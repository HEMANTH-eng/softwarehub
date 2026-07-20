const db = require('../database/db');
const { getAdminNotifications } = require('../services/notificationService');
const { autoDiscoverAndGatherSoftware } = require('../services/aiService');
const { publishDirectly } = require('./autoPublisherController');

/**
 * Endpoint to fetch live notifications and unread alert count.
 */
async function fetchNotifications(req, res) {
  try {
    const data = await getAdminNotifications();
    res.json({
      success: true,
      ...data
    });
  } catch (err) {
    console.error('[NotificationController] Fetch error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch admin notifications.'
    });
  }
}

/**
 * Dismisses a notification item (e.g. marks app request as completed or dismissed).
 */
async function dismissNotification(req, res) {
  try {
    const { notification_id, request_id } = req.body;

    if (request_id) {
      await db.run("UPDATE app_requests SET status = 'completed' WHERE id = ?", [request_id]);
    }

    res.json({
      success: true,
      message: 'Notification dismissed.'
    });
  } catch (err) {
    console.error('[NotificationController] Dismiss error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to dismiss notification.'
    });
  }
}

/**
 * Fulfills an app request automatically via AI One-Click Auto Publisher engine!
 */
async function autoFulfillRequest(req, res) {
  try {
    const { request_id, app_name } = req.body;
    if (!app_name) {
      return res.status(400).json({
        success: false,
        error: 'App Name is required to fulfill request.'
      });
    }

    const config = (req.app && req.app.locals && req.app.locals.getConfig) ? req.app.locals.getConfig() : {};

    // 1. Discover details for the requested app
    const discoveryResult = await autoDiscoverAndGatherSoftware(app_name, config);

    // 2. Map category
    const categories = await db.all('SELECT * FROM categories ORDER BY name ASC');
    let categoryId = categories && categories[0] ? categories[0].id : 1;
    if (categories && discoveryResult.category) {
      const match = categories.find(c => c.name.toLowerCase() === discoveryResult.category.toLowerCase());
      if (match) categoryId = match.id;
    }

    // 3. Directly publish entry
    const publishPayload = {
      ...discoveryResult,
      category_id: categoryId,
      name: discoveryResult.name || app_name
    };

    req.body = publishPayload;
    
    // Mark app request as completed in database
    if (request_id) {
      await db.run("UPDATE app_requests SET status = 'completed' WHERE id = ?", [request_id]);
    }

    return publishDirectly(req, res);

  } catch (err) {
    console.error('[NotificationController] Fulfill request error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to auto-fulfill app request.'
    });
  }
}

module.exports = {
  fetchNotifications,
  dismissNotification,
  autoFulfillRequest
};
