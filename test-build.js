import fs from 'fs-extra';
import { join } from 'node:path';
const testDir = './test';
const dirsToMove = ['build', 'content', 'js'];
const filesToMove = ['.nvmrc', 'browser.json', 'index.js', 'package.json', 'package-lock.json', 'LICENSE', 'README.md', 'test-build.js'];

async function init() {
  await fs.emptyDir(testDir);
  // Copy dirs
  for (const d of dirsToMove) {
    await fs.copy(d, join(testDir, d));
  }
  // Copy files
  for (const f of filesToMove) {
    await fs.copy(f, join(testDir, f));
  }
}

init();
