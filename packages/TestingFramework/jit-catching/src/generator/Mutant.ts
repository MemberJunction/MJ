import { cpSync, mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join, normalize, basename, dirname } from 'node:path';
import type { MutantEdit } from '../types';
import { MutantEditSchema } from '../schemas';

const TEST_SEGMENTS = new Set(['__tests__', '__mocks__', '__fixtures__', 'test', 'tests']);

/** True when a path has a test, mock or fixture folder segment, or a basename containing `.test.` or `.spec.`. */
function IsTestPath(file: string): boolean {
    const segments = file.split('/');
    const name = segments[segments.length - 1];
    return segments.slice(0, -1).some((s) => TEST_SEGMENTS.has(s)) || name.includes('.test.') || name.includes('.spec.');
}

/** Edits may touch only non-test `.ts` files under `src/` of the package the test lives in, with paths the stored record accepts (D13). */
export function ValidateMutantEdits(packageRelDir: string, edits: MutantEdit[]): string | null {
    for (const e of edits) {
        if (e.File !== normalize(e.File) || e.File.includes('..')) return `path not allowed: ${e.File}`;
        if (!e.File.startsWith(`${packageRelDir}/src/`)) return `edit outside the package under test: ${e.File}`;
        if (IsTestPath(e.File.slice(packageRelDir.length + 1))) return `a mutant may not edit test files: ${e.File}`;
        if (!MutantEditSchema.shape.File.safeParse(e.File).success) return `a mutant may edit only .ts source files with plain path names: ${e.File}`;
        if (e.Find.length === 0) return 'Find must not be empty';
    }
    return edits.length > 0 ? null : 'no edits';
}

/**
 * Copies a package directory into a new folder under `scratchRoot`, skipping `dist`, `coverage` and `.turbo`.
 * Symlinks are copied verbatim, so their relative targets resolve once the copy is mounted at the package's own path inside the sandbox.
 */
export function CopyPackageForMutant(packageDir: string, scratchRoot: string): string {
    const dest = join(mkdtempSync(join(scratchRoot, 'mutant-')), basename(packageDir));
    cpSync(packageDir, dest, { recursive: true, verbatimSymlinks: true, filter: (src) => !/[\\/](dist|coverage|\.turbo)$/.test(src) });
    return dest;
}

/** Returns the unified diff from `a/<file>` to `b/<file>` under `cwd`, named by those paths; `git diff --no-index` exits 1 when the files differ. */
function DiffFiles(cwd: string, file: string): string {
    const r = spawnSync('git', ['diff', '--no-index', '--no-color', '--no-prefix', `a/${file}`, `b/${file}`], { cwd, encoding: 'utf8' });
    if (r.error) throw r.error;
    if (r.status === null || r.status > 1) throw new Error(`git diff failed (${r.status ?? r.signal}): ${r.stderr}`);
    return r.stdout;
}

/**
 * Applies exact-string edits in place; each Find must occur exactly once. Returns a unified diff for the record, with each file named by its repo path.
 * `packageRelDir` is the package's repo-relative folder, stripped from each edit's File to find the file under `packageDir`.
 */
export function ApplyMutantEdits(packageDir: string, edits: MutantEdit[], packageRelDir: string): { Patch: string; Changed: string[] } {
    const originals = new Map<string, { File: string; Text: string }>(); const changed: string[] = [];
    for (const e of edits) {
        const rel = e.File.slice(packageRelDir.length + 1);
        const abs = join(packageDir, rel); const text = readFileSync(abs, 'utf8');
        if (!originals.has(abs)) originals.set(abs, { File: e.File, Text: text });
        const first = text.indexOf(e.Find); if (first < 0) throw new Error(`mutant Find not found in ${e.File}`);
        if (text.indexOf(e.Find, first + 1) >= 0) throw new Error(`mutant Find must occur exactly once in ${e.File}`);
        writeFileSync(abs, text.slice(0, first) + e.Replace + text.slice(first + e.Find.length));
        if (!changed.includes(rel)) changed.push(rel);
    }
    let patch = '';
    for (const [abs, original] of originals) {
        const dir = mkdtempSync(join(tmpdir(), 'jit-orig-'));
        try {
            for (const [side, text] of [['a', original.Text], ['b', readFileSync(abs, 'utf8')]] as const) {
                const path = join(dir, side, original.File);
                mkdirSync(dirname(path), { recursive: true });
                writeFileSync(path, text);
            }
            patch += DiffFiles(dir, original.File);
        } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    return { Patch: patch, Changed: changed };
}
