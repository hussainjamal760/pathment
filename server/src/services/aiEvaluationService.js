/**
 * aiEvaluationService — Certificate eligibility evaluation via AI.
 * Supports micro-batching (up to 10 mentees per API call), fingerprint caching,
 * qualitative custom rule & tech stack keyword evaluation, and AbortController request cancellation.
 */
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { models } = require('../db');
const groqService = require('./groqService');
const { ValidationError } = require('../utils/errors/errorTypes');
const logger = require('../utils/logger');
const { preCheckHardConstraints } = require('./certificatePreCheckEngine');
const { aggregateMenteeData } = require('./aiEvalDataService');
const { buildSingleMenteePrompt, buildBatchMenteePrompt } = require('./aiEvalPromptBuilder');

/**
 * Helper: Check if an assigned tier is allowed under the server math ceiling (maxAllowedTierId).
 * Higher tiers (e.g. Gold) come first in criteria order. Assigned tier index must be >= maxAllowed index.
 */
function isTierAllowed(assignedTier, maxAllowedTierId, criteria) {
  if (!assignedTier || !maxAllowedTierId) return false;
  if (assignedTier === maxAllowedTierId) return true;

  const tierOrder = (criteria || []).map(c => c.id);
  const assignedIdx = tierOrder.indexOf(assignedTier);
  const maxIdx = tierOrder.indexOf(maxAllowedTierId);

  if (assignedIdx === -1) return false;
  if (maxIdx === -1) return true;

  return assignedIdx >= maxIdx;
}

/**
 * Compute SHA256 fingerprint hash of mentee data & criteria for caching.
 */
function computeMenteeFingerprint(payload, criteria) {
  const dataToHash = {
    mentee_id: payload.mentee_id,
    score: payload.normalized_score,
    completion: payload.completion_rate,
    on_time: payload.on_time_rate,
    avg_rating: payload.avg_rating,
    tasks: payload.tasks,
    blockers: payload.blockers,
    criteria
  };
  return crypto.createHash('sha256').update(JSON.stringify(dataToHash)).digest('hex');
}

function buildHardConstraintFailures(preCheck, criteria) {
  const failures = [];
  const hardChecks = preCheck.hardChecks || {};
  const maxTierId = preCheck.maxEligibleTier;

  const tierIds = (criteria || []).map(c => c.id);
  const maxTierIndex = tierIds.indexOf(maxTierId);
  const higherTiers = maxTierIndex > 0 ? tierIds.slice(0, maxTierIndex) : (maxTierIndex === -1 ? tierIds : []);

  for (const tierId of higherTiers) {
    const tierConfig = criteria.find(c => c.id === tierId);
    const checks = hardChecks[tierId] || {};
    const tierName = tierConfig?.name || tierId;

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

/**
 * Evaluate a BATCH of up to 20 mentees in ONE single AI API request.
 * Evaluates qualitative Custom Rules and Tech Stack Keywords against completed task titles/descriptions.
 */
async function evaluateBatchMentees(template, batchItems, adminUserId) {
  if (!batchItems || batchItems.length === 0) return [];

  const ai = await groqService._resolve('certificates', adminUserId);
  if (!ai.enabled) {
    throw new ValidationError(
      'AI is not configured. Add a provider key in Settings → AI Connections and route it to "certificates".'
    );
  }

  const criteria = Array.isArray(template.criteria) ? template.criteria : [];
  const systemPrompt = buildBatchMenteePrompt(criteria, batchItems.length);

  // Compact payload with task titles AND descriptions for custom rule & keyword matching
  const compactPayloads = batchItems.map(item => ({
    mentee_id: item.menteePayload.mentee_id,
    score: Math.min(100, Math.max(0, item.menteePayload.normalized_score || 0)),
    completion: item.menteePayload.completion_rate,
    on_time: item.menteePayload.on_time_rate,
    avg_rating: item.menteePayload.avg_rating,
    max_eligible_tier: item.preCheck.maxEligibleTier,
    hard_constraint_failures: buildHardConstraintFailures(item.preCheck, criteria),
    score_breakdown: item.menteePayload.score_breakdown,
    cohort_reviews: item.menteePayload.cohort_reviews,
    clan_name: item.menteePayload.clan_name,
    tasks: (item.menteePayload.tasks || []).map(t => ({
      title: t.title,
      status: t.status,
      type: t.type,
      isCustom: Boolean(t.isCustomTask),
      desc: t.description ? t.description.slice(0, 300) : undefined,
      rating: t.rating,
      difficulty: t.difficulty,
      points_pct: t.pointsPct
    })),
    blockers: {
      total: item.menteePayload.blockers.total,
      open: item.menteePayload.blockers.open,
      open_by_severity: item.menteePayload.blockers.open_by_severity
    }
  }));

  const userPrompt = JSON.stringify(compactPayloads);

  let response = null;
  const initialCandidates = [ai.model];

  if (ai.provider === 'groq' || /groq/i.test(ai.baseURL || '')) {
    initialCandidates.push('llama-3.3-70b-versatile', 'llama-3.1-8b-instant');
  } else if (ai.provider === 'openai' || /openai/i.test(ai.baseURL || '')) {
    initialCandidates.push('gpt-4o-mini', 'gpt-4o');
  }

  const modelQueue = [...new Set(initialCandidates.filter(Boolean))];
  const triedModels = new Set();
  let lastError = null;

  for (let idx = 0; idx < modelQueue.length; idx++) {
    const m = modelQueue[idx];
    if (triedModels.has(m)) continue;
    triedModels.add(m);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    try {
      response = await ai.client.chat.completions.create(
        {
          model: m,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          max_tokens: 3500
        },
        { signal: controller.signal }
      );
      if (response) break;
    } catch (err) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        lastError = new Error(`AI Request Timeout for model ${m} during batch evaluation after 35s`);
      } else {
        lastError = err;
      }
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
      result: buildFallbackResult(item.menteePayload, item.preCheck)
    }));
  }

  const raw = response.choices[0]?.message?.content || '';
  return parseBatchAIResponse(raw, criteria, batchItems, ai);
}

/**
 * Helper: Attempt a single AI self-correction retry prompt if JSON parsing fails.
 */
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
      max_tokens: 3500
    });

    const repairedRaw = repairResponse.choices[0]?.message?.content || '';
    let jsonStr = repairedRaw.trim();
    const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlock) jsonStr = codeBlock[1];

    const firstBracket = jsonStr.indexOf('[');
    const lastBracket = jsonStr.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      jsonStr = jsonStr.slice(firstBracket, lastBracket + 1);
    }
    const result = JSON.parse(jsonStr);
    logger.info('[aiEvaluationService] AI self-correction retry successfully repaired the JSON!');
    return result;
  } catch (err) {
    logger.warn(`[aiEvaluationService] JSON self-correction retry failed: ${err.message}`);
    return null;
  }
}

/**
 * Parse JSON array returned by LLM for a batch of mentees.
 */
async function parseBatchAIResponse(raw, criteria, batchItems, ai = null) {
  let jsonStr = raw.trim();
  const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlock) jsonStr = codeBlock[1];

  const firstBracket = jsonStr.indexOf('[');
  const lastBracket = jsonStr.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    jsonStr = jsonStr.slice(firstBracket, lastBracket + 1);
  }

  let parsedArray = [];
  try {
    parsedArray = JSON.parse(jsonStr);
    if (!Array.isArray(parsedArray)) parsedArray = [];
  } catch (err) {
    logger.warn(`[aiEvaluationService] Direct JSON parse failed (${err.message}). Trying AI self-correction retry...`);
    if (ai) {
      const repaired = await attemptJSONSelfCorrection(raw, err.message, ai);
      if (Array.isArray(repaired)) {
        parsedArray = repaired;
      }
    }
    if (!Array.isArray(parsedArray)) parsedArray = [];
  }

  const resultMap = new Map();
  for (const item of parsedArray) {
    const id = item?.mentee_id || item?.id;
    if (id) {
      resultMap.set(String(id), item);
    }
  }

  return batchItems.map((batchItem, idx) => {
    const menteeId = batchItem.menteePayload.mentee_id;
    let aiItem = resultMap.get(String(menteeId));

    if (!aiItem && parsedArray[idx]) {
      aiItem = parsedArray[idx];
    }

    if (!aiItem) {
      return {
        menteeId,
        result: buildFallbackResult(batchItem.menteePayload, batchItem.preCheck)
      };
    }

    const preCheck = batchItem.preCheck;
    const menteePayload = batchItem.menteePayload;

    // Validate assigned tier against server math ceiling (support camelCase & snake_case)
    const assignedTier = aiItem.certificate_tier || aiItem.certificateTier || aiItem.tier || preCheck.maxEligibleTier;
    const validTier = isTierAllowed(assignedTier, preCheck.maxEligibleTier, criteria)
      ? assignedTier
      : preCheck.maxEligibleTier;

    const rawMatchScore = aiItem.match_score ?? aiItem.matchScore ?? menteePayload.normalized_score;
    const cappedScore = Math.min(100, Math.max(0, Number(rawMatchScore) || 0));

    const matchedKw = Array.isArray(aiItem.matched_keywords)
      ? aiItem.matched_keywords
      : (Array.isArray(aiItem.matchedKeywords) ? aiItem.matchedKeywords : []);

    const missingKw = Array.isArray(aiItem.missing_keywords)
      ? aiItem.missing_keywords
      : (Array.isArray(aiItem.missingKeywords) ? aiItem.missingKeywords : []);

    const customRulesCheckRaw = Array.isArray(aiItem.custom_rules_check)
      ? aiItem.custom_rules_check
      : (Array.isArray(aiItem.customRulesCheck) ? aiItem.customRulesCheck : []);

    const customRulesCheck = customRulesCheckRaw.map(crc => ({
      rule: String(crc.rule || crc.name || 'Custom Qualification Rule').trim(),
      passed: Boolean(crc.passed ?? crc.status === 'passed'),
      evidence: String(crc.evidence || crc.reason || '').trim()
    }));

    const blockersAnalysisObj = aiItem.blockers_analysis || aiItem.blockersAnalysis || {};

    const result = {
      mentee_id: menteeId,
      is_eligible: aiItem.is_eligible ?? aiItem.isEligible ?? true,
      certificate_tier: validTier,
      match_score: cappedScore,
      matched_keywords: matchedKw,
      missing_keywords: missingKw,
      custom_rules_check: customRulesCheck,
      overall_percentage: Math.min(100, Math.max(0, Number(menteePayload.normalized_score) || 0)),
      completion_rate: menteePayload.completion_rate,
      on_time_rate: menteePayload.on_time_rate,
      avg_rating: menteePayload.avg_rating,
      score_breakdown: menteePayload.score_breakdown,
      cohort_reviews: menteePayload.cohort_reviews,
      hard_constraints_check: preCheck.hardChecks[validTier] || {
        score_ok: true, blockers_ok: true, completion_rate_ok: true,
        on_time_rate_ok: true, rating_ok: true, attendance_ok: true
      },
      blockers_analysis: {
        total: Number(blockersAnalysisObj.total) || menteePayload.blockers.total,
        resolved: Number(blockersAnalysisObj.resolved) || menteePayload.blockers.resolved,
        open: Number(blockersAnalysisObj.open) || menteePayload.blockers.open,
        impact: blockersAnalysisObj.impact || 'Low',
        summary: blockersAnalysisObj.summary || ''
      },
      reasoning: aiItem.reasoning || aiItem.summary || ''
    };

    return { menteeId, result };
  });
}

/**
 * Evaluate ONE mentee against template criteria using AI.
 */
async function evaluateSingleMentee(template, menteePayload, preCheckResult, adminUserId) {
  const batchRes = await evaluateBatchMentees(
    template,
    [{ menteeId: menteePayload.mentee_id, menteePayload, preCheck: preCheckResult }],
    adminUserId
  );
  return batchRes[0]?.result;
}

/**
 * Fallback result when AI call or parse fails.
 */
function buildFallbackResult(menteePayload, preCheckResult) {
  const cappedScore = Math.min(100, Math.max(0, Number(menteePayload.normalized_score) || 0));
  return {
    mentee_id: menteePayload.mentee_id,
    is_eligible: preCheckResult.maxEligibleTier !== 'participation',
    certificate_tier: preCheckResult.maxEligibleTier,
    match_score: cappedScore,
    matched_keywords: [],
    missing_keywords: [],
    overall_percentage: cappedScore,
    completion_rate: menteePayload.completion_rate,
    on_time_rate: menteePayload.on_time_rate,
    avg_rating: menteePayload.avg_rating,
    score_breakdown: menteePayload.score_breakdown,
    cohort_reviews: menteePayload.cohort_reviews,
    hard_constraints_check: preCheckResult.hardChecks[preCheckResult.maxEligibleTier] || {
      score_ok: true, blockers_ok: true, completion_rate_ok: true,
      on_time_rate_ok: true, rating_ok: true, attendance_ok: true
    },
    blockers_analysis: {
      total: menteePayload.blockers.total,
      resolved: menteePayload.blockers.resolved,
      open: menteePayload.blockers.open,
      impact: menteePayload.blockers.open > 2 ? 'High' : menteePayload.blockers.open > 0 ? 'Medium' : 'Low',
      summary: 'AI response could not be parsed. Tier assigned by server-side constraint checks.'
    },
    reasoning: `Server pre-check determined ${preCheckResult.maxEligibleTier} tier based on: score=${cappedScore}%, completion=${menteePayload.completion_rate}%, on-time=${menteePayload.on_time_rate}%.`
  };
}

/**
 * Enqueue per-mentee (per-clan) evaluation jobs into AIEvaluationQueue.
 * If clanId is provided, tasks and cohort reviews are scoped to that clan.
 */
async function enqueueEvaluation(templateId, menteeIds, triggeredBy, criteria, clanId = null) {
  const payloads = await aggregateMenteeData(menteeIds, clanId);
  const runId = uuidv4();

  const queueRows = payloads.map(payload => {
    const preCheck = preCheckHardConstraints(payload, criteria);
    return {
      runId,
      templateId,
      menteeId: payload.mentee_id,
      triggeredBy,
      status: 'pending',
      menteePayload: payload,
      preCheck,
      attempts: 0
    };
  });

  await models.AIEvaluationQueue.bulkCreate(queueRows);
  logger.info(`[aiEvaluationService] Enqueued ${queueRows.length} fresh evaluation jobs (runId=${runId}, clanId=${clanId ?? 'none'})`);

  return { runId, total: queueRows.length };
}

module.exports = {
  aggregateMenteeData,
  evaluateSingleMentee,
  evaluateBatchMentees,
  enqueueEvaluation,
  buildFallbackResult
};
