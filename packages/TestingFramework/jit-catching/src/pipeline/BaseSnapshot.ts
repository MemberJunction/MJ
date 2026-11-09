import { copyFileSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import type { RunDir } from './RunDir';

/** Files copied from each package folder next to its `src/`. */
const PACKAGE_FILES = ['tsconfig.json', 'package.json'];
/** Folder under `src/` that holds the generated tests; never copied. */
const JIT_DIR = join('__tests__', 'jit');

/**
 * Copies each package's `src/` (without `src/__tests__/jit`), `tsconfig.json` and `package.json` from `baseRoot`
 * to the same relative paths under `dest`, after emptying `dest`, plus every tsconfig file the package tsconfig
 * `extends` inside `baseRoot`. Copies regular files only and never goes through a symlink; a package folder that is
 * missing or reached through a symlink is skipped with a stderr line.
 * Returns the copied file count.
 */
export function SnapshotBaseSources(baseRoot: string, packageDirs: string[], dest: string): number {
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    let count = 0;
    for (const pkg of packageDirs) {
        if (!isPlainRelative(pkg) || !isRealDirPath(baseRoot, pkg)) { warn(`skipped package folder ${JSON.stringify(pkg)}: not a plain folder in the base worktree`); continue; }
        for (const f of PACKAGE_FILES) count += copyIfRegular(join(baseRoot, pkg, f), join(dest, pkg, f));
        count += copyExtendsChain(baseRoot, join(pkg, 'tsconfig.json'), dest, new Set());
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

/** Writes one base source snapshot line to stderr. */
function warn(message: string): void { process.stderr.write(`base source snapshot: ${message}\n`); }

/**
 * Copies the configs that the tsconfig at `configRel` (relative to `baseRoot`) `extends`, and theirs in turn, to the
 * same relative paths under `dest`. Follows relative `extends` only (a bare package name ends the chain); a config
 * outside `baseRoot`, reached through a symlink or not a regular file is skipped with a stderr line.
 * Returns the copied file count.
 */
function copyExtendsChain(baseRoot: string, configRel: string, dest: string, seen: Set<string>): number {
    if (seen.has(configRel) || !isRegularInside(baseRoot, configRel)) return 0;
    seen.add(configRel);
    let count = 0;
    for (const ext of extendsOf(join(baseRoot, configRel))) {
        if (!ext.startsWith('.') && !ext.startsWith('/')) continue;
        const rel = parentConfigRel(baseRoot, configRel, ext);
        if (rel === null) { warn(`skipped ${JSON.stringify(ext)} extended by ${configRel}: not a regular file inside the base worktree`); continue; }
        if (!seen.has(rel)) count += copyIfRegular(join(baseRoot, rel), join(dest, rel));
        count += copyExtendsChain(baseRoot, rel, dest, seen);
    }
    return count;
}

/** The `extends` entries of a tsconfig file, as a list (empty when it has none or cannot be read). */
function extendsOf(configPath: string): string[] {
    const ext: unknown = ts.readConfigFile(configPath, ts.sys.readFile).config?.extends;
    if (typeof ext === 'string') return [ext];
    return Array.isArray(ext) ? ext.filter((e): e is string => typeof e === 'string') : [];
}

/** `ext` resolved from the folder of `configRel` (adding `.json` when TypeScript would), relative to `baseRoot`; null when it is not a regular file inside `baseRoot`. */
function parentConfigRel(baseRoot: string, configRel: string, ext: string): string | null {
    const abs = resolve(baseRoot, dirname(configRel), ext);
    for (const candidate of ext.endsWith('.json') ? [abs] : [abs, `${abs}.json`]) {
        const rel = relative(baseRoot, candidate);
        if (isRegularInside(baseRoot, rel)) return rel;
    }
    return null;
}

/** True when `rel` is a plain relative path under `root` whose folders are real folders and which is a regular file. */
function isRegularInside(root: string, rel: string): boolean {
    if (!isPlainRelative(rel)) return false;
    const parent = dirname(rel);
    if (parent !== '.' && !isRealDirPath(root, parent)) return false;
    try { return lstatSync(join(root, rel)).isFile(); } catch { return false; }
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
