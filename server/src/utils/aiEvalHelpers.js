const { models } = require('../db');
const { Op } = require('sequelize');

/**
 * Extracts the first valid JSON array or object substring from a raw LLM response.
 * Strips markdown code fences, then finds the outermost [ ] or { } boundaries.
 * Returns the extracted JSON string, or the original trimmed string if nothing found.
 */
function extractJsonFromText(text) {
  let str = (text || '').trim();

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const codeBlock = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlock) str = codeBlock[1].trim();

  // Prefer array extraction, fall back to object
  const firstBracket = str.indexOf('[');
  const lastBracket  = str.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    return str.slice(firstBracket, lastBracket + 1);
  }

  const firstBrace = str.indexOf('{');
  const lastBrace  = str.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return str.slice(firstBrace, lastBrace + 1);
  }

  return str;
}

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

module.exports = { extractJsonFromText, enrichEvaluationResults };
