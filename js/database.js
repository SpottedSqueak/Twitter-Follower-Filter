import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { ensureFile } from 'fs-extra/esm';
import path from 'node:path';
import { userAccount } from '../index.js';
import process from 'node:process';
/**@import { Database } from 'sqlite' */

sqlite3.verbose();

const __dirname = import.meta.dirname;
const databasePath = '../data/follower.db';
/**@type Database */
let db = null;

function dbError(err) {
  console.error(err);
  process.exit(1);
}
/**
 * 
 * @param {Array} entries 
 * @returns {Promise}
 */
export async function addEntries(entries = []) {
  if (!entries.length) return;
  let keys = `${Object.keys(entries[0]).join(', ')}`;
  let placeholders = entries
    // Create map of placeholder slots (i.e [(?,?,?), (?,?,?)])
    .map((val) => `(${Object.keys(val).map(() => '?').join(',')})`)
    // Join them all together into one string
    .join(',');
  // Create flatmap of data arrays as params (i.e. [param1, param2, etc...])
  let data = entries.flatMap((val) => Object.values(val));
  // Build query
  return db.run(`
    INSERT INTO followerdata (${keys})
    VALUES ${placeholders}
  `, data).catch(dbError);
}

export async function hasEntry(url) {
  return db.get(`
    SELECT followerid
    FROM followerdata
    WHERE url = '${url}'
      AND userAccount = '${userAccount}'
  `).then((d) => !!d).catch(console.error);
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
      AND userAccount = '${userAccount}'
    ORDER BY rowid ASC
  `).catch(dbError);
}
/**
 * Queries the database to get the number of records.
 * 
 * @returns {Promise<Int>} Number of entries in the database
 */
export async function getEntriesCount() {
  return db.get(`
    SELECT COUNT(rowid) AS count
    FROM followerdata
    WHERE userAccount = '${userAccount}'
  `).then(d => d.count).catch(dbError);
}

/**
 * Delete entry for given url for current user account.
 * 
 * @param {String} url 
 * @returns {Promise<void>}
 */
export async function deleteEntry(url) {
  return db.exec(`
    DELETE FROM followerdata
    WHERE userAccount = '${userAccount}'
      AND url = '${url}'
  `).catch(dbError);
}
/**
 * Deletes all entries in the database.
 * 
 * @returns {Promise}
 */
export async function clearEntries() {
  if (!userAccount) return;
  return db.exec(`
    DELETE FROM followerdata
    WHERE userAccount = '${userAccount}'
  `).catch(dbError);
}

export async function getColumnNames() {
  return db.all(`
    SELECT name FROM PRAGMA_TABLE_INFO('followerdata');
  `)
  .then(d => d.map(e => e.name))
  .catch(dbError);
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
        followerid UNIQUE ON CONFLICT REPLACE,
        url TEXT,
        img TEXT,
        username TEXT,
        account TEXT,
        bio TEXT,
        allText TEXT
      )`)
      version = 1;
    case 1:
      await db.exec(`
        ALTER TABLE followerdata
        ADD COLUMN userAccount TEXT
      `).catch(dbError);
      version = 2;
    
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
  await ensureFile(path.resolve(__dirname, databasePath));
  return open({
    filename: path.resolve(__dirname, databasePath),
    driver: sqlite3.cached.Database,
  }).then(setupDB);
}

/**
 * Closes the connection to the database.
 * 
 * @returns {Promise}
 */
export async function close() {
  return db?.close().catch(() => {});
}
