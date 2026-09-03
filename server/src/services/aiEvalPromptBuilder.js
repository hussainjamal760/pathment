/**
 * aiEvalPromptBuilder — Constructs structured system & user prompts for AI certificate evaluation.
 */
function buildSingleMenteePrompt(criteria, preCheckResult) {
  const tierDescriptions = criteria.map(c => {
    const lines = [`### ${c.id.toUpperCase()} ("${c.name}")`];
    if (c.minScorePercent != null) lines.push(`  - Min score: ${c.minScorePercent}%`);
    if (c.maxOpenBlockers != null) lines.push(`  - Max open blockers: ${c.maxOpenBlockers}`);
    if (c.minCompletionRate != null) lines.push(`  - Min completion rate: ${c.minCompletionRate}%`);
    if (c.minOnTimeRate != null) lines.push(`  - Min on-time rate: ${c.minOnTimeRate}%`);
    if (c.minAvgRating != null) lines.push(`  - Min avg rating: ${c.minAvgRating}`);
    if (Array.isArray(c.keywords) && c.keywords.length > 0) lines.push(`  - Target Keywords/Tech Stack: ${c.keywords.join(', ')}`);
    if (c.customRule?.trim()) lines.push(`  - Custom rule: "${c.customRule.trim()}"`);
    return lines.join('\n');
  }).join('\n\n');

  const preCheckLines = [
    `SERVER PRE-CHECK VERDICT: maxEligibleTier = "${preCheckResult.maxEligibleTier}"`
  ];
  for (const [tierId, checks] of Object.entries(preCheckResult.hardChecks || {})) {
    const passAll = Object.values(checks).every(Boolean);
    preCheckLines.push(`  ${tierId}: hardConstraints=${passAll ? 'PASS' : 'FAIL'}`);
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

module.exports = { buildSingleMenteePrompt };
