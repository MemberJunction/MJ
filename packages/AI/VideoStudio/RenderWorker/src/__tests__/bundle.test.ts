import * as fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { RenderProjectBundle } from '@memberjunction/video-studio-core';
import {
    FAKE_ONE_BY_ONE_PNG,
    MAX_BUNDLE_ENTRIES,
    RenderWorkerError,
    StageRenderBundle,
    ValidateBundleRelativePath,
    ValidateRenderBundle,
    ValidateRenderGeometry,
} from '../index.js';

function createValidBundle(overrides: Partial<RenderProjectBundle> = {}): RenderProjectBundle {
    return {
        Format: '16:9',
        EntryFile: 'index.html',
        Files: [
            {
                Path: 'index.html',
                Content: '<!doctype html><html><body><div data-composition-id="main" data-duration="2" data-fps="30" data-width="1920" data-height="1080"></div></body></html>',
            },
        ],
        Assets: [
            {
                Key: 'logo',
                RelativePath: 'assets/logo.png',
                MimeType: 'image/png',
                DataBase64: FAKE_ONE_BY_ONE_PNG.toString('base64'),
            },
        ],
        DataSnapshot: { Title: 'Quarterly Update' },
        Seed: 42,
        ...overrides,
    };
}

describe('bundle validation and staging', () => {
    it.each([
        '../etc/passwd',
        'a/../../b',
        '/etc/passwd',
        'C:\\foo',
        'a\\b',
        'a//b',
        './a',
        'a/./b',
        'a\x00b',
        'a\nb',
        '',
        '   ',
    ])('rejects forbidden path vector: %j', (badPath) => {
        expect(() => ValidateBundleRelativePath(badPath, 'TestPath')).toThrow(RenderWorkerError);
        try {
            ValidateBundleRelativePath(badPath, 'TestPath');
        } catch (err) {
            expect((err as RenderWorkerError).Code).toBe('InvalidBundle');
        }
    });

    it('rejects case-insensitive duplicate file paths (Index.html vs index.html)', () => {
        const bundle = createValidBundle({
            Files: [
                { Path: 'index.html', Content: '<!doctype html><html></html>' },
                { Path: 'Index.html', Content: '<!doctype html><html></html>' },
            ],
        });
        expect(() => ValidateRenderBundle(bundle)).toThrow(RenderWorkerError);
    });

    it('rejects file and asset path collisions', () => {
        const bundle = createValidBundle({
            Files: [
                { Path: 'index.html', Content: '<!doctype html><html></html>' },
                { Path: 'assets/logo.png', Content: 'text' },
            ],
        });
        expect(() => ValidateRenderBundle(bundle)).toThrow(/Duplicate bundle path/);
    });

    it('rejects missing entry file or non-.html entry file', () => {
        const missingEntry = createValidBundle({ EntryFile: 'missing.html' });
        expect(() => ValidateRenderBundle(missingEntry)).toThrow(/not found in Bundle\.Files/);

        const nonHtmlEntry = createValidBundle({
            EntryFile: 'main.js',
            Files: [{ Path: 'main.js', Content: 'console.log(1);' }],
        });
        expect(() => ValidateRenderBundle(nonHtmlEntry)).toThrow(/must be an \.html file/);
    });

    it('rejects malformed base64 asset data', () => {
        const badAssetBundle = createValidBundle({
            Assets: [
                {
                    Key: 'bad',
                    RelativePath: 'assets/bad.bin',
                    MimeType: 'application/octet-stream',
                    DataBase64: '!!!not-valid-base64***',
                },
            ],
        });
        expect(() => ValidateRenderBundle(badAssetBundle)).toThrow(/invalid base64/i);
    });

    it('rejects bundles exceeding the 2000 entry cap', () => {
        const files = [
            { Path: 'index.html', Content: '<!doctype html><html></html>' },
            ...Array.from({ length: MAX_BUNDLE_ENTRIES }, (_, i) => ({
                Path: `part-${i}.js`,
                Content: '',
            })),
        ];
        const hugeBundle = createValidBundle({ Files: files, Assets: [] });
        expect(() => ValidateRenderBundle(hugeBundle)).toThrow(/exceeds maximum allowed/);
    });

    it('validates geometry, aspect ratio, fps, and duration bounds', () => {
        expect(() =>
            ValidateRenderGeometry({
                Format: '16:9',
                Width: 1920,
                Height: 1080,
                Fps: 30,
                DurationSeconds: 10,
            }),
        ).not.toThrow();

        expect(() =>
            ValidateRenderGeometry({
                Format: '9:16',
                Width: 1080,
                Height: 1920,
                Fps: 60,
                DurationSeconds: 600,
            }),
        ).not.toThrow();

        expect(() =>
            ValidateRenderGeometry({
                Format: '1:1',
                Width: 1080,
                Height: 1080,
                Fps: 24,
                DurationSeconds: 1,
            }),
        ).not.toThrow();

        // Dimension out of range
        expect(() =>
            ValidateRenderGeometry({ Format: '16:9', Width: 8, Height: 8 }),
        ).toThrow(/Width must be an integer/);
        expect(() =>
            ValidateRenderGeometry({ Format: '16:9', Width: 5000, Height: 2812 }),
        ).toThrow(/Width must be an integer/);

        // Aspect ratio mismatch (> 1%)
        expect(() =>
            ValidateRenderGeometry({ Format: '16:9', Width: 1080, Height: 1920 }),
        ).toThrow(/do not match format 16:9 aspect ratio/);

        // Fps out of bounds (1..60)
        expect(() =>
            ValidateRenderGeometry({ Format: '16:9', Width: 1920, Height: 1080, Fps: 0 }),
        ).toThrow(/Fps must be in/);
        expect(() =>
            ValidateRenderGeometry({ Format: '16:9', Width: 1920, Height: 1080, Fps: 120 }),
        ).toThrow(/Fps must be in/);

        // Duration out of bounds (> 0, <= 600)
        expect(() =>
            ValidateRenderGeometry({ Format: '16:9', Width: 1920, Height: 1080, DurationSeconds: 0 }),
        ).toThrow(/DurationSeconds must be/);
        expect(() =>
            ValidateRenderGeometry({ Format: '16:9', Width: 1920, Height: 1080, DurationSeconds: 601 }),
        ).toThrow(/DurationSeconds must be/);
    });

    it('stages files and assets to disk and Cleanup() removes temp dir idempotently', async () => {
        const bundle = createValidBundle();
        const staged = await StageRenderBundle(bundle);

        const entryHtml = await fs.readFile(staged.EntryPath, 'utf8');
        expect(entryHtml).toContain('Content-Security-Policy');
        expect(entryHtml).toContain('MJVideo');

        await staged.Cleanup();
        await expect(fs.stat(staged.RootDir)).rejects.toThrow();
        // Second Cleanup() call is idempotent
        await expect(staged.Cleanup()).resolves.toBeUndefined();
    });
});
