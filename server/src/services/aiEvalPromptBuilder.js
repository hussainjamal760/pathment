/**
 * aiEvalPromptBuilder — Constructs structured system & user prompts for AI certificate evaluation.
 */

function buildTierDescriptions(criteria) {
  return criteria.map(c => {
    const lines = [`### TIER: "${c.id}" ("${c.name}")`];
    if (c.minScorePercent != null) lines.push(`  - Min score: ${c.minScorePercent}%`);
    if (c.maxOpenBlockers != null && c.maxOpenBlockers >= 0) lines.push(`  - Max open blockers: ${c.maxOpenBlockers}`);
    if (c.minCompletionRate != null) lines.push(`  - Min completion rate: ${c.minCompletionRate}%`);
    if (c.minOnTimeRate != null) lines.push(`  - Min on-time rate: ${c.minOnTimeRate}%`);
    if (c.minAvgRating != null) lines.push(`  - Min avg rating: ${c.minAvgRating}`);
    if (Array.isArray(c.keywords) && c.keywords.length > 0) lines.push(`  - Required Tech Stack / Keywords: ${c.keywords.join(', ')}`);
    if (c.customRule?.trim()) lines.push(`  - Custom Qualification Rule: "${c.customRule.trim()}"`);
    return lines.join('\n');
  }).join('\n\n');
}

function buildSingleMenteePrompt(criteria, preCheckResult) {
  const tierDescriptions = buildTierDescriptions(criteria);

  return `You are an expert AI evaluator assessing ONE mentee for certificate eligibility on a mentorship platform.

TIER DEFINITIONS & QUALIFICATION RULES:
${tierDescriptions || '- participation: everyone with >= 1 completed task'}

SERVER PRE-CHECK UPPER CEILING: "${preCheckResult.maxEligibleTier}"

EVALUATION RULES:
1. "maxEligibleTier" ("${preCheckResult.maxEligibleTier}") is the MAXIMUM ALLOWED tier based on server-side performance math. You MAY NOT assign a tier higher than "${preCheckResult.maxEligibleTier}".
2. TIER STEP-DOWN HIERARCHY: gold -> silver -> bronze -> participation.
3. You MUST evaluate the tier's "Custom Qualification Rule" and "Required Tech Stack / Keywords" against the mentee's completed tasks (status === "completed").
4. If the mentee fails the Custom Qualification Rule or Tech Stack Keywords for "${preCheckResult.maxEligibleTier}", STEP DOWN to the next lower tier in the hierarchy (e.g. silver). Do NOT jump straight to participation! Assign the highest lower tier whose rules & keywords the mentee DOES satisfy.
5. Compute "match_score" (0-100) reflecting how strongly the mentee aligns with the assigned tier.
6. List "matched_keywords" (keywords present in completed tasks) and "missing_keywords" (required keywords missing).
7. Generate "custom_rules_check": Array of objects [{ "rule": "<rule name/description>", "passed": boolean, "evidence": "<exact task title or metric reason>" }] detailing pass/fail results for each custom rule and tech stack requirement.
8. Write a 3-4 sentence detailed narrative in "reasoning" referencing task titles, custom rule evaluation, and performance metrics.

OUTPUT FORMAT (pure JSON object):
{
  "mentee_id": "<string>",
  "is_eligible": true,
  "certificate_tier": "<assigned_tier>",
  "match_score": 85,
  "matched_keywords": [],
  "missing_keywords": [],
  "custom_rules_check": [
    { "rule": "Custom Qualification Rule", "passed": true, "evidence": "Completed multi-step form task" }
  ],
  "overall_percentage": 0,
  "hard_constraints_check": {},
  "blockers_analysis": { "total": 0, "resolved": 0, "open": 0, "impact": "Low", "summary": "" },
  "reasoning": ""
}`;
}

/**
 * Build prompt for a BATCH of mentees.
 */
function buildBatchMenteePrompt(criteria, batchSize) {
  const tierDescriptions = buildTierDescriptions(criteria);

  return `You are an expert AI evaluator assessing a BATCH of up to ${batchSize} mentees for certificate eligibility on a mentorship platform.

TIER DEFINITIONS & QUALIFICATION RULES:
${tierDescriptions || '- participation: everyone with >= 1 completed task'}

EVALUATION INSTRUCTIONS:
1. Each mentee item in the input array contains:
   - "mentee_id": Mentee ID string
   - "score": Normalized performance percentage (0-100)
   - "completion": Task completion rate (0-100)
   - "on_time": On-time submission rate (0-100)
   - "avg_rating": Average mentor rating (1.0-5.0)
   - "max_eligible_tier": Maximum allowed tier ceiling determined by server math.
   - "tasks": List of assigned tasks with "title", "status" ("completed"|"in_progress"|"assigned"|"submitted"), "type" ("project"|"assignment"|"practical"|"exercise"|"quiz"|"custom"), "isCustom" (boolean true for mentor custom tasks), "rating", and "desc".
     CRITICAL RULE 1: Only tasks with status === "completed" count as finished work. Tasks with status "assigned", "in_progress", or "submitted" are UNFINISHED and CANNOT satisfy custom rules or keywords!
     CRITICAL RULE 2: CUSTOM QUALIFICATION RULE & TECH STACK CHECKING:
     - Search completed tasks (status === "completed") for titles, descriptions, task types, or isCustom === true flags that match the tier's "Custom Qualification Rule" (e.g. "must have multivendor project done", "at least 2 custom tasks", "project type task").
     - Match keywords against completed task titles and descriptions loosely (e.g. HTML, CSS, React, Node, etc.).

2. TIER STEP-DOWN HIERARCHY: gold -> silver -> bronze -> participation.

3. FOR EVERY MENTEE IN THE INPUT ARRAY, EVALUATE:
   - "certificate_tier": Check the tier's "Custom Qualification Rule" and "Required Tech Stack / Keywords" against the mentee's completed tasks.
     * If the mentee satisfies the Custom Rule and Tech Stack for "max_eligible_tier", assign "certificate_tier": "max_eligible_tier".
     * If the mentee FAILS the Custom Rule or Tech Stack for "max_eligible_tier" (e.g. Gold), STEP DOWN to the next lower tier (e.g. Silver). Do NOT jump straight to participation! Assign the highest lower tier whose rules the mentee DOES satisfy.
   - "match_score": Integer (0-100) reflecting relevance and task quality.
   - "matched_keywords": Array of target keywords matched in completed tasks.
   - "missing_keywords": Array of target keywords missing from completed tasks.
   - "custom_rules_check": Array of [{ "rule": "<rule name/description>", "passed": boolean, "evidence": "<exact task title or metric reason>" }] detailing pass/fail status for custom rules & keyword checks.
   - "blockers_analysis": { "total": number, "resolved": number, "open": number, "impact": "Low"|"Medium"|"High", "summary": "brief summary" }
   - "reasoning": 3-4 sentence detailed narrative explicitly stating which custom rules passed/failed, matched keywords, task performance, cohort attendance, and why the tier was assigned or stepped down.

4. OUTPUT FORMAT: PURE JSON ARRAY containing exactly one result object per input mentee.
[
  {
    "mentee_id": "<exact input mentee_id>",
    "is_eligible": true,
    "certificate_tier": "<assigned tier id>",
    "match_score": 85,
    "matched_keywords": ["React", "Node.js"],
    "missing_keywords": [],
    "custom_rules_check": [
      { "rule": "Custom Qualification Rule", "passed": true, "evidence": "Completed multi-step form assignment" }
    ],
    "overall_percentage": 92,
    "blockers_analysis": { "total": 0, "resolved": 0, "open": 0, "impact": "Low", "summary": "No blockers" },
    "reasoning": "Mentee completed advanced assignments with a 92% score. Custom qualification rule for Silver tier satisfied."
  }
]`;
}

module.exports = { buildSingleMenteePrompt, buildBatchMenteePrompt };
