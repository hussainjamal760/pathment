const EventEmitter = require('events');
const logger = require('./ragLogger');

class RagEventBus extends EventEmitter {}
const ragEvents = new RagEventBus();

// Catch unhandled errors in listeners to prevent crashing the process
ragEvents.on('error', (err) => {
  logger.error('rag_event_bus_error', { error: err.message });
});

module.exports = ragEvents;
