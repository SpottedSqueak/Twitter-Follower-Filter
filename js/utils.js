import fse from 'fs-extra';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { getColumnNames, getEntries } from './database.js';
import { stringify } from 'csv-stringify';
import * as cheerio from 'cheerio';
import { page, userAccount } from '../index.js';
import pkg from './pkg.cjs';
/**@import { WriteStream } from 'node:fs' */

const { version } = pkg;
const __dirname = import.meta.dirname;
const isWindows = process.platform === 'win32';
const fileOptions = {
  mode: 0o770,
};
const logPath = path.resolve(__dirname, '../data/logs');
/**@type WriteStream */
let logStream = null;
let unhookLog = null;
let unhookErr = null;
let versionHTML = '';

export function sleep(ms = 500) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getRandom(max) {
  return Math.round(Math.random() * (max - 1) + 1);
}

export async function closeLogs() {
  unhookLog();
  unhookErr();
  return logStream?.end();
}

export async function writeFollowersToCSV() {
  if (!userAccount) return console.log('Please login first!');
  const date = new Date();
  const filePath = path.join(logPath, `${date.toJSON().slice(0,10)}_${date.getHours()}-00.csv`);
  // Get all column names, set up stringifier
  const columns = await getColumnNames() || [];
  // Set up writing to file
  await new Promise(async (resolve) => {
    const followers = (await getEntries())?.map(e => Object.values(e).slice(1));
    console.log(`Writing ${followers.length} followers to file!`);
    const stringifier = stringify(followers,
      { header: true, columns: columns?.slice(1) },
      (err, output) => {
        if (err) console.error(e);
        else fse.writeFile(filePath, output);
        resolve();
      });
  });
  console.log('Write complete!');
}

async function setupLogging() {
  const lPath = logPath;
  await fse.ensureDir(lPath);
  const date = new Date();
  const logFileName = path.join(lPath, `debug-${date.toJSON().slice(0,10)}_T${date.getHours()}-00.log`);
  const logFile = await fs.open(logFileName, 'as', fileOptions.mode);
  logStream = logFile.createWriteStream({ encoding: 'utf8' });
  // Thanks to: https://gist.github.com/pguillory/729616 and https://stackoverflow.com/a/41135457
  function hook_stdout(stream, callback) {
    var old_write = stream.write;
    stream.write = (function (write) {
      return function (string, encoding, fd) {
        write.apply(stream, arguments);
        callback(string, encoding, fd);
      }
    })(stream.write);
    return () => stream.write = old_write;
  }

  async function saveToLog(string, encoding) {
    logStream.write(`[${new Date().toISOString()}] ${string}`, encoding);
    if (page?.isClosed()) return;
    await page?.evaluate((text) => {
      if (window?.addToConsole) window.addToConsole(text);
    }, `${string}`);
  }

  unhookLog = hook_stdout(process.stdout, saveToLog);
  unhookErr = hook_stdout(process.stderr, saveToLog);
  logStream.write('---\n');
  // Clean up log files
  fse.readdir(path.resolve(logPath), (_err, files) => {
    files.reverse().slice(5).forEach(val => {
      fse.remove(path.join(logPath, val));
    });
  });
}

export async function getVersion() {
  if (versionHTML) return;
  const data = { current: version };
  versionHTML = await fetch('https://github.com/SpottedSqueak/Twitter-Follower-Filter/releases')
    .catch(() => false);
  if (versionHTML) {
    const $ = cheerio.load(versionHTML);
    const latest = $('a.Link--primary').first()?.text()?.replace('v', '');
    if (latest) data.latest = latest;
    versionHTML = '';
  }
  return data;
}

/**
 * Hides the console on Windows only.
 */
export function hideConsole() {
	if (isWindows) {
    import('node-hide-console-window')
      .then((hc) => {
        hc.hideConsole();
      }).catch(console.err);
  }
}

export async function setupUtils() {
  await setupLogging();
  // Handle process exceptions
  process.on('uncaughtException', (e) => {
    console.error(e);
    process.exit(2);
  })
  .on('unhandledRejection', (e) => {
    console.error(e);
    process.exit(3);
  });
}
