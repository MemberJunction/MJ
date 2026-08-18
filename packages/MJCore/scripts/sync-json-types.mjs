import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../../..');
const srcDir = path.join(rootDir, 'metadata/entities/JSONType-interfaces');
const destDir = path.resolve(__dirname, '../src/generic/JSONType-interfaces');

if (fs.existsSync(srcDir)) {
  fs.mkdirSync(destDir, { recursive: true });
  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.ts'));
  let count = 0;
  for (const file of files) {
    const srcFile = path.join(srcDir, file);
    const destFile = path.join(destDir, file);
    const content = fs.readFileSync(srcFile, 'utf8');
    const header = '/**\n * AUTO-COPIED FROM metadata/entities/JSONType-interfaces/' + file + '\n * DO NOT EDIT DIRECTLY. Run `pnpm run build` in MJCore to refresh.\n */\n\n';
    fs.writeFileSync(destFile, header + content);
    count++;
  }
  console.log(`[MJCore:prebuild] Synchronized ${count} JSONType interface files from metadata/entities/JSONType-interfaces`);
}
