const https = require('https');
const http = require('http');

/**
 * Service to interface with AI models (Gemini API or intelligent heuristic fallback)
 * and generate structured software catalog JSON.
 */
async function generateSoftwareMetadata({ softwareName = '', websiteUrl = '', fileMeta = {}, scrapedMeta = {}, config = {} }) {
  const apiKey = (config.ai && config.ai.apiKey) || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  const modelName = (config.ai && config.ai.model) || 'gemini-2.0-flash';
  const timeoutMs = (config.ai && config.ai.timeoutMs) || 30000;

  // Determine base software title
  let nameHint = softwareName.trim() || fileMeta.guessedName || scrapedMeta.title || '';
  nameHint = nameHint.replace(/\s*[\-\|].*$/g, '').trim(); // strip site suffixes
  if (!nameHint) nameHint = 'Software Application';

  // Attempt Gemini API if key exists
  if (apiKey) {
    try {
      console.log(`[AIService] Calling Gemini API for: "${nameHint}"`);
      const aiResult = await callGeminiApi({
        apiKey,
        modelName,
        softwareName: nameHint,
        websiteUrl,
        fileMeta,
        scrapedMeta,
        timeoutMs
      });

      if (aiResult && aiResult.name) {
        return normalizeStructuredOutput(aiResult, nameHint, fileMeta, scrapedMeta);
      }
    } catch (err) {
      console.warn(`[AIService] Gemini API call failed or timed out: ${err.message}. Falling back to heuristic generator.`);
    }
  } else {
    console.log(`[AIService] No Gemini API key provided. Using built-in intelligent analysis engine for: "${nameHint}"`);
  }

  // Fallback: Intelligent heuristic metadata generator
  return generateHeuristicMetadata(nameHint, websiteUrl, fileMeta, scrapedMeta);
}

/**
 * Calls Gemini API endpoint using standard https module to maintain zero extra dependencies.
 */
function callGeminiApi({ apiKey, modelName, softwareName, websiteUrl, fileMeta, scrapedMeta, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const prompt = `You are a senior software cataloger and technical documentation writer.
Analyze the following software details and generate a complete, professional, highly accurate JSON response for a software download repository.

Context Input:
- Software Name Hint: "${softwareName}"
- Website URL: "${websiteUrl}"
- Uploaded File Info: Size=${fileMeta.fileSizeFormatted || 'Unknown'}, Version=${fileMeta.guessedVersion || 'Unknown'}, Arch=${fileMeta.guessedArchitecture || 'x64'}
- Scraped Page Title: "${scrapedMeta.title || ''}"
- Scraped Description: "${scrapedMeta.metaDescription || ''}"
- Headings: ${(scrapedMeta.headings || []).join('; ')}
- Body Text Snippet: "${(scrapedMeta.bodyText || '').substring(0, 1500)}"

Return ONLY a raw JSON object with NO markdown codeblocks (\`\`\`json) using this EXACT structure:
{
  "name": "${softwareName}",
  "short_description": "Catchy, professional summary under 150 characters",
  "full_description": "Detailed multi-paragraph description of what the software does and why users need it.",
  "version": "e.g. 1.0.0 or latest detected",
  "developer": "Official Developer Name",
  "publisher": "Official Publisher Name",
  "category": "e.g. Utilities, Browsers, Security, Multimedia, Office, Development",
  "license": "Freeware / Open Source / Shareware / Proprietary",
  "operating_systems": "Windows 11, Windows 10, Windows 8.1, Windows 7",
  "architecture": "64-bit (x64), 32-bit (x86)",
  "size": "File size in MB (e.g. 45 MB)",
  "system_requirements": "Processor: 1 GHz or faster, RAM: 2 GB, Storage: 200 MB free space",
  "installation_guide": "1. Download the setup installer file.\\n2. Run the executable file.\\n3. Follow the setup wizard instructions.",
  "features": ["Key Feature 1", "Key Feature 2", "Key Feature 3", "Key Feature 4"],
  "changelog": "Summary of latest improvements and bug fixes.",
  "pros": ["High performance", "Clean interface", "Reliable and secure"],
  "cons": ["Requires restart after update", "Minor RAM usage under heavy load"],
  "tags": "software, utility, tools, free download",
  "seo_title": "Download ${softwareName} Latest Version for Windows",
  "seo_meta_description": "Download ${softwareName} for Windows PC safely and free. Features, installation guide, and full review.",
  "seo_keywords": "${softwareName}, download ${softwareName}, ${softwareName} windows, free download",
  "faq": [
    {"question": "Is ${softwareName} free to use?", "answer": "Yes, ${softwareName} is free to download and use."},
    {"question": "Is it safe to download?", "answer": "Yes, all files are checked for malware and viruses before publishing."}
  ],
  "recommended_software": ["Alternative App 1", "Alternative App 2", "Alternative App 3"]
}`;

    const requestBody = JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    });

    const req = https.request(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      },
      timeout: timeoutMs
    }, (res) => {
      let rawData = '';
      res.on('data', (chunk) => rawData += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            return reject(new Error(`Gemini API HTTP Error ${res.statusCode}: ${rawData}`));
          }
          const parsedRes = JSON.parse(rawData);
          const textResponse = parsedRes.candidates?.[0]?.content?.parts?.[0]?.text || '';
          
          // Clean JSON string if wrapped in codeblocks
          const cleanJsonStr = textResponse.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
          const jsonData = JSON.parse(cleanJsonStr);
          resolve(jsonData);
        } catch (parseErr) {
          reject(new Error(`Failed to parse Gemini API JSON response: ${parseErr.message}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Gemini API connection timed out after ${timeoutMs}ms`));
    });

    req.write(requestBody);
    req.end();
  });
}

/**
 * Intelligent Heuristic Metadata synthesis generator when AI API key is omitted or unreachable.
 */
function generateHeuristicMetadata(name, websiteUrl, fileMeta, scrapedMeta) {
  const cleanName = name || 'Essential Software Utility';
  const version = fileMeta.guessedVersion || '1.0.0';
  const size = fileMeta.fileSizeFormatted || '25.0 MB';
  const arch = fileMeta.guessedArchitecture || '64-bit (x64)';

  const shortDesc = (scrapedMeta.metaDescription || `Download ${cleanName} for Windows PC. High performance, user-friendly features, and fast setup.`).substring(0, 145);
  
  const fullDesc = `${cleanName} is a powerful and reliable application designed to boost productivity and enhance your daily workflow. Built with an intuitive user interface, it provides robust capabilities suited for both beginners and professional users.

Whether you are looking for advanced controls or effortless operation, ${cleanName} delivers consistent performance, security, and updates to keep your setup running smoothly.`;

  // Infer Category
  let categoryName = 'Utilities';
  const lowerName = cleanName.toLowerCase();
  if (/chrome|firefox|browser|edge|brave|opera/i.test(lowerName)) categoryName = 'Browsers';
  else if (/antivirus|security|defender|cleaner|firewall|vpn/i.test(lowerName)) categoryName = 'Security';
  else if (/player|video|music|audio|vlc|media|editor/i.test(lowerName)) categoryName = 'Multimedia';
  else if (/office|word|pdf|excel|note|document/i.test(lowerName)) categoryName = 'Office';
  else if (/code|git|studio|node|python|dev|compiler/i.test(lowerName)) categoryName = 'Development';

  return normalizeStructuredOutput({
    name: cleanName,
    short_description: shortDesc,
    full_description: fullDesc,
    version: version,
    developer: cleanName.split(' ')[0] + ' Software Inc.',
    publisher: cleanName.split(' ')[0] + ' Technologies',
    category: categoryName,
    license: 'Freeware',
    operating_systems: 'Windows 11, Windows 10, Windows 8.1, Windows 7',
    architecture: arch,
    size: size,
    system_requirements: 'OS: Windows 10/11 (64-bit)\nProcessor: Intel Core i3 or AMD equivalent\nMemory: 2 GB RAM\nStorage: 150 MB available space',
    installation_guide: `1. Download the latest setup installer for ${cleanName}.\n2. Double-click the downloaded setup executable.\n3. Follow the onscreen setup wizard instructions.\n4. Launch ${cleanName} and enjoy!`,
    features: [
      `User-friendly and intuitive user interface`,
      `Optimized speed and low resource consumption`,
      `Regular software updates and bug fixes`,
      `Comprehensive configuration options`
    ],
    changelog: `Version ${version}: Performance optimizations, stability enhancements, and updated security protocols.`,
    pros: [
      'Fast installation and setup',
      'Minimal CPU and RAM footprint',
      'Clean interface with zero ad trackers'
    ],
    cons: [
      'Requires administrative privileges during installation',
      'Internet connection recommended for initial updates'
    ],
    tags: `${cleanName.toLowerCase()}, windows utility, free download, software, pc apps`,
    seo_title: `Download ${cleanName} v${version} for Windows - Free & Safe`,
    seo_meta_description: `Download the latest version of ${cleanName} for Windows. Free, safe, and direct download with installation guide and features.`,
    seo_keywords: `${cleanName}, download ${cleanName}, ${cleanName} windows, ${cleanName} latest version`,
    faq: [
      { question: `Is ${cleanName} safe to download?`, answer: `Yes, all binaries hosted on our repository are verified and virus-scanned.` },
      { question: `Does ${cleanName} support 64-bit Windows systems?`, answer: `Yes, ${cleanName} is fully optimized for 64-bit and 32-bit Windows operating systems.` }
    ],
    recommended_software: [
      '7-Zip Utility',
      'VLC Media Player',
      'CCleaner Free'
    ]
  }, cleanName, fileMeta, scrapedMeta);
}

/**
 * Normalizes output object to guarantee string arrays, string formatting, and clean structures.
 */
function normalizeStructuredOutput(obj, defaultName, fileMeta, scrapedMeta) {
  const normArray = (val) => {
    if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
    if (typeof val === 'string') return val.split('\n').map(s => s.replace(/^[\-\*\d\.\s]+/, '').trim()).filter(Boolean);
    return [];
  };

  const normFaq = (val) => {
    if (Array.isArray(val)) return val;
    return [
      { question: `Is ${defaultName} free to download?`, answer: `Yes, ${defaultName} is free to download and use.` }
    ];
  };

  return {
    name: String(obj.name || defaultName).trim(),
    short_description: String(obj.short_description || '').trim(),
    full_description: String(obj.full_description || '').trim(),
    version: String(obj.version || fileMeta.guessedVersion || '1.0.0').trim(),
    developer: String(obj.developer || defaultName + ' Software').trim(),
    publisher: String(obj.publisher || defaultName + ' Inc.').trim(),
    category: String(obj.category || 'Utilities').trim(),
    license: String(obj.license || 'Freeware').trim(),
    operating_systems: String(obj.operating_systems || 'Windows 11, Windows 10, Windows 8.1, Windows 7').trim(),
    architecture: String(obj.architecture || fileMeta.guessedArchitecture || '64-bit (x64)').trim(),
    size: String(obj.size || fileMeta.fileSizeFormatted || '25 MB').trim(),
    system_requirements: Array.isArray(obj.system_requirements) ? obj.system_requirements.join('\n') : String(obj.system_requirements || '').trim(),
    installation_guide: Array.isArray(obj.installation_guide) ? obj.installation_guide.join('\n') : String(obj.installation_guide || '').trim(),
    features: normArray(obj.features),
    changelog: Array.isArray(obj.changelog) ? obj.changelog.join('\n') : String(obj.changelog || '').trim(),
    pros: normArray(obj.pros),
    cons: normArray(obj.cons),
    tags: Array.isArray(obj.tags) ? obj.tags.join(', ') : String(obj.tags || '').trim(),
    seo_title: String(obj.seo_title || `Download ${defaultName} for Windows PC`).trim(),
    seo_meta_description: String(obj.seo_meta_description || `Download ${defaultName} for Windows safely and free. Features and setup.`).trim(),
    seo_keywords: Array.isArray(obj.seo_keywords) ? obj.seo_keywords.join(', ') : String(obj.seo_keywords || '').trim(),
    faq: normFaq(obj.faq),
    recommended_software: normArray(obj.recommended_software)
  };
}

/**
 * One-Click Auto Publisher Discovery Engine:
 * Discovers website URL, scrapes content, calls AI model, fetches media assets, and returns full preview object.
 */
async function autoDiscoverAndGatherSoftware(softwareName, config = {}) {
  const { scrapeWebsite } = require('./scraperService');
  const { fetchSoftwareImages } = require('./imageService');

  const cleanName = softwareName.trim();
  if (!cleanName) {
    throw new Error('Software Name is required for One-Click Auto Publisher.');
  }

  // 1. Resolve official website URL using smart dictionary or domain builder
  const websiteUrl = resolveOfficialWebsiteUrl(cleanName);

  // 2. Scrape website metadata & content
  const scrapedMeta = await scrapeWebsite(websiteUrl, 15000);

  // 3. Generate structured software metadata via AI API or intelligent engine
  const generatedData = await generateSoftwareMetadata({
    softwareName: cleanName,
    websiteUrl,
    fileMeta: {},
    scrapedMeta,
    config
  });

  // 4. Download official icon & screenshots
  const imageMeta = await fetchSoftwareImages(generatedData.name || cleanName, websiteUrl, scrapedMeta);

  // 5. Build official download link reference
  const downloadUrl = `https://${new URL(websiteUrl).hostname}/download`;

  return {
    ...generatedData,
    website_url: websiteUrl,
    official_download_url: downloadUrl,
    icon_image: imageMeta.icon_image || '',
    screenshots: imageMeta.screenshots || '[]'
  };
}

/**
 * Smart Domain Name resolver for popular software titles
 */
function resolveOfficialWebsiteUrl(name) {
  const lower = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

  const domainMap = {
    'google chrome': 'https://www.google.com/chrome/',
    'chrome': 'https://www.google.com/chrome/',
    'vlc media player': 'https://www.videolan.org/vlc/',
    'vlc': 'https://www.videolan.org/vlc/',
    '7zip': 'https://www.7-zip.org/',
    '7 zip': 'https://www.7-zip.org/',
    'notepad': 'https://notepad-plus-plus.org/',
    'notepad++': 'https://notepad-plus-plus.org/',
    'firefox': 'https://www.mozilla.org/firefox/',
    'mozilla firefox': 'https://www.mozilla.org/firefox/',
    'brave': 'https://brave.com/',
    'brave browser': 'https://brave.com/',
    'winrar': 'https://www.win-rar.com/',
    'obs studio': 'https://obsproject.com/',
    'obs': 'https://obsproject.com/',
    'blender': 'https://www.blender.org/',
    'ccleaner': 'https://www.ccleaner.com/',
    'gimp': 'https://www.gimp.org/',
    'visual studio code': 'https://code.visualstudio.com/',
    'vscode': 'https://code.visualstudio.com/',
    'git': 'https://git-scm.com/',
    'python': 'https://www.python.org/',
    'zoom': 'https://zoom.us/',
    'telegram': 'https://desktop.telegram.org/',
    'whatsapp': 'https://www.whatsapp.com/download'
  };

  if (domainMap[lower]) {
    return domainMap[lower];
  }

  // Fallback: build standard domain URL
  const slug = lower.replace(/\s+/g, '');
  return `https://www.${slug}.com/`;
}

module.exports = {
  generateSoftwareMetadata,
  autoDiscoverAndGatherSoftware
};

