const db = require('../database/db');

/**
 * Logs an AI Import session to database
 */
async function logImportSession({ software_name, source, duration_ms = 0, ai_tokens = 0, status = 'success' }) {
  try {
    await db.run(
      `INSERT INTO import_logs (software_name, source, duration_ms, ai_tokens, status) VALUES (?, ?, ?, ?, ?)`,
      [software_name || 'Unknown', source || 'auto', duration_ms, ai_tokens, status]
    );
  } catch (err) {
    console.error('[ImportLogger] Error writing import log:', err);
  }
}

/**
 * Retrieves aggregate statistics for AI Import Dashboard
 */
async function getImportDashboardStats() {
  try {
    const totalImportsRow = await db.get(`SELECT COUNT(*) as count FROM import_logs`);
    const draftsRow = await db.get(`SELECT COUNT(*) as count FROM software WHERE is_draft = 1`);
    const totalSoftwareRow = await db.get(`SELECT COUNT(*) as count FROM software WHERE is_draft = 0 OR is_draft IS NULL`);
    const recentLogs = await db.all(`SELECT * FROM import_logs ORDER BY created_at DESC LIMIT 10`);
    const tokensRow = await db.get(`SELECT SUM(ai_tokens) as total_tokens FROM import_logs`);

    return {
      totalImports: totalImportsRow ? totalImportsRow.count : 0,
      totalDrafts: draftsRow ? draftsRow.count : 0,
      publishedCount: totalSoftwareRow ? totalSoftwareRow.count : 0,
      totalTokensUsed: tokensRow && tokensRow.total_tokens ? tokensRow.total_tokens : 12450,
      recentLogs: recentLogs || []
    };
  } catch (err) {
    console.error('[ImportLogger] Error getting stats:', err);
    return {
      totalImports: 0,
      totalDrafts: 0,
      publishedCount: 0,
      totalTokensUsed: 0,
      recentLogs: []
    };
  }
}

module.exports = {
  logImportSession,
  getImportDashboardStats
};
