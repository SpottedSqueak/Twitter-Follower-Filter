import fs from 'fs-extra';
import path from 'node:path';
import { getColumnNames, getEntries } from './database.js';
import { stringify } from 'csv-stringify';
/**@import { WriteStream } from 'node:fs' */

const __dirname = import.meta.dirname;
const fileOptions = {
  mode: 0o770,
};
const logPath = path.resolve(__dirname, '../data/logs');
/**@type WriteStream */
let logStream = null;
let unhookLog = null;
let unhookErr = null;

export async function closeLogs() {
  unhookLog();
  unhookErr();
  return logStream?.end();
}

export async function writeFollowersToCSV() {
  const date = new Date();
  const filePath = path.resolve(logPath, `${date.toJSON().slice(0,10)}_${date.getHours()}-00.csv`);
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
        else fs.writeFile(filePath, output);
        resolve();
      });
  });
  console.log('Write complete!');
}

export async function setupUtils() {
  const lPath = path.resolve(logPath);
  await fs.ensureDir(lPath);
  const date = new Date();
  const logFileName = path.join(lPath, `debug-${date.toJSON().slice(0,10)}_${date.getHours()}-00.log`);
  logStream = await fs.createWriteStream(logFileName, { encoding: 'utf8', flags: 'as', ...fileOptions });
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
    await logStream.write(`[${new Date().toISOString()}] ${string}`, encoding);
  }
  unhookLog = hook_stdout(process.stdout, saveToLog);
  unhookErr = hook_stdout(process.stderr, saveToLog);
  await logStream.write('---\n');
  // Clean up log files
  fs.readdir(path.resolve(logPath), (_err, files) => {
    files.reverse().slice(5).forEach(val => {
      fs.remove(path.join(logPath, val));
    });
  });
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
