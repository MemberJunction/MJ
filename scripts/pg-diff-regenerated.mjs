// Compare each regenerated .pg.sql against a snapshot.
// Reports per-file: identical / differ (with byte and line counts).
//
// Usage: node scripts/pg-diff-regenerated.mjs <snapshot-dir> [regen-dir]
//   <snapshot-dir>  required — directory containing the original .pg.sql files
//   [regen-dir]     optional — directory containing the regenerated .pg.sql files
//                              defaults to ./migrations-pg/v5
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [, , snapArg, regenArg] = process.argv;

if (!snapArg) {
    console.error('Usage: node scripts/pg-diff-regenerated.mjs <snapshot-dir> [regen-dir]');
    process.exit(1);
}

const SNAP = snapArg;
const REGEN = regenArg ?? './migrations-pg/v5';

const snapFiles = new Set(readdirSync(SNAP).filter(f => f.endsWith('.pg.sql')));
const regenFiles = new Set(readdirSync(REGEN).filter(f => f.endsWith('.pg.sql')));

const onlyInSnap = [...snapFiles].filter(f => !regenFiles.has(f));
const onlyInRegen = [...regenFiles].filter(f => !snapFiles.has(f));
const inBoth = [...snapFiles].filter(f => regenFiles.has(f));

console.log(`Snapshot:    ${SNAP}`);
console.log(`Regenerated: ${REGEN}`);
console.log('');
console.log(`Files only in snapshot (converter MISSED these): ${onlyInSnap.length}`);
for (const f of onlyInSnap) console.log(`  - ${f}`);

console.log(`\nFiles only in regenerated (converter ADDED): ${onlyInRegen.length}`);
for (const f of onlyInRegen) console.log(`  + ${f}`);

console.log(`\nFiles in both: ${inBoth.length}`);

const identical = [];
const differ = [];
for (const f of inBoth) {
    const s = readFileSync(join(SNAP, f), 'utf8');
    const r = readFileSync(join(REGEN, f), 'utf8');
    if (s === r) {
        identical.push(f);
    } else {
        const sl = s.split('\n').length;
        const rl = r.split('\n').length;
        const sb = statSync(join(SNAP, f)).size;
        const rb = statSync(join(REGEN, f)).size;
        differ.push({ name: f, snapLines: sl, regenLines: rl, snapBytes: sb, regenBytes: rb });
    }
}

console.log(`\nIdentical: ${identical.length}`);
console.log(`Differ: ${differ.length}`);

if (differ.length > 0) {
    console.log(`\n--- Per-file diff stats ---`);
    differ.sort((a, b) => Math.abs(b.regenBytes - b.snapBytes) - Math.abs(a.regenBytes - a.snapBytes));
    for (const d of differ) {
        const pct = ((d.regenBytes - d.snapBytes) / d.snapBytes * 100).toFixed(1);
        console.log(`  ${d.name.slice(0, 70).padEnd(72)} snap ${d.snapBytes} → regen ${d.regenBytes} bytes (${pct}%), lines ${d.snapLines} → ${d.regenLines}`);
    }
}
