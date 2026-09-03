const { v4: uuidv4 } = require('uuid');
const { models } = require('../db');
const groqService = require('./groqService');
const { ValidationError } = require('../utils/errors/errorTypes');
const logger = require('../utils/logger');
const { preCheckHardConstraints } = require('./certificatePreCheckEngine');
const { aggregateMenteeData } = require('./aiEvalDataService');
const { buildBatchMenteePrompt } = require('./aiEvalPromptBuilder');
const { extractJsonFromText } = require('../utils/aiEvalHelpers');
const { sortCriteriaByPriority } = require('../utils/criteriaUtils');

function isTierAllowed(assignedTier, maxAllowedTierId, criteria) {
  if (!assignedTier || !maxAllowedTierId) return false;
  if (assignedTier === maxAllowedTierId) return true;

  if (maxAllowedTierId === 'participation') return false;

  const tierOrder = (criteria || []).map(c => c.id);
  const assignedIdx = tierOrder.indexOf(assignedTier);
  const maxIdx      = tierOrder.indexOf(maxAllowedTierId);

  if (assignedIdx === -1) return false; 
  if (maxIdx === -1) return false;      

  return assignedIdx >= maxIdx;
}

function buildHardConstraintFailures(preCheck, criteria) {
  const failures  = [];
  const hardChecks = preCheck.hardChecks || {};
  const maxTierId  = preCheck.maxEligibleTier;

  const tierIds     = (criteria || []).map(c => c.id);
  const maxTierIndex = tierIds.indexOf(maxTierId);

  const higherTiers = maxTierIndex > 0
    ? tierIds.slice(0, maxTierIndex)
    : maxTierIndex === 0
      ? []       
      : tierIds; 

  for (const tierId of higherTiers) {
    const tierConfig = criteria.find(c => c.id === tierId);
    const checks     = hardChecks[tierId] || {};
    const tierName   = tierConfig?.name || tierId;

    if (checks.completion_rate_ok === false && tierConfig?.minCompletionRate != null) {
      failures.push(`Failed ${tierName} Hard Constraint: Mentee completion rate is below required ${tierConfig.minCompletionRate}% threshold.`);
    }
    if (checks.score_ok === false && tierConfig?.minScorePercent != null) {
      failures.push(`Failed ${tierName} Hard Constraint: Mentee score is below required ${tierConfig.minScorePercent}% threshold.`);
    }
    if (checks.blockers_ok === false && tierConfig?.maxOpenBlockers != null && tierConfig.maxOpenBlockers >= 0) {
      failures.push(`Failed ${tierName} Hard Constraint: Mentee open blockers exceeds max limit of ${tierConfig.maxOpenBlockers}.`);
    }
    if (checks.on_time_rate_ok === false && tierConfig?.minOnTimeRate != null) {
      failures.push(`Failed ${tierName} Hard Constraint: Mentee on-time submission rate is below required ${tierConfig.minOnTimeRate}% threshold.`);
    }
    if (checks.rating_ok === false && tierConfig?.minAvgRating != null) {
      failures.push(`Failed ${tierName} Hard Constraint: Mentee average mentor rating is below required ${tierConfig.minAvgRating} threshold.`);
    }
    if (checks.attendance_ok === false && tierConfig?.minAttendanceRate != null) {
      failures.push(`Failed ${tierName} Hard Constraint: Mentee attendance rate is below required ${tierConfig.minAttendanceRate}% threshold.`);
    }
  }

  return failures;
}

async function evaluateBatchMentees(template, batchItems, adminUserId) {
  if (!batchItems || batchItems.length === 0) return [];

  const ai = await groqService._resolve('certificates', adminUserId);
  if (!ai.enabled) {
    throw new ValidationError(
      'AI is not configured. Add a provider key in Settings → AI Connections and route it to "certificates".'
    );
  }

  const criteria     = sortCriteriaByPriority(Array.isArray(template.criteria) ? template.criteria : []);
  const systemPrompt = buildBatchMenteePrompt(criteria, batchItems.length);

  const compactPayloads = batchItems.map(item => {
    const livePreCheck = preCheckHardConstraints(item.menteePayload, criteria);
    return {
      mentee_id:                item.menteePayload.mentee_id,
      score:                    item.menteePayload.normalized_score,
      completion:               item.menteePayload.completion_rate,
      on_time:                  item.menteePayload.on_time_rate,
      avg_rating:               item.menteePayload.avg_rating,
      max_eligible_tier:        livePreCheck.maxEligibleTier,
      hard_constraint_failures: buildHardConstraintFailures(livePreCheck, criteria),
      score_breakdown:          item.menteePayload.score_breakdown,
      cohort_reviews:           item.menteePayload.cohort_reviews,
      clan_name:                item.menteePayload.clan_name,
      tasks: (item.menteePayload.tasks || []).map(t => ({
        title:      t.title,
        status:     t.status,
        type:       t.type,
        isCustom:   Boolean(t.isCustomTask),
        desc:       t.description ? t.description.slice(0, 300) : undefined,
        rating:     t.rating,
        difficulty: t.difficulty,
        points_pct: t.pointsPct
      })),
      blockers: {
        total:            item.menteePayload.blockers?.total            ?? 0,
        open:             item.menteePayload.blockers?.open             ?? 0,
        open_by_severity: item.menteePayload.blockers?.open_by_severity ?? {}
      }
    };
  });


  const userPrompt = JSON.stringify(compactPayloads);

  let response = null;
  const initialCandidates = [ai.model];

  if (ai.provider === 'groq' || /groq/i.test(ai.baseURL || '')) {
    initialCandidates.push('llama-3.3-70b-versatile', 'llama-3.1-8b-instant');
  } else if (ai.provider === 'openai' || /openai/i.test(ai.baseURL || '')) {
    initialCandidates.push('gpt-4o-mini', 'gpt-4o');
  }

  const modelQueue  = [...new Set(initialCandidates.filter(Boolean))];
  const triedModels = new Set();
  let lastError     = null;

  for (let idx = 0; idx < modelQueue.length; idx++) {
    const m = modelQueue[idx];
    if (triedModels.has(m)) continue;
    triedModels.add(m);

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 35000);

    try {
      response = await ai.client.chat.completions.create(
        {
          model: m,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt }
          ],
          temperature: 0.1,
          max_tokens:  3500
        },
        { signal: controller.signal }
      );
      if (response) break;
    } catch (err) {
      lastError = err.name === 'AbortError' || controller.signal.aborted
        ? new Error(`AI Request Timeout for model ${m} during batch evaluation after 35s`)
        : err;

      logger.warn(`[aiEvaluationService] Model ${m} batch failed: ${lastError.message}`);

      if (/401|unauthorized|auth|api_key|invalid_key|429|rate_limit|quota|billing/i.test(lastError?.message || '')) {
        break;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (!response) {
    logger.warn('[aiEvaluationService] Batch AI call failed, generating fallbacks for batch');
    return batchItems.map(item => ({
      menteeId: item.menteeId,
      result:   buildFallbackResult(item.menteePayload, item.preCheck)
    }));
  }

  const raw = response.choices[0]?.message?.content || '';
  return parseBatchAIResponse(raw, criteria, batchItems, ai);
}

async function attemptJSONSelfCorrection(rawText, errorMsg, ai) {
  try {
    logger.info('[aiEvaluationService] Triggering AI self-correction retry prompt for malformed JSON...');
    const repairResponse = await ai.client.chat.completions.create({
      model: ai.model || 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a specialized JSON repair assistant. Fix the JSON syntax error in the provided text and output valid JSON ONLY. Do NOT add markdown wrappers or explanations.'
        },
        {
          role: 'user',
          content: `The following response produced a JSON syntax error '${errorMsg}'. Please fix it and return valid JSON array only:\n\n${rawText.slice(0, 3500)}`
        }
      ],
      temperature: 0.0,
      max_tokens:  3500
    });

    const repaired = JSON.parse(extractJsonFromText(repairResponse.choices[0]?.message?.content || ''));
    logger.info('[aiEvaluationService] AI self-correction retry successfully repaired the JSON!');
    return repaired;
  } catch (err) {
    logger.warn(`[aiEvaluationService] JSON self-correction retry failed: ${err.message}`);
    return null;
  }
}

async function parseBatchAIResponse(raw, criteria, batchItems, ai = null) {
  let parsedArray = [];

  try {
    const jsonStr = extractJsonFromText(raw);
    parsedArray   = JSON.parse(jsonStr);
    if (!Array.isArray(parsedArray)) parsedArray = [];
  } catch (err) {
    logger.warn(`[aiEvaluationService] Direct JSON parse failed (${err.message}). Trying AI self-correction retry...`);
    if (ai) {
      const repaired = await attemptJSONSelfCorrection(raw, err.message, ai);
      if (Array.isArray(repaired)) parsedArray = repaired;
    }
  }

  const resultMap = new Map();
  for (const item of parsedArray) {
    const id = item?.mentee_id || item?.id;
    if (id) resultMap.set(String(id), item);
  }

  return batchItems.map(batchItem => {
    const menteeId = batchItem.menteePayload.mentee_id;
    const aiItem   = resultMap.get(String(menteeId));

    const livePreCheck = preCheckHardConstraints(batchItem.menteePayload, criteria);

    if (!aiItem) {
      return { menteeId, result: buildFallbackResult(batchItem.menteePayload, livePreCheck) };
    }

    const menteePayload = batchItem.menteePayload;
    const sortedCriteria = sortCriteriaByPriority(criteria);
    const maxTierId     = livePreCheck.maxEligibleTier;

    const rawMatchScore = aiItem.match_score ?? aiItem.matchScore ?? menteePayload.normalized_score;
    const cappedScore   = Math.min(100, Math.max(0, Number(rawMatchScore) || 0));

    const matchedKw = Array.isArray(aiItem.matched_keywords) ? aiItem.matched_keywords
      : (Array.isArray(aiItem.matchedKeywords) ? aiItem.matchedKeywords : []);

    const missingKw = Array.isArray(aiItem.missing_keywords) ? aiItem.missing_keywords
      : (Array.isArray(aiItem.missingKeywords) ? aiItem.missingKeywords : []);

    const customRulesCheck = (
      Array.isArray(aiItem.custom_rules_check) ? aiItem.custom_rules_check
        : (Array.isArray(aiItem.customRulesCheck) ? aiItem.customRulesCheck : [])
    ).map(crc => ({
      rule:     String(crc.rule || crc.name || 'Custom Qualification Rule').trim(),
      passed:   Boolean(crc.passed ?? crc.status === 'passed'),
      evidence: String(crc.evidence || crc.reason || '').trim()
    }));

    const blockersAnalysisObj = aiItem.blockers_analysis || aiItem.blockersAnalysis || {};

    let qualifiedTier = 'participation';
    const normalizedMatched = matchedKw.map(k => String(k).toLowerCase());

    for (const tierConfig of sortedCriteria) {
      const tierId = tierConfig.id;

      if (!isTierAllowed(tierId, maxTierId, sortedCriteria)) {
        continue;
      }

      const requiredKw = Array.isArray(tierConfig.keywords) ? tierConfig.keywords : [];
      const unfulfilledKw = requiredKw.filter(kw => !normalizedMatched.includes(String(kw).toLowerCase()));
      if (unfulfilledKw.length > 0) {
        continue; 
      }

      if (tierConfig.customRule?.trim()) {
        const failedRule = customRulesCheck.some(c => c.passed === false);
        if (failedRule) {
          continue; 
        }
      }

      qualifiedTier = tierId;
      break;
    }

    const assignedTier = aiItem.certificate_tier || aiItem.certificateTier || aiItem.tier || maxTierId;

    const validTier = qualifiedTier !== 'participation' ? qualifiedTier : assignedTier;

    const hardConstraintsCheck = livePreCheck.hardChecks[validTier]
      ?? (validTier === 'participation'
        ? Object.values(livePreCheck.hardChecks)[0] ?? { score_ok: false, blockers_ok: false, completion_rate_ok: false, on_time_rate_ok: false, rating_ok: false, attendance_ok: false }
        : { score_ok: true, blockers_ok: true, completion_rate_ok: true, on_time_rate_ok: true, rating_ok: true, attendance_ok: true });

    let finalReasoning = aiItem.reasoning || aiItem.summary || '';
    if (validTier !== assignedTier) {
      const tierName = sortedCriteria.find(c => c.id === validTier)?.name || validTier;
      finalReasoning = `Mentee qualifies for the ${tierName} based on priority tier evaluation: hard constraints, required keywords, and custom rules were all satisfied.`;
    }

    const result = {
      mentee_id:            menteeId,
      is_eligible:          validTier !== 'participation',
      certificate_tier:     validTier,
      match_score:          cappedScore,
      matched_keywords:     matchedKw,
      missing_keywords:     missingKw,
      custom_rules_check:   customRulesCheck,
      overall_percentage:   Math.min(100, Math.max(0, Number(menteePayload.normalized_score) || 0)),
      completion_rate:      menteePayload.completion_rate,
      on_time_rate:         menteePayload.on_time_rate,
      avg_rating:           menteePayload.avg_rating,
      score_breakdown:      menteePayload.score_breakdown,
      cohort_reviews:       menteePayload.cohort_reviews,
      hard_constraints_check: hardConstraintsCheck,
      blockers_analysis: {
        total:    Number(blockersAnalysisObj.total)    || (menteePayload.blockers?.total    ?? 0),
        resolved: Number(blockersAnalysisObj.resolved) || (menteePayload.blockers?.resolved ?? 0),
        open:     Number(blockersAnalysisObj.open)     || (menteePayload.blockers?.open     ?? 0),
        impact:   blockersAnalysisObj.impact  || 'Low',
        summary:  blockersAnalysisObj.summary || ''
      },
      reasoning:            finalReasoning
    };

    return { menteeId, result };
  });

}

async function evaluateSingleMentee(template, menteePayload, preCheckResult, adminUserId) {
  const batchRes = await evaluateBatchMentees(
    template,
    [{ menteeId: menteePayload.mentee_id, menteePayload, preCheck: preCheckResult }],
    adminUserId
  );
  return batchRes[0]?.result;
}

function buildFallbackResult(menteePayload, preCheckResult) {
  const cappedScore = Math.min(100, Math.max(0, Number(menteePayload.normalized_score) || 0));
  const blockers    = menteePayload.blockers ?? {};

  return {
    mentee_id:       menteePayload.mentee_id,
    is_eligible:     preCheckResult.maxEligibleTier !== 'participation',
    certificate_tier: preCheckResult.maxEligibleTier,
    match_score:     cappedScore,
    matched_keywords: [],
    missing_keywords: [],
    overall_percentage:   cappedScore,
    completion_rate:      menteePayload.completion_rate,
    on_time_rate:         menteePayload.on_time_rate,
    avg_rating:           menteePayload.avg_rating,
    score_breakdown:      menteePayload.score_breakdown,
    cohort_reviews:       menteePayload.cohort_reviews,
    hard_constraints_check: preCheckResult.hardChecks[preCheckResult.maxEligibleTier] ?? {
      score_ok: false, blockers_ok: false, completion_rate_ok: false,
      on_time_rate_ok: false, rating_ok: false, attendance_ok: false
    },
    blockers_analysis: {
      total:    blockers.total    ?? 0,
      resolved: blockers.resolved ?? 0,
      open:     blockers.open     ?? 0,
      impact:   (blockers.open ?? 0) > 2 ? 'High' : (blockers.open ?? 0) > 0 ? 'Medium' : 'Low',
      summary:  'AI response could not be parsed. Tier assigned by server-side constraint checks.'
    },
    reasoning: `Server pre-check determined ${preCheckResult.maxEligibleTier} tier based on: score=${cappedScore}%, completion=${menteePayload.completion_rate}%, on-time=${menteePayload.on_time_rate}%.`
  };
}

async function enqueueEvaluation(templateId, menteeIds, triggeredBy, criteria, clanId = null, runId = null) {
  const sortedCriteria = sortCriteriaByPriority(criteria);

  await models.AIEvaluationQueue.destroy({ where: { templateId } });

  const payloads = await aggregateMenteeData(menteeIds, clanId);
  const jobRunId = runId || uuidv4();

  const queueRows = payloads.map(payload => {
    const preCheck = preCheckHardConstraints(payload, sortedCriteria);
    return {
      runId:        jobRunId,
      templateId,
      menteeId:     payload.mentee_id,
      triggeredBy,
      status:       'pending',
      menteePayload: payload,
      preCheck,
      attempts:     0
    };
  });

  await models.AIEvaluationQueue.bulkCreate(queueRows);
  logger.info(`[aiEvaluationService] Enqueued ${queueRows.length} evaluation jobs (runId=${jobRunId}, clanId=${clanId ?? 'none'})`);

  return { runId: jobRunId, total: queueRows.length };
}

module.exports = {
  evaluateSingleMentee,
  evaluateBatchMentees,
  enqueueEvaluation,
  buildFallbackResult
};
