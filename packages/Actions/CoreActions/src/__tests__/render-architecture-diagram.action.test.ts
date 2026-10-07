/**
 * RenderArchitectureDiagramAction is a thin wrapper over @memberjunction/ai-diagrams. These tests pin the
 * wrapper's half: input is checked before any render, archify's diagnostics reach the caller verbatim, the
 * SVG and the HTML file come back the way agents and AgentRunner expect, and the browser gate is optional.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});
vi.mock('@memberjunction/actions-base', () => ({}));
vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));

const renderMock = vi.fn();
vi.mock('@memberjunction/ai-diagrams', () => ({
    ARCHITECTURE_DIAGRAM_TYPES: ['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle'],
    ArchitectureDiagramRenderer: { Instance: { Render: (...args: unknown[]) => renderMock(...args) } },
}));

const readabilityMock = vi.fn();
vi.mock('../custom/visualization/shared/diagram-readability-check', () => ({
    CheckDiagramReadability: (...args: unknown[]) => readabilityMock(...args),
}));

import { RenderArchitectureDiagramAction } from '../custom/visualization/render-architecture-diagram.action';

class TestableAction extends RenderArchitectureDiagramAction {
    public RunForTest(params: RunActionParams): Promise<ActionResultSimple> {
        return this.InternalRunAction(params);
    }
}

function paramsFor(inputs: Record<string, unknown>): RunActionParams {
    return { Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Type: 'Input', Value })) } as RunActionParams;
}

async function run(inputs: Record<string, unknown>): Promise<{ result: ActionResultSimple; outputs: ActionParam[] }> {
    const params = paramsFor(inputs);
    const result = await new TestableAction().RunForTest(params);
    return { result, outputs: params.Params.filter((p) => p.Type === 'Output') };
}

const SPEC = { schema_version: '1', diagram_type: 'architecture', meta: { title: 'Order Flow' } };
const RENDERED = { Success: true, Svg: '<svg id="archify-1"><text>A</text></svg>', Html: '<html><body>page</body></html>', Title: 'Order Flow' };

describe('RenderArchitectureDiagramAction', () => {
    beforeEach(() => {
        renderMock.mockReset();
        readabilityMock.mockReset();
    });

    it('returns the SVG and the HTML page as a file output that surfaces as an artifact', async () => {
        renderMock.mockResolvedValue(RENDERED);

        const { result, outputs } = await run({ DiagramType: 'Architecture', SpecJSON: JSON.stringify(SPEC) });

        expect(renderMock).toHaveBeenCalledWith('architecture', SPEC);
        // The SVG is the Message, once: realtime and MCP callers forward only the Message.
        expect(result).toMatchObject({ Success: true, ResultCode: 'SUCCESS', Message: RENDERED.Svg });
        expect(outputs.find((p) => p.Name === 'SVG')).toBeUndefined();
        const file = outputs.find((p) => p.Name === 'FileOutput')?.Value as Record<string, unknown>;
        expect(file).toMatchObject({ fileName: 'order-flow.html', mimeType: 'text/html', visibility: 'Always' });
        expect(Buffer.from(String(file.fileData), 'base64').toString('utf8')).toBe(RENDERED.Html);
    });

    it('accepts the spec as an object', async () => {
        renderMock.mockResolvedValue(RENDERED);

        await run({ DiagramType: 'workflow', SpecJSON: SPEC });

        expect(renderMock).toHaveBeenCalledWith('workflow', SPEC);
    });

    it.each([
        ['svg', []],
        ['html', ['FileOutput']],
    ])('returns only what Output=%s asks for', async (output, names) => {
        renderMock.mockResolvedValue(RENDERED);

        const { result, outputs } = await run({ DiagramType: 'architecture', SpecJSON: SPEC, Output: output });

        expect(outputs.map((p) => p.Name)).toEqual(names);
        expect(result.Message === RENDERED.Svg).toBe(output === 'svg');
    });

    it('hands archify diagnostics back verbatim so the agent can repair the spec', async () => {
        const failure = { schemaVersion: 1, ok: false, source: 'renderer', error: 'Layout failed', diagnostics: [{ code: 'layout/overlap', supportedFixes: ['move a node'] }] };
        renderMock.mockResolvedValue({ Success: false, ErrorCode: 'VALIDATION_FAILED', Message: 'Layout failed', Failure: failure });

        const { result } = await run({ DiagramType: 'architecture', SpecJSON: SPEC });

        expect(result).toMatchObject({ Success: false, ResultCode: 'VALIDATION_FAILED' });
        expect(JSON.parse(result.Message ?? '')).toEqual(failure);
    });

    it.each([
        [{ SpecJSON: SPEC }],
        [{ DiagramType: 'mindmap', SpecJSON: SPEC }],
        [{ DiagramType: 'architecture' }],
        [{ DiagramType: 'architecture', SpecJSON: '{not json' }],
        [{ DiagramType: 'architecture', SpecJSON: '[1,2]' }],
        [{ DiagramType: 'architecture', SpecJSON: SPEC, Output: 'png' }],
        [{ DiagramType: 'architecture', SpecJSON: `"${'x'.repeat(500_001)}"` }],
        [{ DiagramType: 'architecture', SpecJSON: { meta: { title: 'x'.repeat(500_001) } } }],
    ])('rejects bad input %# without rendering', async (inputs) => {
        const { result } = await run(inputs);

        expect(result).toMatchObject({ Success: false, ResultCode: 'INVALID_INPUT' });
        expect(renderMock).not.toHaveBeenCalled();
    });

    it('fails the optional browser gate when the page does not lay the diagram out', async () => {
        renderMock.mockResolvedValue(RENDERED);
        readabilityMock.mockResolvedValue({ Checked: true, Problems: ['3 of 9 labels have no measured width.'] });

        const { result } = await run({ DiagramType: 'architecture', SpecJSON: SPEC, BrowserCheck: 'true' });

        expect(readabilityMock).toHaveBeenCalledWith(RENDERED.Html);
        expect(result).toMatchObject({ Success: false, ResultCode: 'BROWSER_CHECK_FAILED' });
    });

    it('still succeeds when the browser gate cannot run, and skips it unless asked', async () => {
        renderMock.mockResolvedValue(RENDERED);
        readabilityMock.mockResolvedValue({ Checked: false, Reason: 'no Chromium' });

        expect((await run({ DiagramType: 'architecture', SpecJSON: SPEC, BrowserCheck: true })).result.Success).toBe(true);
        readabilityMock.mockClear();
        await run({ DiagramType: 'architecture', SpecJSON: SPEC });
        expect(readabilityMock).not.toHaveBeenCalled();
    });
});
