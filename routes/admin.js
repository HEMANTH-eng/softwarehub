const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const db = require('../database/db');

// Helper to load current config dynamically
function getConfig() {
  const configPath = path.resolve(__dirname, '../config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// Helper to save config
function saveConfig(config) {
  const configPath = path.resolve(__dirname, '../config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

// Helper for slug generation
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')       // Replace spaces with -
    .replace(/[^\w\-]+/g, '')   // Remove all non-word chars
    .replace(/\-\-+/g, '-');    // Replace multiple - with single -
}

// Multer storage configuration for uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.fieldname === 'icon_image') {
      cb(null, path.resolve(__dirname, '../storage/images'));
    } else if (file.fieldname === 'software_file') {
      cb(null, path.resolve(__dirname, '../storage/software'));
    } else {
      cb(new Error('Invalid field name for upload'), null);
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.fieldname === 'icon_image') {
      // Validate image extensions
      const allowedExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg'];
      const ext = path.extname(file.originalname).toLowerCase();
      if (!allowedExts.includes(ext)) {
        return cb(new Error('Only PNG, JPG, JPEG, GIF, and SVG are allowed for software icons.'));
      }
    }
    cb(null, true);
  }
});

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) {
    next();
  } else {
    res.redirect('/admin/login');
  }
}

// --- ADMIN LOGIN / LOGOUT ---

// GET Login Page
router.get('/login', (req, res) => {
  if (req.session && req.session.adminId) {
    return res.redirect('/admin/dashboard');
  }
  const config = getConfig();
  res.render('admin/login', {
    siteTitle: `Admin Login - ${config.site.name}`,
    error: null,
    config
  });
});

// POST Login Action
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const config = getConfig();
  
  try {
    const user = await db.get('SELECT * FROM admin_users WHERE username = ?', [username]);
    
    if (user && bcrypt.compareSync(password, user.password_hash)) {
      req.session.adminId = user.id;
      req.session.adminUsername = user.username;
      return res.redirect('/admin/dashboard');
    }
    
    res.render('admin/login', {
      siteTitle: `Admin Login - ${config.site.name}`,
      error: 'Invalid username or password.',
      config
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// GET Logout Action
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});


// --- ADMIN DASHBOARD ---
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const config = getConfig();
    
    // Aggregated telemetry statistics
    const catCountRow = await db.get('SELECT COUNT(*) as count FROM categories');
    const softwareCountRow = await db.get('SELECT COUNT(*) as count FROM software');
    const viewCountRow = await db.get('SELECT SUM(view_count) as count FROM software');
    const downloadCountRow = await db.get('SELECT SUM(download_count) as count FROM software');
    const pendingRequestsCountRow = await db.get("SELECT COUNT(*) as count FROM app_requests WHERE status = 'pending'");
    
    const stats = {
      categories: catCountRow ? catCountRow.count : 0,
      software: softwareCountRow ? softwareCountRow.count : 0,
      views: viewCountRow && viewCountRow.count ? viewCountRow.count : 0,
      downloads: downloadCountRow && downloadCountRow.count ? downloadCountRow.count : 0,
      pendingRequests: pendingRequestsCountRow ? pendingRequestsCountRow.count : 0
    };
    
    // Top Downloaded Software List
    const topSoftware = await db.all(
      `SELECT s.*, c.name as category_name 
       FROM software s 
       JOIN categories c ON s.category_id = c.id 
       ORDER BY s.download_count DESC 
       LIMIT 5`
    );
    
    // Recent logs
    const recentDownloads = await db.all(
      `SELECT l.id, l.downloaded_at, s.name as software_name, s.id as software_id 
       FROM download_logs l 
       JOIN software s ON l.software_id = s.id 
       ORDER BY l.downloaded_at DESC 
       LIMIT 8`
    );
    
    // Last 7 days download stats for dynamic SVG chart rendering
    const chartData = await db.all(
      `SELECT date(downloaded_at) as day, COUNT(*) as count 
       FROM download_logs 
       WHERE downloaded_at >= date('now', '-7 days') 
       GROUP BY day 
       ORDER BY day ASC`
    );
    
    res.render('admin/dashboard', {
      siteTitle: `Admin Dashboard - ${config.site.name}`,
      stats,
      topSoftware,
      recentDownloads,
      chartData,
      adminUsername: req.session.adminUsername,
      config,
      activeTab: 'dashboard'
    });
  } catch (err) {
    console.error('Dashboard route error:', err);
    res.status(500).send('Internal Server Error');
  }
});


// --- SOFTWARE MANAGEMENT ---

// GET Listings List
router.get('/software', requireAuth, async (req, res) => {
  try {
    const config = getConfig();
    const softwareList = await db.all(
      `SELECT s.*, c.name as category_name 
       FROM software s 
       JOIN categories c ON s.category_id = c.id 
       ORDER BY s.created_at DESC`
    );
    const categories = await db.all('SELECT * FROM categories ORDER BY name ASC');
    
    res.render('admin/software', {
      siteTitle: `Manage Software - ${config.site.name}`,
      softwareList,
      categories,
      config,
      adminUsername: req.session.adminUsername,
      activeTab: 'software'
    });
  } catch (err) {
    console.error('Software list route error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// POST Add Software
router.post(
  '/software/add',
  requireAuth,
  upload.fields([
    { name: 'icon_image', maxCount: 1 },
    { name: 'software_file', maxCount: 1 }
  ]),
  async (req, res) => {
    const { name, category_id, short_description, full_description, version, size, is_featured, is_new } = req.body;
    
    try {
      const iconFile = req.files['icon_image'] ? req.files['icon_image'][0].filename : '';
      const softwareFile = req.files['software_file'] ? req.files['software_file'][0].filename : '';
      
      if (!name || !category_id || !softwareFile) {
        return res.status(400).send('Software Name, Category, and Installer Binary are required.');
      }
      
      await db.run(
        `INSERT INTO software 
         (name, category_id, short_description, full_description, version, size, icon_image, file_path, is_featured, is_new) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          category_id,
          short_description || '',
          full_description || '',
          version || '',
          size || '0 MB',
          iconFile,
          softwareFile,
          is_featured ? 1 : 0,
          is_new ? 1 : 0
        ]
      );
      
      res.redirect('/admin/software');
    } catch (err) {
      console.error('Add software error:', err);
      res.status(500).send('Internal Server Error');
    }
  }
);

// POST Edit Software (handles metadata edits and optional replacements of uploads)
router.post(
  '/software/edit/:id',
  requireAuth,
  upload.fields([
    { name: 'icon_image', maxCount: 1 },
    { name: 'software_file', maxCount: 1 }
  ]),
  async (req, res) => {
    const softwareId = req.params.id;
    const { name, category_id, short_description, full_description, version, size, is_featured, is_new } = req.body;
    
    try {
      const existing = await db.get('SELECT * FROM software WHERE id = ?', [softwareId]);
      if (!existing) {
        return res.status(404).send('Software listing not found');
      }
      
      let iconFile = existing.icon_image;
      let softwareFile = existing.file_path;
      
      // If new icon is uploaded, delete old one and assign new filename
      if (req.files['icon_image']) {
        if (existing.icon_image) {
          const oldIconPath = path.resolve(__dirname, '../storage/images', existing.icon_image);
          if (fs.existsSync(oldIconPath)) {
            fs.unlinkSync(oldIconPath);
          }
        }
        iconFile = req.files['icon_image'][0].filename;
      }
      
      // If new setup installer file is uploaded, delete old installer file
      if (req.files['software_file']) {
        if (existing.file_path) {
          const oldFilePath = path.resolve(__dirname, '../storage/software', existing.file_path);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        }
        softwareFile = req.files['software_file'][0].filename;
      }
      
      await db.run(
        `UPDATE software 
         SET name = ?, category_id = ?, short_description = ?, full_description = ?, 
             version = ?, size = ?, icon_image = ?, file_path = ?, is_featured = ?, is_new = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          name,
          category_id,
          short_description,
          full_description,
          version,
          size,
          iconFile,
          softwareFile,
          is_featured ? 1 : 0,
          is_new ? 1 : 0,
          softwareId
        ]
      );
      
      res.redirect('/admin/software');
    } catch (err) {
      console.error('Edit software error:', err);
      res.status(500).send('Internal Server Error');
    }
  }
);

// POST Delete Software
router.post('/software/delete/:id', requireAuth, async (req, res) => {
  const softwareId = req.params.id;
  try {
    const existing = await db.get('SELECT * FROM software WHERE id = ?', [softwareId]);
    if (!existing) {
      return res.status(404).send('Software listing not found');
    }
    
    // Delete files from storage
    if (existing.icon_image) {
      const iconPath = path.resolve(__dirname, '../storage/images', existing.icon_image);
      if (fs.existsSync(iconPath)) fs.unlinkSync(iconPath);
    }
    if (existing.file_path) {
      const filePath = path.resolve(__dirname, '../storage/software', existing.file_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    
    // Delete from DB (associated logs cascade automatically in DB setup)
    await db.run('DELETE FROM software WHERE id = ?', [softwareId]);
    
    res.redirect('/admin/software');
  } catch (err) {
    console.error('Delete software error:', err);
    res.status(500).send('Internal Server Error');
  }
});


// --- CATEGORIES MANAGEMENT ---

// GET list categories
router.get('/categories', requireAuth, async (req, res) => {
  try {
    const config = getConfig();
    const categoryList = await db.all(
      `SELECT c.*, COUNT(s.id) as software_count 
       FROM categories c 
       LEFT JOIN software s ON c.id = s.category_id 
       GROUP BY c.id 
       ORDER BY c.name ASC`
    );
    
    res.render('admin/categories', {
      siteTitle: `Manage Categories - ${config.site.name}`,
      categoryList,
      config,
      adminUsername: req.session.adminUsername,
      activeTab: 'categories',
      error: null
    });
  } catch (err) {
    console.error('Categories list error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// POST Add Category
router.post('/categories/add', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).send('Category Name is required.');
  }
  
  try {
    const slug = slugify(name);
    await db.run('INSERT INTO categories (name, slug) VALUES (?, ?)', [name, slug]);
    res.redirect('/admin/categories');
  } catch (err) {
    console.error('Add category error:', err);
    res.status(500).send('Internal Server Error (Category name must be unique).');
  }
});

// POST Edit Category
router.post('/categories/edit/:id', requireAuth, async (req, res) => {
  const categoryId = req.params.id;
  const { name } = req.body;
  
  if (!name) {
    return res.status(400).send('Category Name is required.');
  }
  
  try {
    const slug = slugify(name);
    await db.run('UPDATE categories SET name = ?, slug = ? WHERE id = ?', [name, slug, categoryId]);
    res.redirect('/admin/categories');
  } catch (err) {
    console.error('Edit category error:', err);
    res.status(500).send('Internal Server Error.');
  }
});

// POST Delete Category with safety warning
router.post('/categories/delete/:id', requireAuth, async (req, res) => {
  const categoryId = req.params.id;
  
  try {
    // Check if software is assigned to this category
    const swRow = await db.get('SELECT COUNT(*) as count FROM software WHERE category_id = ?', [categoryId]);
    const softwareCount = swRow ? swRow.count : 0;
    
    const config = getConfig();
    const categoryList = await db.all(
      `SELECT c.*, COUNT(s.id) as software_count 
       FROM categories c 
       LEFT JOIN software s ON c.id = s.category_id 
       GROUP BY c.id 
       ORDER BY c.name ASC`
    );
    
    if (softwareCount > 0) {
      // Re-render categories index with warning alert
      return res.render('admin/categories', {
        siteTitle: `Manage Categories - ${config.site.name}`,
        categoryList,
        config,
        adminUsername: req.session.adminUsername,
        activeTab: 'categories',
        error: `Cannot delete category: ${softwareCount} software listing(s) are currently assigned to it. Please reassign or delete them first.`
      });
    }
    
    await db.run('DELETE FROM categories WHERE id = ?', [categoryId]);
    res.redirect('/admin/categories');
  } catch (err) {
    console.error('Delete category error:', err);
    res.status(500).send('Internal Server Error');
  }
});


// --- CONFIG / SETTINGS MANAGEMENT ---

// GET Settings Panel
router.get('/settings', requireAuth, (req, res) => {
  const config = getConfig();
  res.render('admin/settings', {
    siteTitle: `Site Configuration - ${config.site.name}`,
    config,
    adminUsername: req.session.adminUsername,
    activeTab: 'settings',
    successMsg: null
  });
});

// POST Update Settings Panel
router.post('/settings', requireAuth, (req, res) => {
  try {
    const current = getConfig();
    
    // Parse form inputs and build updated config object
    const updated = {
      site: {
        name: req.body.site_name || current.site.name,
        tagline: req.body.site_tagline || current.site.tagline,
        itemsPerPage: parseInt(req.body.items_per_page) || current.site.itemsPerPage,
        port: parseInt(req.body.site_port) || current.site.port
      },
      paths: current.paths,
      download: {
        loaderDurationSeconds: parseInt(req.body.loader_duration) || current.download.loaderDurationSeconds,
        suggestionsCount: parseInt(req.body.suggestions_count) || current.download.suggestionsCount
      },
      ads: {
        provider: current.ads.provider,
        enabled: req.body.ads_enabled === 'on',
        popunder: {
          enabled: req.body.ad_popunder_enabled === 'on',
          zoneId: req.body.ad_popunder_zone_id || '',
          page: 'download',
          frequencyCapPerSession: 1,
          devices: ['desktop']
        },
        smartlink: {
          enabled: req.body.ad_smartlink_enabled === 'on',
          zoneId: req.body.ad_smartlink_zone_id || '',
          page: 'download',
          frequencyCapPerSession: 1,
          devices: ['mobile']
        },
        nativeBanner: {
          enabled: req.body.ad_native_enabled === 'on',
          zoneId: req.body.ad_native_zone_id || '',
          pages: ['home', 'search']
        },
        banner: {
          enabled: req.body.ad_banner_enabled === 'on',
          zoneId: req.body.ad_banner_zone_id || '',
          pages: ['softwareDetail']
        },
        socialBar: {
          enabled: req.body.ad_social_enabled === 'on',
          zoneId: req.body.ad_social_zone_id || '',
          page: 'download',
          dismissible: true
        }
      },
      admin: {
        sessionSecret: current.admin.sessionSecret
      }
    };
    
    saveConfig(updated);
    
    res.render('admin/settings', {
      siteTitle: `Site Configuration - ${updated.site.name}`,
      config: updated,
      adminUsername: req.session.adminUsername,
      activeTab: 'settings',
      successMsg: 'Settings saved successfully! Changes are active immediately.'
    });
  } catch (err) {
    console.error('Save settings error:', err);
    res.status(500).send('Internal Server Error while saving configuration.');
  }
});

// --- APP REQUESTS MANAGEMENT ---

// GET App Requests list
router.get('/requests', requireAuth, async (req, res) => {
  try {
    const config = getConfig();
    const requestsList = await db.all('SELECT * FROM app_requests ORDER BY created_at DESC');
    
    res.render('admin/requests', {
      siteTitle: `App Requests - ${config.site.name}`,
      requestsList,
      config,
      adminUsername: req.session.adminUsername,
      activeTab: 'requests'
    });
  } catch (err) {
    console.error('App requests list route error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// POST Toggle request status
router.post('/requests/status/:id', requireAuth, async (req, res) => {
  const requestId = req.params.id;
  const { status } = req.body;
  if (!status || !['pending', 'fulfilled'].includes(status)) {
    return res.status(400).send('Invalid status.');
  }

  try {
    await db.run('UPDATE app_requests SET status = ? WHERE id = ?', [status, requestId]);
    res.redirect('/admin/requests');
  } catch (err) {
    console.error('Update request status error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// POST Delete request
router.post('/requests/delete/:id', requireAuth, async (req, res) => {
  const requestId = req.params.id;
  try {
    await db.run('DELETE FROM app_requests WHERE id = ?', [requestId]);
    res.redirect('/admin/requests');
  } catch (err) {
    console.error('Delete request error:', err);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;

