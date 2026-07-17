const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const db = require('../database/db');

// Helper to load current config (uses cached version from server.js when available)
function getConfig(req) {
  if (req && req.app && req.app.locals.getConfig) {
    return req.app.locals.getConfig();
  }
  // Fallback: read from disk
  const configPath = path.resolve(__dirname, '../config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// Rate limiter for the request form (max 5 submissions per 15 minutes per IP)
const requestFormLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many requests submitted. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// 1. Home Page
router.get('/', async (req, res) => {
  try {
    const config = getConfig(req);
    const categories = await db.all('SELECT * FROM categories ORDER BY name ASC');
    
    // Featured Software
    const featured = await db.all('SELECT s.*, c.name as category_name, c.slug as category_slug FROM software s JOIN categories c ON s.category_id = c.id WHERE s.is_featured = 1 ORDER BY s.updated_at DESC LIMIT 6');
    
    // New Software (either marked new or top 6 recent)
    const newSoftware = await db.all('SELECT s.*, c.name as category_name, c.slug as category_slug FROM software s JOIN categories c ON s.category_id = c.id WHERE s.is_new = 1 OR s.created_at >= date(\'now\', \'-30 days\') ORDER BY s.created_at DESC LIMIT 6');
    
    // Trending / Popular software (top downloads in last 7 days)
    const trending = await db.all(
      `SELECT s.*, c.name as category_name, c.slug as category_slug, COUNT(l.id) as recent_downloads
       FROM download_logs l
       JOIN software s ON l.software_id = s.id
       JOIN categories c ON s.category_id = c.id
       WHERE l.downloaded_at >= date('now', '-7 days')
       GROUP BY s.id
       ORDER BY recent_downloads DESC
       LIMIT 6`
    );

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
      metaDescription: `${config.site.tagline} — Browse, search, and download verified Windows software instantly. No accounts required.`,
      canonicalUrl: `${req.protocol}://${req.get('host')}/`,
      tagline: config.site.tagline,
      categories,
      featured,
      newSoftware,
      trending,
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

// 2. Search & Category Explore Page (with sorting + pagination)
router.get('/search', async (req, res) => {
  try {
    const config = getConfig(req);
    const query = req.query.q || '';
    const categorySlug = req.query.category || '';
    const sortBy = req.query.sort || 'name';
    const page = parseInt(req.query.page) || 1;
    const limit = config.site.itemsPerPage || 12;
    const offset = (page - 1) * limit;
    
    const categories = await db.all('SELECT * FROM categories ORDER BY name ASC');
    
    let countSql = `
      SELECT COUNT(*) as count
      FROM software s 
      JOIN categories c ON s.category_id = c.id 
      WHERE 1=1
    `;
    let sql = `
      SELECT s.*, c.name as category_name, c.slug as category_slug 
      FROM software s 
      JOIN categories c ON s.category_id = c.id 
      WHERE 1=1
    `;
    const params = [];
    const countParams = [];
    let activeCategory = null;
    
    if (categorySlug) {
      const cat = await db.get('SELECT * FROM categories WHERE slug = ?', [categorySlug]);
      if (cat) {
        sql += ' AND s.category_id = ?';
        countSql += ' AND s.category_id = ?';
        params.push(cat.id);
        countParams.push(cat.id);
        activeCategory = cat;
      }
    }
    
    if (query) {
      sql += ' AND (s.name LIKE ? OR s.short_description LIKE ? OR s.full_description LIKE ?)';
      countSql += ' AND (s.name LIKE ? OR s.short_description LIKE ? OR s.full_description LIKE ?)';
      const queryParam = `%${query}%`;
      params.push(queryParam, queryParam, queryParam);
      countParams.push(queryParam, queryParam, queryParam);
    }
    
    // Sorting
    switch (sortBy) {
      case 'newest':
        sql += ' ORDER BY s.created_at DESC';
        break;
      case 'downloads':
        sql += ' ORDER BY s.download_count DESC';
        break;
      case 'views':
        sql += ' ORDER BY s.view_count DESC';
        break;
      case 'name':
      default:
        sql += ' ORDER BY s.name ASC';
        break;
    }

    // Get total count for pagination
    const totalRow = await db.get(countSql, countParams);
    const totalCount = totalRow ? totalRow.count : 0;
    const totalPages = Math.ceil(totalCount / limit);
    
    // Add pagination
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const results = await db.all(sql, params);

    // Popular fallbacks (shown when no results)
    let popularFallback = [];
    if (results.length === 0) {
      popularFallback = await db.all(
        `SELECT s.*, c.name as category_name, c.slug as category_slug 
         FROM software s 
         JOIN categories c ON s.category_id = c.id 
         ORDER BY s.download_count DESC 
         LIMIT 6`
      );
    }

    // Build meta description
    let metaDesc = `Explore and download free Windows software.`;
    if (query) metaDesc = `Search results for "${query}" — free Windows software downloads.`;
    if (activeCategory) metaDesc = `Browse ${activeCategory.name} software — free verified downloads.`;
    
    res.render('search', {
      siteTitle: query ? `Search: ${query} - ${config.site.name}` : `Explore Software - ${config.site.name}`,
      metaDescription: metaDesc,
      canonicalUrl: `${req.protocol}://${req.get('host')}/search`,
      categories,
      results,
      searchQuery: query,
      activeCategory,
      sortBy,
      currentPage: page,
      totalPages,
      totalCount,
      popularFallback,
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
    const config = getConfig(req);
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
      metaDescription: software.short_description || `Download ${software.name} for Windows — free, verified, and virus-checked.`,
      canonicalUrl: `${req.protocol}://${req.get('host')}/software/${software.id}/${req.params.slug}`,
      ogImage: software.icon_image ? `${req.protocol}://${req.get('host')}/storage/images/${software.icon_image}` : null,
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
    const config = getConfig(req);
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
      metaDescription: `Download ${software.name} (${software.size}) — free, safe, and verified Windows software.`,
      canonicalUrl: `${req.protocol}://${req.get('host')}/download/${softwareId}`,
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
    const config = getConfig(req);
    const categories = await db.all('SELECT * FROM categories ORDER BY name ASC');
    res.render('request', {
      siteTitle: `Request for Apps - ${config.site.name}`,
      metaDescription: `Can't find the software you need? Submit a request and we'll add it to our verified repository.`,
      canonicalUrl: `${req.protocol}://${req.get('host')}/request`,
      categories,
      config,
      success: req.query.success === 'true'
    });
  } catch (err) {
    console.error('Request app page error:', err);
    res.status(500).send('Internal Server Error');
  }
});

router.post('/request', requestFormLimiter, async (req, res) => {
  const { app_name, email, details } = req.body;
  if (!app_name) {
    return res.status(400).send('Application Name is required.');
  }

  // Basic input sanitization — strip HTML tags
  const sanitize = (str) => str ? str.replace(/<[^>]*>/g, '').trim() : null;

  try {
    await db.run(
      'INSERT INTO app_requests (app_name, email, details) VALUES (?, ?, ?)',
      [sanitize(app_name), sanitize(email) || null, sanitize(details) || null]
    );
    res.redirect('/request?success=true');
  } catch (err) {
    console.error('Submit app request error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// 7. About Page
router.get('/about', async (req, res) => {
  try {
    const config = getConfig(req);
    const categories = await db.all('SELECT * FROM categories ORDER BY name ASC');
    const totalSoftware = await db.get('SELECT COUNT(*) as count FROM software');
    const totalDownloads = await db.get('SELECT SUM(download_count) as count FROM software');

    res.render('about', {
      siteTitle: `About - ${config.site.name}`,
      metaDescription: `About ${config.site.name} — a free, verified Windows software download platform. No accounts, no malware, just clean software.`,
      canonicalUrl: `${req.protocol}://${req.get('host')}/about`,
      categories,
      config,
      totalSoftware: totalSoftware ? totalSoftware.count : 0,
      totalDownloads: totalDownloads && totalDownloads.count ? totalDownloads.count : 0
    });
  } catch (err) {
    console.error('About page error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// 8. Sitemap.xml
router.get('/sitemap.xml', async (req, res) => {
  try {
    const config = getConfig(req);
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const software = await db.all(
      `SELECT s.id, s.name, s.updated_at FROM software s ORDER BY s.updated_at DESC`
    );
    const categories = await db.all('SELECT * FROM categories ORDER BY name ASC');

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/search</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/request</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${baseUrl}/about</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`;

    // Category pages
    categories.forEach(cat => {
      xml += `
  <url>
    <loc>${baseUrl}/search?category=${cat.slug}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
    });

    // Software detail pages
    software.forEach(sw => {
      const slug = sw.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const lastmod = sw.updated_at ? new Date(sw.updated_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      xml += `
  <url>
    <loc>${baseUrl}/software/${sw.id}/${slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`;
    });

    xml += `\n</urlset>`;

    res.type('application/xml');
    res.send(xml);
  } catch (err) {
    console.error('Sitemap error:', err);
    res.status(500).send('Error generating sitemap');
  }
});

// 9. RSS Feed
router.get('/feed.xml', async (req, res) => {
  try {
    const config = getConfig(req);
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const latest = await db.all(
      `SELECT s.*, c.name as category_name 
       FROM software s 
       JOIN categories c ON s.category_id = c.id 
       ORDER BY s.created_at DESC 
       LIMIT 20`
    );

    let rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${config.site.name}</title>
    <link>${baseUrl}</link>
    <description>${config.site.tagline}</description>
    <language>en-us</language>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml" />`;

    latest.forEach(sw => {
      const slug = sw.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const pubDate = sw.created_at ? new Date(sw.created_at).toUTCString() : new Date().toUTCString();
      rss += `
    <item>
      <title>${sw.name} ${sw.version ? 'v' + sw.version : ''}</title>
      <link>${baseUrl}/software/${sw.id}/${slug}</link>
      <guid>${baseUrl}/software/${sw.id}/${slug}</guid>
      <pubDate>${pubDate}</pubDate>
      <category>${sw.category_name}</category>
      <description>${sw.short_description || ''} (${sw.size})</description>
    </item>`;
    });

    rss += `
  </channel>
</rss>`;

    res.type('application/rss+xml');
    res.send(rss);
  } catch (err) {
    console.error('RSS feed error:', err);
    res.status(500).send('Error generating RSS feed');
  }
});

module.exports = router;
