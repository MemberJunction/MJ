/**
 * @fileoverview Finding the packages and source files a check should look at.
 *
 * Shared rather than per-check, because "which files count" is a decision every standard has to get
 * right and getting it wrong is silent in both directions: miss a directory and the gate reports
 * green over code it never read; include one and it reports violations nobody can fix. The two
 * classic traps are `dist/` (the same code twice, once compiled) and committed generated output.
 *
 * The skip set is a parameter, not a constant, because the right answer genuinely differs per
 * check — see each check's own set and the reasoning next to it.
 *
 * @module @memberjunction/standards
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Directories a walk descends into, expressed as the ones it refuses to. */
export interface WalkOptions {
    /** Directory *names* (not paths) never descended into, at any depth. */
    SkipDirs: ReadonlySet<string>;
}

/** Options for collecting a package's source files. */
export interface SourceFileOptions extends WalkOptions {
    /** File extensions that count as source, e.g. `['.ts', '.tsx']`. */
    Extensions: readonly string[];
    /** Return `true` to drop an otherwise-matching file. Receives the absolute path. */
    Exclude?: (file: string) => boolean;
}

/**
 * Every directory under `root` that holds a `package.json`, including `root` itself.
 *
 * Nested packages are all returned — MJ nests them up to five deep (`packages/AI/Vectors/
 * Providers/*`), so a walk that stopped at the first manifest it found would miss most of the repo.
 */
export function FindPackageDirs(root: string, options: WalkOptions): string[] {
    const found: string[] = [];
    const walk = (dir: string): void => {
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        if (entries.some((e) => e.isFile() && e.name === 'package.json')) found.push(dir);
        for (const entry of entries) {
            if (!entry.isDirectory() || options.SkipDirs.has(entry.name)) continue;
            walk(join(dir, entry.name));
        }
    };
    walk(root);
    return found;
}

/** Every source file under `packageDir` matching `Extensions` and surviving `Exclude`. */
export function FindSourceFiles(packageDir: string, options: SourceFileOptions): string[] {
    const found: string[] = [];
    const walk = (dir: string): void => {
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!options.SkipDirs.has(entry.name)) walk(full);
            } else if (options.Extensions.some((ext) => entry.name.endsWith(ext)) && !options.Exclude?.(full)) {
                found.push(full);
            }
        }
    };
    walk(packageDir);
    return found;
}
