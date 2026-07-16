const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../database/db');

// Helper to load current config dynamically
function getConfig() {
  const configPath = path.resolve(__dirname, '../config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// 1. Home Page
router.get('/', async (req, res) => {
  try {
    const config = getConfig();
    const categories = await db.all('SELECT * FROM categories ORDER BY name ASC');
    
    // Featured Software
    const featured = await db.all('SELECT s.*, c.name as category_name, c.slug as category_slug FROM software s JOIN categories c ON s.category_id = c.id WHERE s.is_featured = 1 ORDER BY s.updated_at DESC LIMIT 6');
    
    // New Software (either marked new or top 6 recent)
    const newSoftware = await db.all('SELECT s.*, c.name as category_name, c.slug as category_slug FROM software s JOIN categories c ON s.category_id = c.id WHERE s.is_new = 1 OR s.created_at >= date(\'now\', \'-30 days\') ORDER BY s.created_at DESC LIMIT 6');
    
    // All Software (with Pagination)
    const page = parseInt(req.query.page) || 1;
    const limit = config.site.itemsPerPage || 12;
    const offset = (page - 1) * limit;
    
    const allSoftware = await db.all(
      `SELECT s.*, c.name as category_name, c.slug as category_slug 
       FROM software s 
       JOIN categories c ON s.category_id = c.id 
       ORDER BY s.name ASC 
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    
    const totalCountRow = await db.get('SELECT COUNT(*) as count FROM software');
    const totalCount = totalCountRow ? totalCountRow.count : 0;
    const totalPages = Math.ceil(totalCount / limit);
    
    res.render('home', {
      siteTitle: config.site.name,
      tagline: config.site.tagline,
      categories,
      featured,
      newSoftware,
      allSoftware,
      currentPage: page,
      totalPages,
      config,
      activeCategory: null,
      searchQuery: ''
    });
  } catch (err) {
    console.error('Home route error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// 2. Search & Category Explore Page
router.get('/search', async (req, res) => {
  try {
    const config = getConfig();
    const query = req.query.q || '';
    const categorySlug = req.query.category || '';
    
    const categories = await db.all('SELECT * FROM categories ORDER BY name ASC');
    
    let sql = `
      SELECT s.*, c.name as category_name, c.slug as category_slug 
      FROM software s 
      JOIN categories c ON s.category_id = c.id 
      WHERE 1=1
    `;
    const params = [];
    let activeCategory = null;
    
    if (categorySlug) {
      const cat = await db.get('SELECT * FROM categories WHERE slug = ?', [categorySlug]);
      if (cat) {
        sql += ' AND s.category_id = ?';
        params.push(cat.id);
        activeCategory = cat;
      }
    }
    
    if (query) {
      sql += ' AND (s.name LIKE ? OR s.short_description LIKE ? OR s.full_description LIKE ?)';
      const queryParam = `%${query}%`;
      params.push(queryParam, queryParam, queryParam);
    }
    
    sql += ' ORDER BY s.name ASC';
    
    const results = await db.all(sql, params);
    
    res.render('search', {
      siteTitle: config.site.name,
      categories,
      results,
      searchQuery: query,
      activeCategory,
      config
    });
  } catch (err) {
    console.error('Search route error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// 3. Software Detail Page
router.get('/software/:id/:slug', async (req, res) => {
  try {
    const config = getConfig();
    const softwareId = req.params.id;
    
    // Get software info
    const software = await db.get(
      `SELECT s.*, c.name as category_name, c.slug as category_slug 
       FROM software s 
       JOIN categories c ON s.category_id = c.id 
       WHERE s.id = ?`,
      [softwareId]
    );
    
    if (!software) {
      return res.status(404).send('Software not found');
    }
    
    // Increment View Count asynchronously
    await db.run('UPDATE software SET view_count = view_count + 1 WHERE id = ?', [softwareId]);
    
    // Suggestions: other products in same category
    const suggestionsLimit = config.download.suggestionsCount || 4;
    const suggestions = await db.all(
      `SELECT s.*, c.name as category_name, c.slug as category_slug 
       FROM software s 
       JOIN categories c ON s.category_id = c.id 
       WHERE s.category_id = ? AND s.id != ? 
       ORDER BY RANDOM() 
       LIMIT ?`,
      [software.category_id, softwareId, suggestionsLimit]
    );
    
    res.render('detail', {
      siteTitle: `${software.name} Free Download - ${config.site.name}`,
      software,
      suggestions,
      config
    });
  } catch (err) {
    console.error('Detail route error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// 4. Download Interstitial Page
router.get('/download/:id', async (req, res) => {
  try {
    const config = getConfig();
    const softwareId = req.params.id;
    
    const software = await db.get(
      `SELECT s.*, c.name as category_name, c.slug as category_slug 
       FROM software s 
       JOIN categories c ON s.category_id = c.id 
       WHERE s.id = ?`,
      [softwareId]
    );
    
    if (!software) {
      return res.status(404).send('Software not found');
    }
    
    // Suggestions
    const suggestionsLimit = config.download.suggestionsCount || 4;
    const suggestions = await db.all(
      `SELECT s.*, c.name as category_name, c.slug as category_slug 
       FROM software s 
       JOIN categories c ON s.category_id = c.id 
       WHERE s.category_id = ? AND s.id != ? 
       ORDER BY RANDOM() 
       LIMIT ?`,
      [software.category_id, softwareId, suggestionsLimit]
    );
    
    res.render('download', {
      siteTitle: `Downloading ${software.name} - ${config.site.name}`,
      software,
      suggestions,
      config
    });
  } catch (err) {
    console.error('Download interstitial route error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// 5. Direct File Downloader Route (Triggers file stream download & logs analytics)
router.get('/get-file/:id', async (req, res) => {
  try {
    const softwareId = req.params.id;
    const software = await db.get('SELECT * FROM software WHERE id = ?', [softwareId]);
    
    if (!software || !software.file_path) {
      return res.status(404).send('File not found');
    }
    
    const storageDir = path.resolve(__dirname, '../storage/software');
    const filePath = path.join(storageDir, software.file_path);
    
    if (!fs.existsSync(filePath)) {
      console.error(`Software binary missing on server: ${filePath}`);
      return res.status(404).send('The requested software installer is missing from our server storage.');
    }
    
    // Increment Download Count in DB
    await db.run('UPDATE software SET download_count = download_count + 1 WHERE id = ?', [softwareId]);
    
    // Log Download action
    await db.run('INSERT INTO download_logs (software_id) VALUES (?)', [softwareId]);
    
    // Stream download with the software name as file download title
    const downloadName = path.basename(filePath);
    res.download(filePath, downloadName, (err) => {
      if (err) {
        console.error('File stream error:', err);
        // Avoid sending double headers if response already started
        if (!res.headersSent) {
          res.status(500).send('Error downloading file');
        }
      }
    });
  } catch (err) {
    console.error('Get file error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// 6. App Request Routes
router.get('/request', async (req, res) => {
  try {
    const config = getConfig();
    const categories = await db.all('SELECT * FROM categories ORDER BY name ASC');
    res.render('request', {
      siteTitle: `Request for Apps - ${config.site.name}`,
      categories,
      config,
      success: req.query.success === 'true'
    });
  } catch (err) {
    console.error('Request app page error:', err);
    res.status(500).send('Internal Server Error');
  }
});

router.post('/request', async (req, res) => {
  const { app_name, email, details } = req.body;
  if (!app_name) {
    return res.status(400).send('Application Name is required.');
  }

  try {
    await db.run(
      'INSERT INTO app_requests (app_name, email, details) VALUES (?, ?, ?)',
      [app_name, email || null, details || null]
    );
    res.redirect('/request?success=true');
  } catch (err) {
    console.error('Submit app request error:', err);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;

