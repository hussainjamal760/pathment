/**
 * aiEvaluationService — Certificate eligibility evaluation via AI.
 * Supports micro-batching (up to 10 mentees per API call), qualitative custom rule
 * & tech stack keyword evaluation, and AbortController request cancellation.
 *
 * Criteria arrays are ALWAYS sorted by `priority` (ascending, 1 = top tier) before
 * any processing. sortCriteriaByPriority is applied at every entry point so callers
 * don't need to think about order.
 */
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

/**
 * Check if an AI-assigned tier falls within the server math ceiling (maxAllowedTierId).
 *
 * Criteria are ordered highest-first. A lower index = more prestigious. Assigned tier is
 * "allowed" only when its index >= maxAllowed index (i.e., it is the ceiling or below it).
 *
 * Special case: 'participation' is the sentinel floor tier and is never in the criteria array.
 * When the ceiling is 'participation', NO custom tier is allowed — only 'participation' itself.
 *
 * @param {string} assignedTier    - Tier the AI wants to assign.
 * @param {string} maxAllowedTierId - Server-computed ceiling tier id.
 * @param {Array}  criteria         - Template criteria array, highest-first.
 * @returns {boolean}
 */
function isTierAllowed(assignedTier, maxAllowedTierId, criteria) {
  if (!assignedTier || !maxAllowedTierId) return false;
  if (assignedTier === maxAllowedTierId) return true;

  // 'participation' ceiling means the mentee failed all hard constraints.
  // No custom tier can be assigned — only participation itself is valid.
  if (maxAllowedTierId === 'participation') return false;

  const tierOrder = (criteria || []).map(c => c.id);
  const assignedIdx = tierOrder.indexOf(assignedTier);
  const maxIdx      = tierOrder.indexOf(maxAllowedTierId);

  if (assignedIdx === -1) return false; // unknown tier → deny
  if (maxIdx === -1) return false;      // unknown ceiling → deny (conservative)

  // assignedIdx >= maxIdx means assignedTier is the ceiling or below it (lower prestige)
  return assignedIdx >= maxIdx;
}

/**
 * Builds human-readable failure messages for tiers the mentee could NOT reach,
 * so the AI can reference them verbatim in its reasoning.
 */
function buildHardConstraintFailures(preCheck, criteria) {
  const failures  = [];
  const hardChecks = preCheck.hardChecks || {};
  const maxTierId  = preCheck.maxEligibleTier;

  const tierIds     = (criteria || []).map(c => c.id);
  const maxTierIndex = tierIds.indexOf(maxTierId);

  // Report failures only for tiers ABOVE the ceiling (those the mentee didn't qualify for).
  //
  // Three cases:
  //   maxTierIndex > 0  → ceiling is not the top tier → report failures for everything above it
  //   maxTierIndex === 0 → mentee achieved the top tier → NO tiers above it → no failures to report
  //   maxTierIndex === -1 → 'participation' (not in criteria array) → ALL tiers were failed
  const higherTiers = maxTierIndex > 0
    ? tierIds.slice(0, maxTierIndex)
    : maxTierIndex === 0
      ? []       // top tier achieved: nothing above to report
      : tierIds; // participation ceiling: every tier was failed

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

/**
 * Evaluate a BATCH of up to 20 mentees in ONE single AI API request.
 * Evaluates qualitative Custom Rules and Tech Stack Keywords against completed tasks.
 */
async function evaluateBatchMentees(template, batchItems, adminUserId) {
  if (!batchItems || batchItems.length === 0) return [];

  const ai = await groqService._resolve('certificates', adminUserId);
  if (!ai.enabled) {
    throw new ValidationError(
      'AI is not configured. Add a provider key in Settings → AI Connections and route it to "certificates".'
    );
  }

  // Sort by priority so the AI prompt hierarchy and isTierAllowed comparisons
  // always operate on a deterministic highest-first order.
  const criteria     = sortCriteriaByPriority(Array.isArray(template.criteria) ? template.criteria : []);
  const systemPrompt = buildBatchMenteePrompt(criteria, batchItems.length);

  // Re-run preCheckHardConstraints from the live template criteria at evaluation time.
  // The stored item.preCheck was computed at ENQUEUE time — if the admin changed any
  // threshold between enqueue and processing, the stale snapshot would send wrong
  // max_eligible_tier and wrong failure messages to the AI (the root cause of the
  // "static values overriding dynamic changes" bug).
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

/**
 * Attempt a single AI self-correction retry when JSON parsing fails.
 * Uses the shared extractJsonFromText helper.
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

/**
 * Parse JSON array returned by LLM for a batch of mentees.
 * SIMPLIFY-2: Removed positional fallback (parsedArray[idx]).
 * If a mentee_id is not found in the AI result map, we use buildFallbackResult.
 * Positional matching was unsafe — if the AI returned results out of order,
 * the wrong AI analysis would be assigned to the wrong mentee.
 */
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

  // Build a lookup map keyed by mentee_id for O(1) access.
  const resultMap = new Map();
  for (const item of parsedArray) {
    const id = item?.mentee_id || item?.id;
    if (id) resultMap.set(String(id), item);
  }

  return batchItems.map(batchItem => {
    const menteeId = batchItem.menteePayload.mentee_id;
    const aiItem   = resultMap.get(String(menteeId));

    // Always re-compute preCheck from the live criteria at parse time.
    // batchItem.preCheck is the enqueue-time snapshot and may be stale
    // if the admin changed criteria thresholds between enqueue and processing.
    const livePreCheck = preCheckHardConstraints(batchItem.menteePayload, criteria);

    // No match → safe fallback (server-side tier, no keywords/reasoning).
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

    // Determine the highest tier in priority order for which ALL requirements pass:
    // 1. Hard constraints ceiling (maxTierId)
    // 2. Explicit required tech stack keywords
    // 3. Custom AI qualification rules
    let qualifiedTier = 'participation';
    const normalizedMatched = matchedKw.map(k => String(k).toLowerCase());

    for (const tierConfig of sortedCriteria) {
      const tierId = tierConfig.id;

      // Cannot assign a tier above maxEligibleTier ceiling
      if (!isTierAllowed(tierId, maxTierId, sortedCriteria)) {
        continue;
      }

      // Check required tech stack keywords for this tier
      const requiredKw = Array.isArray(tierConfig.keywords) ? tierConfig.keywords : [];
      const unfulfilledKw = requiredKw.filter(kw => !normalizedMatched.includes(String(kw).toLowerCase()));
      if (unfulfilledKw.length > 0) {
        continue; // Missing explicit keywords for this tier
      }

      // Check custom AI rule for this tier
      if (tierConfig.customRule?.trim()) {
        const failedRule = customRulesCheck.some(c => c.passed === false);
        if (failedRule) {
          continue; // Custom rule failed for this tier
        }
      }

      // If hard constraints, keywords, and custom rule all pass, this tier is earned!
      qualifiedTier = tierId;
      break;
    }

    const assignedTier = aiItem.certificate_tier || aiItem.certificateTier || aiItem.tier || maxTierId;

    // Authoritative tier: if mentee earned qualifiedTier, enforce it to prevent AI hallucination downgrades
    const validTier = qualifiedTier !== 'participation' ? qualifiedTier : assignedTier;

    // Use livePreCheck.hardChecks for the hard constraints display.
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

/**
 * Evaluate ONE mentee via the batch path (single-item batch).
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
 * Fallback result when AI call or parse fails — uses server math ceiling only.
 */
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

/**
 * Enqueue per-mentee evaluation jobs into AIEvaluationQueue.
 *
 * BUG-6 fix: Delete old rows for this templateId before creating new ones so the status
 * endpoint never returns stale results from a previous run during the transition period.
 *
 * @param {string}      templateId   - Certificate template UUID.
 * @param {string[]}    menteeIds    - Array of mentee user IDs to evaluate.
 * @param {string}      triggeredBy  - User ID who triggered the run.
 * @param {Array}       criteria     - Tier criteria, highest-first.
 * @param {string|null} clanId       - Optional clan scope for task/cohort aggregation.
 * @param {string}      [runId]      - Optional pre-generated run UUID (for multi-clan grouping).
 * @returns {{ runId: string, total: number }}
 */
async function enqueueEvaluation(templateId, menteeIds, triggeredBy, criteria, clanId = null, runId = null) {
  // Sort by priority before storing into queue rows so the pre-check snapshot
  // is always in the canonical order regardless of how the caller built the array.
  const sortedCriteria = sortCriteriaByPriority(criteria);

  // Remove stale rows from previous runs for this template before enqueuing new jobs.
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
