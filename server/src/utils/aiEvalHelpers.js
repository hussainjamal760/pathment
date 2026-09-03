const { models } = require('../db');
const { Op } = require('sequelize');

function extractJsonFromText(text) {
  let str = (text || '').trim();

  const codeBlock = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlock) str = codeBlock[1].trim();

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
