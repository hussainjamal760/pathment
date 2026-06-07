const crypto = require('crypto');
const { runWithRequestContext } = require('../utils/auditContext');

/**
 * Seed the per-request context: client IP + user-agent (for audit) AND a
 * correlation **requestId** (echoed in the `X-Request-Id` header, the error
 * envelope, and every log line — so a user's "it broke" ties to one server
 * trace). Relies on `trust proxy` so req.ip reflects the real client.
 */
module.exports = function requestContext(req, res, next) {
  const ip =
    req.ip ||
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    (req.socket && req.socket.remoteAddress) ||
    null;
  const userAgent = req.headers['user-agent'] || null;
  // Reuse an inbound id (from a gateway/proxy) or mint one.
  const requestId = String(req.headers['x-request-id'] || crypto.randomUUID());
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  runWithRequestContext({ ip, userAgent, requestId }, () => next());
};
