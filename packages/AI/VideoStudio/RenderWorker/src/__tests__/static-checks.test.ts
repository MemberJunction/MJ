import { describe, expect, it } from 'vitest';
import type { RenderProjectBundle } from '@memberjunction/video-studio-core';
import {
    MJ_MISSING_ASSET_CODE,
    MJ_NONDETERMINISTIC_API_CODE,
    MJ_UNBOUND_LITERAL_SOURCE_CODE,
    RunStaticChecks,
} from '../index.js';

function makeBundle(overrides: Partial<RenderProjectBundle> = {}): RenderProjectBundle {
    return {
        Format: '16:9',
        EntryFile: 'index.html',
        Files: [
            {
                Path: 'index.html',
                Content: '<!doctype html><html><body><div id="root">Hello World</div></body></html>',
            },
        ],
        Assets: [],
        DataSnapshot: {},
        Seed: 1,
        ...overrides,
    };
}

describe('RunStaticChecks', () => {
    describe('MJ_MISSING_ASSET', () => {
        it('flags relative references to missing files in HTML, CSS, SVG, and JS', () => {
            const bundle = makeBundle({
                Files: [
                    {
                        Path: 'index.html',
                        Content: [
                            '<!doctype html>',
                            '<html>',
                            '<head><link rel="stylesheet" href="styles/main.css" /></head>',
                            '<body>',
                            '  <img src="assets/missing-logo.png" alt="Logo" />',
                            '  <script src="scripts/app.js"></script>',
                            '</body>',
                            '</html>',
                        ].join('\n'),
                    },
                    {
                        Path: 'styles/main.css',
                        Content: '.bg { background-image: url("../assets/missing-bg.png"); }',
                    },
                    {
                        Path: 'scripts/app.js',
                        Content: 'import { helper } from "./missing-helper.js";\nconsole.log(helper);',
                    },
                ],
            });

            const issues = RunStaticChecks(bundle);
            const missingIssues = issues.filter((i) => i.Code === MJ_MISSING_ASSET_CODE);
            expect(missingIssues.length).toBe(3);
            expect(missingIssues.every((i) => i.Category === 'MissingAsset' && i.Severity === 'Error')).toBe(true);
            expect(missingIssues.map((i) => i.File)).toEqual([
                'index.html',
                'styles/main.css',
                'scripts/app.js',
            ]);
        });

        it('passes when all relative references exist in Files or Assets', () => {
            const bundle = makeBundle({
                Files: [
                    {
                        Path: 'index.html',
                        Content: [
                            '<!doctype html>',
                            '<html>',
                            '<head><link rel="stylesheet" href="styles/main.css" /></head>',
                            '<body>',
                            '  <img src="assets/logo.png" alt="Logo" />',
                            '  <a href="#section">Jump</a>',
                            '</body>',
                            '</html>',
                        ].join('\n'),
                    },
                    {
                        Path: 'styles/main.css',
                        Content: '.hero { width: 320px; background-image: url("../assets/logo.png"); }',
                    },
                ],
                Assets: [
                    {
                        RelativePath: 'assets/logo.png',
                        MimeType: 'image/png',
                        Base64Data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
                    },
                ],
            });

            const issues = RunStaticChecks(bundle);
            expect(issues.filter((i) => i.Code === MJ_MISSING_ASSET_CODE)).toEqual([]);
        });
    });

    describe('MJ_NONDETERMINISTIC_API', () => {
        it('flags setTimeout and setInterval in inline HTML scripts while skipping patterns HyperFrames lint already reports', () => {
            const bundle = makeBundle({
                Files: [
                    {
                        Path: 'index.html',
                        Content: [
                            '<!doctype html>',
                            '<html><body>',
                            '<script>',
                            '  var a = Date.now();',
                            '  var b = new Date();',
                            '  var c = performance.now();',
                            '  requestAnimationFrame(function() {});',
                            '  setTimeout(function() {}, 100);',
                            '  setInterval(function() {}, 200);',
                            '</script>',
                            '</body></html>',
                        ].join('\n'),
                    },
                ],
            });

            const issues = RunStaticChecks(bundle);
            const nonDet = issues.filter((i) => i.Code === MJ_NONDETERMINISTIC_API_CODE);
            expect(nonDet.length).toBe(2);
            expect(nonDet.every((i) => i.Category === 'Lint' && i.Severity === 'Error')).toBe(true);
            expect(nonDet.map((i) => i.Message)).toEqual([
                expect.stringContaining('setTimeout('),
                expect.stringContaining('setInterval('),
            ]);
        });

        it('flags all six non-deterministic APIs in standalone .js files and passes deterministic scripts', () => {
            const failingBundle = makeBundle({
                Files: [
                    {
                        Path: 'index.html',
                        Content: '<!doctype html><html><body><script src="anim.js"></script></body></html>',
                    },
                    {
                        Path: 'anim.js',
                        Content: [
                            'const t1 = Date.now();',
                            'const t2 = new Date();',
                            'const t3 = performance.now();',
                            'requestAnimationFrame(() => {});',
                            'setTimeout(() => {}, 10);',
                            'setInterval(() => {}, 20);',
                        ].join('\n'),
                    },
                ],
            });

            const failingIssues = RunStaticChecks(failingBundle).filter(
                (i) => i.Code === MJ_NONDETERMINISTIC_API_CODE,
            );
            expect(failingIssues.length).toBe(6);

            const passingBundle = makeBundle({
                Files: [
                    {
                        Path: 'index.html',
                        Content: [
                            '<!doctype html>',
                            '<html><body>',
                            '<script>',
                            '  var fixedDate = new Date("2026-01-15T00:00:00Z");',
                            '  window.MJVideo.OnFrame(function(t) { console.log(t, fixedDate); });',
                            '</script>',
                            '</body></html>',
                        ].join('\n'),
                    },
                ],
            });
            expect(
                RunStaticChecks(passingBundle).filter((i) => i.Code === MJ_NONDETERMINISTIC_API_CODE),
            ).toEqual([]);
        });
    });

    describe('MJ_UNBOUND_LITERAL_SOURCE', () => {
        it('flags unbound numeric literals in HTML text nodes while ignoring CSS 320px, attributes, scripts, and data-mj-bound elements', () => {
            const bundle = makeBundle({
                Files: [
                    {
                        Path: 'index.html',
                        Content: [
                            '<!doctype html>',
                            '<html>',
                            '<head>',
                            '  <style>.card { width: 320px; height: 180px; font-size: 42px; }</style>',
                            '</head>',
                            '<body>',
                            '  <div id="root" data-duration="5" data-fps="30" data-width="1920" data-height="1080">',
                            '    <div class="card" style="padding: 24px">',
                            '      <span data-mj-bound>$99.5M bound</span>',
                            '      <p id="allowed">Revenue reached $14.2M in Q3 2026</p>',
                            '      <p id="unapproved">Growth surged 28%YoY across 412 customers</p>',
                            '    </div>',
                            '  </div>',
                            '  <script>var x = 98765;</script>',
                            '</body>',
                            '</html>',
                        ].join('\n'),
                    },
                ],
            });

            const issues = RunStaticChecks(bundle, {
                AllowedDataLiterals: ['$14.2M'],
            });
            const literalIssues = issues.filter((i) => i.Code === MJ_UNBOUND_LITERAL_SOURCE_CODE);
            expect(literalIssues.length).toBe(2);
            expect(literalIssues.every((i) => i.Category === 'DataLiteral' && i.Severity === 'Error')).toBe(
                true,
            );
            expect(literalIssues.map((i) => i.Message)).toEqual([
                expect.stringContaining('28%'),
                expect.stringContaining('412'),
            ]);
        });

        it('passes when all source text numeric literals are either bound or in AllowedDataLiterals', () => {
            const bundle = makeBundle({
                Files: [
                    {
                        Path: 'index.html',
                        Content: [
                            '<!doctype html>',
                            '<html><body>',
                            '  <div data-mj-bound><span>1,250 active seats</span></div>',
                            '  <p>ARR grew to $14.2M (+28%) in Q4 2026</p>',
                            '</body></html>',
                        ].join('\n'),
                    },
                ],
            });

            const issues = RunStaticChecks(bundle, {
                AllowedDataLiterals: ['$14.2M', '28%'],
            });
            expect(issues.filter((i) => i.Code === MJ_UNBOUND_LITERAL_SOURCE_CODE)).toEqual([]);
        });

        it('recognizes </script >, </SCRIPT>, </script foo>, and </style > closing tags, ignores </script-x>, </script!>, </style-x>, handles U+0130 (İ) and <my-el_x>/<script-x>, and does not double-unescape &amp;minus;5', () => {
            const bundle = makeBundle({
                Files: [
                    {
                        Path: 'index.html',
                        Content: [
                            '<!doctype html>',
                            '<html><head>',
                            '<title>İzmir</title>',
                            '<style>/*</style-x>*/.a { width: 100px; background: url("missing.png"); }</style >',
                            '</head><body>',
                            '<h1>İstanbul</h1>',
                            '<span data-mj-bound>999</span>',
                            '<my-el_x data-mj-bound>42</my-el_x>',
                            '<script-x>var a = 5;</script>',
                            '<script>/*</script-x></script!>*/var hidden1 = 999; setTimeout(function() {}, 0);</script >',
                            '<script>var hidden2 = 888;</SCRIPT>',
                            '<script>var hidden3 = 777;</script foo>',
                            '<p>&amp;lt;tag&amp;gt; and &amp;minus;5</p>',
                            '</body></html>',
                        ].join('\n'),
                    },
                ],
            });

            const issues = RunStaticChecks(bundle, {
                AllowedDataLiterals: ['5'],
            });
            // CSS missing.png inside <style>...</style > and setTimeout inside <script>...</script > are detected,
            // while numbers inside scripts/bound elements and &amp;minus;5 (allowed '5', not double-unescaped to '−5') pass.
            expect(issues.some((i) => i.Code === MJ_MISSING_ASSET_CODE)).toBe(true);
            expect(issues.some((i) => i.Code === MJ_NONDETERMINISTIC_API_CODE)).toBe(true);
            expect(issues.filter((i) => i.Code === MJ_UNBOUND_LITERAL_SOURCE_CODE)).toEqual([]);
        });

        it('completes in under 200 ms on 50,000 repeated <!--, x + 50,000 ! + x in IsAllowedNumericLiteral, and 50,000 repeated a/* in JS', async () => {
            const { IsAllowedNumericLiteral } = await import('../checks/static-checks.js');

            const commentAttackBundle = makeBundle({
                Files: [{ Path: 'index.html', Content: '<!--'.repeat(50_000) }],
            });
            const t0 = performance.now();
            expect(RunStaticChecks(commentAttackBundle)).toEqual([]);
            expect(performance.now() - t0).toBeLessThan(200);

            const bangToken = 'x' + '!'.repeat(50_000) + 'x';
            const allowed = new Set(['42']);
            const t1 = performance.now();
            expect(IsAllowedNumericLiteral(bangToken, allowed)).toBe(false);
            expect(performance.now() - t1).toBeLessThan(200);

            const jsAttackBundle = makeBundle({
                Files: [
                    { Path: 'index.html', Content: '<!doctype html><html><body></body></html>' },
                    { Path: 'anim.js', Content: 'a/*'.repeat(50_000) },
                ],
            });
            const t2 = performance.now();
            expect(RunStaticChecks(jsAttackBundle)).toEqual([]);
            expect(performance.now() - t2).toBeLessThan(200);
        });
    });
});
