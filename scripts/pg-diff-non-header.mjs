// Classify regenerated-vs-snapshot diffs as cosmetic (header-only) or substantive.
// The current converter prepends a 22-line header (extension setup, schema creation,
// pg_cast int->bool, etc.) to every output file. This script strips that header
// before comparing, so the result counts only meaningful structural differences.
//
// Usage: node scripts/pg-diff-non-header.mjs <snapshot-dir> [regen-dir]
//   <snapshot-dir>  required — directory containing the original .pg.sql files
//   [regen-dir]     optional — directory containing the regenerated .pg.sql files
//                              defaults to ./migrations-pg/v5
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [, , snapArg, regenArg] = process.argv;

if (!snapArg) {
    console.error('Usage: node scripts/pg-diff-non-header.mjs <snapshot-dir> [regen-dir]');
    process.exit(1);
}

const SNAP = snapArg;
const REGEN = regenArg ?? './migrations-pg/v5';

const HEADER_LINES = 22; // Standard header added to every regenerated file
const HEADER_BYTES_APPROX = 934; // Approximate byte-cost of the header for delta math

const snapFiles = readdirSync(SNAP).filter(f => f.endsWith('.pg.sql'));
const significantDiffs = [];
const headerOnlyDiffs = [];

for (const f of snapFiles) {
    const snapPath = join(SNAP, f);
    const regenPath = join(REGEN, f);
    let regenExists = true;
    try { statSync(regenPath); } catch { regenExists = false; }
    if (!regenExists) continue;

    const snap = readFileSync(snapPath, 'utf8');
    const regen = readFileSync(regenPath, 'utf8');
    if (snap === regen) continue;

    const regenLines = regen.split('\n');
    const regenStripped = regenLines.slice(HEADER_LINES + 1).join('\n');

    if (snap === regenStripped) {
        headerOnlyDiffs.push(f);
    } else {
        const regenStripped2 = regenLines.slice(HEADER_LINES).join('\n');
        if (snap === regenStripped2) {
            headerOnlyDiffs.push(f);
        } else {
            significantDiffs.push(f);
        }
    }
}

console.log(`Snapshot:    ${SNAP}`);
console.log(`Regenerated: ${REGEN}`);
console.log('');
console.log(`Header-only diffs (cosmetic): ${headerOnlyDiffs.length}`);
console.log(`Significant diffs (substantive): ${significantDiffs.length}`);
console.log('');
console.log('Files with significant diffs:');
for (const f of significantDiffs) {
    const snapBytes = statSync(join(SNAP, f)).size;
    const regenBytes = statSync(join(REGEN, f)).size;
    const delta = regenBytes - snapBytes - HEADER_BYTES_APPROX;
    console.log(`  ${f.padEnd(82)} delta beyond header: ${delta > 0 ? '+' : ''}${delta} bytes`);
}
