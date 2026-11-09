/**
 * The `/testing` entry point (the video conformance kit) must load in any provider's test without a driver, the Gemini
 * SDK or a test framework, so a provider in its own package can run it and the kit runs under any test runner.
 *
 * The test walks every module reachable from `src/testing/index.ts`, type-only imports included, and checks each import
 * against an allowlist: files under `src/testing/`, `src/media/`, `src/audio/`, and `src/generic/baseRealtimeClient.ts`,
 * and the packages in {@link TESTING_BOUNDARY}. Everything else is refused: the drivers, the OpenAI protocol client, the
 * main entry, `@google/genai`, `vitest`, Angular, `livekit-client`, `node:*`.
 */
import { describe, expect, it } from 'vitest';
import { PlantedViolations, ReadFromDisk, ReadManifest, WalkEntry, type EntryBoundary } from './helpers/entry-boundary';

/** What `/testing` may reach. */
const TESTING_BOUNDARY: EntryBoundary = {
    Entry: 'testing/index.ts',
    Name: '/testing',
    IsAllowedFile: (file) =>
        file.startsWith('testing/') || file.startsWith('media/') || file.startsWith('audio/') || file === 'generic/baseRealtimeClient.ts',
    AllowedPackages: new Set(['@memberjunction/ai', '@memberjunction/global', 'rxjs']),
};

describe('the /testing entry point', () => {
    it('reaches only allowed files and packages', () => {
        const walk = WalkEntry(TESTING_BOUNDARY, ReadFromDisk);

        expect(walk.Violations).toEqual([]);
        // A walk that silently stopped early would also report nothing, so check it reached the kit's modules.
        expect(walk.Reached).toEqual(
            expect.arrayContaining([
                'testing/index.ts',
                'testing/realtimeVideoConformance.ts',
                'testing/realtimeVideoConformanceChecks.ts',
                'testing/realtimeVideoConformanceTurnChecks.ts',
                'testing/realtimeVideoConformanceFrameChecks.ts',
                'testing/conformanceVideoStream.ts',
                'media/playbackClock.ts',
                'testing/realtimeVideoConformanceSession.ts',
                'testing/recordingPlayout.ts',
                'generic/baseRealtimeClient.ts',
                'media/videoPlayout.ts',
                'audio/pcmPlayback.ts',
            ])
        );
    });

    describe('catches a planted forbidden import', () => {
        const violationsFor = (entrySource: string, otherFiles: Record<string, string> = {}): string[] => PlantedViolations(TESTING_BOUNDARY, entrySource, otherFiles);

        it('a driver', () => {
            expect(violationsFor(`import type { GeminiRealtimeClient } from '../drivers/geminiRealtimeClient';`, { 'drivers/geminiRealtimeClient.ts': '' })).toEqual([
                'testing/index.ts -> ../drivers/geminiRealtimeClient: drivers/geminiRealtimeClient.ts is outside /testing',
            ]);
        });

        it('the OpenAI protocol client, beside the allowed base class', () => {
            expect(violationsFor(`export * from '../generic/openAIProtocolClient';`, { 'generic/openAIProtocolClient.ts': '' })).toEqual([
                'testing/index.ts -> ../generic/openAIProtocolClient: generic/openAIProtocolClient.ts is outside /testing',
            ]);
        });

        it('the main entry, which brings every driver', () => {
            expect(violationsFor(`export { BaseRealtimeClient } from '../index';`, { 'index.ts': '' })).toEqual([
                'testing/index.ts -> ../index: index.ts is outside /testing',
            ]);
        });

        it('a test framework', () => {
            expect(violationsFor(`import { expect } from 'vitest';\nexport const e = expect;`)).toEqual([
                'testing/index.ts -> vitest: vitest is not an allowed package',
            ]);
        });

        it('the Gemini SDK', () => {
            expect(violationsFor(`import type { LiveServerMessage } from '@google/genai';`)).toEqual([
                'testing/index.ts -> @google/genai: @google/genai is not an allowed package',
            ]);
        });

        it('one reached through another kit file', () => {
            const files = { 'testing/helper.ts': `import { readFileSync } from 'node:fs';\nexport const r = readFileSync;` };
            expect(violationsFor(`export * from './helper';`, files)).toEqual(['testing/helper.ts -> node:fs: node:fs is not an allowed package']);
        });
    });

    it('is mapped in package.json, for both module resolvers', () => {
        const manifest = ReadManifest();

        expect(manifest.exports?.['./testing']).toEqual({ types: './dist/testing/index.d.ts', default: './dist/testing/index.js' });
        expect(manifest.typesVersions?.['*']?.['testing']).toEqual(['dist/testing/index.d.ts']);
    });
});
