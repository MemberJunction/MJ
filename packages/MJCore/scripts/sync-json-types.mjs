import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../../..');
const srcDir = path.join(rootDir, 'metadata/entities/JSONType-interfaces');
const destDir = path.resolve(__dirname, '../src/generic/JSONType-interfaces');

// Specific JSONType interfaces needed for EntityInfo / EntityFieldInfo / EntityRelationshipInfo metadata models
const allowedFiles = new Set([
  'IEntityConfiguration.ts',
  'IEntityFieldConfiguration.ts',
  'IEntityRelationshipConfiguration.ts'
]);

if (fs.existsSync(srcDir)) {
  fs.mkdirSync(destDir, { recursive: true });

  // Clean up any files in destDir that are not in allowedFiles
  if (fs.existsSync(destDir)) {
    const existing = fs.readdirSync(destDir);
    for (const f of existing) {
      if (!allowedFiles.has(f)) {
        fs.rmSync(path.join(destDir, f), { force: true });
      }
    }
  }

  // Also clean up compiled dist directory to prevent stale interface artifacts
  const distDir = path.resolve(__dirname, '../dist/generic/JSONType-interfaces');
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }

  let count = 0;
  for (const file of allowedFiles) {
    const srcFile = path.join(srcDir, file);
    if (fs.existsSync(srcFile)) {
      const destFile = path.join(destDir, file);
      const content = fs.readFileSync(srcFile, 'utf8');
      const header = '/**\n * AUTO-COPIED FROM metadata/entities/JSONType-interfaces/' + file + '\n * DO NOT EDIT DIRECTLY. Run `pnpm run build` in MJCore to refresh.\n */\n\n';
      fs.writeFileSync(destFile, header + content);
      count++;
    }
  }
  console.log(`[MJCore:prebuild] Synchronized ${count} JSONType interface files for EntityInfo/EntityFieldInfo/EntityRelationshipInfo`);
}
