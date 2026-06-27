// Rewrite `"BoolCol" = 0/1` (and != / <> / and trailing space variants) to
// `"BoolCol" = FALSE/TRUE` in WHERE/UPDATE/SET clauses across all PG migration
// files. Necessary after stripping the implicit-cast pg_cast UPDATE.
//
// Excludes:
//   - INSERT VALUES tuples (handled separately by fix-pg-cast-and-booleans.mjs)
//   - CHECK (...) constraint expressions (only AT MOST 1 to handle there;
//     fix-bool-constraint-bug.mjs handles those)
//   - Comments (-- … or /* … */)
//   - Lines inside SQL string literals (e.g. stored Query SQL in INSERTs)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('Usage: fix-bool-comparisons.mjs <dir>'); process.exit(1); }

const boolColLines = readFileSync('/tmp/pg-boolean-cols.txt', 'utf-8').split('\n');
const boolColSet = new Set();
for (const l of boolColLines) {
    const m = l.trim().split('|');
    if (m.length === 2) boolColSet.add(m[1].toLowerCase());
}

const files = readdirSync(dir).filter(f => f.endsWith('.sql'));
let totalChanges = 0;

for (const file of files) {
    const path = join(dir, file);
    const original = readFileSync(path, 'utf-8');
    let s = original;
    let fileChanges = 0;

    // Only touch lines that look like WHERE / AND / OR / SET predicates
    // (i.e., not inside INSERT VALUES tuples or CHECK constraints).
    // Heuristic: process line-by-line, skip lines that contain VALUES (
    // or CHECK ( before the boolean comparison.
    const lines = s.split('\n');
    let inInsertValuesBlock = false;
    let parenDepth = 0;
    const newLines = lines.map(line => {
        const trimmed = line.trim();
        // Track if we're inside a VALUES (...) block — skip rewrites there.
        if (/\bVALUES\s*$/i.test(trimmed) || /\bVALUES\s*\(/i.test(trimmed)) {
            inInsertValuesBlock = true;
        }
        // Update paren depth for the line
        const opens = (line.match(/\(/g) || []).length;
        const closes = (line.match(/\)/g) || []).length;
        parenDepth += opens - closes;
        if (parenDepth <= 0) {
            parenDepth = 0;
            inInsertValuesBlock = false;
        }
        if (inInsertValuesBlock) return line;
        // Skip obvious CHECK constraint lines — those are handled elsewhere.
        if (/\bCHECK\s*\(/i.test(line)) return line;

        // Now rewrite "BoolCol" comparison patterns
        return line.replace(
            /"([A-Z][A-Za-z]+)"\s*([!=<>]+)\s*([01])\b/g,
            (m, col, op, val) => {
                if (!boolColSet.has(col.toLowerCase())) return m;
                // Normalize op + value
                const bool = val === '1' ? 'TRUE' : 'FALSE';
                fileChanges++;
                return `"${col}" ${op} ${bool}`;
            }
        );
    });

    s = newLines.join('\n');
    if (s !== original) {
        writeFileSync(path, s, 'utf-8');
        console.log(`${file}: ${fileChanges} comparisons rewritten`);
        totalChanges += fileChanges;
    }
}
console.log(`Total: ${totalChanges} comparisons across ${files.length} files`);
