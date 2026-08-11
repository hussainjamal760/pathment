const aiConnectionService = require('./aiConnectionService');
const { models } = require('../db');

/**
 * Evaluates whether the user acts in the admin scope (org-wide) or personal scope.
 */
function ownerFor(user) {
  const caps = Array.isArray(user?.capabilities) && user.capabilities.length ? user.capabilities : [user?.role];
  return caps.includes('admin') ? null : user.id;
}

/**
 * A narrowly-scoped, RAG-specific config resolver that wraps the shared aiConnectionService.
 * This re-implements the RAG-only fallback logic ("any personal connection for this owner")
 * and injects the OpenAI-compatible Gemini baseURL without polluting global routing.
 */
async function resolveRagConfig(feature, userId) {
  // 1) Ask the shared service for standard routing
  let cfg = await aiConnectionService.resolveActiveConfig(feature, userId);

  // 2) RAG-only fallback: Any personal connection for this owner
  // (If normal routing yielded nothing, we fallback to their connected/recent key)
  if (!cfg && userId) {
    let ownerId = userId;
    if (typeof userId === 'string') {
      try {
        const user = await models.User.findByPk(userId, { attributes: ['id', 'role', 'capabilities'] });
        if (user) {
          ownerId = ownerFor(user);
        }
      } catch { /* fallback */ }
    } else if (typeof userId === 'object') {
      ownerId = ownerFor(userId);
    }
    
    if (ownerId) {
      const personalRows = await models.AIConnection.findAll({ where: { ownerId }, order: [['created_at', 'DESC']] });
      if (personalRows.length) {
        const chosen = personalRows.find((r) => r.status === 'connected') || personalRows[0];
        cfg = aiConnectionService._toConfig(chosen);
      }
    }
  }

  // 3) RAG-only base URL override: Use OpenAI compatibility layer for Gemini
  // The shared testConnection expects /v1beta/, but RAG orchestrator needs /openai/ for SDK.
  if (cfg && cfg.provider === 'gemini') {
    if (cfg.baseURL === 'https://generativelanguage.googleapis.com/v1beta/') {
      cfg.baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
    }
  }

  return cfg;
}

module.exports = { resolveRagConfig };
