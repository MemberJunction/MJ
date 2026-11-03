import { describe, expect, it } from 'vitest';
import { WithChartKit, type RenderProjectBundle } from '@memberjunction/video-studio-core';
import { HyperFramesRenderBackend } from '../hyperframes-backend.js';
import {
    FakeRenderBackend,
    RunLintGate,
    RunStaticChecks,
    ScanAuthoredFilesForLintIssues,
    StageRenderBundle,
} from '../index.js';

function makeChartKitCompositionBundle(): RenderProjectBundle {
    const html = [
        '<!doctype html>',
        '<html>',
        '<head>',
        '  <meta charset="utf-8" />',
        '</head>',
        '<body>',
        '  <div id="root" data-composition-id="main" data-duration="3" data-fps="30" data-width="1920" data-height="1080">',
        '    <div id="mount"></div>',
        '  </div>',
        '  <script src="mj/chart-kit.js"></script>',
        '  <script>',
        '    const mount = document.getElementById("mount");',
        '    window.MJVideo.OnFrame((TimeSeconds) => {',
        '      const data = window.MJVideo.Data || {};',
        '      mount.innerHTML = window.MJChartKit.KpiTile({',
        '        Frame: { Width: 600, Height: 300, StartSeconds: 0, DurationSeconds: 1.2 },',
        '        Value: Number(data.Revenue || 0),',
        '        Label: "Revenue",',
        '        BindingKey: "revenue",',
        '        Format: { Kind: "Currency", Currency: "USD", Decimals: 1 },',
        '      }, TimeSeconds);',
        '    });',
        '  </script>',
        '</body>',
        '</html>',
    ].join('\n');

    const baseBundle: RenderProjectBundle = {
        Format: '16:9',
        EntryFile: 'index.html',
        Files: [{ Path: 'index.html', Content: html }],
        Assets: [],
        DataSnapshot: { Revenue: 14_200_000 },
        Seed: 42,
    };

    return WithChartKit(baseBundle);
}

describe('WithChartKit bundle lint-gate and static checks (VS-DAT-2)', () => {
    it('passes ScanAuthoredFilesForLintIssues and RunStaticChecks with zero issues', () => {
        const bundle = makeChartKitCompositionBundle();
        expect(ScanAuthoredFilesForLintIssues(bundle)).toEqual([]);
        expect(RunStaticChecks(bundle)).toEqual([]);
    });

    it('passes RunLintGate (including @hyperframes/lint) with zero issues', async () => {
        const bundle = makeChartKitCompositionBundle();
        const staged = await StageRenderBundle(bundle);
        try {
            const fakeResult = await RunLintGate(bundle, staged.RootDir, new FakeRenderBackend());
            expect(fakeResult.Passed).toBe(true);
            expect(fakeResult.BlockRender).toBe(false);
            expect(fakeResult.Issues).toEqual([]);

            const realBackend = new HyperFramesRenderBackend();
            const realResult = await RunLintGate(bundle, staged.RootDir, realBackend);
            expect(realResult.Issues).toEqual([]);
            expect(realResult.Passed).toBe(true);
            expect(realResult.BlockRender).toBe(false);
        } finally {
            await staged.Cleanup();
        }
    });
});
