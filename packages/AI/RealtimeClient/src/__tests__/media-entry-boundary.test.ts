/**
 * The `/media` entry point must stay free of provider drivers, so a consumer such as the LiveKit room can
 * import capture, pacing and the video source arbiter without bundling `@google/genai`.
 *
 * The test walks every module reachable from `src/media/index.ts`, type-only imports included, and checks
 * each import against an allowlist: files under `src/media/`, `src/audio/audioMeter.ts`, and the packages in
 * {@link MEDIA_BOUNDARY}. Letting `/media` import a new package is a deliberate one-line change here.
 */
import { describe, expect, it } from 'vitest';
import { PlantedViolations, ReadFromDisk, ReadManifest, WalkEntry, type EntryBoundary } from './helpers/entry-boundary';

/** What `/media` may reach. Anything else (`@google/genai`, Angular, `livekit-client`, `node:*`) is refused. */
const MEDIA_BOUNDARY: EntryBoundary = {
    Entry: 'media/index.ts',
    Name: '/media',
    IsAllowedFile: (file) => file.startsWith('media/') || file === 'audio/audioMeter.ts',
    AllowedPackages: new Set(['@memberjunction/ai', '@memberjunction/global', 'rxjs']),
};

describe('the /media entry point', () => {
    it('reaches only allowed files and packages', () => {
        const walk = WalkEntry(MEDIA_BOUNDARY, ReadFromDisk);

        expect(walk.Violations).toEqual([]);
        // A walk that silently stopped early would also report nothing, so check it reached the media modules.
        expect(walk.Reached).toEqual(
            expect.arrayContaining([
                'media/index.ts',
                'media/frameCapture.ts',
                'media/channelVideoSource.ts',
                'media/videoPacing.ts',
                'media/videoSourceArbiter.ts',
                'media/videoFrameDecoderRegistry.ts',
                'media/decoders/mseFmp4Decoder.ts',
                'media/decoders/webCodecsChunkDecoder.ts',
                'media/decoders/imageFrameDecoder.ts',
                'media/decoders/streamCanvas.ts',
                'audio/audioMeter.ts',
            ])
        );
    });

    describe('catches a planted forbidden import', () => {
        const violationsFor = (entrySource: string, otherFiles: Record<string, string> = {}): string[] => PlantedViolations(MEDIA_BOUNDARY, entrySource, otherFiles);

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
        const manifest = ReadManifest();

        expect(manifest.exports?.['.']).toEqual({ types: './dist/index.d.ts', default: './dist/index.js' });
        expect(manifest.exports?.['./media']).toEqual({ types: './dist/media/index.d.ts', default: './dist/media/index.js' });
        expect(manifest.typesVersions?.['*']?.['media']).toEqual(['dist/media/index.d.ts']);
    });
});
