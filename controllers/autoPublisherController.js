const path = require('path');
const fs = require('fs');
const db = require('../database/db');
const { autoDiscoverAndGatherSoftware } = require('../services/aiService');

/**
 * Searches the web for software name, gathers all details, images, and returns Live Preview JSON.
 */
async function searchAndPreview(req, res) {
  try {
    const softwareName = (req.body.software_name || req.body.name || '').trim();
    if (!softwareName) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a software name to search and auto-publish.'
      });
    }

    const config = (req.app && req.app.locals && req.app.locals.getConfig) ? req.app.locals.getConfig() : {};

    console.log(`[AutoPublisherController] Searching and discovering details for: "${softwareName}"`);

    // Run Auto Publisher Discovery Engine
    const discoveryResult = await autoDiscoverAndGatherSoftware(softwareName, config);

    // Map Category
    const categories = await db.all('SELECT * FROM categories ORDER BY name ASC');
    let matchedCategoryId = null;

    if (categories && categories.length > 0) {
      const targetCat = (discoveryResult.category || '').toLowerCase();
      const match = categories.find(c => c.name.toLowerCase() === targetCat || targetCat.includes(c.name.toLowerCase()));
      matchedCategoryId = match ? match.id : categories[0].id;
    }

    res.json({
      success: true,
      message: `Discovered and analyzed "${discoveryResult.name}" successfully!`,
      preview: {
        ...discoveryResult,
        category_id: matchedCategoryId
      }
    });

  } catch (err) {
    console.error('[AutoPublisherController] Search and Preview error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to discover software details.'
    });
  }
}

/**
 * One-Click Publish Handler: Receives preview payload, creates installer stub if needed, and inserts into database.
 */
async function publishDirectly(req, res) {
  try {
    const p = req.body;

    if (!p.name || !p.category_id) {
      return res.status(400).json({
        success: false,
        error: 'Software Name and Category are required to publish.'
      });
    }

    // Handle installer file: download or generate installer binary package in storage/software/
    let softwareFilePath = p.file_path || '';
    if (!softwareFilePath) {
      const { ensureSoftwareInstallerFile } = require('../services/packageDownloaderService');
      softwareFilePath = await ensureSoftwareInstallerFile({
        softwareName: p.name,
        downloadUrl: p.download_url || p.official_download_url || p.website_url || p.official_url,
        platform: p.platform || 'windows',
        version: p.version || '1.0.0'
      });
    }

    // Insert into SQLite software table
    const insertResult = await db.run(
      `INSERT INTO software 
       (name, category_id, short_description, full_description, version, size, icon_image, file_path, is_featured, is_new, platform,
        developer, publisher, license, operating_systems, architecture, system_requirements, installation_guide,
        features, changelog, pros, cons, tags, seo_title, seo_meta_description, seo_keywords, faq, recommended_software, screenshots) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.name.trim(),
        p.category_id,
        p.short_description || '',
        p.full_description || '',
        p.version || '1.0.0',
        p.size || '25.0 MB',
        p.icon_image || '',
        softwareFilePath,
        p.is_featured ? 1 : 1, // Default featured for auto published
        p.is_new ? 1 : 1,      // Default new badge for auto published
        p.platform || 'windows',
        p.developer || '',
        p.publisher || '',
        p.license || 'Freeware',
        p.operating_systems || 'Windows 11, Windows 10, Windows 8.1, Windows 7',
        p.architecture || '64-bit (x64)',
        p.system_requirements || '',
        p.installation_guide || '',
        typeof p.features === 'object' ? JSON.stringify(p.features) : (p.features || ''),
        p.changelog || '',
        typeof p.pros === 'object' ? JSON.stringify(p.pros) : (p.pros || ''),
        typeof p.cons === 'object' ? JSON.stringify(p.cons) : (p.cons || ''),
        p.tags || '',
        p.seo_title || `Download ${p.name} for Windows PC`,
        p.seo_meta_description || `Download ${p.name} for Windows. Free, safe direct download with guide.`,
        p.seo_keywords || `${p.name}, download ${p.name}, free download`,
        typeof p.faq === 'object' ? JSON.stringify(p.faq) : (p.faq || ''),
        typeof p.recommended_software === 'object' ? JSON.stringify(p.recommended_software) : (p.recommended_software || ''),
        typeof p.screenshots === 'object' ? JSON.stringify(p.screenshots) : (p.screenshots || '[]')
      ]
    );

    console.log(`[AutoPublisherController] Successfully published "${p.name}" with ID: ${insertResult.lastID}`);

    res.json({
      success: true,
      message: `🎉 "${p.name}" has been published to your website automatically!`,
      softwareId: insertResult.lastID,
      detailUrl: `/detail/${insertResult.lastID}`
    });

  } catch (err) {
    console.error('[AutoPublisherController] Publish error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to publish software entry.'
    });
  }
}

module.exports = {
  searchAndPreview,
  publishDirectly
};
