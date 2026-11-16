import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const cssPath = resolve(packageRoot, 'src/lib/styles/primitives-prototype.css');
const outPath = resolve(packageRoot, 'src/lib/styles/prototype-css.generated.ts');

const css = readFileSync(cssPath, 'utf8');
const content = `// Generated from primitives-prototype.css by scripts/generate-css-module.mjs\nexport const PROTOTYPE_CSS = ${JSON.stringify(css)};\n`;
writeFileSync(outPath, content, 'utf8');
