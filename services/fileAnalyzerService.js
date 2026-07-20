const fs = require('fs');
const path = require('path');

/**
 * Analyzes uploaded binary/installer file to extract file size, version hints, software name hints, architecture.
 */
function analyzeInstallerFile(filePath, originalFilename = '') {
  const result = {
    hasFile: false,
    fileSizeFormatted: '',
    fileName: originalFilename || (filePath ? path.basename(filePath) : ''),
    extension: '',
    guessedName: '',
    guessedVersion: '',
    guessedArchitecture: 'x64'
  };

  const nameToAnalyze = result.fileName || (filePath ? path.basename(filePath) : '');
  if (!nameToAnalyze) return result;

  result.extension = path.extname(nameToAnalyze).toLowerCase();

  // 1. Calculate file size if file exists on disk
  if (filePath && fs.existsSync(filePath)) {
    try {
      const stats = fs.statSync(filePath);
      result.hasFile = true;
      result.fileSizeFormatted = formatBytes(stats.size);
    } catch (e) {
      console.warn('[FileAnalyzerService] Could not stat file:', e.message);
    }
  }

  // 2. Parse filename hints
  const cleanBase = path.basename(nameToAnalyze, result.extension);

  // Detect Architecture
  if (/x64|64bit|amd64|win64/i.test(cleanBase)) {
    result.guessedArchitecture = '64-bit (x64)';
  } else if (/x86|32bit|win32/i.test(cleanBase)) {
    result.guessedArchitecture = '32-bit (x86)';
  } else if (/arm64|aarch64/i.test(cleanBase)) {
    result.guessedArchitecture = 'ARM64';
  } else {
    result.guessedArchitecture = '64-bit / 32-bit';
  }

  // Detect Version pattern (e.g. 3.0.20, v12.1.0, 2407)
  const versionMatch = cleanBase.match(/(?:v|ver|version)?[\-_]?(\d+\.\d+(?:\.\d+)?(?:\.\d+)?)/i);
  if (versionMatch) {
    result.guessedVersion = versionMatch[1];
  }

  // Detect Software Name by stripping version, arch, extension, and common setup keywords
  let namePart = cleanBase
    .replace(/(?:v|ver|version)?[\-_]?\d+\.\d+(?:\.\d+)?(?:\.\d+)?/gi, '')
    .replace(/[\-_]?(?:x64|x86|64bit|32bit|win64|win32|amd64|setup|installer|full|portable|final|build|latest|offline)/gi, '')
    .replace(/[\-_]+/g, ' ')
    .trim();

  if (namePart.length >= 2) {
    // Capitalize words
    result.guessedName = namePart
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  return result;
}

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 MB';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

module.exports = {
  analyzeInstallerFile,
  formatBytes
};
