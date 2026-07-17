const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const morgan = require('morgan');

// --- Centralized Config Cache ---
// Reads config once at startup, provides getter and invalidation method.
const configPath = path.join(__dirname, 'config.json');
let _cachedConfig = null;

function getConfig() {
  if (!_cachedConfig) {
    _cachedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  return _cachedConfig;
}

function invalidateConfigCache() {
  _cachedConfig = null;
}

// Load initial config (fail fast if missing)
try {
  getConfig();
} catch (err) {
  console.error('Error loading config.json:', err);
  process.exit(1);
}

const config = getConfig();
const app = express();

// --- Security: Helmet middleware for HTTP headers ---
app.use(
  helmet({
    contentSecurityPolicy: false, // Disabled to allow Tailwind CDN, Lucide CDN, and ad scripts
    crossOriginEmbedderPolicy: false
  })
);

// --- Logging: Morgan for HTTP request logging ---
app.use(morgan('short'));

// Express EJS template engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware configuration
app.use(
  session({
    secret: config.admin.sessionSecret || 'default_fallback_session_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours session lifetime
      secure: false // Set to true in production if running HTTPS
    }
  })
);

// Serve public static assets with cache headers
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d', // Browser cache for 7 days
  etag: true
}));

// Serve uploaded thumbnail images as static files
app.use('/storage/images', express.static(path.join(__dirname, 'storage/images'), {
  maxAge: '7d'
}));

// Global local variables for EJS templates (e.g. navigation helpers, default placeholders)
app.use((req, res, next) => {
  res.locals.adminLoggedIn = !!(req.session && req.session.adminId);
  res.locals.adminUsername = req.session ? req.session.adminUsername : null;
  res.locals.currentUrl = req.originalUrl;
  next();
});

// --- Expose config helpers to routes ---
app.locals.getConfig = getConfig;
app.locals.invalidateConfigCache = invalidateConfigCache;

// Import route modules
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

// --- Health check endpoint ---
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// --- robots.txt ---
app.get('/robots.txt', (req, res) => {
  const siteName = getConfig().site.name || 'Software Hub';
  res.type('text/plain');
  res.send(
`User-agent: *
Allow: /
Disallow: /admin
Disallow: /get-file/

Sitemap: ${req.protocol}://${req.get('host')}/sitemap.xml
`
  );
});

// Mount route pathways
app.use('/', publicRoutes);
app.use('/admin', adminRoutes);

// Custom 404 Handler
app.use((req, res) => {
  const cfg = getConfig();
  res.status(404).render('404', {
    siteTitle: `Page Not Found - ${cfg.site.name || 'Software Hub'}`,
    config: cfg
  });
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack || err);
  const cfg = getConfig();
  res.status(500).render('404', {
    siteTitle: `Server Error - ${cfg.site.name || 'Software Hub'}`,
    config: cfg
  });
});

// Port binding execution
const PORT = process.env.PORT || config.site.port || 3000;
const server = app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`Software Hub Web Application successfully launched`);
  console.log(`Running on Local Address: http://localhost:${PORT}`);
  console.log(`Admin Control Panel path: http://localhost:${PORT}/admin`);
  console.log(`Health check endpoint:    http://localhost:${PORT}/health`);
  console.log(`==================================================`);
});

// --- Graceful Shutdown ---
function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    const db = require('./database/db');
    db.close().then(() => {
      console.log('Database connection closed.');
      process.exit(0);
    }).catch(() => {
      process.exit(1);
    });
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
