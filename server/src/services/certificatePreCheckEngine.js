/**
 * certificatePreCheckEngine — Server-side deterministic mathematical pre-check engine.
 *
 * Responsibilities:
 *   - Evaluates mentee performance metrics (normalized score, open blockers, completion rate, on-time rate, mentor rating).
 *   - Evaluates qualitative custom rules against completed task titles.
 *   - Determines highest eligible certificate tier BEFORE sending payload to LLM.
 *   - 100% deterministic (no AI/LLM dependencies).
 */

/**
 * Determine the highest eligible tier for a mentee using server-side hard constraints.
 *
 * @param {Object} menteePayload - Data snapshot containing scores, tasks, blockers, etc.
 * @param {Array} criteria - Array of template criteria tier definitions.
 * @returns {Object} { maxEligibleTier, hardChecks, customRuleChecks }
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

    if (tier.minScorePercent != null && menteePayload.normalized_score < tier.minScorePercent) {
      checks.score_ok = false;
    }

    if (tier.maxOpenBlockers != null && menteePayload.blockers.open > tier.maxOpenBlockers) {
      checks.blockers_ok = false;
    }

    if (tier.minCompletionRate != null && menteePayload.completion_rate < tier.minCompletionRate) {
      checks.completion_rate_ok = false;
    }

    if (tier.minOnTimeRate != null && menteePayload.on_time_rate < tier.minOnTimeRate) {
      checks.on_time_rate_ok = false;
    }

    if (tier.minAvgRating != null && (menteePayload.avg_rating == null || menteePayload.avg_rating < tier.minAvgRating)) {
      checks.rating_ok = false;
    }

    hardChecks[tierId] = checks;

    const allHardPass = Object.values(checks).every(Boolean);
    if (allHardPass && !maxEligibleTier) {
      maxEligibleTier = tierId;
    }
  }

  return {
    maxEligibleTier: maxEligibleTier || 'participation',
    hardChecks
  };
}

module.exports = {
  preCheckHardConstraints
};
