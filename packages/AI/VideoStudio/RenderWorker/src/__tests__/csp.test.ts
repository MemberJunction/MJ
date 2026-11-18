import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RenderProjectBundle } from '@memberjunction/video-studio-core';
import {
    COMPOSITION_CSP,
    EscapeJsonForInlineScript,
    InjectPreambleIntoHtml,
    StageRenderBundle,
} from '../index.js';

describe('CSP and preamble injection', () => {
    it('exports the exact Decision 3 COMPOSITION_CSP string', () => {
        expect(COMPOSITION_CSP).toBe(
            [
                "default-src 'self' data: blob:",
                "script-src 'self' 'unsafe-inline'",
                "style-src 'self' 'unsafe-inline'",
                "connect-src 'none'",
                "frame-src 'none'",
                "worker-src 'none'",
                "object-src 'none'",
                "base-uri 'none'",
                "form-action 'none'",
            ].join('; '),
        );
    });

    it('injects preamble right after <!doctype ...> or at byte 0 when no doctype is present', () => {
        const opts = {
            DataSnapshot: { k: 1 },
            Seed: 7,
            Format: '16:9' as const,
            Width: 1920,
            Height: 1080,
            Fps: 30,
        };

        const withDoctype = '<!DOCTYPE html>\n<html><head></head><body></body></html>';
        const injectedWithDoctype = InjectPreambleIntoHtml(withDoctype, opts);
        expect(injectedWithDoctype.startsWith('<!DOCTYPE html><meta http-equiv="Content-Security-Policy"')).toBe(
            true,
        );

        const withoutDoctype = '<html><head></head><body></body></html>';
        const injectedWithoutDoctype = InjectPreambleIntoHtml(withoutDoctype, opts);
        expect(injectedWithoutDoctype.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true);
    });

    it('injects preamble into every .html file in a staged bundle', async () => {
        const bundle: RenderProjectBundle = {
            Format: '16:9',
            EntryFile: 'index.html',
            Files: [
                { Path: 'index.html', Content: '<!doctype html><html><body>main</body></html>' },
                { Path: 'scenes/sub.html', Content: '<html><body>sub</body></html>' },
                { Path: 'styles/main.css', Content: 'body { color: #fff; }' },
            ],
            Assets: [],
            DataSnapshot: { Headline: 'Safe' },
            Seed: 99,
        };

        const staged = await StageRenderBundle(bundle);
        try {
            const indexHtml = await fs.readFile(path.join(staged.RootDir, 'index.html'), 'utf8');
            const subHtml = await fs.readFile(path.join(staged.RootDir, 'scenes/sub.html'), 'utf8');
            const css = await fs.readFile(path.join(staged.RootDir, 'styles/main.css'), 'utf8');

            expect(indexHtml).toContain(COMPOSITION_CSP);
            expect(subHtml).toContain(COMPOSITION_CSP);
            expect(css).not.toContain(COMPOSITION_CSP);
        } finally {
            await staged.Cleanup();
        }
    });

    it('escapes </script>, <, >, U+2028, and U+2029 in DataSnapshot', () => {
        const payload = {
            Evil: '</script><script>alert(1)</script>',
            LineSep: 'before\u2028after\u2029end',
        };
        const escaped = EscapeJsonForInlineScript(payload);
        expect(escaped).not.toContain('</script>');
        expect(escaped).not.toContain('<');
        expect(escaped).not.toContain('>');
        expect(escaped).not.toContain('\u2028');
        expect(escaped).not.toContain('\u2029');
        expect(escaped).toContain('\\u003c/script\\u003e');
        expect(escaped).toContain('\\u2028');
        expect(escaped).toContain('\\u2029');
    });
});
