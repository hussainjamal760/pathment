const { models } = require('../db');
const { Op } = require('sequelize');

/**
 * Enriches AI evaluation results with mentee name/email from the database.
 * Sorts by match_score descending.
 * @param {Array} results - Array of AI result objects with mentee_id field
 * @returns {Promise<Array>} - Enriched and sorted results
 */
async function enrichEvaluationResults(results) {
  if (!results.length) return results;

  const menteeIds = results.map(r => r.mentee_id).filter(Boolean);
  const mentees = menteeIds.length > 0
    ? await models.User.findAll({
        where: { id: { [Op.in]: menteeIds } },
        attributes: ['id', 'firstName', 'lastName', 'email'],
        raw: true
      })
    : [];

  const menteeMap = Object.fromEntries(mentees.map(m => [m.id, m]));

  const enriched = results.map(ev => ({
    ...ev,
    firstName: menteeMap[ev.mentee_id]?.firstName ?? '',
    lastName:  menteeMap[ev.mentee_id]?.lastName  ?? '',
    email:     menteeMap[ev.mentee_id]?.email      ?? ''
  }));

  enriched.sort((a, b) => b.match_score - a.match_score);
  return enriched;
}

module.exports = { enrichEvaluationResults };
