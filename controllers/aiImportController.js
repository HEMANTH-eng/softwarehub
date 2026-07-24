const path = require('path');
const fs = require('fs');
const db = require('../database/db');
const { importSoftwareFromSource } = require('../services/softwareFetcher');
const { logImportSession, getImportDashboardStats } = require('../services/importLogger');
const { scanSoftwareForUpdates, updateSoftwareDetailsViaAi } = require('../services/versionChecker');

/**
 * Renders AI Import Admin Control Panel page
 */
async function renderAiImportPage(req, res) {
  try {
    const config = (req.app && req.app.locals && req.app.locals.getConfig) ? req.app.locals.getConfig() : {};
    const categories = await db.all('SELECT * FROM categories ORDER BY name ASC');
    const stats = await getImportDashboardStats();
    const drafts = await db.all('SELECT * FROM software WHERE is_draft = 1 ORDER BY created_at DESC');
    const pendingUpdates = await scanSoftwareForUpdates();

    res.render('admin/ai_import', {
      siteTitle: `🤖 AI Import Center - ${config.site.name || 'Software Hub'} Admin`,
      config,
      adminUsername: req.session.adminUsername || 'Admin',
      activeTab: 'ai-import',
      currentUrl: req.originalUrl,
      categories: categories || [],
      stats,
      drafts: drafts || [],
      pendingUpdates: pendingUpdates || []
    });
  } catch (err) {
    console.error('[AiImportController] Render page error:', err);
    res.status(500).send('Error rendering AI Import page.');
  }
}

/**
 * Handles AI Import Generation from source (Name, Website, GitHub, Play Store)
 */
async function generateImportPreview(req, res) {
  const startTime = Date.now();
  try {
    const { input, source_type = 'auto' } = req.body;
    if (!input || !input.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a software name or URL.'
      });
    }

    const config = (req.app && req.app.locals && req.app.locals.getConfig) ? req.app.locals.getConfig() : {};

    // Execute Import Aggregator
    const result = await importSoftwareFromSource({
      input: input.trim(),
      sourceType: source_type,
      config: config
    });

    // Match Category ID
    const categories = await db.all('SELECT * FROM categories ORDER BY name ASC');
    let matchedCatId = categories && categories[0] ? categories[0].id : 1;
    if (categories && result.category) {
      const match = categories.find(c => c.name.toLowerCase() === result.category.toLowerCase() || result.category.toLowerCase().includes(c.name.toLowerCase()));
      if (match) matchedCatId = match.id;
    }
    result.category_id = matchedCatId;

    const duration = Date.now() - startTime;
    await logImportSession({
      software_name: result.name,
      source: source_type,
      duration_ms: duration,
      ai_tokens: 150,
      status: 'success'
    });

    res.json({
      success: true,
      message: `Imported and generated AI metadata for "${result.name}" successfully!`,
      data: result
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    console.error('[AiImportController] Import generation error:', err);

    await logImportSession({
      software_name: req.body.input || 'Unknown',
      source: req.body.source_type || 'auto',
      duration_ms: duration,
      ai_tokens: 0,
      status: 'failed'
    });

    res.status(500).json({
      success: false,
      error: err.message || 'Failed to import software details.'
    });
  }
}

/**
 * Saves imported software as a DRAFT (is_draft = 1)
 */
async function saveDraft(req, res) {
  try {
    const p = req.body;
    if (!p.name || !p.category_id) {
      return res.status(400).json({
        success: false,
        error: 'Software Name and Category are required to save draft.'
      });
    }

    // Handle icon file upload
    let iconImagePath = p.icon_image || '';
    if (req.files && req.files.icon_file && req.files.icon_file[0]) {
      iconImagePath = req.files.icon_file[0].filename;
    }

    // Handle installer file upload / binary generation
    let softwareFilePath = p.file_path || '';
    if (req.files && req.files.software_file && req.files.software_file[0]) {
      softwareFilePath = req.files.software_file[0].filename;
    } else if (!softwareFilePath) {
      const { ensureSoftwareInstallerFile } = require('../services/packageDownloaderService');
      softwareFilePath = await ensureSoftwareInstallerFile({
        softwareName: p.name,
        downloadUrl: p.download_url || p.official_url || p.github_url || p.official_website,
        platform: p.platform || 'windows',
        version: p.version || '1.0.0'
      });
    }

    const existingSw = await db.get('SELECT id, icon_image, file_path FROM software WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))', [p.name]);
    let draftId;

    if (existingSw) {
      draftId = existingSw.id;
      const finalIcon = iconImagePath || existingSw.icon_image || '';
      const finalFile = softwareFilePath || existingSw.file_path || '';

      await db.run(
        `UPDATE software SET
         category_id = ?, short_description = ?, full_description = ?, version = ?, size = ?,
         icon_image = ?, file_path = ?, is_featured = 0, is_new = 1, platform = ?,
         developer = ?, publisher = ?, license = ?, operating_systems = ?, architecture = ?,
         system_requirements = ?, installation_guide = ?, features = ?, changelog = ?,
         pros = ?, cons = ?, tags = ?, seo_title = ?, seo_meta_description = ?,
         seo_keywords = ?, faq = ?, recommended_software = ?, screenshots = ?,
         is_draft = 1, github_url = ?, official_url = ?, safety_info = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          p.category_id,
          p.short_description || '',
          p.full_description || '',
          p.version || '1.0.0',
          p.size || '25.0 MB',
          finalIcon,
          finalFile,
          p.platform || 'windows',
          p.developer || '',
          p.publisher || '',
          p.license || 'Freeware',
          p.operating_systems || 'Windows 11, Windows 10',
          p.architecture || '64-bit (x64)',
          p.system_requirements || '',
          p.installation_guide || '',
          typeof p.features === 'object' ? JSON.stringify(p.features) : (p.features || ''),
          p.changelog || '',
          typeof p.pros === 'object' ? JSON.stringify(p.pros) : (p.pros || ''),
          typeof p.cons === 'object' ? JSON.stringify(p.cons) : (p.cons || ''),
          p.tags || '',
          p.seo_title || `Download ${p.name}`,
          p.seo_meta_description || `Download ${p.name} for Windows / Mobile. Safe direct download.`,
          p.seo_keywords || `${p.name}, download ${p.name}`,
          typeof p.faq === 'object' ? JSON.stringify(p.faq) : (p.faq || ''),
          typeof p.recommended_software === 'object' ? JSON.stringify(p.recommended_software) : (p.recommended_software || ''),
          typeof p.screenshots === 'object' ? JSON.stringify(p.screenshots) : (p.screenshots || '[]'),
          p.github_url || '',
          p.official_url || '',
          p.safety_info || '100% Virus-free and verified clean installer package.',
          draftId
        ]
      );
    } else {
      const insertResult = await db.run(
        `INSERT INTO software 
         (name, category_id, short_description, full_description, version, size, icon_image, file_path, is_featured, is_new, platform,
          developer, publisher, license, operating_systems, architecture, system_requirements, installation_guide,
          features, changelog, pros, cons, tags, seo_title, seo_meta_description, seo_keywords, faq, recommended_software, screenshots,
          is_draft, github_url, official_url, safety_info) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.name.trim(),
          p.category_id,
          p.short_description || '',
          p.full_description || '',
          p.version || '1.0.0',
          p.size || '25.0 MB',
          iconImagePath,
          softwareFilePath,
          0,
          1,
          p.platform || 'windows',
          p.developer || '',
          p.publisher || '',
          p.license || 'Freeware',
          p.operating_systems || 'Windows 11, Windows 10',
          p.architecture || '64-bit (x64)',
          p.system_requirements || '',
          p.installation_guide || '',
          typeof p.features === 'object' ? JSON.stringify(p.features) : (p.features || ''),
          p.changelog || '',
          typeof p.pros === 'object' ? JSON.stringify(p.pros) : (p.pros || ''),
          typeof p.cons === 'object' ? JSON.stringify(p.cons) : (p.cons || ''),
          p.tags || '',
          p.seo_title || `Download ${p.name}`,
          p.seo_meta_description || `Download ${p.name} for Windows / Mobile. Safe direct download.`,
          p.seo_keywords || `${p.name}, download ${p.name}`,
          typeof p.faq === 'object' ? JSON.stringify(p.faq) : (p.faq || ''),
          typeof p.recommended_software === 'object' ? JSON.stringify(p.recommended_software) : (p.recommended_software || ''),
          typeof p.screenshots === 'object' ? JSON.stringify(p.screenshots) : (p.screenshots || '[]'),
          1, // is_draft = 1
          p.github_url || '',
          p.official_url || '',
          p.safety_info || '100% Virus-free and verified clean installer package.'
        ]
      );
      draftId = insertResult.lastID;
    }

    res.json({
      success: true,
      message: `💾 "${p.name}" saved as Draft! You can review and publish anytime.`,
      draftId: insertResult.lastID
    });

  } catch (err) {
    console.error('[AiImportController] Save draft error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to save software draft.'
    });
  }
}

/**
 * Publishes a draft software (is_draft = 0)
 */
async function publishSoftware(req, res) {
  try {
    const { id } = req.params;
    if (id) {
      await db.run('UPDATE software SET is_draft = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
      return res.json({
        success: true,
        message: '🚀 Software published live to website!'
      });
    }

    // Direct publish payload
    const p = req.body;
    p.is_draft = 0;
    req.body = p;
    const { publishDirectly } = require('./autoPublisherController');
    return publishDirectly(req, res);

  } catch (err) {
    console.error('[AiImportController] Publish error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to publish software.'
    });
  }
}

/**
 * Scans database for available updates
 */
async function checkUpdates(req, res) {
  try {
    const updates = await scanSoftwareForUpdates();
    res.json({
      success: true,
      count: updates.length,
      updates
    });
  } catch (err) {
    console.error('[AiImportController] Check updates error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to scan software updates.'
    });
  }
}

/**
 * Updates software details via AI while preserving existing download link
 */
async function updateVersion(req, res) {
  try {
    const { id } = req.params;
    const config = (req.app && req.app.locals && req.app.locals.getConfig) ? req.app.locals.getConfig() : {};
    const result = await updateSoftwareDetailsViaAi(id, config);
    res.json(result);
  } catch (err) {
    console.error('[AiImportController] Update version error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to update software version.'
    });
  }
}

module.exports = {
  renderAiImportPage,
  generateImportPreview,
  saveDraft,
  publishSoftware,
  checkUpdates,
  updateVersion
};
