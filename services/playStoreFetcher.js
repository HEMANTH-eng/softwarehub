const https = require('https');
const http = require('http');

/**
 * Parses Google Play Store URL or package ID
 */
function parsePlayStoreUrl(urlOrPkg) {
  if (!urlOrPkg) return null;
  const match = urlOrPkg.match(/id=([a-zA-Z0-9_\.]+)/) || urlOrPkg.match(/^([a-zA-Z0-9_\.]+)$/);
  return match ? match[1] : null;
}

/**
 * Fetches Google Play Store web page HTML
 */
function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', err => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Play Store request timed out.'));
    });
  });
}

/**
 * Scrapes Google Play Store app page details
 */
async function fetchPlayStoreDetails(playStoreUrl) {
  const packageId = parsePlayStoreUrl(playStoreUrl);
  if (!packageId) {
    throw new Error('Invalid Play Store URL or Package ID. Example: https://play.google.com/store/apps/details?id=com.whatsapp');
  }

  const targetUrl = `https://play.google.com/store/apps/details?id=${packageId}&hl=en_US`;
  const html = await fetchHtml(targetUrl);

  // Extract Title: <h1 itemprop="name"><span>Title</span></h1> or <title>App Title - Apps on Google Play</title>
  let title = '';
  const titleMatch = html.match(/<title>([^<]+)- Apps on Google Play<\/title>/i) || html.match(/<h1[^>]*><span>([^<]+)<\/span><\/h1>/i);
  if (titleMatch) {
    title = titleMatch[1].trim();
  } else {
    title = packageId.split('.').pop();
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }

  // Extract Developer
  let developer = 'Android Developer';
  const devMatch = html.match(/href="\/store\/apps\/developer\?id=([^"]+)"[^>]*><span>([^<]+)<\/span>/i) || html.match(/itemprop="author"[^>]*>([^<]+)</i);
  if (devMatch) {
    developer = devMatch[2] || devMatch[1];
  }

  // Extract Icon URL
  let iconUrl = '';
  const iconMatch = html.match(/<img[^>]+src="([^"]+)"[^>]+alt="Cover art"[^>]*>/i) || html.match(/itemprop="image"[^>]+content="([^"]+)"/i);
  if (iconMatch) {
    iconUrl = iconMatch[1];
  }

  // Extract Screenshots
  const screenshots = [];
  const screenshotMatches = html.matchAll(/<img[^>]+src="([^"]+)"[^>]+srcset="[^"]*"[^>]+alt="Screenshot image"[^>]*>/g);
  for (const m of screenshotMatches) {
    if (m[1] && screenshots.length < 4) {
      screenshots.push(m[1]);
    }
  }

  // Extract Description
  let description = '';
  const descMatch = html.match(/itemprop="description"[^>]*>([\s\S]*?)<\/div>/i) || html.match(/<div data-g-id="description"[^>]*>([\s\S]*?)<\/div>/i);
  if (descMatch) {
    description = descMatch[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
  }

  // Extract Version
  let version = '2.24.1';
  const verMatch = html.match(/Current Version[^<]*<\/div>[^<]*<div[^>]*>([^<]+)/i) || description.match(/v?(\d+\.\d+\.\d+(\.\d+)?)/i);
  if (verMatch) {
    version = verMatch[1].trim();
  }

  return {
    name: title,
    developer: developer,
    publisher: developer,
    version: version,
    release_date: new Date().toISOString().split('T')[0],
    category: 'Android Apps',
    operating_system: 'Android 8.0 and up',
    architecture: 'ARM64 / Universal APK',
    license: 'Free',
    size: '45 MB',
    download_url: targetUrl,
    official_website: targetUrl,
    playstore_url: targetUrl,
    icon_image: iconUrl,
    screenshots: screenshots,
    short_description: description ? description.substring(0, 200) + '...' : `Download ${title} APK for Android.`,
    full_description: description || `Download ${title} APK for Android devices. Fast and secure APK installer.`,
    platform: 'android'
  };
}

module.exports = {
  fetchPlayStoreDetails,
  parsePlayStoreUrl
};
