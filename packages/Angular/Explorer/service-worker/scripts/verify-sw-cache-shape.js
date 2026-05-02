#!/usr/bin/env node
/**
 * Verify that every root-level .js file in the consumer's prod build matches
 * one of the filename prefixes that `ngsw-config.json` knows how to classify.
 *
 * Why this exists: Angular's `application` builder emits all bundles flat at
 * the dist root with hashed filenames. Our `ngsw-config.json` uses prefix
 * globs (`main-*.js`, `polyfills-*.js`, `chunk-*.js`, `styles-*.css`) to
 * decide which group each file belongs to (eager prefetch vs lazy). If a
 * future Angular release introduces a new prefix (`runtime-*`, `vendor-*`,
 * something nobody saw coming), the SW would silently *not* cache those
 * files — leaving offline users with a half-broken app. This gate fails the
 * build the moment that happens, forcing a conscious update to the config.
 *
 * Usage:
 *   node node_modules/@memberjunction/ng-explorer-service-worker/scripts/verify-sw-cache-shape.js \
 *        path/to/dist/<app>/browser
 *
 * Suggested wire-up: add a `postbuild` script to your app's package.json:
 *   "postbuild": "node node_modules/.../verify-sw-cache-shape.js dist/<app>/browser"
 *
 * Exits 0 on success (every root JS file matches a known prefix), 1 on
 * failure (with a diagnostic listing the unrecognized files).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const KNOWN_JS_PREFIXES = ['main-', 'polyfills-', 'chunk-', 'styles-'];
const KNOWN_CSS_PREFIXES = ['styles-'];

// SW-infrastructure files that the SW itself manages — NOT application assets.
// These live at the dist root but should never appear in any asset group.
const SW_INFRASTRUCTURE_FILES = new Set([
  'ngsw-worker.js',
  'ngsw.json',
  'safety-worker.js',
  'worker-basic.min.js',
]);

function fail(message) {
  // eslint-disable-next-line no-console
  console.error('\n[verify-sw-cache-shape] ❌ ' + message + '\n');
  process.exit(1);
}

function ok(message) {
  // eslint-disable-next-line no-console
  console.log('[verify-sw-cache-shape] ✅ ' + message);
}

const distArg = process.argv[2];
if (!distArg) {
  fail('Usage: verify-sw-cache-shape.js <path-to-browser-dist>');
}

const distDir = path.resolve(distArg);
if (!fs.existsSync(distDir) || !fs.statSync(distDir).isDirectory()) {
  fail('Directory not found: ' + distDir);
}

const entries = fs.readdirSync(distDir, { withFileTypes: true });
const rootJs = entries
  .filter((e) => e.isFile() && e.name.endsWith('.js'))
  .map((e) => e.name);
const rootCss = entries
  .filter((e) => e.isFile() && e.name.endsWith('.css'))
  .map((e) => e.name);

const unknownJs = rootJs.filter((name) => {
  if (SW_INFRASTRUCTURE_FILES.has(name)) return false;
  return !KNOWN_JS_PREFIXES.some((p) => name.startsWith(p));
});

const unknownCss = rootCss.filter(
  (name) => !KNOWN_CSS_PREFIXES.some((p) => name.startsWith(p))
);

if (unknownJs.length > 0 || unknownCss.length > 0) {
  const lines = [
    'Unrecognized root-level files in dist — these are NOT classified by',
    'ngsw-config.json and will silently bypass the service worker cache:',
    '',
  ];
  if (unknownJs.length > 0) {
    lines.push('  Unrecognized .js prefixes:');
    unknownJs.forEach((n) => lines.push('    - ' + n));
  }
  if (unknownCss.length > 0) {
    lines.push('  Unrecognized .css prefixes:');
    unknownCss.forEach((n) => lines.push('    - ' + n));
  }
  lines.push('');
  lines.push('Either:');
  lines.push('  1. Update @memberjunction/ng-explorer-service-worker/ngsw-config.json');
  lines.push('     to add an asset-group entry for the new prefix.');
  lines.push('  2. Update KNOWN_JS_PREFIXES / KNOWN_CSS_PREFIXES in this script');
  lines.push('     if the file should be intentionally excluded from caching.');
  fail(lines.join('\n'));
}

ok(
  `${rootJs.length} root .js + ${rootCss.length} root .css verified ` +
    `(${SW_INFRASTRUCTURE_FILES.size} SW infrastructure files ignored)`
);
