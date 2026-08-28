/**
 * aiEvaluationService — certificate eligibility evaluation via AI.
 *
 * Architecture (single-responsibility, no monolith):
 *   1. aggregateMenteeData     — SQL queries + metric computation, no AI.
 *   2. preCheckHardConstraints — server-side mathematical constraint checks.
 *   3. evaluateSingleMentee    — single-mentee AI call, no DB writes.
 *   4. buildSingleMenteePrompt — focused prompt for one mentee.
 *   5. parseAIResponse         — JSON extraction + validation.
 *   6. enqueueEvaluation       — creates queue jobs for the worker.
 */
const { v4: uuidv4 } = require('uuid');
const { models, sequelize } = require('../../../db');
const { Op } = require('sequelize');
const groqService = require('../../../services/groqService');
const { ValidationError } = require('../../../utils/errors/errorTypes');

// ────────────────────────────────────────────────────────────────────────────
// 1. Data aggregation (unchanged — proven correct)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build a rich data snapshot for each mentee in `menteeIds`.
 * Computes all derived metrics server-side so the AI receives ground-truth numbers.
 * Returns an array of plain objects ready to be serialised into the AI prompt.
 */
async function aggregateMenteeData(menteeIds) {
  if (!menteeIds.length) return [];

  // All assigned tasks (not cancelled)
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

  // All blockers
  const blockers = await models.Blocker.findAll({
    where: { menteeId: { [Op.in]: menteeIds } },
    attributes: ['menteeId', 'status', 'category', 'severity', 'openedAt', 'resolvedAt'],
    raw: true
  });

  // Group by menteeId
  const taskMap = {};
  const blockerMap = {};
  for (const id of menteeIds) {
    taskMap[id] = [];
    blockerMap[id] = [];
  }

  for (const t of tasks) taskMap[t.menteeId]?.push(t);
  for (const b of blockers) blockerMap[b.menteeId]?.push(b);

  return menteeIds.map((id) => {
    const myTasks    = taskMap[id]   || [];
    const myBlockers = blockerMap[id] || [];

    // ── Points / normalized score ───────────────────────────────────────────
    let totalBase = 0, totalAwarded = 0;
    const taskSummaries = [];

    for (const t of myTasks) {
      const base    = t.pointsBase ?? t.roadmapTask?.pointsBase ?? 10;
      const awarded = t.pointsAwarded ?? 0;
      totalBase += base;
      if (t.status === 'completed') totalAwarded += awarded;

      taskSummaries.push({
        title:      t.roadmapTask?.title ?? (t.isCustomTask ? 'Custom Task' : 'Unknown'),
        type:       t.roadmapTask?.type  ?? 'custom',
        difficulty: t.roadmapTask?.difficulty ?? 'medium',
        status:     t.status,
        rating:     t.finalRating ? parseFloat(t.finalRating) : null,
        isLate:     t.isLate
      });
    }

    const normalizedScore = totalBase > 0
      ? Math.round((totalAwarded / totalBase) * 100)
      : 0;

    // ── Derived metrics ─────────────────────────────────────────────────────
    const completedTasks = myTasks.filter(t => t.status === 'completed');
    const totalTasks     = myTasks.length;
    const completionRate = totalTasks > 0
      ? Math.round((completedTasks.length / totalTasks) * 100)
      : 0;

    // On-time rate: among completed tasks, % where isLate is falsy
    const onTimeTasks  = completedTasks.filter(t => !t.isLate).length;
    const onTimeRate   = completedTasks.length > 0
      ? Math.round((onTimeTasks / completedTasks.length) * 100)
      : 0;

    // Average mentor rating (only tasks that have been rated)
    const ratedTasks = completedTasks.filter(t => t.finalRating != null);
    const avgRating  = ratedTasks.length > 0
      ? parseFloat((ratedTasks.reduce((s, t) => s + parseFloat(t.finalRating), 0) / ratedTasks.length).toFixed(2))
      : null;

    // ── Blockers ────────────────────────────────────────────────────────────
    const totalBlockers    = myBlockers.length;
    const resolvedBlockers = myBlockers.filter(b => b.status === 'resolved').length;
    const openBlockers     = totalBlockers - resolvedBlockers;

    // Group open blockers by severity
    const openByName = myBlockers.filter(b => b.status !== 'resolved');
    const blockersBySeverity = openByName.reduce((acc, b) => {
      const sev = b.severity || 'unknown';
      acc[sev] = (acc[sev] || 0) + 1;
      return acc;
    }, {});

    return {
      mentee_id:        id,
      normalized_score: normalizedScore,   // points-based 0-100 — GROUND TRUTH
      completion_rate:  completionRate,    // % of tasks completed
      on_time_rate:     onTimeRate,        // % of completed tasks submitted on time
      avg_rating:       avgRating,         // mentor rating avg (null if no ratings)
      tasks:            taskSummaries,
      total_tasks:      totalTasks,
      completed_tasks:  completedTasks.length,
      blockers: {
        total:            totalBlockers,
        resolved:         resolvedBlockers,
        open:             openBlockers,
        by_severity:      blockersBySeverity,  // { critical: 1, high: 2, medium: 0 }
        categories:       [...new Set(myBlockers.map(b => b.category))]
      }
    };
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Server-side hard constraint pre-check (NEW — ground truth, no AI)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Determine the highest eligible tier for a mentee using ONLY mathematical
 * checks. The AI cannot override these results.
 *
 * @param {Object} menteePayload — output from aggregateMenteeData for one mentee
 * @param {Array}  criteria      — template.criteria (ordered highest → lowest)
 * @returns {{ maxEligibleTier, hardChecks, customRuleChecks }}
 */
function preCheckHardConstraints(menteePayload, criteria) {
  if (!criteria.length) {
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

    // Score threshold
    const minScore = tier.minScorePercent ?? 0;
    if (minScore > 0 && menteePayload.normalized_score < minScore) {
      checks.score_ok = false;
    }

    // Blockers
    const maxBlockers = tier.maxOpenBlockers ?? tier.maxBlockers ?? -1;
    if (maxBlockers >= 0 && menteePayload.blockers.open > maxBlockers) {
      checks.blockers_ok = false;
    }

    // Completion rate
    const minCompletion = tier.minCompletionRate ?? 0;
    if (minCompletion > 0 && menteePayload.completion_rate < minCompletion) {
      checks.completion_rate_ok = false;
    }

    // On-time rate
    const minOnTime = tier.minOnTimeRate ?? 0;
    if (minOnTime > 0 && menteePayload.on_time_rate < minOnTime) {
      checks.on_time_rate_ok = false;
    }

    // Average rating
    const minRating = tier.minAvgRating ?? 0;
    if (minRating > 0) {
      if (menteePayload.avg_rating == null || menteePayload.avg_rating < minRating) {
        checks.rating_ok = false;
      }
    }

    // Custom admin rule — literal case-insensitive substring check
    let customRuleSatisfied = true;
    if (tier.customRule && tier.customRule.trim()) {
      const rule = tier.customRule.trim();
      // Extract keywords from the rule (words > 2 chars that aren't stop words)
      const stopWords = new Set([
        'must', 'have', 'has', 'had', 'completed', 'complete', 'finish',
        'finished', 'the', 'and', 'for', 'with', 'that', 'this', 'from',
        'been', 'not', 'all', 'are', 'was', 'were', 'will', 'should',
        'would', 'could', 'their', 'they', 'them', 'your', 'our',
        'project', 'task', 'tasks', 'projects', 'any', 'least', 'one',
        'mentee', 'student'
      ]);

      // Try to find meaningful keywords in the rule
      const ruleWords = rule.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));

      if (ruleWords.length > 0) {
        // Each meaningful keyword must appear in at least one completed task title
        customRuleSatisfied = ruleWords.every(keyword => {
          const kw = keyword.toLowerCase().replace(/[^a-z0-9]/gi, '');
          return completedTitlesLower.some(title => title.includes(kw));
        });
      }
    }

    customRuleChecks[tierId] = customRuleSatisfied;
    hardChecks[tierId] = checks;

    const allHardPass = Object.values(checks).every(v => v === true);
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

// ────────────────────────────────────────────────────────────────────────────
// 3. Single-mentee AI evaluation (NEW — focused, accurate)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate ONE mentee against the template criteria using AI.
 * Receives the pre-check result so the AI knows the max tier and can't override.
 *
 * @param {Object} template       — CertificateTemplate instance
 * @param {Object} menteePayload  — aggregated data for this single mentee
 * @param {Object} preCheckResult — output from preCheckHardConstraints
 * @param {string} adminUserId    — for AI key resolution
 * @returns {Object} evaluation result
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
  const candidates = [ai.model];
  if (ai.provider === 'groq' || /groq/i.test(ai.baseURL || '')) {
    candidates.push('llama-3.3-70b-versatile', 'llama3-70b-8192', 'llama-3.1-8b-instant');
  } else if (ai.provider === 'openai' || /openai/i.test(ai.baseURL || '')) {
    candidates.push('gpt-4o-mini', 'gpt-4o');
  }
  const uniqueModels = [...new Set(candidates.filter(Boolean))];

  let lastError = null;
  for (const m of uniqueModels) {
    try {
      response = await Promise.race([
        ai.client.chat.completions.create({
          model: m,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt }
          ],
          temperature: 0.1,
          max_tokens: 2000
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`AI Request Timeout for model ${m} after 25s`)), 25000))
      ]);
      if (response) break;
    } catch (err) {
      lastError = err;
      console.warn(`[aiEvaluationService] Model ${m} failed:`, err.message);
      if (!/404|model_not_found|does not exist/i.test(err?.message || '')) {
        break;
      }
    }
  }

  if (!response) {
    throw new ValidationError(groqService._friendlyAiError(lastError));
  }

  const raw = response.choices[0]?.message?.content || '';
  const parsed = parseSingleAIResponse(raw, criteria, menteePayload, preCheckResult);
  return parsed;
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Prompt construction for single mentee
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build a focused system prompt for evaluating ONE mentee.
 * The pre-check result is embedded so the AI knows the server's verdict.
 */
function buildSingleMenteePrompt(criteria, preCheckResult) {
  const tierIds = criteria.map(c => `"${c.id}"`).join(' | ');

  // Build tier descriptions
  const tierDescriptions = criteria.map(c => {
    const lines = [];
    lines.push(`### ${c.id.toUpperCase()} ("${c.name}")`);

    const minScore = c.minScorePercent ?? 0;
    if (minScore > 0) lines.push(`  - Min score: ${minScore}%`);
    const maxBlockers = c.maxOpenBlockers ?? c.maxBlockers ?? -1;
    if (maxBlockers >= 0) lines.push(`  - Max open blockers: ${maxBlockers}`);
    const minCompletion = c.minCompletionRate ?? 0;
    if (minCompletion > 0) lines.push(`  - Min completion rate: ${minCompletion}%`);
    const minOnTime = c.minOnTimeRate ?? 0;
    if (minOnTime > 0) lines.push(`  - Min on-time rate: ${minOnTime}%`);
    const minRating = c.minAvgRating ?? 0;
    if (minRating > 0) lines.push(`  - Min avg rating: ${minRating}`);
    const kws = (c.keywords || []).join(', ') || 'none';
    lines.push(`  - Keywords: [${kws}]`);
    if (c.customRule?.trim()) {
      lines.push(`  - Custom rule: "${c.customRule.trim()}"`);
    }
    return lines.join('\n');
  }).join('\n\n');

  // Pre-check summary
  const preCheckLines = [];
  preCheckLines.push(`SERVER PRE-CHECK VERDICT: maxEligibleTier = "${preCheckResult.maxEligibleTier}"`);
  for (const [tierId, checks] of Object.entries(preCheckResult.hardChecks)) {
    const passAll = Object.values(checks).every(v => v);
    const customOk = preCheckResult.customRuleChecks[tierId] !== false;
    preCheckLines.push(`  ${tierId}: hardConstraints=${passAll ? 'PASS' : 'FAIL'}, customRule=${customOk ? 'PASS' : 'FAIL'} ${JSON.stringify(checks)}`);
  }

  return `You are evaluating ONE mentee for certificate eligibility on a mentorship platform.

You will receive a JSON object with this mentee's complete performance data: their tasks (title, status, type, difficulty, rating, lateness), normalized_score, completion_rate, on_time_rate, avg_rating, and blockers.

════════════════════════════════════════
TIER DEFINITIONS (highest → lowest)
════════════════════════════════════════
${tierDescriptions || '- participation: everyone with >= 1 completed task'}

════════════════════════════════════════
SERVER-SIDE HARD CONSTRAINT PRE-CHECK
════════════════════════════════════════
The server has already verified all mathematical constraints and custom rules.
${preCheckLines.join('\n')}

YOU MUST ASSIGN: "${preCheckResult.maxEligibleTier}" as the certificate_tier.
You CANNOT override the server's tier decision. The tier is FINAL.

════════════════════════════════════════
YOUR JOB
════════════════════════════════════════
Since the tier is already decided by the server, your job is:
1. Compute a "match_score" (0-100) — a holistic quality score within the assigned tier:
   - How well do the mentee's completed task titles match the tier's keywords?
   - How is their blocker resolution quality?
   - Were tasks submitted on time?
   - What is the overall task quality (ratings)?
2. Identify matched_keywords and missing_keywords from the tier's keyword list.
3. Analyze blocker resolution.
4. Write detailed reasoning (4-5 sentences) explaining:
   - Which tasks they completed and how they match the requirements
   - Specific deductions with actual values vs targets
   - Why the assigned tier is justified
   - Any notable patterns (late submissions, high ratings, etc.)

IMPORTANT ACCURACY RULES:
- Read the task list CAREFULLY. Each task has a "title" and "status" field.
- A task is completed ONLY if status === "completed". Do NOT assume completion.
- List the exact task titles you see in the data. Do NOT invent or hallucinate tasks.
- If the data shows 5 completed tasks, acknowledge exactly 5 completed tasks.

════════════════════════════════════════
OUTPUT FORMAT (pure JSON object, no markdown)
════════════════════════════════════════
{
  "mentee_id": "<string>",
  "is_eligible": <boolean>,
  "certificate_tier": "${preCheckResult.maxEligibleTier}",
  "match_score": <number 0-100>,
  "matched_keywords": ["<keyword>", ...],
  "missing_keywords": ["<keyword>", ...],
  "overall_percentage": <copy normalized_score from input>,
  "hard_constraints_check": ${JSON.stringify(preCheckResult.hardChecks[preCheckResult.maxEligibleTier] || { score_ok: true, blockers_ok: true, completion_rate_ok: true, on_time_rate_ok: true, rating_ok: true })},
  "blockers_analysis": {
    "total": <number>,
    "resolved": <number>,
    "open": <number>,
    "impact": "Low" | "Medium" | "High",
    "summary": "<1 sentence>"
  },
  "reasoning": "<detailed 4-5 sentence explanation>"
}

Return ONLY the JSON object. No markdown, no explanations outside the object.`;
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Response parsing for single mentee
// ────────────────────────────────────────────────────────────────────────────

function parseSingleAIResponse(raw, criteria, menteePayload, preCheckResult) {
  let jsonStr = raw.trim();

  // Handle code blocks
  const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlock) {
    jsonStr = codeBlock[1];
  }

  // Try to extract JSON object
  const firstBrace = jsonStr.indexOf('{');
  const lastBrace  = jsonStr.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
  }

  let item;
  try {
    item = JSON.parse(jsonStr);
  } catch {
    console.error('[aiEvaluationService] Failed to parse single AI response:', jsonStr.slice(0, 500));
    // Return a safe fallback using pre-check data
    return buildFallbackResult(menteePayload, preCheckResult);
  }

  if (!item || typeof item !== 'object') {
    return buildFallbackResult(menteePayload, preCheckResult);
  }

  // Enforce server-side tier — the AI cannot override it
  const validTierIds = new Set(criteria.map(c => c.id));
  validTierIds.add('participation');

  return {
    mentee_id:         menteePayload.mentee_id,
    is_eligible:       item.is_eligible ?? true,
    certificate_tier:  preCheckResult.maxEligibleTier, // ALWAYS use server's decision
    match_score:       Math.min(100, Math.max(0, Number(item.match_score) || 0)),
    matched_keywords:  Array.isArray(item.matched_keywords) ? item.matched_keywords : [],
    missing_keywords:  Array.isArray(item.missing_keywords)  ? item.missing_keywords  : [],
    overall_percentage: menteePayload.normalized_score, // ALWAYS use server's number
    hard_constraints_check: preCheckResult.hardChecks[preCheckResult.maxEligibleTier] || {
      score_ok: true, blockers_ok: true, completion_rate_ok: true,
      on_time_rate_ok: true, rating_ok: true
    },
    blockers_analysis: {
      total:    Number(item.blockers_analysis?.total)    || menteePayload.blockers.total,
      resolved: Number(item.blockers_analysis?.resolved) || menteePayload.blockers.resolved,
      open:     Number(item.blockers_analysis?.open)     || menteePayload.blockers.open,
      impact:   item.blockers_analysis?.impact           || 'Low',
      summary:  item.blockers_analysis?.summary          || ''
    },
    reasoning: item.reasoning || ''
  };
}

/**
 * Build a safe fallback result when AI parsing fails.
 * Uses pre-check data so the mentee still gets a valid evaluation.
 */
function buildFallbackResult(menteePayload, preCheckResult) {
  return {
    mentee_id:         menteePayload.mentee_id,
    is_eligible:       preCheckResult.maxEligibleTier !== 'participation',
    certificate_tier:  preCheckResult.maxEligibleTier,
    match_score:       menteePayload.normalized_score,
    matched_keywords:  [],
    missing_keywords:  [],
    overall_percentage: menteePayload.normalized_score,
    hard_constraints_check: preCheckResult.hardChecks[preCheckResult.maxEligibleTier] || {
      score_ok: true, blockers_ok: true, completion_rate_ok: true,
      on_time_rate_ok: true, rating_ok: true
    },
    blockers_analysis: {
      total:    menteePayload.blockers.total,
      resolved: menteePayload.blockers.resolved,
      open:     menteePayload.blockers.open,
      impact:   menteePayload.blockers.open > 2 ? 'High' : menteePayload.blockers.open > 0 ? 'Medium' : 'Low',
      summary:  'AI response could not be parsed. Tier assigned by server-side constraint checks.'
    },
    reasoning: `Server pre-check determined ${preCheckResult.maxEligibleTier} tier based on: score=${menteePayload.normalized_score}%, completion=${menteePayload.completion_rate}%, on-time=${menteePayload.on_time_rate}%. AI response parsing failed; this is a fallback result.`
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Queue enqueue function (NEW)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Enqueue per-mentee evaluation jobs. Returns the runId.
 *
 * @param {string}   templateId  — certificate template ID
 * @param {string[]} menteeIds   — list of mentee user IDs
 * @param {string}   triggeredBy — admin/mentor user ID
 * @param {Array}    criteria    — template.criteria for pre-checks
 * @returns {{ runId: string, total: number }}
 */
async function enqueueEvaluation(templateId, menteeIds, triggeredBy, criteria) {
  // 1. Aggregate all mentee data in one efficient batch query
  const payloads = await aggregateMenteeData(menteeIds);
  const runId = uuidv4();

  // 2. Pre-check + create queue rows
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

  // 3. Bulk insert into queue
  await models.AIEvaluationQueue.bulkCreate(queueRows);

  console.log(`[aiEvaluationService] Enqueued ${queueRows.length} evaluation jobs (runId=${runId})`);

  return { runId, total: queueRows.length };
}

// ────────────────────────────────────────────────────────────────────────────
// Legacy export kept for backward compatibility during transition
// ────────────────────────────────────────────────────────────────────────────

/** @deprecated — use enqueueEvaluation + worker instead */
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
  evaluateWithAI,    // legacy
  buildFallbackResult
};
