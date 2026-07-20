const db = require('../database/db');

/**
 * Service to aggregate Admin Notifications & Alerts
 */
async function getAdminNotifications() {
  const notifications = [];

  try {
    // 1. Fetch pending user app requests
    const pendingRequests = await db.all(
      `SELECT * FROM app_requests WHERE status = 'pending' ORDER BY created_at DESC LIMIT 10`
    );

    if (pendingRequests && pendingRequests.length > 0) {
      pendingRequests.forEach(req => {
        notifications.push({
          id: `req-${req.id}`,
          raw_id: req.id,
          type: 'app_request',
          badge: 'New Request',
          badge_color: 'bg-blue-500/20 text-blue-300 border-blue-400/30',
          title: `App Request: ${req.app_name}`,
          message: req.email ? `Requested by ${req.email}` : (req.details || 'User requested this software download.'),
          app_name: req.app_name,
          created_at: req.created_at,
          action: 'auto_publish'
        });
      });
    }

    // 2. Fetch older software listings for version update recommendations
    const olderSoftware = await db.all(
      `SELECT id, name, version, updated_at FROM software 
       ORDER BY updated_at ASC LIMIT 5`
    );

    if (olderSoftware && olderSoftware.length > 0) {
      olderSoftware.forEach(sw => {
        notifications.push({
          id: `sw-${sw.id}`,
          raw_id: sw.id,
          type: 'software_update',
          badge: 'Update Check',
          badge_color: 'bg-amber-500/20 text-amber-300 border-amber-400/30',
          title: `Check Update: ${sw.name}`,
          message: `Current version v${sw.version || '1.0.0'}. Click to run automated version lookup.`,
          app_name: sw.name,
          created_at: sw.updated_at,
          action: 'auto_update'
        });
      });
    }

  } catch (err) {
    console.error('[NotificationService] Error fetching notifications:', err);
  }

  return {
    unreadCount: notifications.length,
    notifications
  };
}

module.exports = {
  getAdminNotifications
};
