const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Load config to find database path
const configPath = path.resolve(__dirname, '../config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const dbFilePath = path.resolve(__dirname, '..', config.paths.database);

// Ensure the directory for the database exists
const dbDir = path.dirname(dbFilePath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Ensure the storage folders exist
const storageDir = path.resolve(__dirname, '..', config.paths.storage);
const softwareDir = path.join(storageDir, 'software');
const imagesDir = path.join(storageDir, 'images');

if (!fs.existsSync(softwareDir)) {
  fs.mkdirSync(softwareDir, { recursive: true });
}
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

// Connect to SQLite database
const db = new sqlite3.Database(dbFilePath, (err) => {
  if (err) {
    console.error('Could not connect to SQLite database', err);
  } else {
    console.log('Connected to SQLite database:', dbFilePath);
    // Initialize schema
    initializeSchema();
  }
});

function initializeSchema() {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema, (err) => {
    if (err) {
      console.error('Error initializing database schema', err);
    } else {
      console.log('Database schema checked/initialized successfully.');
      
      const newColumns = [
        "platform TEXT DEFAULT 'windows'",
        "developer TEXT",
        "publisher TEXT",
        "license TEXT",
        "operating_systems TEXT",
        "architecture TEXT",
        "system_requirements TEXT",
        "installation_guide TEXT",
        "features TEXT",
        "changelog TEXT",
        "pros TEXT",
        "cons TEXT",
        "tags TEXT",
        "seo_title TEXT",
        "seo_meta_description TEXT",
        "seo_keywords TEXT",
        "faq TEXT",
        "recommended_software TEXT",
        "screenshots TEXT",
        "is_draft INTEGER DEFAULT 0",
        "github_url TEXT",
        "official_url TEXT",
        "last_checked DATETIME",
        "last_ai_update DATETIME",
        "safety_info TEXT"
      ];

      let completed = 0;
      newColumns.forEach((colDef) => {
        db.run(`ALTER TABLE software ADD COLUMN ${colDef}`, (migrateErr) => {
          if (migrateErr && !migrateErr.message.includes('duplicate column name')) {
            console.error(`Error adding column ${colDef}:`, migrateErr);
          }
          completed++;
          if (completed === newColumns.length) {
            console.log('Database schema software table columns verified/migrated.');
            seedDefaultAdminAndCategories();
            seedDefaultSoftware();
            try {
              const cleanupDuplicates = require('./cleanupDuplicates');
              cleanupDuplicates();
            } catch (e) {
              console.error('Error running cleanupDuplicates:', e);
            }
          }
        });
      });
    }
  });
}

function seedDefaultAdminAndCategories() {
  db.get('SELECT COUNT(*) as count FROM admin_users', (err, row) => {
    if (err) {
      console.error('Error checking admin_users table:', err);
      return;
    }
    if (row && row.count === 0) {
      const bcrypt = require('bcryptjs');
      const adminUsername = 'hemanth';
      const adminPassword = 'bhemanth';
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(adminPassword, salt);
      db.run('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', [adminUsername, hash], (insertErr) => {
        if (insertErr) {
          console.error('Failed to seed default admin user:', insertErr);
        } else {
          console.log(`Auto-seeded default admin user: "${adminUsername}"`);
        }
      });
    }
  });

  db.get('SELECT COUNT(*) as count FROM categories', (err, row) => {
    if (err) {
      console.error('Error checking categories table:', err);
      return;
    }
    if (row && row.count === 0) {
      const categories = [
        { name: 'Utilities', slug: 'utilities' },
        { name: 'Browsers', slug: 'browsers' },
        { name: 'Security', slug: 'security' },
        { name: 'Office', slug: 'office' },
        { name: 'Multimedia', slug: 'multimedia' },
        { name: 'Development', slug: 'development' }
      ];
      const stmt = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)');
      categories.forEach(cat => {
        stmt.run(cat.name, cat.slug);
      });
      stmt.finalize((finalizeErr) => {
        if (finalizeErr) {
          console.error('Failed to finalize categories statement:', finalizeErr);
        } else {
          console.log('Auto-seeded default categories.');
        }
      });
    }
  });
}

// Wrapper object to export Promise-based methods
const dbWrapper = {
  get: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  all: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  run: function (sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        // "this" contains lastID and changes for standard sqlite3 callback
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },

  exec: (sql) => {
    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  close: () => {
    return new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};

module.exports = dbWrapper;


function seedDefaultSoftware() {
  db.get('SELECT COUNT(*) as count FROM software', (err, row) => {
    if (err) return;
    if (row && row.count === 0) {
      const defaultApps = [
  {
    "id": 1,
    "name": "Google Chrome",
    "category_id": 2,
    "short_description": "Fast, secure, and easy-to-use browser built for the modern web.",
    "full_description": "Google Chrome is a fast, simple, and secure web browser, built for the modern web. It runs web applications and pages with lightning speed, features a clean interface, and integrates Google Account synchronization across all your devices.",
    "version": "124.0.6367.61",
    "size": "95 MB",
    "icon_image": "chrome-icon.svg",
    "file_path": "chrome-installer.exe",
    "download_count": 2,
    "view_count": 5,
    "is_featured": 1,
    "is_new": 0,
    "created_at": "2026-07-11 10:51:47",
    "updated_at": "2026-07-11 10:51:47",
    "platform": "windows",
    "developer": null,
    "architecture": null,
    "changelog": null,
    "installation_guide": null,
    "cons": null,
    "features": null,
    "seo_title": null,
    "pros": null,
    "tags": null,
    "system_requirements": null,
    "seo_meta_description": null,
    "screenshots": null,
    "operating_systems": null,
    "publisher": null,
    "recommended_software": null,
    "seo_keywords": null,
    "faq": null,
    "license": null
  },
  {
    "id": 2,
    "name": "VLC Media Player",
    "category_id": 5,
    "short_description": "The open-source multi-platform multimedia player that plays almost everything.",
    "full_description": "VLC is a free and open-source cross-platform multimedia player and framework that plays most multimedia files as well as DVDs, Audio CDs, VCDs, and various streaming protocols. Features highly customizable skins and extension support.",
    "version": "3.0.20",
    "size": "42 MB",
    "icon_image": "vlc-icon.svg",
    "file_path": "vlc-installer.exe",
    "download_count": 0,
    "view_count": 0,
    "is_featured": 1,
    "is_new": 1,
    "created_at": "2026-07-11 10:51:47",
    "updated_at": "2026-07-11 10:51:47",
    "platform": "windows",
    "developer": null,
    "architecture": null,
    "changelog": null,
    "installation_guide": null,
    "cons": null,
    "features": null,
    "seo_title": null,
    "pros": null,
    "tags": null,
    "system_requirements": null,
    "seo_meta_description": null,
    "screenshots": null,
    "operating_systems": null,
    "publisher": null,
    "recommended_software": null,
    "seo_keywords": null,
    "faq": null,
    "license": null
  },
  {
    "id": 3,
    "name": "7-Zip",
    "category_id": 1,
    "short_description": "High compression ratio file archiver utility.",
    "full_description": "7-Zip is a file archiver with a high compression ratio. It supports 7z, ZIP, GZIP, BZIP2 and TAR formats, and features a clean shell integration, strong AES-256 encryption in 7z and ZIP formats, and a powerful Command Line version.",
    "version": "24.05",
    "size": "2.5 MB",
    "icon_image": "7zip-icon.svg",
    "file_path": "7zip-installer.exe",
    "download_count": 0,
    "view_count": 1,
    "is_featured": 0,
    "is_new": 1,
    "created_at": "2026-07-11 10:51:47",
    "updated_at": "2026-07-11 10:51:47",
    "platform": "windows",
    "developer": null,
    "architecture": null,
    "changelog": null,
    "installation_guide": null,
    "cons": null,
    "features": null,
    "seo_title": null,
    "pros": null,
    "tags": null,
    "system_requirements": null,
    "seo_meta_description": null,
    "screenshots": null,
    "operating_systems": null,
    "publisher": null,
    "recommended_software": null,
    "seo_keywords": null,
    "faq": null,
    "license": null
  },
  {
    "id": 4,
    "name": "VS Code",
    "category_id": 6,
    "short_description": "Code editing. Redefined. Free and open source.",
    "full_description": "Visual Studio Code is a lightweight but powerful source code editor which runs on your desktop. It comes with built-in support for JavaScript, TypeScript and Node.js and has a rich ecosystem of extensions for other languages and runtimes.",
    "version": "1.89.1",
    "size": "88 MB",
    "icon_image": "vscode-icon.svg",
    "file_path": "vscode-installer.exe",
    "download_count": 0,
    "view_count": 3,
    "is_featured": 1,
    "is_new": 0,
    "created_at": "2026-07-11 10:51:47",
    "updated_at": "2026-07-11 10:51:47",
    "platform": "windows",
    "developer": null,
    "architecture": null,
    "changelog": null,
    "installation_guide": null,
    "cons": null,
    "features": null,
    "seo_title": null,
    "pros": null,
    "tags": null,
    "system_requirements": null,
    "seo_meta_description": null,
    "screenshots": null,
    "operating_systems": null,
    "publisher": null,
    "recommended_software": null,
    "seo_keywords": null,
    "faq": null,
    "license": null
  },
  {
    "id": 5,
    "name": "LibreOffice",
    "category_id": 4,
    "short_description": "The free, powerful, and open-source office productivity suite.",
    "full_description": "LibreOffice is a powerful and free office suite, a successor to OpenOffice.org. Its clean interface and feature-rich tools help you unleash your creativity and organize your productivity. Includes Writer (word processing), Calc (spreadsheets), and Impress (presentations).",
    "version": "24.2.3",
    "size": "340 MB",
    "icon_image": "libreoffice-icon.svg",
    "file_path": "libreoffice-installer.exe",
    "download_count": 0,
    "view_count": 0,
    "is_featured": 0,
    "is_new": 0,
    "created_at": "2026-07-11 10:51:47",
    "updated_at": "2026-07-11 10:51:47",
    "platform": "windows",
    "developer": null,
    "architecture": null,
    "changelog": null,
    "installation_guide": null,
    "cons": null,
    "features": null,
    "seo_title": null,
    "pros": null,
    "tags": null,
    "system_requirements": null,
    "seo_meta_description": null,
    "screenshots": null,
    "operating_systems": null,
    "publisher": null,
    "recommended_software": null,
    "seo_keywords": null,
    "faq": null,
    "license": null
  },
  {
    "id": 6,
    "name": "Malwarebytes",
    "category_id": 3,
    "short_description": "Industry-leading anti-malware and security protection.",
    "full_description": "Malwarebytes protects you against malware, ransomware, malicious websites, and other advanced threats. It cleans infected devices, monitors your systems in real-time, and safeguards your privacy with intuitive dashboard settings.",
    "version": "4.6.12",
    "size": "180 MB",
    "icon_image": "malwarebytes-icon.svg",
    "file_path": "malwarebytes-installer.exe",
    "download_count": 0,
    "view_count": 0,
    "is_featured": 0,
    "is_new": 1,
    "created_at": "2026-07-11 10:51:47",
    "updated_at": "2026-07-11 10:51:47",
    "platform": "windows",
    "developer": null,
    "architecture": null,
    "changelog": null,
    "installation_guide": null,
    "cons": null,
    "features": null,
    "seo_title": null,
    "pros": null,
    "tags": null,
    "system_requirements": null,
    "seo_meta_description": null,
    "screenshots": null,
    "operating_systems": null,
    "publisher": null,
    "recommended_software": null,
    "seo_keywords": null,
    "faq": null,
    "license": null
  },
  {
    "id": 7,
    "name": "WhatsApp Messenger",
    "category_id": 1,
    "short_description": "Simple, reliable, and private messaging and calling on Android.",
    "full_description": "WhatsApp from Meta is a free messaging and video calling app. It is used by over 2B people in more than 180 countries. It is simple, reliable, and private, so you can easily keep in touch with your friends and family.",
    "version": "2.24.9.78",
    "size": "38 MB",
    "icon_image": "whatsapp-icon.svg",
    "file_path": "whatsapp.apk",
    "download_count": 0,
    "view_count": 0,
    "is_featured": 1,
    "is_new": 1,
    "created_at": "2026-07-19 12:35:31",
    "updated_at": "2026-07-19 12:35:31",
    "platform": "android",
    "developer": null,
    "architecture": null,
    "changelog": null,
    "installation_guide": null,
    "cons": null,
    "features": null,
    "seo_title": null,
    "pros": null,
    "tags": null,
    "system_requirements": null,
    "seo_meta_description": null,
    "screenshots": null,
    "operating_systems": null,
    "publisher": null,
    "recommended_software": null,
    "seo_keywords": null,
    "faq": null,
    "license": null
  },
  {
    "id": 8,
    "name": "Telegram",
    "category_id": 1,
    "short_description": "Pure instant messaging — simple, fast, secure, and synced across all devices.",
    "full_description": "Telegram is a messaging app with a focus on speed and security, it’s super-fast, simple and free. You can send media and files, without any limits on their type and size. Your entire chat history will require no disk space on your device.",
    "version": "10.11.1",
    "size": "48 MB",
    "icon_image": "telegram-icon.svg",
    "file_path": "telegram.apk",
    "download_count": 0,
    "view_count": 0,
    "is_featured": 1,
    "is_new": 0,
    "created_at": "2026-07-19 12:35:31",
    "updated_at": "2026-07-19 12:35:31",
    "platform": "android",
    "developer": null,
    "architecture": null,
    "changelog": null,
    "installation_guide": null,
    "cons": null,
    "features": null,
    "seo_title": null,
    "pros": null,
    "tags": null,
    "system_requirements": null,
    "seo_meta_description": null,
    "screenshots": null,
    "operating_systems": null,
    "publisher": null,
    "recommended_software": null,
    "seo_keywords": null,
    "faq": null,
    "license": null
  },
  {
    "id": 9,
    "name": "Spotify Music",
    "category_id": 5,
    "short_description": "Listen to songs, play podcasts, and albums you love for free on your Android.",
    "full_description": "With the Spotify music and podcast app, you can play millions of songs, albums and original podcasts for free. We have even added audiobooks, so you can enjoy thousands of stories wherever you are!",
    "version": "8.9.34",
    "size": "62 MB",
    "icon_image": "spotify-icon.svg",
    "file_path": "spotify.apk",
    "download_count": 0,
    "view_count": 0,
    "is_featured": 1,
    "is_new": 0,
    "created_at": "2026-07-19 12:35:31",
    "updated_at": "2026-07-19 12:35:31",
    "platform": "android",
    "developer": null,
    "architecture": null,
    "changelog": null,
    "installation_guide": null,
    "cons": null,
    "features": null,
    "seo_title": null,
    "pros": null,
    "tags": null,
    "system_requirements": null,
    "seo_meta_description": null,
    "screenshots": null,
    "operating_systems": null,
    "publisher": null,
    "recommended_software": null,
    "seo_keywords": null,
    "faq": null,
    "license": null
  },
  {
    "id": 10,
    "name": "Firefox for Android",
    "category_id": 2,
    "short_description": "Private, safe, and fast web browser with tracking protection.",
    "full_description": "Get the fast, free and private web browser. Firefox is built with independent privacy protections and customizable options to make your Android browsing experience secure.",
    "version": "125.1.0",
    "size": "75 MB",
    "icon_image": "firefox-icon.svg",
    "file_path": "firefox.apk",
    "download_count": 0,
    "view_count": 0,
    "is_featured": 0,
    "is_new": 1,
    "created_at": "2026-07-19 12:35:31",
    "updated_at": "2026-07-19 12:35:31",
    "platform": "android",
    "developer": null,
    "architecture": null,
    "changelog": null,
    "installation_guide": null,
    "cons": null,
    "features": null,
    "seo_title": null,
    "pros": null,
    "tags": null,
    "system_requirements": null,
    "seo_meta_description": null,
    "screenshots": null,
    "operating_systems": null,
    "publisher": null,
    "recommended_software": null,
    "seo_keywords": null,
    "faq": null,
    "license": null
  },
  {
    "id": 11,
    "name": "Google Drive",
    "category_id": 4,
    "short_description": "Store, access, and share your files securely in one place.",
    "full_description": "Google Drive, part of Google Workspace, is a safe place to back up and access all your files from any device. Easily invite others to view, edit, or leave comments on any of your files or folders.",
    "version": "2.24.182",
    "size": "28 MB",
    "icon_image": "drive-icon.svg",
    "file_path": "drive.apk",
    "download_count": 0,
    "view_count": 0,
    "is_featured": 0,
    "is_new": 0,
    "created_at": "2026-07-19 12:35:31",
    "updated_at": "2026-07-19 12:35:31",
    "platform": "android",
    "developer": null,
    "architecture": null,
    "changelog": null,
    "installation_guide": null,
    "cons": null,
    "features": null,
    "seo_title": null,
    "pros": null,
    "tags": null,
    "system_requirements": null,
    "seo_meta_description": null,
    "screenshots": null,
    "operating_systems": null,
    "publisher": null,
    "recommended_software": null,
    "seo_keywords": null,
    "faq": null,
    "license": null
  },
  {
    "id": 13,
    "name": "VLC Media Player",
    "category_id": 5,
    "short_description": "Official download of VLC media player, the best Open Source player",
    "full_description": "VLC Media Player is a powerful and reliable application designed to boost productivity and enhance your daily workflow. Built with an intuitive user interface, it provides robust capabilities suited for both beginners and professional users.\n\nWhether you are looking for advanced controls or effortless operation, VLC Media Player delivers consistent performance, security, and updates to keep your setup running smoothly.",
    "version": "1.0.0",
    "size": "25.0 MB",
    "icon_image": "icon-1784528255840-912686.ico",
    "file_path": "vlc-media-player-installer-1784528260290.exe",
    "download_count": 0,
    "view_count": 0,
    "is_featured": 1,
    "is_new": 1,
    "created_at": "2026-07-20 06:17:40",
    "updated_at": "2026-07-20 06:17:40",
    "platform": "windows",
    "developer": "VLC Software Inc.",
    "architecture": "64-bit (x64)",
    "changelog": "Version 1.0.0: Performance optimizations, stability enhancements, and updated security protocols.",
    "installation_guide": "1. Download the latest setup installer for VLC Media Player.\n2. Double-click the downloaded setup executable.\n3. Follow the onscreen setup wizard instructions.\n4. Launch VLC Media Player and enjoy!",
    "cons": "[\"Requires administrative privileges during installation\",\"Internet connection recommended for initial updates\"]",
    "features": "[\"User-friendly and intuitive user interface\",\"Optimized speed and low resource consumption\",\"Regular software updates and bug fixes\",\"Comprehensive configuration options\"]",
    "seo_title": "Download VLC Media Player v1.0.0 for Windows - Free & Safe",
    "pros": "[\"Fast installation and setup\",\"Minimal CPU and RAM footprint\",\"Clean interface with zero ad trackers\"]",
    "tags": "vlc media player, windows utility, free download, software, pc apps",
    "system_requirements": "OS: Windows 10/11 (64-bit)\nProcessor: Intel Core i3 or AMD equivalent\nMemory: 2 GB RAM\nStorage: 150 MB available space",
    "seo_meta_description": "Download the latest version of VLC Media Player for Windows. Free, safe, and direct download with installation guide and features.",
    "screenshots": "[]",
    "operating_systems": "Windows 11, Windows 10, Windows 8.1, Windows 7",
    "publisher": "VLC Technologies",
    "recommended_software": "[\"7-Zip Utility\",\"VLC Media Player\",\"CCleaner Free\"]",
    "seo_keywords": "VLC Media Player, download VLC Media Player, VLC Media Player windows, VLC Media Player latest version",
    "faq": "[{\"question\":\"Is VLC Media Player safe to download?\",\"answer\":\"Yes, all binaries hosted on our repository are verified and virus-scanned.\"},{\"question\":\"Does VLC Media Player support 64-bit Windows systems?\",\"answer\":\"Yes, VLC Media Player is fully optimized for 64-bit and 32-bit Windows operating systems.\"}]",
    "license": "Freeware"
  },
  {
    "id": 14,
    "name": "WinRAR Pro",
    "category_id": 1,
    "short_description": "Download WinRAR Pro for Windows PC. High performance, user-friendly features, and fast setup.",
    "full_description": "WinRAR Pro is a powerful and reliable application designed to boost productivity and enhance your daily workflow. Built with an intuitive user interface, it provides robust capabilities suited for both beginners and professional users.\n\nWhether you are looking for advanced controls or effortless operation, WinRAR Pro delivers consistent performance, security, and updates to keep your setup running smoothly.",
    "version": "1.0.0",
    "size": "25.0 MB",
    "icon_image": "fallback-1784528287017-38811.svg",
    "file_path": "winrar-pro-installer-1784528287027.exe",
    "download_count": 0,
    "view_count": 0,
    "is_featured": 1,
    "is_new": 1,
    "created_at": "2026-07-20 06:18:07",
    "updated_at": "2026-07-20 06:18:07",
    "platform": "windows",
    "developer": "WinRAR Software Inc.",
    "architecture": "64-bit (x64)",
    "changelog": "Version 1.0.0: Performance optimizations, stability enhancements, and updated security protocols.",
    "installation_guide": "1. Download the latest setup installer for WinRAR Pro.\n2. Double-click the downloaded setup executable.\n3. Follow the onscreen setup wizard instructions.\n4. Launch WinRAR Pro and enjoy!",
    "cons": "[\"Requires administrative privileges during installation\",\"Internet connection recommended for initial updates\"]",
    "features": "[\"User-friendly and intuitive user interface\",\"Optimized speed and low resource consumption\",\"Regular software updates and bug fixes\",\"Comprehensive configuration options\"]",
    "seo_title": "Download WinRAR Pro v1.0.0 for Windows - Free & Safe",
    "pros": "[\"Fast installation and setup\",\"Minimal CPU and RAM footprint\",\"Clean interface with zero ad trackers\"]",
    "tags": "winrar pro, windows utility, free download, software, pc apps",
    "system_requirements": "OS: Windows 10/11 (64-bit)\nProcessor: Intel Core i3 or AMD equivalent\nMemory: 2 GB RAM\nStorage: 150 MB available space",
    "seo_meta_description": "Download the latest version of WinRAR Pro for Windows. Free, safe, and direct download with installation guide and features.",
    "screenshots": "[]",
    "operating_systems": "Windows 11, Windows 10, Windows 8.1, Windows 7",
    "publisher": "WinRAR Technologies",
    "recommended_software": "[\"7-Zip Utility\",\"VLC Media Player\",\"CCleaner Free\"]",
    "seo_keywords": "WinRAR Pro, download WinRAR Pro, WinRAR Pro windows, WinRAR Pro latest version",
    "faq": "[{\"question\":\"Is WinRAR Pro safe to download?\",\"answer\":\"Yes, all binaries hosted on our repository are verified and virus-scanned.\"},{\"question\":\"Does WinRAR Pro support 64-bit Windows systems?\",\"answer\":\"Yes, WinRAR Pro is fully optimized for 64-bit and 32-bit Windows operating systems.\"}]",
    "license": "Freeware"
  }
];
      const stmt = db.prepare(`INSERT INTO software 
        (name, category_id, short_description, full_description, version, size, icon_image, file_path, download_count, view_count, is_featured, is_new, platform, developer, publisher, license, operating_systems, architecture, system_requirements, installation_guide, features, changelog, pros, cons, tags, seo_title, seo_meta_description, seo_keywords, faq, recommended_software, screenshots)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      
      defaultApps.forEach(a => {
        stmt.run(
          a.name, a.category_id, a.short_description, a.full_description, a.version, a.size, a.icon_image, a.file_path,
          a.download_count || 0, a.view_count || 0, a.is_featured || 0, a.is_new || 0, a.platform || 'windows',
          a.developer, a.publisher, a.license, a.operating_systems, a.architecture, a.system_requirements,
          a.installation_guide, a.features, a.changelog, a.pros, a.cons, a.tags, a.seo_title, a.seo_meta_description,
          a.seo_keywords, a.faq, a.recommended_software, a.screenshots || '[]'
        );
      });
      stmt.finalize(() => console.log('Auto-seeded default software entries.'));
    }
  });
}
