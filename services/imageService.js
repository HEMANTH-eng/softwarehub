const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const imagesStorageDir = path.resolve(__dirname, '../storage/images');
if (!fs.existsSync(imagesStorageDir)) {
  fs.mkdirSync(imagesStorageDir, { recursive: true });
}

/**
 * Downloads a remote image URL and saves it to storage/images/.
 * Returns the saved filename, or empty string on failure.
 */
function downloadAndSaveImage(imageUrl, prefix = 'ai-img') {
  return new Promise((resolve) => {
    if (!imageUrl || typeof imageUrl !== 'string' || !/^https?:\/\//i.test(imageUrl)) {
      return resolve('');
    }

    try {
      const parsed = new URL(imageUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      
      let ext = path.extname(parsed.pathname).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'].includes(ext)) {
        ext = '.png';
      }

      const uniqueName = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
      const destPath = path.join(imagesStorageDir, uniqueName);
      const fileStream = fs.createWriteStream(destPath);

      const req = client.get(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fileStream.close();
          fs.unlink(destPath, () => {});
          return resolve(downloadAndSaveImage(res.headers.location, prefix));
        }

        if (res.statusCode !== 200) {
          fileStream.close();
          fs.unlink(destPath, () => {});
          return resolve('');
        }

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve(uniqueName);
        });
      });

      req.on('error', (err) => {
        console.warn(`[ImageService] Download error for ${imageUrl}:`, err.message);
        fileStream.close();
        fs.unlink(destPath, () => {});
        resolve('');
      });

      req.setTimeout(10000, () => {
        req.destroy();
        fileStream.close();
        fs.unlink(destPath, () => {});
        resolve('');
      });

    } catch (err) {
      console.warn('[ImageService] Invalid image URL:', err.message);
      resolve('');
    }
  });
}

/**
 * Finds and downloads official logo and screenshots based on software metadata & domain.
 */
async function fetchSoftwareImages(softwareName, websiteUrl, scrapedMeta = {}) {
  let logoFilename = '';
  const screenshots = [];

  let domain = '';
  if (websiteUrl) {
    try {
      const u = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
      domain = u.hostname;
    } catch (e) {}
  }

  // 1. Try Scraped OG Image first
  if (scrapedMeta.ogImage) {
    logoFilename = await downloadAndSaveImage(scrapedMeta.ogImage, 'logo');
  }

  // 2. Try Favicon if no logo yet
  if (!logoFilename && scrapedMeta.favicon) {
    logoFilename = await downloadAndSaveImage(scrapedMeta.favicon, 'icon');
  }

  // 3. Try High-Res Google Favicon Service if domain exists and logo still empty
  if (!logoFilename && domain) {
    const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    logoFilename = await downloadAndSaveImage(googleFaviconUrl, 'icon-google');
  }

  // 4. Generate SVG fallback icon if no remote icon could be fetched
  if (!logoFilename) {
    logoFilename = createFallbackSvgIcon(softwareName || 'App');
  }

  // 5. Gather screenshots if OG image exists or mock placeholder screens
  if (scrapedMeta.ogImage && logoFilename !== scrapedMeta.ogImage) {
    const screenFile = await downloadAndSaveImage(scrapedMeta.ogImage, 'screen');
    if (screenFile) screenshots.push(screenFile);
  }

  return {
    icon_image: logoFilename,
    screenshots: screenshots.length > 0 ? JSON.stringify(screenshots) : '[]'
  };
}

/**
 * Generates a stylish fallback SVG icon for software if none was found online.
 */
function createFallbackSvgIcon(name) {
  const cleanName = (name || 'App').trim();
  const initial = (cleanName.charAt(0) || 'A').toUpperCase();
  
  // Pick deterministic vibrant gradient colors based on string
  const colors = [
    { start: '#2563eb', end: '#1d4ed8' }, // Blue
    { start: '#7c3aed', end: '#6d28d9' }, // Purple
    { start: '#059669', end: '#047857' }, // Emerald
    { start: '#dc2626', end: '#b91c1c' }, // Red
    { start: '#ea580c', end: '#c2410c' }  // Orange
  ];

  let hash = 0;
  for (let i = 0; i < cleanName.length; i++) {
    hash = cleanName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = colors[Math.abs(hash) % colors.length];

  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${color.start}" />
      <stop offset="100%" stop-color="${color.end}" />
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#grad)" />
  <text x="50%" y="54%" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="64" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${initial}</text>
</svg>`;

  const filename = `fallback-${Date.now()}-${Math.round(Math.random() * 1e5)}.svg`;
  const destPath = path.join(imagesStorageDir, filename);

  try {
    fs.writeFileSync(destPath, svgContent, 'utf8');
    return filename;
  } catch (e) {
    console.warn('[ImageService] Failed to write fallback SVG icon:', e.message);
    return '';
  }
}

module.exports = {
  downloadAndSaveImage,
  fetchSoftwareImages,
  createFallbackSvgIcon
};
