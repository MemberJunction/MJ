import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../../..');
const srcDir = path.join(rootDir, 'metadata/entities/JSONType-interfaces');
const destDir = path.resolve(__dirname, '../src/generic/JSONType-interfaces');
const distDir = path.resolve(__dirname, '../dist/generic/JSONType-interfaces');
const tsBuildInfoPath = path.resolve(__dirname, '../dist/tsconfig.tsbuildinfo');

// Specific JSONType interfaces needed for EntityInfo / EntityFieldInfo / EntityRelationshipInfo metadata models
const allowedFiles = new Set([
  'IEntityConfiguration.ts',
  'IEntityFieldConfiguration.ts',
  'IEntityRelationshipConfiguration.ts',
  'IFileStorageProviderConfiguration.ts',
  'IEntitySubtypeSelectorConfig.ts',
  'IQueryConfiguration.ts'
]);

const allowedStems = new Set([...allowedFiles].map(f => f.replace(/\.ts$/, '')));

if (fs.existsSync(srcDir)) {
  fs.mkdirSync(destDir, { recursive: true });

  let invalidateBuildInfo = false;

  // Clean up any files in destDir that are not in allowedFiles
  if (fs.existsSync(destDir)) {
    const existing = fs.readdirSync(destDir);
    for (const f of existing) {
      if (!allowedFiles.has(f)) {
        fs.rmSync(path.join(destDir, f), { force: true });
        invalidateBuildInfo = true;
      }
    }
  }

  // Clean up stale interface artifacts in compiled dist directory without blowing away valid emit
  if (fs.existsSync(distDir)) {
    const existingDist = fs.readdirSync(distDir);
    for (const f of existingDist) {
      const stem = f.replace(/\.(d\.ts\.map|d\.ts|js\.map|js)$/, '');
      if (!allowedStems.has(stem)) {
        fs.rmSync(path.join(distDir, f), { force: true });
        invalidateBuildInfo = true;
      }
    }
  }

  // Self-healing check: if tsbuildinfo exists, make sure every allowed file that exists in src has its .js and .d.ts emitted in dist.
  // If anything is missing in dist, invalidate tsbuildinfo so tsc --incremental re-emits them.
  if (fs.existsSync(tsBuildInfoPath)) {
    for (const file of allowedFiles) {
      if (fs.existsSync(path.join(srcDir, file))) {
        const stem = file.replace(/\.ts$/, '');
        if (!fs.existsSync(path.join(distDir, `${stem}.js`)) || !fs.existsSync(path.join(distDir, `${stem}.d.ts`))) {
          invalidateBuildInfo = true;
          break;
        }
      }
    }
  }

  if (invalidateBuildInfo && fs.existsSync(tsBuildInfoPath)) {
    fs.rmSync(tsBuildInfoPath, { force: true });
  }

  let count = 0;
  for (const file of allowedFiles) {
    const srcFile = path.join(srcDir, file);
    if (fs.existsSync(srcFile)) {
      const destFile = path.join(destDir, file);
      const content = fs.readFileSync(srcFile, 'utf8');
      const header = '/**\n * AUTO-COPIED FROM metadata/entities/JSONType-interfaces/' + file + '\n * DO NOT EDIT DIRECTLY. Run `pnpm run build` in MJCore to refresh.\n */\n\n';
      const nextContent = header + content;
      if (!fs.existsSync(destFile) || fs.readFileSync(destFile, 'utf8') !== nextContent) {
        fs.writeFileSync(destFile, nextContent);
      }
      count++;
    }
  }
  console.log(`[MJCore:prebuild] Synchronized ${count} JSONType interface files for EntityInfo/EntityFieldInfo/EntityRelationshipInfo`);
}
