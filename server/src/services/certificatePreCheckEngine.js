/**
 * certificatePreCheckEngine — Server-side deterministic mathematical pre-check engine.
 *
 * Responsibilities:
 *   - Evaluates mentee performance metrics (normalized score, open blockers, completion rate, on-time rate, mentor rating, cohort attendance).
 *   - Determines highest eligible certificate tier BEFORE sending payload to LLM.
 *   - 100% deterministic (no AI/LLM dependencies).
 */

/**
 * Determine the highest eligible tier for a mentee using server-side hard constraints.
 *
 * @param {Object} menteePayload - Data snapshot containing scores, tasks, blockers, cohort_reviews, etc.
 * @param {Array} criteria - Array of template criteria tier definitions.
 * @returns {Object} { maxEligibleTier, hardChecks }
 */
function preCheckHardConstraints(menteePayload, criteria) {
  if (!criteria || !criteria.length) {
    return {
      maxEligibleTier: 'participation',
      hardChecks: {},
    };
  }

  const hardChecks = {};
  let maxEligibleTier = null;

  for (const tier of criteria) {
    const tierId = tier.id;
    const checks = {
      score_ok: true,
      blockers_ok: true,
      completion_rate_ok: true,
      on_time_rate_ok: true,
      rating_ok: true,
      attendance_ok: true
    };

    if (tier.minScorePercent != null && menteePayload.normalized_score < tier.minScorePercent) {
      checks.score_ok = false;
    }

    // maxOpenBlockers: -1 = unlimited (no restriction). Only apply check when >= 0.
    if (tier.maxOpenBlockers != null && tier.maxOpenBlockers >= 0 && menteePayload.blockers.open > tier.maxOpenBlockers) {
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

    // Attendance check: only enforced when minAttendanceRate is set AND data is available.
    // If no cohort sessions have been held yet, skip (do not penalize mentee).
    if (
      tier.minAttendanceRate != null &&
      menteePayload.cohort_reviews?.data_available === true
    ) {
      const attendancePct = menteePayload.cohort_reviews.attendance_pct ?? 0;
      if (attendancePct < tier.minAttendanceRate) {
        checks.attendance_ok = false;
      }
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
