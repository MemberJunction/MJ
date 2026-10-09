#!/usr/bin/env node
/**
 * Builds assets/template.lite.html from the vendored archify template: drops the embedded JetBrains Mono
 * @font-face data and points the template's font stacks at MJ's (--mj-font-family, --mj-font-family-mono).
 * Re-run after every upstream sync; it fails if the template no longer has the shape it expects.
 */
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('vendor/archify/assets/template.html', root), 'utf8');

const MJ_SANS = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MJ_MONO = "'JetBrains Mono', 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace";

const fontFaces = source.match(/@font-face\s*\{[^}]*\}\s*/g) ?? [];
if (fontFaces.length === 0) throw new Error('template.html has no @font-face blocks; upstream changed how it ships fonts');

const lite = source
    .replace(/@font-face\s*\{[^}]*\}\s*/g, '')
    .replace(/font-family:\s*'JetBrains Mono', ui-monospace[^;}]*/g, () => `font-family: ${MJ_MONO}`)
    .replace(/font-family:\s*-apple-system, BlinkMacSystemFont[^;}]*/g, () => `font-family: ${MJ_SANS}`);

fs.writeFileSync(new URL('assets/template.lite.html', root), lite);
console.log(`template.lite.html: removed ${fontFaces.length} embedded fonts, ${source.length} -> ${lite.length} bytes`);
