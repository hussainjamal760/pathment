require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const http = require('http');
const { sequelize } = require('./db');
const routes = require('./routes');
const { errorHandler, notFound } = require('./middlewares/errorHandler');
const { initSocket } = require('./socket');
const notificationScheduler = require('./services/notificationScheduler');
const requestContext = require('./middlewares/requestContext');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);


app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: false,
}));

app.use(compression());

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

function isOriginAllowed(origin) {
  return allowedOrigins.some((allowed) => {
    if (allowed.includes('*')) {
      const escaped = allowed.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('*', '[^.]+');
      return new RegExp('^' + escaped + '$').test(origin);
    }
    return allowed === origin;
  });
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || isOriginAllowed(origin)) {
      return callback(null, true);
    }
    console.warn(`[CORS] Blocked origin: "${origin}" | Allowed patterns: ${JSON.stringify(allowedOrigins)}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(requestContext);

app.use(require('./middlewares/auditTrail'));

if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}


app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Pathment API Server',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use('/api', require('./middlewares/rateLimiter').apiLimiter, routes);

app.use('/webhooks', require('./routes/webhooks'));

app.use(notFound);

app.use(errorHandler);

async function start() {
  try {
    await sequelize.authenticate();
    console.log('✓ Database connection established successfully');

    if (process.env.GAMIFICATION_BOOTSTRAP_DISABLED !== 'true') {
      try {
        const gamificationService = require('./services/gamificationService');
        const badgeCount = await gamificationService.createDefaultBadges();
        console.log(`✓ Gamification badges verified: ${badgeCount}`);
      } catch (bootstrapError) {
        console.warn('⚠ Gamification bootstrap skipped:', bootstrapError.message);
      }
    }


    require('./workers/emailWorker').start();

    initSocket(server);
    
    const { initializeRag } = require('./features/rag');
    initializeRag();

    if (process.env.CERTIFICATE_WORKER_DISABLED !== 'true') {
      require('./workers/certificateWorker').start();
    }
    if (process.env.NOTIFICATION_SCHEDULER_DISABLED !== 'true') {
      notificationScheduler.start();
    }

    server.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✓ API available at: http://localhost:${PORT}/api`);
      console.log(`✓ Health check: http://localhost:${PORT}/api/health`);
      console.log(`✓ Socket.IO path: http://localhost:${PORT}/socket.io`);
    });
  } catch (err) {
    console.error('✗ Failed to start server:', err);
    process.exit(1);
  }
}

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error(err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err);
  process.exit(1);
});

if (require.main === module) {
  start();
}

module.exports = app;
