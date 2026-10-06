/**
 * The `/media` entry point must stay free of provider drivers, so a consumer such as the LiveKit room can
 * import capture, pacing and the video source arbiter without bundling `@google/genai`.
 *
 * The test walks every module reachable from `src/media/index.ts`, type-only imports included, and checks
 * each import against an allowlist: files under `src/media/`, `src/audio/audioMeter.ts`, and the packages in
 * {@link ALLOWED_PACKAGES}. Letting `/media` import a new package is a deliberate one-line change here.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The `/media` entry module, relative to `src/`. */
const MEDIA_ENTRY = 'media/index.ts';

/** Packages `/media` may import. Anything else (`@google/genai`, Angular, `livekit-client`, `node:*`) is refused. */
const ALLOWED_PACKAGES: ReadonlySet<string> = new Set(['@memberjunction/ai', '@memberjunction/global']);

/** Reads a source file by its path relative to `src/`; `undefined` when there is no such file. */
type SourceReader = (file: string) => string | undefined;

interface BoundaryViolation {
    File: string;
    Import: string;
    Reason: string;
}

interface MediaEntryWalk {
    /** Every source file reached from the entry, relative to `src/`. */
    Reached: string[];
    Violations: BoundaryViolation[];
}

/** Whether a source file (relative to `src/`) may be part of `/media`. */
function isAllowedFile(file: string): boolean {
    return file.startsWith('media/') || file === 'audio/audioMeter.ts';
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
function classifyImport(file: string, specifier: string, read: SourceReader): { Follow?: string; Violation?: BoundaryViolation } {
    if (!specifier.startsWith('.')) {
        const pkg = packageNameOf(specifier);
        return ALLOWED_PACKAGES.has(pkg) ? {} : { Violation: { File: file, Import: specifier, Reason: `${pkg} is not an allowed package` } };
    }
    const target = resolveRelative(file, specifier, read);
    if (!target) {
        return { Violation: { File: file, Import: specifier, Reason: 'resolves to no source file' } };
    }
    if (!isAllowedFile(target)) {
        return { Violation: { File: file, Import: specifier, Reason: `${target} is outside /media` } };
    }
    return { Follow: target };
}

/**
 * Walks the import graph from the `/media` entry. TypeScript's own scanner lists the imports, so type-only,
 * re-exported, side-effect and dynamic imports all count, and imports inside comments or strings don't.
 */
function walkMediaEntry(read: SourceReader): MediaEntryWalk {
    const reached = [MEDIA_ENTRY];
    const violations: BoundaryViolation[] = [];
    for (let i = 0; i < reached.length; i++) {
        const file = reached[i];
        for (const imported of ts.preProcessFile(read(file) ?? '', true, true).importedFiles) {
            const result = classifyImport(file, imported.fileName, read);
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

function readFromDisk(file: string): string | undefined {
    const path = resolve(PACKAGE_ROOT, 'src', file);
    return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** A reader over an in-memory source tree, for planting forbidden imports. */
function readFromMemory(files: Record<string, string>): SourceReader {
    return (file) => files[file];
}

interface PackageManifest {
    exports?: Record<string, { types: string; default: string }>;
    typesVersions?: Record<string, Record<string, string[]>>;
}

describe('the /media entry point', () => {
    it('reaches only allowed files and packages', () => {
        const walk = walkMediaEntry(readFromDisk);

        expect(walk.Violations).toEqual([]);
        // A walk that silently stopped early would also report nothing, so check it reached the media modules.
        expect(walk.Reached).toEqual(
            expect.arrayContaining([
                'media/index.ts',
                'media/frameCapture.ts',
                'media/channelVideoSource.ts',
                'media/videoPacing.ts',
                'media/videoSourceArbiter.ts',
                'audio/audioMeter.ts',
            ])
        );
    });

    describe('catches a planted forbidden import', () => {
        function violationsFor(entrySource: string, otherFiles: Record<string, string> = {}): string[] {
            const walk = walkMediaEntry(readFromMemory({ [MEDIA_ENTRY]: entrySource, ...otherFiles }));
            return walk.Violations.map((v) => `${v.File} -> ${v.Import}: ${v.Reason}`);
        }

        it('a driver', () => {
            expect(violationsFor(`export * from '../drivers/geminiRealtimeClient';`, { 'drivers/geminiRealtimeClient.ts': '' })).toEqual([
                'media/index.ts -> ../drivers/geminiRealtimeClient: drivers/geminiRealtimeClient.ts is outside /media',
            ]);
        });

        it('a type-only import from generic/', () => {
            const source = `import type { BaseRealtimeClient } from '../generic/baseRealtimeClient';\nexport type Client = BaseRealtimeClient;`;
            expect(violationsFor(source, { 'generic/baseRealtimeClient.ts': '' })).toEqual([
                'media/index.ts -> ../generic/baseRealtimeClient: generic/baseRealtimeClient.ts is outside /media',
            ]);
        });

        it('a package outside the allowlist', () => {
            expect(violationsFor(`import { GoogleGenAI } from '@google/genai';\nexport const ai = GoogleGenAI;`)).toEqual([
                'media/index.ts -> @google/genai: @google/genai is not an allowed package',
            ]);
        });

        it('a dynamic import', () => {
            expect(violationsFor(`export const load = () => import('livekit-client');`)).toEqual([
                'media/index.ts -> livekit-client: livekit-client is not an allowed package',
            ]);
        });

        it('one reached through another media file', () => {
            const files = { 'media/player.ts': `import { Component } from '@angular/core';\nexport const C = Component;` };
            expect(violationsFor(`export * from './player';`, files)).toEqual([
                'media/player.ts -> @angular/core: @angular/core is not an allowed package',
            ]);
        });

        it('an import that resolves to nothing', () => {
            expect(violationsFor(`export * from './missing';`)).toEqual(['media/index.ts -> ./missing: resolves to no source file']);
        });

        it('but not an import inside a comment or a string', () => {
            expect(violationsFor(`// import { GoogleGenAI } from '@google/genai';\nexport const s = "import '@google/genai'";`)).toEqual([]);
        });
    });

    it('is mapped in package.json, for both module resolvers', () => {
        const manifest: PackageManifest = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'package.json'), 'utf8'));

        expect(manifest.exports?.['.']).toEqual({ types: './dist/index.d.ts', default: './dist/index.js' });
        expect(manifest.exports?.['./media']).toEqual({ types: './dist/media/index.d.ts', default: './dist/media/index.js' });
        expect(manifest.typesVersions?.['*']?.['media']).toEqual(['dist/media/index.d.ts']);
    });
});
