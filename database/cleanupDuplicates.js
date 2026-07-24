const db = require('./db');

async function cleanupDuplicates() {
  console.log('[CleanupDuplicates] Starting deduplication of software table...');

  try {
    const allSoftware = await db.all('SELECT * FROM software ORDER BY id ASC');
    console.log(`[CleanupDuplicates] Found ${allSoftware.length} total software records.`);

    // Group software by normalized name
    const grouped = {};
    for (const sw of allSoftware) {
      const normName = sw.name.trim().toLowerCase();
      if (!grouped[normName]) {
        grouped[normName] = [];
      }
      grouped[normName].push(sw);
    }

    let deletedCount = 0;

    for (const [normName, items] of Object.entries(grouped)) {
      // Check for obviously invalid names like "7"
      if (normName === '7') {
        for (const item of items) {
          console.log(`[CleanupDuplicates] Removing invalid software entry ID ${item.id} ("${item.name}")`);
          await db.run('DELETE FROM download_logs WHERE software_id = ?', [item.id]);
          await db.run('DELETE FROM software WHERE id = ?', [item.id]);
          deletedCount++;
        }
        continue;
      }

      if (items.length > 1) {
        console.log(`[CleanupDuplicates] Found ${items.length} entries for "${items[0].name}"`);
        
        // Pick primary item: prefer item with richer version/description or lowest ID
        items.sort((a, b) => {
          // Check version (prefer non '1.0.0' or higher version strings)
          const aVer = a.version && a.version !== '1.0.0' ? 1 : 0;
          const bVer = b.version && b.version !== '1.0.0' ? 1 : 0;
          if (aVer !== bVer) return bVer - aVer;

          // Check full description length
          const aDescLen = (a.full_description || '').length;
          const bDescLen = (b.full_description || '').length;
          if (aDescLen !== bDescLen) return bDescLen - aDescLen;

          // Default to lower ID
          return a.id - b.id;
        });

        const primary = items[0];
        const duplicates = items.slice(1);

        console.log(`[CleanupDuplicates] Primary kept: ID ${primary.id} ("${primary.name}", version: ${primary.version})`);

        for (const dup of duplicates) {
          console.log(`[CleanupDuplicates] Removing duplicate: ID ${dup.id} ("${dup.name}", version: ${dup.version})`);

          // Re-link download_logs to primary ID
          await db.run('UPDATE download_logs SET software_id = ? WHERE software_id = ?', [primary.id, dup.id]);

          // Delete duplicate software record
          await db.run('DELETE FROM software WHERE id = ?', [dup.id]);
          deletedCount++;
        }

        // Recalculate download_count for primary software
        const logCountRow = await db.get('SELECT COUNT(*) as count FROM download_logs WHERE software_id = ?', [primary.id]);
        const actualDownloads = (primary.download_count || 0) + (logCountRow ? logCountRow.count : 0);
        await db.run('UPDATE software SET download_count = ? WHERE id = ?', [actualDownloads, primary.id]);
      }
    }

    const remainingSoftware = await db.all('SELECT id, name, version, download_count FROM software ORDER BY id ASC');
    console.log(`[CleanupDuplicates] Deduplication finished! Deleted ${deletedCount} duplicate/invalid entries.`);
    console.log(`[CleanupDuplicates] Remaining software count: ${remainingSoftware.length}`);
    console.log(JSON.stringify(remainingSoftware, null, 2));

  } catch (err) {
    console.error('[CleanupDuplicates] Error:', err);
  }
}

if (require.main === module) {
  cleanupDuplicates().then(() => process.exit(0));
}

module.exports = cleanupDuplicates;
