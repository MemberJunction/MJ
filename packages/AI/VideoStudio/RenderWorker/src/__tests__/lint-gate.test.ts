import * as path from 'node:path';
import { lintProject } from '@hyperframes/lint';
import { describe, expect, it } from 'vitest';
import type { CheckIssue, RenderProjectBundle } from '@memberjunction/video-studio-core';
import {
    FakeRenderBackend,
    MJ_NETWORK_API_CODE,
    MJ_NON_BUNDLE_URL_CODE,
    RunLintGate,
    SortCheckIssues,
    StageRenderBundle,
} from '../index.js';

function makeBundleWithEntryContent(
    entryContent: string,
    extraFiles: Array<{ Path: string; Content: string }> = [],
): RenderProjectBundle {
    return {
        Format: '16:9',
        EntryFile: 'index.html',
        Files: [{ Path: 'index.html', Content: entryContent }, ...extraFiles],
        Assets: [],
        DataSnapshot: {},
        Seed: 1,
    };
}

describe('lint-gate static and HyperFrames lint checks', () => {
    it('passes a clean self-contained bundle with data:, blob:, #frag, and valid relative paths', async () => {
        const html = [
            '<!doctype html>',
            '<html>',
            '<head>',
            '  <link rel="stylesheet" href="styles/app.css" />',
            '</head>',
            '<body>',
            '  <div id="root" data-composition-id="main" data-duration="2" data-fps="30" data-width="1920" data-height="1080" data-no-timeline>',
            '    <a href="#section-1">Jump</a>',
            '    <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" />',
            '    <img src="blob:null/1234" />',
            '    <img src="assets/local.png" />',
            '  </div>',
            '  <script src="scripts/app.js"></script>',
            '</body>',
            '</html>',
        ].join('\n');

        const bundle = makeBundleWithEntryContent(html, [
            { Path: 'styles/app.css', Content: '.box { background: url("../assets/local.png"); }' },
            { Path: 'scripts/app.js', Content: 'const label = "Revenue Growth";' },
        ]);

        const staged = await StageRenderBundle(bundle, { InjectPreamble: false });
        try {
            const backend = new FakeRenderBackend();
            const result = await RunLintGate(bundle, staged.RootDir, backend);
            expect(result.Passed).toBe(true);
            expect(result.BlockRender).toBe(false);
            expect(result.Issues).toEqual([]);
        } finally {
            await staged.Cleanup();
        }
    });

    it.each([
        ['HTML img https', '<img src="https://evil.example.com/a.png" />'],
        ['HTML script protocol-relative', '<script src="//cdn.example.com/gsap.js"></script>'],
        ['HTML link javascript:', '<a href="javascript:alert(1)">x</a>'],
        ['HTML srcset remote', '<img srcset="local.png 1x, https://evil.example.com/2x.png 2x" />'],
        ['HTML inline style url()', '<div style="background-image: url(https://evil.example.com/bg.png)"></div>'],
        ['Inline CSS @import', '<style>@import "https://evil.example.com/theme.css";</style>'],
        ['Inline CSS url()', '<style>.hero { background: url(http://evil.example.com/a.jpg); }</style>'],
        ['Inline JS import from https', '<script>import x from "https://evil.example.com/mod.js";</script>'],
        ['Inline JS dynamic import', '<script>import("https://evil.example.com/dyn.js");</script>'],
        ['Inline JS string literal URL', '<script>const u = "https://evil.example.com/api";</script>'],
        ['Relative path escaping bundle root', '<img src="../../outside.png" />'],
    ])('catches MJ_NON_BUNDLE_URL vector (%s) with BlockRender: true', async (_label, snippet) => {
        const bundle = makeBundleWithEntryContent(`<!doctype html><html><body>${snippet}</body></html>`);
        const staged = await StageRenderBundle(bundle, { InjectPreamble: false });
        try {
            const result = await RunLintGate(bundle, staged.RootDir, new FakeRenderBackend());
            expect(result.BlockRender).toBe(true);
            expect(result.Passed).toBe(false);
            expect(result.Issues.some((i) => i.Code === MJ_NON_BUNDLE_URL_CODE)).toBe(true);
        } finally {
            await staged.Cleanup();
        }
    });

    it.each([
        ['fetch()', '<script>fetch("/api");</script>'],
        ['XMLHttpRequest', '<script>const x = new XMLHttpRequest();</script>'],
        ['WebSocket', '<script>const ws = new WebSocket("ws://localhost");</script>'],
        ['EventSource', '<script>const es = new EventSource("/events");</script>'],
        ['navigator.sendBeacon', '<script>navigator.sendBeacon("/log", "x");</script>'],
        ['RTCPeerConnection', '<script>new RTCPeerConnection();</script>'],
        ['importScripts', '<script>importScripts("worker.js");</script>'],
        ['navigator.serviceWorker', '<script>navigator.serviceWorker.register("sw.js");</script>'],
        ['window.open', '<script>window.open("about:blank");</script>'],
        ['location.href =', '<script>window.location.href = "/other";</script>'],
        ['meta refresh', '<meta http-equiv="refresh" content="0;url=index.html">'],
        ['base tag', '<base href="https://evil.example.com/">'],
        ['link rel=preconnect', '<link rel="preconnect" href="assets">'],
    ])('catches MJ_NETWORK_API vector (%s) with BlockRender: true', async (_label, snippet) => {
        const bundle = makeBundleWithEntryContent(`<!doctype html><html><head>${snippet}</head><body></body></html>`);
        const staged = await StageRenderBundle(bundle, { InjectPreamble: false });
        try {
            const result = await RunLintGate(bundle, staged.RootDir, new FakeRenderBackend());
            expect(result.BlockRender).toBe(true);
            expect(result.Passed).toBe(false);
            expect(result.Issues.some((i) => i.Code === MJ_NETWORK_API_CODE)).toBe(true);
        } finally {
            await staged.Cleanup();
        }
    });

    it('merges backend.Lint issues and sorts deterministically by (Category, File, Line, Code)', async () => {
        const unsorted: CheckIssue[] = [
            { Code: 'B_CODE', Category: 'RemoteUrl', Severity: 'Error', Message: 'b', File: 'b.html', Line: 10 },
            { Code: 'A_CODE', Category: 'Lint', Severity: 'Warning', Message: 'a', File: 'b.html', Line: 2 },
            { Code: 'A_CODE', Category: 'Lint', Severity: 'Error', Message: 'a2', File: 'a.html', Line: 5 },
            { Code: 'A_CODE', Category: 'Lint', Severity: 'Error', Message: 'a1', File: 'a.html', Line: 1 },
        ];
        const sorted = SortCheckIssues(unsorted);
        expect(sorted.map((i) => `${i.Category}:${i.File}:${i.Line}:${i.Code}`)).toEqual([
            'Lint:a.html:1:A_CODE',
            'Lint:a.html:5:A_CODE',
            'Lint:b.html:2:A_CODE',
            'RemoteUrl:b.html:10:B_CODE',
        ]);
    });

    it('runs @hyperframes/lint contract test on a real staged composition without launching a browser', async () => {
        const validHtml = [
            '<!doctype html>',
            '<html>',
            '<body>',
            '  <div id="root" data-composition-id="main" data-duration="2" data-fps="30" data-width="1920" data-height="1080" data-no-timeline>',
            '    <h1>Hello</h1>',
            '  </div>',
            '</body>',
            '</html>',
        ].join('\n');
        const bundle = makeBundleWithEntryContent(validHtml);
        const staged = await StageRenderBundle(bundle, { InjectPreamble: false });
        try {
            const report = await lintProject(staged.RootDir, path.join(staged.RootDir, 'index.html'), {
                host: 'cli',
            });
            expect(report.totalErrors).toBe(0);
        } finally {
            await staged.Cleanup();
        }
    });
});
