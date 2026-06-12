#!/usr/bin/env node
/**
 * enumerate-queries.mjs
 *
 * Programmatically scans the saved SpectaQL HTML for Path LMS's GraphQL
 * query operations and emits their names as a JSON array to stdout.
 *
 * This script's stdout IS the TaxonomyLeaves for the source-audit return.
 * NEVER hand-type the query names — run this script and use its output.
 *
 * Cross-check signals (both must agree with the emitted count):
 *   1. class="operation operation-query" section count (structural)
 *   2. href="#query-*" nav-link count (navigation)
 *
 * Usage:
 *   node scripts/enumerate-queries.mjs [--html <path>] [--exclude-infra]
 *
 * Flags:
 *   --html <path>     Path to the SpectaQL HTML file
 *                     (default: sources/schema.spectaql.html relative to this script)
 *   --exclude-infra   Exclude infrastructure/non-report queries (root, account, teams)
 *                     to produce the COVERABLE leaf set only
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse CLI args
const args = process.argv.slice(2);
let htmlPath = resolve(__dirname, '../sources/schema.spectaql.html');
let excludeInfra = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--html' && args[i + 1]) htmlPath = resolve(args[++i]);
  if (args[i] === '--exclude-infra') excludeInfra = true;
}

const html = readFileSync(htmlPath, 'utf8');

// Signal 1: Extract query names from section id="query-<name>" attributes
//   pattern: class="operation operation-query" sections with their ids
const operationSectionIds = [];
const sectionPattern = /<section\s+id="(query-[^"]+)"\s+class="operation operation-query"/g;
let match;
while ((match = sectionPattern.exec(html)) !== null) {
  operationSectionIds.push(match[1].replace(/^query-/, ''));
}

// Signal 2: Extract query names from nav href="#query-*" links
const navLinkIds = new Set();
const navPattern = /href="#(query-[^"]+)"/g;
while ((match = navPattern.exec(html)) !== null) {
  navLinkIds.add(match[1].replace(/^query-/, ''));
}

// Signal 3: class="operation operation-query" count
const structuralCount = (html.match(/class="operation operation-query"/g) || []).length;

// Cross-check
const sectionCount = operationSectionIds.length;
const navCount = navLinkIds.size;

const crossCheckPassed = (sectionCount === structuralCount) && (sectionCount === navCount);

// Infrastructure queries (non-report, non-coverable):
//   - root: returns String (health/ping endpoint, not a report)
//   - account: top-level container returning an Account object (not itself a report row)
//   - teams: top-level container returning [Team]! objects (not itself a report row — sub-fields are reports)
//
// The COVERABLE leaves for TaxonomyLeaves are:
//   All queries EXCLUDING infrastructure stubs.
//   The account.* sub-report fields and teams.* sub-report fields ARE the covered objects
//   but are accessed via the account/teams top-level queries, so account and teams ARE
//   coverable (they are the entry points for many report types).
//   Only 'root' is purely infrastructure (returns String, no data fields).
const INFRA_QUERIES = new Set(['root']);

// Full set (all 17 operations)
const allQueries = operationSectionIds.slice().sort();

// Coverable set (excludes pure infra)
const coverableQueries = allQueries.filter(q => !INFRA_QUERIES.has(q));

const outputSet = excludeInfra ? coverableQueries : allQueries;

// Emit structured result
const result = {
  enumerated: outputSet,
  count: outputSet.length,
  crossCheck: {
    sectionCount,
    navLinkCount: navCount,
    structuralClassCount: structuralCount,
    passed: crossCheckPassed,
    message: crossCheckPassed
      ? `All three signals agree: ${structuralCount} query operations`
      : `MISMATCH: sections=${sectionCount}, navLinks=${navCount}, structuralClass=${structuralCount} — parse defect, investigate before handing off`
  },
  infraExcluded: excludeInfra ? [...INFRA_QUERIES] : [],
  allQueries,
  coverableQueries,
  htmlPath
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
