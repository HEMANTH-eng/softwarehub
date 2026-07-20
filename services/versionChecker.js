const db = require('../database/db');
const { fetchGitHubDetails } = require('./githubFetcher');
const { importSoftwareFromSource } = require('./softwareFetcher');

/**
 * Compares semver version strings (e.g. "1.89.1" vs "1.90.0")
 */
function isVersionNewer(latest, current) {
  if (!latest || !current) return false;
  const cleanL = latest.replace(/[^0-9\.]/g, '');
  const cleanC = current.replace(/[^0-9\.]/g, '');
  return cleanL !== cleanC && cleanL > cleanC;
}

/**
 * Scans all published software for available updates
 */
async function scanSoftwareForUpdates() {
  const updatesAvailable = [];

  try {
    const softwareList = await db.all(
      `SELECT id, name, version, github_url, official_url, updated_at FROM software WHERE (is_draft = 0 OR is_draft IS NULL) ORDER BY updated_at ASC`
    );

    for (const sw of softwareList) {
      if (sw.github_url) {
        try {
          const gh = await fetchGitHubDetails(sw.github_url);
          if (gh && gh.version && isVersionNewer(gh.version, sw.version)) {
            updatesAvailable.push({
              software_id: sw.id,
              name: sw.name,
              current_version: sw.version || '1.0.0',
              latest_version: gh.version,
              github_url: sw.github_url,
              release_notes: gh.release_notes,
              update_source: 'GitHub Release'
            });
          }
        } catch (e) {
          // GitHub fetch failed or no release
        }
      }
    }
  } catch (err) {
    console.error('[VersionChecker] Error scanning updates:', err);
  }

  return updatesAvailable;
}

/**
 * Updates software details via AI while preserving existing download file path
 */
async function updateSoftwareDetailsViaAi(softwareId, config = {}) {
  const existing = await db.get(`SELECT * FROM software WHERE id = ?`, [softwareId]);
  if (!existing) {
    throw new Error(`Software with ID ${softwareId} not found.`);
  }

  // Run auto discovery / import from source
  const sourceInput = existing.github_url || existing.official_url || existing.name;
  const refreshed = await importSoftwareFromSource({ input: sourceInput, sourceType: 'auto', config });

  // Update record in database, keeping original file_path & download_count
  await db.run(
    `UPDATE software SET
      version = ?,
      short_description = ?,
      full_description = ?,
      features = ?,
      changelog = ?,
      system_requirements = ?,
      seo_title = ?,
      seo_meta_description = ?,
      seo_keywords = ?,
      last_ai_update = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      refreshed.version || existing.version,
      refreshed.short_description || existing.short_description,
      refreshed.full_description || existing.full_description,
      typeof refreshed.features === 'object' ? JSON.stringify(refreshed.features) : (refreshed.features || existing.features),
      refreshed.changelog || existing.changelog,
      refreshed.system_requirements || existing.system_requirements,
      refreshed.seo.title || existing.seo_title,
      refreshed.seo.description || existing.seo_meta_description,
      Array.isArray(refreshed.seo.keywords) ? refreshed.seo.keywords.join(', ') : (refreshed.seo.keywords || existing.seo_keywords),
      softwareId
    ]
  );

  console.log(`[VersionChecker] Successfully updated software ID ${softwareId} ("${existing.name}") to v${refreshed.version}`);

  return {
    success: true,
    message: `Updated "${existing.name}" to version v${refreshed.version || existing.version}!`,
    version: refreshed.version || existing.version
  };
}

module.exports = {
  scanSoftwareForUpdates,
  updateSoftwareDetailsViaAi
};
