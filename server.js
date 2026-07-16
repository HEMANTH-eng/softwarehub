const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

// Load configurations
const configPath = path.join(__dirname, 'config.json');
let config = {};
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
  console.error('Error loading config.json:', err);
  process.exit(1);
}

const app = express();

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

// Serve public static assets
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded thumbnail images as static files
app.use('/storage/images', express.static(path.join(__dirname, 'storage/images')));

// Global local variables for EJS templates (e.g. navigation helpers, default placeholders)
app.use((req, res, next) => {
  res.locals.adminLoggedIn = !!(req.session && req.session.adminId);
  res.locals.adminUsername = req.session ? req.session.adminUsername : null;
  res.locals.currentUrl = req.originalUrl;
  next();
});

// Import route modules
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

// Mount route pathways
app.use('/', publicRoutes);
app.use('/admin', adminRoutes);

// Custom 404 Handler
app.use((req, res) => {
  res.status(404).render('404', {
    siteTitle: `Page Not Found - ${config.site.name || 'Software Hub'}`,
    config
  });
});

// Port binding execution
const PORT = process.env.PORT || config.site.port || 3000;
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`Software Hub Web Application successfully launched`);
  console.log(`Running on Local Address: http://localhost:${PORT}`);
  console.log(`Admin Control Panel path: http://localhost:${PORT}/admin`);
  console.log(`==================================================`);
});
