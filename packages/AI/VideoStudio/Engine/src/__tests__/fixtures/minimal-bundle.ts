import type {
    RenderProjectBundle,
    RenderRequest,
} from '@memberjunction/video-studio-core';

export const MINIMAL_BUNDLE_WIDTH = 640;
export const MINIMAL_BUNDLE_HEIGHT = 360;
export const MINIMAL_BUNDLE_FPS = 15;
export const MINIMAL_BUNDLE_DURATION_SECONDS = 1;
export const HANG_BUNDLE_DURATION_SECONDS = 60;
export const HANG_BUNDLE_FPS = 30;
export const HANG_BUNDLE_WIDTH = 1280;
export const HANG_BUNDLE_HEIGHT = 720;

function buildCompositionHtml(options: {
    compositionId: string;
    width: number;
    height: number;
    fps: number;
    durationSeconds: number;
    fakeHang?: boolean;
    extraBodyHtml?: string;
}): string {
    const hangAttr = options.fakeHang ? ' data-fake-hang="true"' : '';
    const extraBody = options.extraBodyHtml ? `\n      ${options.extraBodyHtml}` : '';
    return [
        '<!doctype html>',
        '<html>',
        '<head>',
        '  <meta charset="utf-8" />',
        '  <style>',
        '    * { box-sizing: border-box; margin: 0; padding: 0; }',
        `    body, #root { width: ${options.width}px; height: ${options.height}px; background: #0f172a; color: #f8fafc; font-family: "MJ Sans", sans-serif; display: flex; align-items: center; justify-content: center; }`,
        '    #card { padding: 24px 36px; border-radius: 12px; background: #1e293b; border: 3px solid #38bdf8; text-align: center; }',
        '    #headline { font-size: 32px; font-weight: 400; color: #f8fafc; }',
        '    #sub { font-size: 20px; color: #e2e8f0; margin-top: 8px; }',
        '  </style>',
        '</head>',
        '<body>',
        `  <div id="root" data-composition-id="${options.compositionId}" data-duration="${options.durationSeconds}" data-fps="${options.fps}" data-width="${options.width}" data-height="${options.height}"${hangAttr}>`,
        '    <div id="card">',
        '      <h1 id="headline">Quarterly Overview</h1>',
        '      <p id="sub">All systems operational</p>',
        `    </div>${extraBody}`,
        '  </div>',
        '  <script>',
        '    (function() {',
        '      var card = document.getElementById("card");',
        '      var headline = document.getElementById("headline");',
        '      if (window.MJVideo && window.MJVideo.Data && window.MJVideo.Data.Title && headline) {',
        '        headline.textContent = String(window.MJVideo.Data.Title);',
        '      }',
        '      function renderAt(t) {',
        '        if (!card) return;',
        '        var progress = Math.min(1, Math.max(0, t));',
        '        var hue = Math.round(200 + progress * 90);',
        '        card.style.background = "hsl(" + hue + ", 65%, 24%)";',
        '      }',
        '      if (window.MJVideo && typeof window.MJVideo.OnFrame === "function") {',
        '        window.MJVideo.OnFrame(renderAt);',
        '      }',
        '      renderAt(0);',
        '    })();',
        '  </script>',
        '</body>',
        '</html>',
    ].join('\n');
}

/**
 * Returns a clean minimal `RenderProjectBundle` that passes `RunLintGate`, `RunStaticChecks`,
 * HyperFrames CLI audit, and DOM rules with zero errors.
 */
export function CreateMinimalBundle(): RenderProjectBundle {
    return {
        Format: '16:9',
        EntryFile: 'index.html',
        Files: [
            {
                Path: 'index.html',
                Content: buildCompositionHtml({
                    compositionId: 'minimal-clean',
                    width: MINIMAL_BUNDLE_WIDTH,
                    height: MINIMAL_BUNDLE_HEIGHT,
                    fps: MINIMAL_BUNDLE_FPS,
                    durationSeconds: MINIMAL_BUNDLE_DURATION_SECONDS,
                }),
            },
        ],
        Assets: [],
        DataSnapshot: { Title: 'Quarterly Overview' },
        Seed: 42,
    };
}

/**
 * Returns a `RenderRequest` for the clean minimal composition bundle.
 */
export function CreateMinimalRenderRequest(): RenderRequest {
    return {
        Bundle: CreateMinimalBundle(),
        Width: MINIMAL_BUNDLE_WIDTH,
        Height: MINIMAL_BUNDLE_HEIGHT,
        Fps: MINIMAL_BUNDLE_FPS,
        DurationSeconds: MINIMAL_BUNDLE_DURATION_SECONDS,
    };
}

/**
 * Returns a 60-second composition `RenderRequest` marked with `data-fake-hang="true"` for
 * cancellation testing on both fake and real workers.
 */
export function CreateHangRenderRequest(): RenderRequest {
    const bundle: RenderProjectBundle = {
        Format: '16:9',
        EntryFile: 'index.html',
        Files: [
            {
                Path: 'index.html',
                Content: buildCompositionHtml({
                    compositionId: 'minimal-hang',
                    width: HANG_BUNDLE_WIDTH,
                    height: HANG_BUNDLE_HEIGHT,
                    fps: HANG_BUNDLE_FPS,
                    durationSeconds: HANG_BUNDLE_DURATION_SECONDS,
                    fakeHang: true,
                }),
            },
        ],
        Assets: [],
        DataSnapshot: { Title: 'Long Running Render' },
        Seed: 99,
    };
    return {
        Bundle: bundle,
        Width: HANG_BUNDLE_WIDTH,
        Height: HANG_BUNDLE_HEIGHT,
        Fps: HANG_BUNDLE_FPS,
        DurationSeconds: HANG_BUNDLE_DURATION_SECONDS,
    };
}

/**
 * Returns a `RenderProjectBundle` containing `<img src="https://example.com/x.png">` that must be
 * blocked by `Check` and `Render` with a `RemoteUrl` issue (`LintBlocked`).
 */
export function CreateRemoteUrlBundle(): RenderProjectBundle {
    return {
        Format: '16:9',
        EntryFile: 'index.html',
        Files: [
            {
                Path: 'index.html',
                Content: buildCompositionHtml({
                    compositionId: 'minimal-remote-url',
                    width: MINIMAL_BUNDLE_WIDTH,
                    height: MINIMAL_BUNDLE_HEIGHT,
                    fps: MINIMAL_BUNDLE_FPS,
                    durationSeconds: MINIMAL_BUNDLE_DURATION_SECONDS,
                    extraBodyHtml: '<img src="https://example.com/x.png" alt="Remote" />',
                }),
            },
        ],
        Assets: [],
        DataSnapshot: { Title: 'Blocked Composition' },
        Seed: 42,
    };
}
