import { copyFileSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import type { RunDir } from './RunDir';

/** Files copied from each package folder next to its `src/`. */
const PACKAGE_FILES = ['tsconfig.json', 'package.json'];
/** Folder under `src/` that holds the generated tests; never copied. */
const JIT_DIR = join('__tests__', 'jit');

/**
 * Copies each package's `src/` (without `src/__tests__/jit`), `tsconfig.json` and `package.json` from `baseRoot`
 * to the same relative paths under `dest`, after emptying `dest`. Copies regular files only and never goes
 * through a symlink; a package folder that is missing or reached through a symlink is skipped.
 * Returns the copied file count.
 */
export function SnapshotBaseSources(baseRoot: string, packageDirs: string[], dest: string): number {
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    let count = 0;
    for (const pkg of packageDirs) {
        if (!isPlainRelative(pkg) || !isRealDirPath(baseRoot, pkg)) continue;
        for (const f of PACKAGE_FILES) count += copyIfRegular(join(baseRoot, pkg, f), join(dest, pkg, f));
        if (isRealDirPath(baseRoot, join(pkg, 'src'))) count += copyTree(join(baseRoot, pkg, 'src'), join(dest, pkg, 'src'), '');
    }
    return count;
}

/**
 * The base source snapshot path recorded in `generation.json`, after checking that it is the run's own
 * `<run dir>/base-src` folder (same real path, an existing folder). Throws a one-line error otherwise.
 */
export function CheckedBaseSourceDir(dir: RunDir, recorded: string): string {
    const expected = join(dir.Path, 'base-src');
    const real = (p: string): string | null => { try { return statSync(p).isDirectory() ? realpathSync.native(p) : null; } catch { return null; } };
    const want = real(expected); const got = real(recorded);
    if (want === null) throw new Error(`run ${dir.RunID} has no base source snapshot at ${expected}`);
    if (got !== want) throw new Error(`run ${dir.RunID}: recorded base source snapshot ${JSON.stringify(recorded)} is not ${expected}`);
    return recorded;
}

/** True when `rel` is a relative path with no `..` or empty segment. */
function isPlainRelative(rel: string): boolean {
    return rel.length > 0 && !isAbsolute(rel) && rel.split(/[\\/]/).every((s) => s !== '' && s !== '.' && s !== '..');
}

/** True when every segment of `rel` under `root` is a real folder, not a symlink. */
function isRealDirPath(root: string, rel: string): boolean {
    let p = root;
    for (const seg of rel.split(/[\\/]/)) {
        p = join(p, seg);
        try { if (!lstatSync(p).isDirectory()) return false; } catch { return false; }
    }
    return true;
}

/** Copies `from` to `to` when `from` is a regular file (not a symlink). Returns 1 when copied, else 0. */
function copyIfRegular(from: string, to: string): number {
    try { if (!lstatSync(from).isFile()) return 0; } catch { return 0; }
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    return 1;
}

/** Copies the regular files under `from` to `to`, skipping symlinks and the jit test folder. `rel` is the path below `src/`. */
function copyTree(from: string, to: string, rel: string): number {
    if (rel === JIT_DIR) return 0;
    mkdirSync(to, { recursive: true });
    let count = 0;
    for (const e of readdirSync(from, { withFileTypes: true })) {
        if (e.isSymbolicLink()) continue;
        const childRel = rel === '' ? e.name : join(rel, e.name);
        if (e.isDirectory()) count += copyTree(join(from, e.name), join(to, e.name), childRel);
        else if (e.isFile()) { copyFileSync(join(from, e.name), join(to, e.name)); count++; }
    }
    return count;
}
