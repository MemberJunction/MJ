// One-time fix for a pre-existing converter bug that translated `(1)` to `TRUE`
// in CHECK constraint expressions for INTEGER columns. Result: PG can't apply
// constraints like `"EffortLevel" >= TRUE AND "EffortLevel" <= (100)` because
// it can't compare INTEGER to BOOLEAN.
//
// Scope: ALTER TABLE … CHECK (…) lines containing `>=TRUE`, `<=TRUE`, `>=FALSE`,
// `<=FALSE`. Replaces with `>=1`, `<=1`, `>=0`, `<=0`.
import { readFileSync, writeFileSync } from 'node:fs';

const targets = process.argv.slice(2);
if (targets.length === 0) {
    console.error('Usage: node fix-bool-constraint-bug.mjs <file1> [file2] ...');
    process.exit(1);
}

let totalChanges = 0;
for (const path of targets) {
    let s = readFileSync(path, 'utf-8');
    const before = s;
    // Only touch ALTER TABLE … CHECK (…) blocks; never the INSERT VALUES regions.
    s = s.replace(
        /(ALTER TABLE [^\n]+CHECK \()([^\n]*?)\)([^\n]*)/g,
        (m, p1, body, rest) => {
            const fixed = body
                .replace(/(\s*[<>]=\s*)TRUE\b/g, '$11')
                .replace(/(\s*[<>]=\s*)FALSE\b/g, '$10');
            return p1 + fixed + ')' + rest;
        }
    );
    if (s !== before) {
        const matches = (before.match(/CHECK \([^)]*[<>]=\s*(?:TRUE|FALSE)/g) || []).length
                      - (s.match(/CHECK \([^)]*[<>]=\s*(?:TRUE|FALSE)/g) || []).length;
        totalChanges += matches;
        writeFileSync(path, s, 'utf-8');
        console.log(`${path}: ${matches} CHECK constraint comparisons fixed`);
    }
}
console.log(`Total: ${totalChanges} constraint expressions repaired`);
