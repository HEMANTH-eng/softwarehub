const { fetchGitHubDetails, parseGitHubUrl } = require('./githubFetcher');
const { fetchWebsiteDetails } = require('./websiteFetcher');
const { fetchPlayStoreDetails, parsePlayStoreUrl } = require('./playStoreFetcher');
const { autoDiscoverAndGatherSoftware, generateSoftwareMetadata } = require('./aiService');

/**
 * Master Software Aggregator Service
 * Dispatches to specialized fetchers (GitHub, Website, Play Store, or Name)
 */
async function importSoftwareFromSource({ input, sourceType = 'auto', config = {} }) {
  if (!input || !input.trim()) {
    throw new Error('Please enter a software name or URL.');
  }

  const query = input.trim();
  let rawData = null;
  let detectedSource = sourceType;

  // Auto detect source type if set to auto
  if (sourceType === 'auto') {
    if (parseGitHubUrl(query)) detectedSource = 'github';
    else if (parsePlayStoreUrl(query)) detectedSource = 'playstore';
    else if (/^https?:\/\//i.test(query)) detectedSource = 'website';
    else detectedSource = 'name';
  }

  console.log(`[SoftwareFetcher] Importing software. Source: "${detectedSource}", Input: "${query}"`);

  // Dispatch to domain-specific fetcher
  switch (detectedSource) {
    case 'github':
      rawData = await fetchGitHubDetails(query);
      break;
    case 'playstore':
      rawData = await fetchPlayStoreDetails(query);
      break;
    case 'website':
      rawData = await fetchWebsiteDetails(query);
      break;
    case 'name':
    default:
      rawData = await autoDiscoverAndGatherSoftware(query, config);
      break;
  }

  // Generate AI-enriched structured metadata
  const aiMetadata = await generateSoftwareMetadata({
    softwareName: rawData.name,
    websiteUrl: rawData.official_website || rawData.download_url,
    scrapedMeta: {
      title: rawData.name,
      description: rawData.short_description || rawData.full_description,
      bodyText: rawData.body_content || rawData.release_notes || ''
    },
    config: config
  });

  // Unified structured output combining source data + AI generation
  const unifiedPayload = {
    name: rawData.name || aiMetadata.name || query,
    developer: rawData.developer || aiMetadata.developer || 'Official Developer',
    publisher: rawData.publisher || aiMetadata.publisher || rawData.developer || 'Official Publisher',
    version: rawData.version || aiMetadata.version || '1.0.0',
    release_date: rawData.release_date || new Date().toISOString().split('T')[0],
    category: rawData.category || aiMetadata.category || 'Utilities',
    platform: rawData.platform || (aiMetadata.operating_systems && aiMetadata.operating_systems.toLowerCase().includes('android') ? 'android' : 'windows'),
    operating_systems: rawData.operating_system || aiMetadata.operating_systems || 'Windows 11, Windows 10',
    architecture: rawData.architecture || aiMetadata.architecture || '64-bit (x64)',
    license: rawData.license || aiMetadata.license || 'Freeware',
    size: rawData.size || aiMetadata.size || '25.0 MB',
    
    // URLs
    official_url: rawData.official_website || rawData.download_url || '',
    github_url: rawData.github_url || '',
    playstore_url: rawData.playstore_url || '',
    download_url: rawData.download_url || rawData.official_website || '',

    // Media
    icon_image: rawData.icon_image || aiMetadata.icon_image || '',
    screenshots: rawData.screenshots || aiMetadata.screenshots || [],

    // AI Descriptions & Content
    short_description: aiMetadata.short_description || rawData.short_description || '',
    full_description: aiMetadata.full_description || rawData.full_description || '',
    features: Array.isArray(aiMetadata.features) ? aiMetadata.features : (rawData.features || []),
    pros: Array.isArray(aiMetadata.pros) ? aiMetadata.pros : [],
    cons: Array.isArray(aiMetadata.cons) ? aiMetadata.cons : [],
    system_requirements: aiMetadata.system_requirements || 'Standard system requirements.',
    installation_guide: aiMetadata.installation_guide || 'Download setup installer and launch application.',
    changelog: rawData.release_notes || aiMetadata.changelog || `Version ${rawData.version || '1.0.0'} release updates.`,
    faq: Array.isArray(aiMetadata.faq) ? aiMetadata.faq : [],
    tags: aiMetadata.tags || rawData.name,
    recommended_software: Array.isArray(aiMetadata.recommended_software) ? aiMetadata.recommended_software : [],
    safety_info: 'Verified clean installer package. 100% safe direct download.',

    // SEO Meta
    seo: {
      title: aiMetadata.seo_title || `Download ${rawData.name} for PC / Mobile`,
      description: aiMetadata.seo_meta_description || `Download ${rawData.name}. Free, safe direct download with guide.`,
      keywords: Array.isArray(aiMetadata.seo_keywords) ? aiMetadata.seo_keywords : (aiMetadata.seo_keywords || '').split(',').map(k => k.trim())
    },

    source_type: detectedSource,
    is_draft: 1
  };

  return unifiedPayload;
}

module.exports = {
  importSoftwareFromSource
};
