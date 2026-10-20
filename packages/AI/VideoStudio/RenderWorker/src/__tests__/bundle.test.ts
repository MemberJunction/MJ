import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RenderProjectBundle } from '@memberjunction/video-studio-core';
import {
    FAKE_ONE_BY_ONE_PNG,
    MAX_BUNDLE_ENTRIES,
    RenderWorkerError,
    StageRenderBundle,
    ValidateBundleRelativePath,
    ValidateCompositionGeometryMatch,
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
        'C:foo',
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

    it('rejects invalid Format and non-integer Seed with InvalidBundle', () => {
        const badFormat = createValidBundle({ Format: '4:3' as unknown as RenderProjectBundle['Format'] });
        expect(() => ValidateRenderBundle(badFormat)).toThrow(/Bundle\.Format/);

        const floatSeed = createValidBundle({ Seed: 1.5 });
        expect(() => ValidateRenderBundle(floatSeed)).toThrow(/Bundle\.Seed/);

        const nanSeed = createValidBundle({ Seed: Number.NaN });
        expect(() => ValidateRenderBundle(nanSeed)).toThrow(/Bundle\.Seed/);
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

    it('rejects missing entry file or non-.html/.htm entry file', () => {
        const missingEntry = createValidBundle({ EntryFile: 'missing.html' });
        expect(() => ValidateRenderBundle(missingEntry)).toThrow(/not found in Bundle\.Files/);

        const nonHtmlEntry = createValidBundle({
            EntryFile: 'main.js',
            Files: [{ Path: 'main.js', Content: 'console.log(1);' }],
        });
        expect(() => ValidateRenderBundle(nonHtmlEntry)).toThrow(/must be an \.html or \.htm file/);
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

    it('rejects request geometry that mismatches composition data-* attributes with GEOMETRY_MISMATCH', () => {
        const bundle = createValidBundle();
        expect(() =>
            ValidateCompositionGeometryMatch(bundle, { Width: 1920, Height: 1080, DurationSeconds: 2.02 }),
        ).not.toThrow();

        for (const bad of [
            { Width: 1280, Height: 720, DurationSeconds: 2 },
            { Width: 1920, Height: 1080, DurationSeconds: 3 },
        ]) {
            try {
                ValidateCompositionGeometryMatch(bundle, bad);
                expect.fail('Expected GEOMETRY_MISMATCH');
            } catch (err) {
                expect((err as RenderWorkerError).Code).toBe('GEOMETRY_MISMATCH');
            }
        }
    });

    it('stages .html and .htm files with CSP + preamble on line 1 (preserving line numbers) and Cleanup() removes temp dir idempotently', async () => {
        const bundle = createValidBundle({
            EntryFile: 'index.htm',
            Files: [
                {
                    Path: 'index.htm',
                    Content: '<!doctype html>\n<html>\n<body>\n<div id="target">Hello</div>\n</body>\n</html>',
                },
                {
                    Path: 'sub/card.html',
                    Content: '<!doctype html>\n<html><body>Card</body></html>',
                },
            ],
            DataSnapshot: { Bad: '</script><script>alert(1)</script>' },
        });
        const staged = await StageRenderBundle(bundle);

        const entryHtml = await fs.readFile(staged.EntryPath, 'utf8');
        expect(entryHtml).toContain('Content-Security-Policy');
        expect(entryHtml).toContain('MJVideo');
        expect(entryHtml).not.toContain('</script><script>alert(1)');
        // Line 4 of the original file must still be line 4 after single-line preamble injection
        const lines = entryHtml.split('\n');
        expect(lines[3]).toBe('<div id="target">Hello</div>');

        const cardHtml = await fs.readFile(path.join(staged.RootDir, 'sub/card.html'), 'utf8');
        expect(cardHtml).toContain('Content-Security-Policy');

        await staged.Cleanup();
        await expect(fs.stat(staged.RootDir)).rejects.toThrow();
        // Second Cleanup() call is idempotent
        await expect(staged.Cleanup()).resolves.toBeUndefined();
    });

    it('EnsureIndexHtmlForServer overwrites an existing index.html when EntryFile is main.html', async () => {
        const bundle = createValidBundle({
            EntryFile: 'main.html',
            Files: [
                {
                    Path: 'main.html',
                    Content: '<!doctype html><html><body><div id="from-main">Main Entry</div></body></html>',
                },
                {
                    Path: 'index.html',
                    Content: '<!doctype html><html><body><div id="from-decoy">Decoy Index</div></body></html>',
                },
            ],
        });
        const staged = await StageRenderBundle(bundle, { InjectPreamble: false });
        try {
            const { EnsureIndexHtmlForServer } = await import('../index.js');
            await EnsureIndexHtmlForServer(staged.RootDir, 'main.html');
            const [mainContent, indexContent] = await Promise.all([
                fs.readFile(path.join(staged.RootDir, 'main.html'), 'utf8'),
                fs.readFile(path.join(staged.RootDir, 'index.html'), 'utf8'),
            ]);
            expect(indexContent).toBe(mainContent);
            expect(indexContent).toContain('from-main');
        } finally {
            await staged.Cleanup();
        }
    });

    it('scans composition opening tags in linear time (< 200 ms) on 50,000 ! characters without closing >', async () => {
        const { ResolveCompositionDuration, ResolveCompositionFps } = await import('../bundle.js');
        const attackHtml = `<div data-composition-id=${'!'.repeat(50_000)}x`;
        const bundle = createValidBundle({
            Files: [{ Path: 'index.html', Content: attackHtml }],
        });

        const start = performance.now();
        ValidateCompositionGeometryMatch(bundle, { Width: 1920, Height: 1080, DurationSeconds: 2 });
        expect(ResolveCompositionFps(bundle, 30)).toBe(30);
        expect(ResolveCompositionDuration(bundle, 5)).toBe(5);
        const elapsedMs = performance.now() - start;

        expect(elapsedMs).toBeLessThan(200);
    });
});
