import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { ensureFile } from 'fs-extra/esm';
import path from 'node:path';
/**@import { Database } from 'sqlite' */

sqlite3.verbose();

const databasePath = './data/follower.db';
/**@type Database */
let db = null;

/**
 * 
 * @param {Array} entries 
 * @returns {Promise}
 */
export async function addEntries(entries = []) {
  if (!entries.length) return;
  let placeholders = entries
    // Create map of placeholder slots (i.e [(?,?,?), (?,?,?)])
    .map((val) => `(${Object.keys(val).map(() => '?').join(',')})`)
    // Join them all together into one string
    .join(',');
  // Create flatmap of data arrays as params (i.e. [param1, param2, etc...])
  let data = entries.flatMap((val) => Object.values(val));
  // Build query
  return db.run(`
    INSERT INTO followerdata (url, img, username, account, bio, allText)
    VALUES ${placeholders}
  `, data);
}

/**
 * Queries the database for all followers.
 * 
 * @param {Int} offset 
 * @param {Int} size 
 * @returns {Promise<Array>} Array of matching follower entries
 */
export async function getEntries() {
  return db.all(`
    SELECT *
    FROM followerdata
    WHERE url IS NOT NULL
    ORDER BY id DESC
  `);
}
/**
 * Queries the database to get the number of records.
 * 
 * @returns {Promise<Int>} Number of entries in the database
 */
export async function getEntriesCount() {
  return db.get(`
    SELECT COUNT(id) AS count
    FROM followerdata
  `).then(d => d.count);
}

/**
 * Deletes all entries in the database.
 * 
 * @returns {Promise}
 */
export async function clearEntries() {
  return db.run(`
    DELETE FROM followerdata
  `);
}

export async function getColumnNames() {
  return db.all(`
    SELECT name FROM PRAGMA_TABLE_INFO('followerdata');
  `)
  .then(d => d.map(e => e.name))
  .catch(console.error);
}

/**
 * Sets up the database and updates it to the
 * current version.
 * 
 * @param {Database} database 
 */
async function setupDB(database) {
  db = database;
  let { user_version:version } = await db.get('PRAGMA user_version');
  switch(version) {
    case 0:
      await db.exec(`
      CREATE TABLE IF NOT EXISTS followerdata (
        id INTEGER PRIMARY KEY,
        url TEXT UNIQUE ON CONFLICT REPLACE,
        img TEXT,
        username TEXT,
        account TEXT,
        bio TEXT,
        allText TEXT
      )`)
      version = 1;
    
    default:
      await db.exec('VACUUM');
      await db.exec(`PRAGMA user_version = ${version}`);
      console.log(`Database now at: v${version}`);
  }
  return db;
}
/**
 * Creates, sets up, and connects to the database file.
 * 
 * @returns {Promise<Database>}
 */
export async function openDB() {
  await ensureFile(path.resolve(databasePath));
  return open({
    filename: path.resolve(databasePath),
    driver: sqlite3.cached.Database,
  }).then(setupDB);
}

/**
 * Closes the connection to the database.
 * 
 * @returns {Promise}
 */
export async function close() {
  return db?.close();
}
