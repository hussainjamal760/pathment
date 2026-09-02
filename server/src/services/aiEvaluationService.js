/**
 * aiEvaluationService — Certificate eligibility evaluation via AI.
 *
 * Responsibilities:
 *   1. aggregateMenteeData     — SQL queries + metric computation.
 *   2. preCheckHardConstraints — Server-side mathematical constraint checks.
 *   3. evaluateSingleMentee    — Single-mentee AI call (Groq/OpenAI).
 *   4. buildSingleMenteePrompt — Focused prompt construction.
 *   5. parseSingleAIResponse   — Safe JSON parsing with fallback guarantees.
 *   6. enqueueEvaluation       — Batch queue creator for background processing.
 */
const { v4: uuidv4 } = require('uuid');
const { models } = require('../db');
const { Op } = require('sequelize');
const groqService = require('./groqService');
const { ValidationError } = require('../utils/errors/errorTypes');
const logger = require('../utils/logger');

/**
 * Build a rich data snapshot for each mentee in `menteeIds`.
 */
async function aggregateMenteeData(menteeIds) {
  if (!menteeIds || !menteeIds.length) return [];

  const tasks = await models.AssignedTask.findAll({
    where: {
      menteeId: { [Op.in]: menteeIds },
      status: { [Op.ne]: 'cancelled' }
    },
    attributes: [
      'menteeId', 'status', 'pointsAwarded', 'pointsBase',
      'finalRating', 'isLate', 'completedAt', 'isCustomTask', 'dueDate'
    ],
    include: [{
      model: models.RoadmapTask,
      as: 'roadmapTask',
      attributes: ['title', 'type', 'difficulty', 'description']
    }],
    raw: false
  });

  const blockers = await models.Blocker.findAll({
    where: { menteeId: { [Op.in]: menteeIds } },
    attributes: ['menteeId', 'status', 'category', 'severity', 'openedAt', 'resolvedAt'],
    raw: true
  });

  const taskMap = {};
  const blockerMap = {};
  for (const id of menteeIds) {
    taskMap[id] = [];
    blockerMap[id] = [];
  }

  for (const t of tasks) taskMap[t.menteeId]?.push(t);
  for (const b of blockers) blockerMap[b.menteeId]?.push(b);

  return menteeIds.map((id) => {
    const myTasks = taskMap[id] || [];
    const myBlockers = blockerMap[id] || [];

    let totalBase = 0;
    let totalAwarded = 0;
    const taskSummaries = [];

    for (const t of myTasks) {
      const base = t.pointsBase ?? t.roadmapTask?.pointsBase ?? 10;
      const awarded = t.pointsAwarded ?? 0;
      totalBase += base;
      if (t.status === 'completed') totalAwarded += awarded;

      taskSummaries.push({
        title: t.roadmapTask?.title ?? (t.isCustomTask ? 'Custom Task' : 'Unknown'),
        type: t.roadmapTask?.type ?? 'custom',
        difficulty: t.roadmapTask?.difficulty ?? 'medium',
        status: t.status,
        rating: t.finalRating ? parseFloat(t.finalRating) : null,
        isLate: t.isLate
      });
    }

    const normalizedScore = totalBase > 0 ? Math.round((totalAwarded / totalBase) * 100) : 0;
    const completedTasks = myTasks.filter(t => t.status === 'completed');
    const totalTasks = myTasks.length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks.length / totalTasks) * 100) : 0;

    const onTimeTasks = completedTasks.filter(t => !t.isLate).length;
    const onTimeRate = completedTasks.length > 0 ? Math.round((onTimeTasks / completedTasks.length) * 100) : 0;

    const ratedTasks = completedTasks.filter(t => t.finalRating != null);
    const avgRating = ratedTasks.length > 0
      ? parseFloat((ratedTasks.reduce((s, t) => s + parseFloat(t.finalRating), 0) / ratedTasks.length).toFixed(2))
      : null;

    const totalBlockers = myBlockers.length;
    const resolvedBlockers = myBlockers.filter(b => b.status === 'resolved').length;
    const openBlockers = totalBlockers - resolvedBlockers;

    const openByName = myBlockers.filter(b => b.status !== 'resolved');
    const blockersBySeverity = openByName.reduce((acc, b) => {
      const sev = b.severity || 'unknown';
      acc[sev] = (acc[sev] || 0) + 1;
      return acc;
    }, {});

    return {
      mentee_id: id,
      normalized_score: normalizedScore,
      completion_rate: completionRate,
      on_time_rate: onTimeRate,
      avg_rating: avgRating,
      tasks: taskSummaries,
      total_tasks: totalTasks,
      completed_tasks: completedTasks.length,
      blockers: {
        total: totalBlockers,
        resolved: resolvedBlockers,
        open: openBlockers,
        by_severity: blockersBySeverity,
        categories: [...new Set(myBlockers.map(b => b.category))]
      }
    };
  });
}

/**
 * Determine the highest eligible tier for a mentee using server-side constraints.
 */
function preCheckHardConstraints(menteePayload, criteria) {
  if (!criteria || !criteria.length) {
    return {
      maxEligibleTier: 'participation',
      hardChecks: {},
      customRuleChecks: {}
    };
  }

  const completedTitlesLower = (menteePayload.tasks || [])
    .filter(t => t.status === 'completed')
    .map(t => (t.title || '').toLowerCase());

  const hardChecks = {};
  const customRuleChecks = {};
  let maxEligibleTier = null;

  for (const tier of criteria) {
    const tierId = tier.id;
    const checks = {
      score_ok: true,
      blockers_ok: true,
      completion_rate_ok: true,
      on_time_rate_ok: true,
      rating_ok: true
    };

    const minScore = tier.minScorePercent ?? 0;
    if (minScore > 0 && menteePayload.normalized_score < minScore) {
      checks.score_ok = false;
    }

    const maxBlockers = tier.maxOpenBlockers ?? tier.maxBlockers ?? -1;
    if (maxBlockers >= 0 && menteePayload.blockers.open > maxBlockers) {
      checks.blockers_ok = false;
    }

    const minCompletion = tier.minCompletionRate ?? 0;
    if (minCompletion > 0 && menteePayload.completion_rate < minCompletion) {
      checks.completion_rate_ok = false;
    }

    const minOnTime = tier.minOnTimeRate ?? 0;
    if (minOnTime > 0 && menteePayload.on_time_rate < minOnTime) {
      checks.on_time_rate_ok = false;
    }

    const minRating = tier.minAvgRating ?? 0;
    if (minRating > 0 && (menteePayload.avg_rating == null || menteePayload.avg_rating < minRating)) {
      checks.rating_ok = false;
    }

    let customRuleSatisfied = true;
    if (tier.customRule && tier.customRule.trim()) {
      const rule = tier.customRule.trim();
      const stopWords = new Set([
        'must', 'have', 'has', 'had', 'completed', 'complete', 'finish',
        'finished', 'the', 'and', 'for', 'with', 'that', 'this', 'from',
        'been', 'not', 'all', 'are', 'was', 'were', 'will', 'should',
        'would', 'could', 'their', 'they', 'them', 'your', 'our',
        'project', 'task', 'tasks', 'projects', 'any', 'least', 'one',
        'mentee', 'student'
      ]);

      const ruleWords = rule.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));
      if (ruleWords.length > 0) {
        customRuleSatisfied = ruleWords.every(keyword => {
          const kw = keyword.toLowerCase().replace(/[^a-z0-9]/gi, '');
          return completedTitlesLower.some(title => title.includes(kw));
        });
      }
    }

    customRuleChecks[tierId] = customRuleSatisfied;
    hardChecks[tierId] = checks;

    const allHardPass = Object.values(checks).every(Boolean);
    if (allHardPass && customRuleSatisfied && !maxEligibleTier) {
      maxEligibleTier = tierId;
    }
  }

  return {
    maxEligibleTier: maxEligibleTier || 'participation',
    hardChecks,
    customRuleChecks
  };
}

/**
 * Evaluate ONE mentee against the template criteria using AI.
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

    try {
      response = await Promise.race([
        ai.client.chat.completions.create({
          model: m,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          max_tokens: 2000
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`AI Request Timeout for model ${m} after 25s`)), 25000))
      ]);
      if (response) break;
    } catch (err) {
      lastError = err;
      logger.warn(`[aiEvaluationService] Model ${m} failed: ${err.message}`);

      if (/401|unauthorized|auth|api_key|invalid_key|429|rate_limit|quota|billing/i.test(err?.message || '')) {
        break;
      }

      if (idx === modelQueue.length - 1) {
        try {
          logger.info('[aiEvaluationService] Fetching available models list dynamically...');
          const listRes = await ai.client.models.list();
          const available = (listRes.data || [])
            .map(x => x.id)
            .filter(id => !/whisper|guard|embed|moderation/i.test(id));

          for (const modelId of available) {
            if (!triedModels.has(modelId)) {
              modelQueue.push(modelId);
            }
          }
        } catch (listErr) {
          logger.warn(`[aiEvaluationService] Failed to dynamically list models: ${listErr.message}`);
        }
      }
    }
  }

  if (!response) {
    throw new ValidationError(groqService._friendlyAiError(lastError));
  }

  const raw = response.choices[0]?.message?.content || '';
  return parseSingleAIResponse(raw, criteria, menteePayload, preCheckResult);
}

/**
 * Build a focused system prompt for evaluating ONE mentee.
 */
function buildSingleMenteePrompt(criteria, preCheckResult) {
  const tierDescriptions = criteria.map(c => {
    const lines = [`### ${c.id.toUpperCase()} ("${c.name}")`];
    if (c.minScorePercent > 0) lines.push(`  - Min score: ${c.minScorePercent}%`);
    if ((c.maxOpenBlockers ?? c.maxBlockers) >= 0) lines.push(`  - Max open blockers: ${c.maxOpenBlockers ?? c.maxBlockers}`);
    if (c.minCompletionRate > 0) lines.push(`  - Min completion rate: ${c.minCompletionRate}%`);
    if (c.minOnTimeRate > 0) lines.push(`  - Min on-time rate: ${c.minOnTimeRate}%`);
    if (c.minAvgRating > 0) lines.push(`  - Min avg rating: ${c.minAvgRating}`);
    if (c.customRule?.trim()) lines.push(`  - Custom rule: "${c.customRule.trim()}"`);
    return lines.join('\n');
  }).join('\n\n');

  const preCheckLines = [
    `SERVER PRE-CHECK VERDICT: maxEligibleTier = "${preCheckResult.maxEligibleTier}"`
  ];
  for (const [tierId, checks] of Object.entries(preCheckResult.hardChecks)) {
    const passAll = Object.values(checks).every(Boolean);
    const customOk = preCheckResult.customRuleChecks[tierId] !== false;
    preCheckLines.push(`  ${tierId}: hardConstraints=${passAll ? 'PASS' : 'FAIL'}, customRule=${customOk ? 'PASS' : 'FAIL'}`);
  }

  return `You are evaluating ONE mentee for certificate eligibility on a mentorship platform.

TIER DEFINITIONS:
${tierDescriptions || '- participation: everyone with >= 1 completed task'}

SERVER-SIDE PRE-CHECK VERDICT:
${preCheckLines.join('\n')}

YOU MUST ASSIGN: "${preCheckResult.maxEligibleTier}" as the certificate_tier. The tier decision is FINAL.

YOUR JOB:
1. Compute "match_score" (0-100) based on task quality and relevance.
2. Identify matched_keywords and missing_keywords.
3. Write detailed reasoning (4-5 sentences) explaining the evaluation.

OUTPUT FORMAT (pure JSON object):
{
  "mentee_id": "<string>",
  "is_eligible": true,
  "certificate_tier": "${preCheckResult.maxEligibleTier}",
  "match_score": 85,
  "matched_keywords": [],
  "missing_keywords": [],
  "overall_percentage": 0,
  "hard_constraints_check": {},
  "blockers_analysis": { "total": 0, "resolved": 0, "open": 0, "impact": "Low", "summary": "" },
  "reasoning": ""
}`;
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

/** @deprecated — legacy synchronous evaluator */
async function evaluateWithAI(template, menteePayloads, adminUserId) {
  const criteria = Array.isArray(template.criteria) ? template.criteria : [];
  const results = [];

  for (const payload of menteePayloads) {
    const preCheck = preCheckHardConstraints(payload, criteria);
    const result = await evaluateSingleMentee(template, payload, preCheck, adminUserId);
    results.push(result);
  }

  return results;
}

module.exports = {
  aggregateMenteeData,
  preCheckHardConstraints,
  evaluateSingleMentee,
  enqueueEvaluation,
  evaluateWithAI,
  buildFallbackResult
};
