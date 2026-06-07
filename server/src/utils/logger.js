/**
 * Tiny structured logger. JSON lines in production (greppable / aggregator-ready),
 * readable text in dev. No dependency — swap the sink for pino/winston later
 * without touching call sites. Always include a `requestId` in `meta` when you
 * have one so a log line ties back to a single request.
 */
const isProd = process.env.NODE_ENV === 'production';

function emit(level, message, meta = {}) {
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (isProd) {
    sink(JSON.stringify({ level, message, time: new Date().toISOString(), ...meta }));
  } else {
    const tail = meta && Object.keys(meta).length ? meta : '';
    sink(`[${level}] ${message}`, tail);
  }
}

module.exports = {
  info: (msg, meta) => emit('info', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => emit('error', msg, meta),
};
