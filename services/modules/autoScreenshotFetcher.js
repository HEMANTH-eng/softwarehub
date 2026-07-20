/**
 * Future Ready Module: Auto Screenshot Fetcher
 * Specialized service module to discover and download screenshots for software.
 */
const { downloadAndSaveImage } = require('../imageService');

async function fetchScreenshotsForSoftware(websiteUrl, candidateUrls = []) {
  const savedFiles = [];
  for (let i = 0; i < candidateUrls.length; i++) {
    const filename = await downloadAndSaveImage(candidateUrls[i], `screenshot-${i + 1}`);
    if (filename) savedFiles.push(filename);
  }
  return savedFiles;
}

module.exports = {
  fetchScreenshotsForSoftware
};
