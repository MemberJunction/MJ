import { cpSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, normalize, basename } from 'node:path';
import type { MutantEdit } from '../types';

/** Edits may touch only non-test `src/` files of the package the test lives in (D13). */
export function ValidateMutantEdits(packageRelDir: string, edits: MutantEdit[]): string | null {
    for (const e of edits) {
        if (e.File !== normalize(e.File) || e.File.includes('..')) return `path not allowed: ${e.File}`;
        if (!e.File.startsWith(`${packageRelDir}/src/`)) return `edit outside the package under test: ${e.File}`;
        if (/__tests__\/|\.test\.ts$|\.spec\.ts$/.test(e.File)) return `a mutant may not edit test files: ${e.File}`;
        if (e.Find.length === 0) return 'Find must not be empty';
    }
    return edits.length > 0 ? null : 'no edits';
}

/** Copies a package directory (symlinks kept as links, so pnpm's node_modules still resolves). */
export function CopyPackageForMutant(packageDir: string, scratchRoot: string): string {
    const dest = join(mkdtempSync(join(scratchRoot, 'mutant-')), basename(packageDir));
    cpSync(packageDir, dest, { recursive: true, verbatimSymlinks: true, filter: (src) => !/[\\/](dist|coverage|\.turbo)$/.test(src) });
    return dest;
}

/** Returns the unified diff from `before` to `after`; `git diff --no-index` exits 1 when the files differ. */
function DiffFiles(before: string, after: string): string {
    const r = spawnSync('git', ['diff', '--no-index', '--no-color', before, after], { encoding: 'utf8' });
    if (r.error) throw r.error;
    if (r.status === null || r.status > 1) throw new Error(`git diff failed (${r.status ?? r.signal}): ${r.stderr}`);
    return r.stdout;
}

/**
 * Applies exact-string edits in place; each Find must occur exactly once. Returns a unified diff for the record.
 * `packageRelDir` is the package's repo-relative folder, stripped from each edit's File to find the file under `packageDir`.
 */
export function ApplyMutantEdits(packageDir: string, edits: MutantEdit[], packageRelDir: string): { Patch: string; Changed: string[] } {
    const originals = new Map<string, string>(); const changed: string[] = [];
    for (const e of edits) {
        const rel = e.File.slice(packageRelDir.length + 1);
        const abs = join(packageDir, rel); const text = readFileSync(abs, 'utf8');
        if (!originals.has(abs)) originals.set(abs, text);
        const first = text.indexOf(e.Find); if (first < 0) throw new Error(`mutant Find not found in ${e.File}`);
        if (text.indexOf(e.Find, first + 1) >= 0) throw new Error(`mutant Find must occur exactly once in ${e.File}`);
        writeFileSync(abs, text.slice(0, first) + e.Replace + text.slice(first + e.Find.length));
        if (!changed.includes(rel)) changed.push(rel);
    }
    let patch = '';
    for (const [abs, original] of originals) {
        const tmp = `${abs}.orig`; writeFileSync(tmp, original);
        try { patch += DiffFiles(tmp, abs); } finally { rmSync(tmp, { force: true }); }
    }
    return { Patch: patch, Changed: changed };
}
