/**
 * criteriaUtils — Shared utilities for certificate tier criteria arrays.
 *
 * All evaluation pipelines (preCheckEngine, aiEvaluationService, promptBuilder, qualificationService)
 * MUST sort criteria through sortCriteriaByPriority before any processing.
 * This replaces the fragile "array position = tier rank" implicit contract with an explicit
 * `priority` integer field (1 = best tier, ascending = lower prestige).
 *
 * Backward compatibility: criteria without a `priority` field are sorted to the END
 * (Infinity fallback), preserving their existing relative order for legacy templates
 * until the admin re-saves the template (which re-assigns priorities by position).
 */

/**
 * Sort a criteria array by `priority` ascending (1 = top tier).
 * Returns a NEW array — does NOT mutate the input.
 *
 * @param {Array} criteria - Raw criteria array from DB or state.
 * @returns {Array} - Sorted copy, highest-prestige tier at index 0.
 */
function sortCriteriaByPriority(criteria) {
  if (!Array.isArray(criteria) || criteria.length === 0) return [];
  return [...criteria].sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity));
}

module.exports = { sortCriteriaByPriority };
