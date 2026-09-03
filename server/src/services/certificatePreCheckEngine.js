const { sortCriteriaByPriority } = require('../utils/criteriaUtils');

/**
 * certificatePreCheckEngine — Server-side deterministic mathematical pre-check engine.
 *
 * Responsibilities:
 *   - Evaluates mentee performance metrics (normalized score, open blockers, completion rate,
 *     on-time rate, mentor rating, cohort attendance).
 *   - Determines highest eligible certificate tier BEFORE sending payload to LLM.
 *   - 100% deterministic (no AI/LLM dependencies).
 *
 * CRITICAL INVARIANT: The `criteria` array MUST be ordered highest-tier-first (index 0 = top
 * tier). The engine stops at the FIRST tier a mentee fully passes and records it as the ceiling.
 * Callers (enqueueEvaluation, etc.) are responsible for maintaining this order. An incorrect
 * order will silently produce a wrong (too-low) tier ceiling — no error will be thrown.
 *
 * This invariant is enforced at template creation/update time: the UI always stores tiers in
 * the display order which is highest → lowest. Do not reorder without updating the UI contract.
 */

/**
 * Determine the highest eligible tier for a mentee using server-side hard constraints.
 *
 * @param {Object} menteePayload - Data snapshot: normalized_score, blockers, completion_rate,
 *   on_time_rate, avg_rating, cohort_reviews.
 * @param {Array}  criteria      - Tier definitions, ordered highest-priority-first.
 * @returns {{ maxEligibleTier: string, hardChecks: Object }}
 */
function preCheckHardConstraints(menteePayload, criteria) {
  if (!criteria || !criteria.length) {
    return {
      maxEligibleTier: 'participation',
      hardChecks: {},
    };
  }

  // Sort highest-priority tier first. This is the guarantee that replaces the
  // old "array position = prestige" implicit contract (BUG-1 fix, now enforced here).
  const sortedCriteria = sortCriteriaByPriority(criteria);

  const hardChecks = {};
  let maxEligibleTier = null;

  for (const tier of sortedCriteria) {
    const tierId = tier.id;
    const checks = {
      score_ok:           true,
      blockers_ok:        true,
      completion_rate_ok: true,
      on_time_rate_ok:    true,
      rating_ok:          true,
      attendance_ok:      true,
    };

    if (tier.minScorePercent != null && menteePayload.normalized_score < tier.minScorePercent) {
      checks.score_ok = false;
    }

    // maxOpenBlockers: -1 = unlimited (no restriction). Enforce only when >= 0.
    const openBlockers = menteePayload.blockers?.open ?? 0;
    if (tier.maxOpenBlockers != null && tier.maxOpenBlockers >= 0 && openBlockers > tier.maxOpenBlockers) {
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

    // Attendance: only enforced when minAttendanceRate is set AND data is available.
    // If no sessions have been held yet (data_available === false), attendance passes by default.
    // This is intentional: a new cohort with no sessions should not fail the attendance gate.
    if (tier.minAttendanceRate != null && menteePayload.cohort_reviews?.data_available === true) {
      const attendancePct = menteePayload.cohort_reviews.attendance_pct ?? 0;
      if (attendancePct < tier.minAttendanceRate) {
        checks.attendance_ok = false;
      }
    }

    hardChecks[tierId] = checks;

    // First tier that passes ALL hard constraints becomes the ceiling (criteria are highest-first).
    const allHardPass = Object.values(checks).every(Boolean);
    if (allHardPass && !maxEligibleTier) {
      maxEligibleTier = tierId;
    }
  }

  return {
    maxEligibleTier: maxEligibleTier || 'participation',
    hardChecks,
  };
}

module.exports = { preCheckHardConstraints };
