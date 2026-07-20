const https = require('https');

/**
 * Parses GitHub Repository URL or Owner/Repo path
 */
function parseGitHubUrl(urlOrPath) {
  if (!urlOrPath) return null;
  const cleaned = urlOrPath.trim().replace(/\/+$/, '');
  const match = cleaned.match(/github\.com\/([^\/]+)\/([^\/]+)/) || cleaned.match(/^([^\/]+)\/([^\/]+)$/);
  if (match) {
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
  }
  return null;
}

/**
 * Helper to make GitHub API HTTPS GET Requests
 */
function fetchGitHubApi(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: endpoint,
      method: 'GET',
      headers: {
        'User-Agent': 'SoftwareHubPro-AI-Importer/1.0',
        'Accept': 'application/vnd.github.v3+json'
      },
      timeout: 12000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 403 || res.statusCode === 429) {
          return reject(new Error('GitHub API rate limit exceeded. Please try again later or use website URL.'));
        }
        if (res.statusCode === 404) {
          return reject(new Error('GitHub Repository or Release not found.'));
        }
        if (res.statusCode >= 400) {
          return reject(new Error(`GitHub API HTTP Error ${res.statusCode}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON response from GitHub API.'));
        }
      });
    });

    req.on('error', (err) => reject(new Error(`GitHub request failed: ${err.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('GitHub API request timed out.'));
    });
    req.end();
  });
}

/**
 * Fetches GitHub Repository metadata, latest release, asset files & sizes
 */
async function fetchGitHubDetails(githubUrl) {
  const parsed = parseGitHubUrl(githubUrl);
  if (!parsed) {
    throw new Error('Invalid GitHub URL format. Example: https://github.com/vlc/vlc');
  }

  const { owner, repo } = parsed;
  const repoData = await fetchGitHubApi(`/repos/${owner}/${repo}`);

  let latestRelease = null;
  try {
    latestRelease = await fetchGitHubApi(`/repos/${owner}/${repo}/releases/latest`);
  } catch (e) {
    console.warn(`[GitHubFetcher] No releases found for ${owner}/${repo}: ${e.message}`);
  }

  // Extract assets and download link
  let downloadUrl = repoData.html_url;
  let fileSize = 'Variable';
  let architecture = 'x64 / Cross-platform';

  if (latestRelease && Array.isArray(latestRelease.assets) && latestRelease.assets.length > 0) {
    const asset = latestRelease.assets.find(a => a.name.match(/\.(exe|msi|zip|dmg|apk|deb|tar\.gz)$/i)) || latestRelease.assets[0];
    if (asset) {
      downloadUrl = asset.browser_download_url;
      if (asset.size) {
        fileSize = `${(asset.size / (1024 * 1024)).toFixed(1)} MB`;
      }
      if (asset.name.includes('x64') || asset.name.includes('64bit')) architecture = '64-bit (x64)';
      else if (asset.name.includes('x86') || asset.name.includes('32bit')) architecture = '32-bit (x86)';
      else if (asset.name.includes('arm64')) architecture = 'ARM64';
    }
  }

  return {
    name: repoData.name ? repoData.name.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : repo,
    developer: repoData.owner ? repoData.owner.login : owner,
    publisher: repoData.owner ? repoData.owner.login : owner,
    version: (latestRelease && latestRelease.tag_name) ? latestRelease.tag_name.replace(/^v/i, '') : '1.0.0',
    release_date: (latestRelease && latestRelease.published_at) ? latestRelease.published_at.split('T')[0] : new Date().toISOString().split('T')[0],
    category: repoData.language || 'Development',
    operating_system: 'Windows / Cross-platform',
    architecture: architecture,
    license: (repoData.license && repoData.license.spdx_id) ? repoData.license.spdx_id : 'Open Source',
    size: fileSize,
    download_url: downloadUrl,
    official_website: repoData.homepage || repoData.html_url,
    github_url: repoData.html_url,
    icon_image: repoData.owner ? repoData.owner.avatar_url : '',
    release_notes: (latestRelease && latestRelease.body) ? latestRelease.body : repoData.description,
    short_description: repoData.description || `Open source ${repoData.name} application on GitHub.`
  };
}

module.exports = {
  fetchGitHubDetails,
  parseGitHubUrl
};
