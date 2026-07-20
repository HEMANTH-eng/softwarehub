const { scrapeWebsiteMetadata } = require('./scraperService');

/**
 * Fetches software details from official landing page website URL
 */
async function fetchWebsiteDetails(websiteUrl) {
  if (!websiteUrl) {
    throw new Error('Website URL is required. Example: https://www.google.com/chrome/');
  }

  let validUrl = websiteUrl.trim();
  if (!/^https?:\/\//i.test(validUrl)) {
    validUrl = 'https://' + validUrl;
  }

  const scraped = await scrapeWebsiteMetadata(validUrl);

  // Extract developer/publisher name from domain name
  let domainName = '';
  try {
    const parsed = new URL(validUrl);
    domainName = parsed.hostname.replace(/^www\./i, '').split('.')[0];
    domainName = domainName.charAt(0).toUpperCase() + domainName.slice(1);
  } catch (e) {
    domainName = 'Official Developer';
  }

  // Extract version from scraped content if available
  let version = '1.0.0';
  const versionMatch = (scraped.title + ' ' + scraped.description + ' ' + scraped.bodyText).match(/v?(\d+\.\d+(\.\d+)?)/i);
  if (versionMatch) {
    version = versionMatch[1];
  }

  return {
    name: scraped.title ? scraped.title.replace(/\s*[\-\|].*$/g, '').trim() : domainName,
    developer: domainName + ' LLC',
    publisher: domainName + ' Official',
    version: version,
    release_date: new Date().toISOString().split('T')[0],
    category: 'Utilities',
    operating_system: 'Windows 11, Windows 10',
    architecture: '64-bit (x64)',
    license: 'Freeware',
    size: '25.0 MB',
    download_url: validUrl,
    official_website: validUrl,
    icon_image: scraped.favicon || scraped.ogImage || '',
    og_image: scraped.ogImage || '',
    short_description: scraped.description || `Official software download for ${scraped.title || domainName}.`,
    body_content: scraped.bodyText || '',
    headings: scraped.headings || []
  };
}

module.exports = {
  fetchWebsiteDetails
};
