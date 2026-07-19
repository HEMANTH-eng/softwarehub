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
      // Automatically run migration to add platform column if it doesn't exist
      db.run("ALTER TABLE software ADD COLUMN platform TEXT DEFAULT 'windows'", (migrateErr) => {
        if (migrateErr && !migrateErr.message.includes('duplicate column name')) {
          console.error('Error migrating software table for platform column:', migrateErr);
        } else {
          console.log('Database schema platform column verified/migrated.');
        }
        seedDefaultAdminAndCategories();
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
