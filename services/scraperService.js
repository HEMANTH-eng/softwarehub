const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * Scrapes metadata and page text content from a given website URL.
 * Handles timeouts, redirects, and meta tag extraction cleanly.
 */
async function scrapeWebsite(targetUrl, timeoutMs = 15000) {
  if (!targetUrl || typeof targetUrl !== 'string') {
    return { success: false, error: 'No URL provided' };
  }

  let normalizedUrl = targetUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = 'https://' + normalizedUrl;
  }

  try {
    const html = await fetchHtmlWithTimeout(normalizedUrl, timeoutMs);
    const parsed = extractMetaAndText(html, normalizedUrl);
    return {
      success: true,
      url: normalizedUrl,
      ...parsed
    };
  } catch (err) {
    console.warn(`[ScraperService] Scraping failed for ${normalizedUrl}:`, err.message);
    return {
      success: false,
      url: normalizedUrl,
      error: err.message,
      title: '',
      metaDescription: '',
      metaKeywords: '',
      ogImage: '',
      favicon: '',
      headings: [],
      bodyText: ''
    };
  }
}

function fetchHtmlWithTimeout(urlStr, timeoutMs = 15000, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Too many HTTP redirects'));
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(urlStr);
    } catch (err) {
      return reject(new Error('Invalid URL format'));
    }

    const client = parsedUrl.protocol === 'https:' ? https : http;
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    };

    const req = client.request(reqOptions, (res) => {
      // Handle HTTP redirects (301, 302, 307, 308)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, urlStr).toString();
        return resolve(fetchHtmlWithTimeout(redirectUrl, timeoutMs, maxRedirects - 1));
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP Server Error (${res.statusCode})`));
      }

      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
        // Limit max download size to 2MB to prevent memory bloat
        if (data.length > 2 * 1024 * 1024) {
          req.destroy();
          resolve(data);
        }
      });
      res.on('end', () => resolve(data));
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Request connection timed out'));
    });

    req.end();
  });
}

function extractMetaAndText(html, baseUrlStr) {
  const meta = {
    title: '',
    metaDescription: '',
    metaKeywords: '',
    ogImage: '',
    favicon: '',
    headings: [],
    bodyText: ''
  };

  if (!html) return meta;

  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    meta.title = sanitizeText(titleMatch[1]);
  }

  // Meta Description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i) ||
                    html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["']/i) ||
                    html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([\s\S]*?)["']/i);
  if (descMatch) {
    meta.metaDescription = sanitizeText(descMatch[1]);
  }

  // Meta Keywords
  const keyMatch = html.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([\s\S]*?)["']/i);
  if (keyMatch) {
    meta.metaKeywords = sanitizeText(keyMatch[1]);
  }

  // OpenGraph Image
  const ogImgMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([\s\S]*?)["']/i) ||
                     html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([\s\S]*?)["']/i);
  if (ogImgMatch) {
    meta.ogImage = resolveUrl(ogImgMatch[1], baseUrlStr);
  }

  // Favicon
  const iconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([\s\S]*?)["']/i) ||
                    html.match(/<link[^>]*href=["']([\s\S]*?)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
  if (iconMatch) {
    meta.favicon = resolveUrl(iconMatch[1], baseUrlStr);
  } else {
    try {
      const u = new URL(baseUrlStr);
      meta.favicon = `${u.protocol}//${u.hostname}/favicon.ico`;
    } catch (e) {}
  }

  // Headings (H1, H2)
  const headings = [];
  const hRegex = /<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi;
  let match;
  while ((match = hRegex.exec(html)) !== null && headings.length < 10) {
    const text = sanitizeText(match[1]);
    if (text && text.length > 3) {
      headings.push(text);
    }
  }
  meta.headings = headings;

  // Extract clean main body text (strip tags, scripts, styles)
  let cleanText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<code[\s\S]*?<\/code>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  meta.bodyText = cleanText.substring(0, 4000); // Pass first 4000 chars to AI context

  return meta;
}

function sanitizeText(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveUrl(relative, base) {
  try {
    return new URL(relative, base).toString();
  } catch (e) {
    return relative;
  }
}

module.exports = {
  scrapeWebsite,
  scrapeWebsiteMetadata: scrapeWebsite
};
