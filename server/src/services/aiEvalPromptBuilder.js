/**
 * aiEvalPromptBuilder — Constructs system & user prompts for batch AI certificate evaluation.
 *
 * NOTE: criteria arrays MUST be ordered highest-tier-first (index 0 = top tier).
 * This is the contract enforced at template creation time and relied upon everywhere in
 * the evaluation pipeline (preCheckHardConstraints, isTierAllowed, prompt hierarchy).
 */
const { sortCriteriaByPriority } = require('../utils/criteriaUtils');


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

function getDynamicTierOrder(criteria) {
  if (!Array.isArray(criteria) || criteria.length === 0) {
    return { hierarchy: '"participation"', topTierId: 'participation', topTierName: 'Participation Certificate' };
  }

  const hierarchy = criteria.map(c => `"${c.id}" ("${c.name}")`).join(' -> ');
  const topTierId = criteria[0].id;
  const topTierName = criteria[0].name || topTierId;

  return { hierarchy, topTierId, topTierName };
}

/**
 * Build the system prompt for a BATCH of mentees.
 * @param {Array} criteria - Tier criteria array, ordered highest tier first.
 * @param {number} batchSize - Max number of mentees in a single AI call.
 */
function buildBatchMenteePrompt(criteria, batchSize) {
  // Sort by explicit priority so the prompt hierarchy matches the actual evaluation order.
  const sorted = sortCriteriaByPriority(criteria);
  const tierDescriptions = buildTierDescriptions(sorted);
  const { hierarchy, topTierId, topTierName } = getDynamicTierOrder(sorted);

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
     - Match keywords against completed task titles and descriptions loosely based ONLY on the explicit keywords specified for that tier.

     CRITICAL RULE 3: STRICT EXPLICIT CRITERIA ONLY (NO HALLUCINATED TECH STACK REQUIREMENTS):
     - DO NOT invent, assume, or penalize for missing technologies (such as Node, Express, MongoDB, REST design, Databases, Docker, etc.) that are NOT explicitly listed in the tier's "Required Tech Stack / Keywords" or "Custom Qualification Rule"!
     - Only evaluate against keywords explicitly listed in TIER DEFINITIONS for that tier. If the tier keywords are "HTML, css, js", you MUST ONLY check for HTML, css, js. If all keywords listed for that tier are present in completed tasks (or if no keywords are specified), the Tech Stack check is 100% PASSED.
     - NEVER state in your "reasoning" or "custom_rules_check" that a mentee failed a tier for unlisted technologies!

     CRITICAL RULE 4: EXPLICIT DYNAMIC REASONING FOR HARD CONSTRAINT FAILURES & TIER STEP-DOWN:
     - Each mentee item contains "hard_constraint_failures": Array of exact dynamic metric failure reasons calculated by server math.
     - IF "max_eligible_tier" is lower than "${topTierId}" AND "hard_constraint_failures" contains entries, your "reasoning" MUST quote the exact dynamic failure message provided in "hard_constraint_failures" word-for-word (using the exact threshold percentage specified in hard_constraint_failures).
     - NEVER output hardcoded numbers (like 90%) unless that exact number is provided in hard_constraint_failures!
     - DO NOT invent, guess, or claim missing technologies (like Node, MongoDB, REST design, etc.) as the reason for stepping down! Your reasoning MUST be grounded 100% on actual metric failures from hard_constraint_failures or missing explicit keywords.

     CRITICAL RULE 5: MANDATORY MAXIMUM QUALIFIED TIER ASSIGNMENT (NO UNJUSTIFIED STEP-DOWNS):
     - If a mentee's "max_eligible_tier" is "${topTierId}", AND the mentee's completed tasks satisfy explicit keywords (or if no keywords are required) AND custom rule (or if no custom rule is set) for "${topTierName}", YOU MUST ASSIGN "certificate_tier": "${topTierId}"!
     - Stepping down from "max_eligible_tier" to a lower tier is STRICTLY PROHIBITED unless there is an explicit missing keyword or explicit failed Custom Qualification Rule!
     - DO NOT invent "cohort-relative" or unlisted threshold excuses to downgrade a mentee!

2. DYNAMIC TIER STEP-DOWN HIERARCHY (highest to lowest): ${hierarchy}.

3. FOR EVERY MENTEE IN THE INPUT ARRAY, EVALUATE:
   - "certificate_tier": Check the tier's "Custom Qualification Rule" and "Required Tech Stack / Keywords" against the mentee's completed tasks.
     * If the mentee satisfies the Custom Rule and explicit Tech Stack for "max_eligible_tier", assign "certificate_tier": "max_eligible_tier".
     * If the mentee FAILS the explicit Custom Rule or explicit Tech Stack for "max_eligible_tier", STEP DOWN to the next lower tier in the hierarchy. Do NOT jump straight to the bottom! Assign the highest lower tier whose rules the mentee DOES satisfy.
   - "match_score": Integer (0-100) reflecting relevance and task quality.
   - "matched_keywords": Array of target keywords matched in completed tasks.
   - "missing_keywords": Array of target keywords missing from completed tasks.
   - "custom_rules_check": Array of [{ "rule": "<rule name/description>", "passed": boolean, "evidence": "<exact task title or metric reason>" }] detailing pass/fail status for custom rules & keyword checks.
   - "blockers_analysis": { "total": number, "resolved": number, "open": number, "impact": "Low"|"Medium"|"High", "summary": "brief summary" }
   - "reasoning": 3-4 sentence detailed narrative explicitly stating hard_constraint_failures (if any), custom rules passed/failed, matched keywords, task performance, and why the tier was assigned or stepped down. NEVER invent unlisted technology names!

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
    "reasoning": "Mentee completed advanced assignments with a 92% score. Custom qualification rule satisfied."
  }
]`;
}

module.exports = { buildBatchMenteePrompt };
