const { sortCriteriaByPriority } = require('../utils/criteriaUtils');


function preCheckHardConstraints(menteePayload, criteria) {
  if (!criteria || !criteria.length) {
    return {
      maxEligibleTier: 'participation',
      hardChecks: {},
    };
  }

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

    if (tier.minAttendanceRate != null && menteePayload.cohort_reviews?.data_available === true) {
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
    hardChecks,
  };
}

module.exports = { preCheckHardConstraints };
