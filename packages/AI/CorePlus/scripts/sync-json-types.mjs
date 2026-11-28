import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../../../..');
const srcDir = path.join(rootDir, 'metadata/entities/JSONType-interfaces');
const destDir = path.resolve(__dirname, '../src/JSONType-interfaces');
const distDir = path.resolve(__dirname, '../dist/JSONType-interfaces');
const tsBuildInfoPath = path.resolve(__dirname, '../dist/tsconfig.tsbuildinfo');

// Specific JSONType interfaces owned in metadata/entities/JSONType-interfaces and exposed by @memberjunction/ai-core-plus
const allowedFiles = new Set([
  'IAgentConfiguration.ts',
]);

const allowedStems = new Set([...allowedFiles].map(f => f.replace(/\.ts$/, '')));

function readTextIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

function readDirIfExists(dirPath) {
  try {
    return fs.readdirSync(dirPath);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

const srcEntries = readDirIfExists(srcDir);
if (srcEntries !== null) {
  fs.mkdirSync(destDir, { recursive: true });

  let invalidateBuildInfo = false;

  // Clean up any files in destDir that are not in allowedFiles
  const destEntries = readDirIfExists(destDir);
  if (destEntries !== null) {
    for (const f of destEntries) {
      if (!allowedFiles.has(f)) {
        fs.rmSync(path.join(destDir, f), { force: true });
        invalidateBuildInfo = true;
      }
    }
  }

  // Clean up stale interface artifacts in compiled dist directory without blowing away valid emit
  const survivingDistFiles = new Set();
  const distEntries = readDirIfExists(distDir);
  if (distEntries !== null) {
    for (const f of distEntries) {
      const stem = f.replace(/\.(d\.ts\.map|d\.ts|js\.map|js)$/, '');
      if (!allowedStems.has(stem)) {
        fs.rmSync(path.join(distDir, f), { force: true });
        invalidateBuildInfo = true;
      } else {
        survivingDistFiles.add(f);
      }
    }
  }

  let count = 0;
  for (const file of allowedFiles) {
    const srcFile = path.join(srcDir, file);
    const content = readTextIfExists(srcFile);
    if (content !== null) {
      const stem = file.replace(/\.ts$/, '');
      const destFile = path.join(destDir, file);
      const header = '/**\n * AUTO-COPIED FROM metadata/entities/JSONType-interfaces/' + file + '\n * DO NOT EDIT DIRECTLY. Run `pnpm run build` in AICorePlus to refresh.\n */\n\n';
      const nextContent = header + content;
      const existingDest = readTextIfExists(destFile);
      if (existingDest !== nextContent) {
        fs.writeFileSync(destFile, nextContent);
      }
      if (!survivingDistFiles.has(`${stem}.js`) || !survivingDistFiles.has(`${stem}.d.ts`)) {
        invalidateBuildInfo = true;
      }
      count++;
    }
  }

  if (invalidateBuildInfo) {
    fs.rmSync(tsBuildInfoPath, { force: true });
  }

  console.log(`[AICorePlus:prebuild] Synchronized ${count} JSONType interface file(s) from metadata/entities/JSONType-interfaces`);
}
