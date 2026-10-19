#!/usr/bin/env node
/**
 * Regenerates guides/BIZAPPS_GUIDE.md — the GitHub copy of the BizApps catalog —
 * from every public `bizapps-*` repository in the MemberJunction org.
 *
 *   node docs-site/scripts/bizapps-guide.mjs                 write the guide
 *   node docs-site/scripts/bizapps-guide.mjs --check         exit 1 if the guide is out of date
 *   node docs-site/scripts/bizapps-guide.mjs --source f.json render from a saved source (offline)
 *   node docs-site/scripts/bizapps-guide.mjs --save-source f.json   also save what was fetched
 *
 * Reads GITHUB_TOKEN (or GH_TOKEN); it works without one, but the anonymous API
 * limit is 60 requests an hour. Runs from any directory and needs no install:
 * it uses only Node built-ins.
 *
 * Unlike the docs-site ingest, which falls back to the committed copy, this
 * exits non-zero when it cannot read the catalog: a refresh must never commit a
 * half-empty guide. .github/workflows/bizapps-guide.yml runs it after every docs
 * deploy and weekly, and opens a pull request when the output changes.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIDE_SOURCE, buildCatalog } from './lib/bizapps-catalog.mjs';
import { renderGuideMarkdown } from './lib/bizapps-markdown.mjs';
import { loadBizAppsSource } from './lib/bizapps-source.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GUIDE_PATH = path.join(REPO_ROOT, GUIDE_SOURCE);
const IN_ACTIONS = process.env.GITHUB_ACTIONS === 'true';

main().catch((error) => {
  fail(`could not build the BizApps catalog: ${error.message}`);
  process.exit(2);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const warnings = [];
  const warn = (message) => warnings.push(message);

  const source = await loadBizAppsSource({
    file: args.source,
    token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
    warn,
  });
  if (args.saveSource) writeFileSync(args.saveSource, `${JSON.stringify(source, null, 2)}\n`);

  const catalog = buildCatalog(source, warn);
  const markdown = renderGuideMarkdown(catalog);
  for (const message of warnings) console.warn(IN_ACTIONS ? `::warning::${message}` : `WARN ${message}`);

  const current = existsSync(GUIDE_PATH) ? readFileSync(GUIDE_PATH, 'utf8') : null;
  const summary = `${catalog.apps.length} BizApps, ${catalog.featured.length} featured repos, ${warnings.length} warning(s)`;
  if (args.check) {
    if (current === markdown) {
      console.log(`${GUIDE_SOURCE} is up to date (${summary})`);
      return;
    }
    fail(`${GUIDE_SOURCE} is out of date; run: node docs-site/scripts/bizapps-guide.mjs`);
    process.exit(1);
  }
  if (current === markdown) {
    console.log(`${GUIDE_SOURCE} unchanged (${summary})`);
    return;
  }
  writeFileSync(GUIDE_PATH, markdown);
  console.log(`wrote ${GUIDE_SOURCE} (${summary})`);
}

function parseArgs(argv) {
  const args = { check: false, source: null, saveSource: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check') args.check = true;
    else if (arg === '--source') args.source = requireValue(argv, ++i, arg);
    else if (arg === '--save-source') args.saveSource = requireValue(argv, ++i, arg);
    else throw new Error(`unknown argument "${arg}" (expected --check, --source <file>, --save-source <file>)`);
  }
  return args;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a file path`);
  return value;
}

function fail(message) {
  console.error(IN_ACTIONS ? `::error::${message}` : `ERROR ${message}`);
}
