/**
 * Walks the import graph of one of the package's entry points and checks every import against that entry's allowlist:
 * the source files it may reach and the packages it may import. The `/media` and `/testing` boundary tests use it.
 *
 * TypeScript's own scanner lists the imports, so type-only, re-exported, side-effect and dynamic imports all count, and
 * imports inside comments or strings don't.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/** The package root (where `package.json` and `src/` are). */
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Reads a source file by its path relative to `src/`; `undefined` when there is no such file. */
export type SourceReader = (file: string) => string | undefined;

export interface BoundaryViolation {
    File: string;
    Import: string;
    Reason: string;
}

export interface EntryWalk {
    /** Every source file reached from the entry, relative to `src/`. */
    Reached: string[];
    Violations: BoundaryViolation[];
}

/** One entry point's boundary. */
export interface EntryBoundary {
    /** The entry module, relative to `src/`. */
    Entry: string;
    /** The subpath's name in messages, e.g. `/media`. */
    Name: string;
    /** Whether a source file (relative to `src/`) may be part of the entry. */
    IsAllowedFile(file: string): boolean;
    /** Packages the entry may import. */
    AllowedPackages: ReadonlySet<string>;
}

/** The package's `exports` and `typesVersions`. */
export interface PackageManifest {
    exports?: Record<string, { types: string; default: string }>;
    typesVersions?: Record<string, Record<string, string[]>>;
}

/** `@scope/pkg/sub` → `@scope/pkg`; `pkg/sub` → `pkg`. */
function packageNameOf(specifier: string): string {
    const parts = specifier.split('/');
    return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Resolves a relative import to a source file the way the build does: `<path>.ts`, then `<path>/index.ts`. */
function resolveRelative(from: string, specifier: string, read: SourceReader): string | null {
    const base = posix.normalize(posix.join(posix.dirname(from), specifier)).replace(/\.js$/, '');
    for (const candidate of [`${base}.ts`, `${base}/index.ts`]) {
        if (read(candidate) !== undefined) {
            return candidate;
        }
    }
    return null;
}

/** Classifies one import of `file`: a source file to follow, an allowed package (neither field), or a violation. */
function classifyImport(boundary: EntryBoundary, file: string, specifier: string, read: SourceReader): { Follow?: string; Violation?: BoundaryViolation } {
    if (!specifier.startsWith('.')) {
        const pkg = packageNameOf(specifier);
        return boundary.AllowedPackages.has(pkg) ? {} : { Violation: { File: file, Import: specifier, Reason: `${pkg} is not an allowed package` } };
    }
    const target = resolveRelative(file, specifier, read);
    if (!target) {
        return { Violation: { File: file, Import: specifier, Reason: 'resolves to no source file' } };
    }
    if (!boundary.IsAllowedFile(target)) {
        return { Violation: { File: file, Import: specifier, Reason: `${target} is outside ${boundary.Name}` } };
    }
    return { Follow: target };
}

/** Walks the import graph from an entry, recording every file reached and every import outside the boundary. */
export function WalkEntry(boundary: EntryBoundary, read: SourceReader): EntryWalk {
    const reached = [boundary.Entry];
    const violations: BoundaryViolation[] = [];
    for (let i = 0; i < reached.length; i++) {
        const file = reached[i];
        for (const imported of ts.preProcessFile(read(file) ?? '', true, true).importedFiles) {
            const result = classifyImport(boundary, file, imported.fileName, read);
            if (result.Violation) {
                violations.push(result.Violation);
            }
            if (result.Follow && !reached.includes(result.Follow)) {
                reached.push(result.Follow);
            }
        }
    }
    return { Reached: reached, Violations: violations };
}

/** Reads source files from the package's `src/`. */
export function ReadFromDisk(file: string): string | undefined {
    const path = resolve(PACKAGE_ROOT, 'src', file);
    return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** A reader over an in-memory source tree, for planting forbidden imports. */
export function ReadFromMemory(files: Record<string, string>): SourceReader {
    return (file) => files[file];
}

/** The package's manifest. */
export function ReadManifest(): PackageManifest {
    return JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'package.json'), 'utf8')) as PackageManifest;
}

/** The violations of an entry whose source is `entrySource`, with other files planted beside it, as `file -> import: reason`. */
export function PlantedViolations(boundary: EntryBoundary, entrySource: string, otherFiles: Record<string, string> = {}): string[] {
    const walk = WalkEntry(boundary, ReadFromMemory({ [boundary.Entry]: entrySource, ...otherFiles }));
    return walk.Violations.map((v) => `${v.File} -> ${v.Import}: ${v.Reason}`);
}
