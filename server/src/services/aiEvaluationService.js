/**
 * aiEvaluationService — Certificate eligibility evaluation via AI.
 * Handles LLM orchestration with explicit approved fallback chains and AbortController request cancellation.
 */
const { v4: uuidv4 } = require('uuid');
const { models } = require('../db');
const groqService = require('./groqService');
const { ValidationError } = require('../utils/errors/errorTypes');
const logger = require('../utils/logger');
const { preCheckHardConstraints } = require('./certificatePreCheckEngine');
const { aggregateMenteeData } = require('./aiEvalDataService');
const { buildSingleMenteePrompt } = require('./aiEvalPromptBuilder');

/**
 * Evaluate ONE mentee against template criteria using AI.
 * Uses explicit approved model fallback chains and AbortController timeouts.
 */
async function evaluateSingleMentee(template, menteePayload, preCheckResult, adminUserId) {
  const ai = await groqService._resolve('certificates', adminUserId);
  if (!ai.enabled) {
    throw new ValidationError(
      'AI is not configured. Add a provider key in Settings → AI Connections and route it to "certificates".'
    );
  }

  const criteria = Array.isArray(template.criteria) ? template.criteria : [];
  const systemPrompt = buildSingleMenteePrompt(criteria, preCheckResult);
  const userPrompt = JSON.stringify(menteePayload, null, 2);

  let response = null;
  const initialCandidates = [ai.model];

  // Explicit, curated fallback model chains per provider
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
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      response = await ai.client.chat.completions.create(
        {
          model: m,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          max_tokens: 2000
        },
        { signal: controller.signal }
      );
      if (response) break;
    } catch (err) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        lastError = new Error(`AI Request Timeout for model ${m} after 25s`);
      } else {
        lastError = err;
      }
      logger.warn(`[aiEvaluationService] Model ${m} failed: ${lastError.message}`);

      // Stop fallback chain on authentication or quota errors
      if (/401|unauthorized|auth|api_key|invalid_key|429|rate_limit|quota|billing/i.test(lastError?.message || '')) {
        break;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (!response) {
    throw new ValidationError(groqService._friendlyAiError(lastError));
  }

  const raw = response.choices[0]?.message?.content || '';
  return parseSingleAIResponse(raw, criteria, menteePayload, preCheckResult);
}

/**
 * Response parsing with fallback safety
 */
function parseSingleAIResponse(raw, criteria, menteePayload, preCheckResult) {
  let jsonStr = raw.trim();

  const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlock) jsonStr = codeBlock[1];

  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
  }

  let item;
  try {
    item = JSON.parse(jsonStr);
  } catch {
    logger.error('[aiEvaluationService] Failed to parse AI response, using fallback result');
    return buildFallbackResult(menteePayload, preCheckResult);
  }

  if (!item || typeof item !== 'object') {
    return buildFallbackResult(menteePayload, preCheckResult);
  }

  return {
    mentee_id: menteePayload.mentee_id,
    is_eligible: item.is_eligible ?? true,
    certificate_tier: preCheckResult.maxEligibleTier,
    match_score: Math.min(100, Math.max(0, Number(item.match_score) || 0)),
    matched_keywords: Array.isArray(item.matched_keywords) ? item.matched_keywords : [],
    missing_keywords: Array.isArray(item.missing_keywords) ? item.missing_keywords : [],
    overall_percentage: menteePayload.normalized_score,
    hard_constraints_check: preCheckResult.hardChecks[preCheckResult.maxEligibleTier] || {
      score_ok: true, blockers_ok: true, completion_rate_ok: true,
      on_time_rate_ok: true, rating_ok: true
    },
    blockers_analysis: {
      total: Number(item.blockers_analysis?.total) || menteePayload.blockers.total,
      resolved: Number(item.blockers_analysis?.resolved) || menteePayload.blockers.resolved,
      open: Number(item.blockers_analysis?.open) || menteePayload.blockers.open,
      impact: item.blockers_analysis?.impact || 'Low',
      summary: item.blockers_analysis?.summary || ''
    },
    reasoning: item.reasoning || ''
  };
}

/**
 * Fallback result when AI call or parse fails.
 */
function buildFallbackResult(menteePayload, preCheckResult) {
  return {
    mentee_id: menteePayload.mentee_id,
    is_eligible: preCheckResult.maxEligibleTier !== 'participation',
    certificate_tier: preCheckResult.maxEligibleTier,
    match_score: menteePayload.normalized_score,
    matched_keywords: [],
    missing_keywords: [],
    overall_percentage: menteePayload.normalized_score,
    hard_constraints_check: preCheckResult.hardChecks[preCheckResult.maxEligibleTier] || {
      score_ok: true, blockers_ok: true, completion_rate_ok: true,
      on_time_rate_ok: true, rating_ok: true
    },
    blockers_analysis: {
      total: menteePayload.blockers.total,
      resolved: menteePayload.blockers.resolved,
      open: menteePayload.blockers.open,
      impact: menteePayload.blockers.open > 2 ? 'High' : menteePayload.blockers.open > 0 ? 'Medium' : 'Low',
      summary: 'AI response could not be parsed. Tier assigned by server-side constraint checks.'
    },
    reasoning: `Server pre-check determined ${preCheckResult.maxEligibleTier} tier based on: score=${menteePayload.normalized_score}%, completion=${menteePayload.completion_rate}%, on-time=${menteePayload.on_time_rate}%.`
  };
}

/**
 * Enqueue per-mentee evaluation jobs into AIEvaluationQueue
 */
async function enqueueEvaluation(templateId, menteeIds, triggeredBy, criteria) {
  const payloads = await aggregateMenteeData(menteeIds);
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
      preCheck
    };
  });

  await models.AIEvaluationQueue.bulkCreate(queueRows);
  logger.info(`[aiEvaluationService] Enqueued ${queueRows.length} evaluation jobs (runId=${runId})`);

  return { runId, total: queueRows.length };
}

module.exports = {
  aggregateMenteeData,
  evaluateSingleMentee,
  enqueueEvaluation,
  buildFallbackResult
};
