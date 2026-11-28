import { describe, it, expect } from 'vitest';
import type { ArtifactToolArgs } from '@memberjunction/ai-core-plus';
import { DocumentToolLibrary } from '../artifact-tools/DocumentToolLibrary';

const SAMPLE_DOC = [
    '---',
    'title: "Q4 Operating Plan"',
    '---',
    '<!-- mj-block-id: heading-1 -->',
    '# Executive Summary',
    '',
    '<!-- mj-block-id: intro-1 -->',
    'Quarterly revenue grew steadily across enterprise accounts.',
    '',
    '<!-- mj-block-id: metrics-1 -->',
    '| Metric | Q1 | Q2 | Q3 | Q4 | Target | Delta |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    '| ARR | 10M | 12M | 14M | 17M | 16M | +6% |',
].join('\n');

describe('DocumentToolLibrary — batch, design presets, export preflight & hostile fuzzing', () => {
    const library = new DocumentToolLibrary();

    it('returns design presets, active design config, and live stats via get_design_options', async () => {
        const res = await library.InvokeTool('get_design_options', {}, SAMPLE_DOC);
        expect(res.success).toBe(true);
        const data = res.data as {
            activeDesign: { presetId: string; pageSize: string; orientation: string };
            stats: { wordCount: number; headingCount: number; estimatedPages: number };
            presets: Array<{ id: string; name: string }>;
        };
        expect(data.activeDesign.presetId).toBe('modern-clean');
        expect(data.presets.map((p) => p.id)).toContain('executive-memo');
        expect(data.presets.map((p) => p.id)).toContain('technical-spec');
        expect(data.stats.headingCount).toBe(1);
        expect(data.stats.wordCount).toBeGreaterThan(5);
        expect(data.stats.estimatedPages).toBe(1);
    });

    it('applies valid design presets via set_design_preset and rejects invalid preset IDs cleanly', async () => {
        const bad = await library.InvokeTool('set_design_preset', { presetId: 'neon-comic-sans' }, SAMPLE_DOC);
        expect(bad.success).toBe(false);
        expect(bad.errorMessage).toMatch(/Valid presets/i);

        const good = await library.InvokeTool(
            'set_design_preset',
            {
                presetId: 'executive-memo',
                pageSize: 'a4',
                orientation: 'landscape',
                watermark: 'DRAFT',
                runningHeader: 'Board Pack Q4',
                showPageNumbers: true,
            },
            SAMPLE_DOC,
        );
        expect(good.success).toBe(true);
        const data = good.data as { updatedContent: string; design: { presetId: string; watermark: string; pageSize: string } };
        expect(data.design.presetId).toBe('executive-memo');
        expect(data.design.watermark).toBe('DRAFT');
        expect(data.design.pageSize).toBe('a4');
        expect(data.updatedContent).toContain('designPreset: "executive-memo"');
        expect(data.updatedContent).toContain('title: "Q4 Operating Plan"');
    });

    it('flags broken/untrusted images, unverified frozen blocks, and wide portrait tables in export_preflight', async () => {
        const problematicDoc = [
            SAMPLE_DOC,
            '',
            '![Broken](relative/chart.png)',
            '![Empty]()',
            '',
            ':::mj-block',
            '{"BlockID":"frozen-1","Kind":"EntityView","EntityName":"Users","Mode":"Frozen","FrozenSnapshot":{"FrozenAt":"2026-01-01T00:00:00Z","Columns":[{"Name":"ID"}],"Rows":[{"ID":"1"}]}}',
            ':::',
        ].join('\n');

        const res = await library.InvokeTool('export_preflight', { strict: true, orientation: 'portrait' }, problematicDoc);
        expect(res.success).toBe(true);
        const data = res.data as {
            passed: boolean;
            strictFailed: boolean;
            errorCount: number;
            warningCount: number;
            recommendedOrientation: string;
            issues: Array<{ code: string; severity: string }>;
        };
        expect(data.passed).toBe(false);
        expect(data.strictFailed).toBe(true);
        expect(data.errorCount).toBe(2);
        expect(data.warningCount).toBeGreaterThanOrEqual(2);
        expect(data.recommendedOrientation).toBe('landscape');
        const codes = data.issues.map((i) => i.code);
        expect(codes).toContain('untrusted_or_relative_image_url');
        expect(codes).toContain('empty_image_url');
        expect(codes).toContain('unverified_frozen_snapshot');
        expect(codes).toContain('wide_table_portrait');
    });

    it('executes multi-step mutations atomically via batch and rolls back completely on failure', async () => {
        const atomicOk = await library.InvokeTool(
            'batch',
            {
                operations: [
                    { tool: 'set_design_preset', args: { presetId: 'client-proposal', watermark: 'INTERNAL' } },
                    { tool: 'replace_block', args: { blockId: 'intro-1', markdown: 'Updated enterprise summary with 31% ARR growth.' } },
                    { tool: 'insert_block_after', args: { afterBlockId: 'intro-1', markdown: '## Next Quarter Priorities', newBlockId: 'priorities-1' } },
                ],
            },
            SAMPLE_DOC,
        );
        expect(atomicOk.success).toBe(true);
        const okData = atomicOk.data as { operationsExecuted: number; succeededCount: number; failedCount: number; updatedContent: string };
        expect(okData.operationsExecuted).toBe(3);
        expect(okData.succeededCount).toBe(3);
        expect(okData.failedCount).toBe(0);
        expect(okData.updatedContent).toContain('designPreset: "client-proposal"');
        expect(okData.updatedContent).toContain('Updated enterprise summary with 31% ARR growth.');
        expect(okData.updatedContent).toContain('## Next Quarter Priorities');

        // Failure mid-batch must roll back all prior edits when keepGoing is false
        const rolledBack = await library.InvokeTool(
            'batch',
            {
                operations: [
                    { tool: 'set_design_preset', args: { presetId: 'editorial' } },
                    { tool: 'replace_block', args: { blockId: 'does-not-exist', markdown: 'Boom' } },
                ],
            },
            SAMPLE_DOC,
        );
        expect(rolledBack.success).toBe(false);
        expect((rolledBack.data as { rolledBack?: boolean }).rolledBack).toBe(true);

        // Nested batch must be rejected cleanly
        const nested = await library.InvokeTool(
            'batch',
            {
                operations: [{ tool: 'batch', args: { operations: [] } }],
            },
            SAMPLE_DOC,
        );
        expect(nested.success).toBe(false);
        expect(nested.errorMessage).toMatch(/Nested batch/i);
    });

    it('hostile_params_never_panic: handles malformed inputs across every DocumentToolLibrary tool without throwing', async () => {
        const allTools = library.GetToolList();
        expect(allTools.length).toBeGreaterThanOrEqual(25);

        const hostilePayloads: ArtifactToolArgs[] = [
            {},
            { blockId: '', markdown: '', query: '', pattern: '' },
            { blockId: 12345, start: -5, count: -999 },
            { pattern: '((((a+)+)+)+)$', use_regex: true, query: '[unterminated', useRegex: true },
            { operations: 'not-an-array', fields: ['not-an-object'] },
            { presetId: '__proto__', watermark: 999, pageSize: 'poster' },
            { expectedRevisionHash: 'stale-hash-000', headingLineNumber: 999999 },
        ];

        for (const toolDef of allTools) {
            for (const payload of hostilePayloads) {
                let threw = false;
                let result: Awaited<ReturnType<DocumentToolLibrary['InvokeTool']>> | null = null;
                try {
                    result = await library.InvokeTool(toolDef.name, payload, SAMPLE_DOC);
                } catch {
                    threw = true;
                }
                expect(threw, `Tool "${toolDef.name}" threw on hostile payload ${JSON.stringify(payload)}`).toBe(false);
                expect(result).toBeTruthy();
                expect(typeof result!.success).toBe('boolean');
            }
        }
    });
});
