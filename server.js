// server.js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/config.js';
import connectDB from './config/db.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import planRoutes from './routes/plan.js';
import shopifyRoutes from './routes/shopifyRoutes.js';
import agentRoutes from './routes/agentRoutes.js';
import websiteRoutes from './routes/website.js';
import invitationRoutes from './routes/invitationRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import widgetRoutes from './routes/widgetRoutes.js';
import trainingRoutes from './routes/training.js';
import integrationRoutes from './routes/integrationRoutes.js';
import nudgeRoutes from './routes/nudgeRoutes.js';
import assistantRoutes from './routes/assistantRoutes.js';

import path from 'path';
import { fileURLToPath } from 'url';
import { initializeSocket } from './socket/socketHandler.js';
import shopifyController from './controllers/shopifyController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
app.set('trust proxy', true);

// Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: [config.clientUrl, 'http://localhost:3000', 'http://localhost:5173', 'https://camero.myabmedia.com/'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Connect DB
connectDB();

// --------- Middlewares ----------
app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps, curl)
    if (!origin) return callback(null, true);
    // allow known origins
    const allowed = [config.clientUrl, 'http://localhost:3000', 'http://localhost:5173'];
    if (allowed.includes(origin)) return callback(null, true);
    // fallback to allow all (if you want strict, change this)
    return callback(null, true);
  },
  credentials: true,
}));

// cookie parser for storing/validating oauth state
app.use(cookieParser());

// BEFORE app.use(express.json())
app.post('/api/shopify/webhooks/products', express.raw({ type: 'application/json' }), shopifyController.handleProductWebhook);
app.post('/api/shopify/webhooks/customers_data_request', express.raw({ type: 'application/json' }), shopifyController.handleCustomersDataRequest);
app.post('/api/shopify/webhooks/customers_redact', express.raw({ type: 'application/json' }), shopifyController.handleCustomersRedact);
app.post('/api/shopify/webhooks/shop_redact', express.raw({ type: 'application/json' }), shopifyController.handleShopRedact);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Allow required headers and preflight responses
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-api-key, x-visitor-id, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// --------- Static file serving ----------
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/widget.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'widget.js'));
});

const reactBuildPath = path.join(__dirname, 'client', 'build');
app.use(express.static(reactBuildPath));

// --------- API Routes ----------
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/manage/website', websiteRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/shopify', shopifyRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/widget', widgetRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/nudges', nudgeRoutes);
app.use('/api/assistant', assistantRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    widgetUrl: `${req.protocol}://${req.get('host')}/widget.js`
  });
});

// Test widget endpoint
app.get('/test-widget', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Widget Test</title></head>
    <body>
      <h1>Testing Widget</h1>
      <script src="/widget.js"></script>
      <script>
        if (window.initAIChatWidget) {
          console.log('Widget loaded successfully!');
        } else {
          console.error('Widget not loaded');
        }
      </script>
    </body>
    </html>
  `);
});

app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/public/') || req.path === '/widget.js' || req.path === '/test-widget' || req.path === '/health') {
    return next();
  }
  res.sendFile(path.join(reactBuildPath, 'index.html'), (err) => {
    if (err) {
      return res.status(200).json({ success: true, message: 'React build not found' });
    }
  });
});

// --------- Error handlers ----------
app.use((err, req, res, next) => {
  console.error(err.stack);
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  res.status(statusCode).json({
    success: false,
    message,
    stack: config.nodeEnv === 'development' ? err.stack : undefined
  });
});

// 404 catcher for non-GET API routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Initialize sockets after routes
initializeSocket(io);

// Start server
const PORT = config.port || 4000;
httpServer.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   🚀 MERN Backend Server Started          ║
╠════════════════════════════════════════════╣
║   📡 Port: ${PORT}                           ║
║   🌍 Environment: ${config.nodeEnv}           ║
║   🔗 URL: http://localhost:${PORT}           ║
║   📚 Docs: http://localhost:${PORT}/api      ║
║   🔐 Shopify Secret: ${config.shopifyApiSecret ? 'Loaded (' + config.shopifyApiSecret.length + ' chars)' : 'MISSING ❌'} ║
╚════════════════════════════════════════════╝
  `);
});

process.on('unhandledRejection', (err) => {
  console.log(`❌ Error: ${err?.message || err}`);
  httpServer.close(() => process.exit(1));
});
