/**
 * RenderArchitectureDiagramAction tests: verifies input validation, diagnostic pass-through,
 * and SVG Data Contract preservation through SVGUtils.SanitizeSVG.
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
    MJ_DIAGRAM_KINDS: ['workflow', 'lifecycle', 'sequence', 'dataflow'],
    RenderDiagram: (...args: unknown[]) => renderMock(...args),
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

const SPEC = { kind: 'workflow', title: 'Order Flow', lanes: [], nodes: [], edges: [] };
const RENDERED = {
    Success: true,
    Svg: '<svg id="mjd-1" data-mj-diagram="1" data-mj-kind="workflow"><g class="node" data-node-id="a"><desc>Step details</desc><text>A</text></g></svg>',
    Title: 'Order Flow',
    Kind: 'workflow',
    Warnings: [],
};

describe('RenderArchitectureDiagramAction', () => {
    beforeEach(() => {
        renderMock.mockReset();
    });

    it('returns the sanitized SVG (preserving data-* attributes and <desc>) as both Message and SVG output param', async () => {
        renderMock.mockReturnValue(RENDERED);

        const { result, outputs } = await run({ DiagramType: 'Workflow', SpecJSON: JSON.stringify(SPEC) });

        expect(renderMock).toHaveBeenCalledWith(SPEC, 'workflow');
        expect(result).toMatchObject({ Success: true, ResultCode: 'SUCCESS', Message: RENDERED.Svg });
        expect(result.Message).toContain('data-mj-diagram="1"');
        expect(result.Message).toContain('<desc>Step details</desc>');
        const svgOutput = outputs.find((p) => p.Name === 'SVG')?.Value;
        expect(svgOutput).toBe(RENDERED.Svg);
    });

    it('accepts the spec as an object and infers DiagramType from spec.kind when DiagramType param is omitted', async () => {
        renderMock.mockReturnValue(RENDERED);

        await run({ SpecJSON: SPEC });

        expect(renderMock).toHaveBeenCalledWith(SPEC, 'workflow');
    });

    it('hands @memberjunction/ai-diagrams diagnostics back as JSON so the agent can repair the spec', async () => {
        const diagnostics = [{ Code: 'UNKNOWN_EDGE_TO', Severity: 'error', Path: 'edges[0].to', Message: 'Not found', Fix: 'Use valid id' }];
        renderMock.mockReturnValue({
            Success: false,
            ErrorCode: 'VALIDATION_FAILED',
            Message: 'Dangling edge',
            Diagnostics: diagnostics,
        });

        const { result } = await run({ DiagramType: 'workflow', SpecJSON: SPEC });

        expect(result).toMatchObject({ Success: false, ResultCode: 'VALIDATION_FAILED' });
        expect(JSON.parse(result.Message ?? '')).toEqual({
            error: 'Dangling edge',
            diagnostics,
        });
    });

    it.each([
        [{ SpecJSON: { title: 'No kind' } }],
        [{ DiagramType: 'mindmap', SpecJSON: SPEC }],
        [{ DiagramType: 'workflow' }],
        [{ DiagramType: 'workflow', SpecJSON: '{not json' }],
        [{ DiagramType: 'workflow', SpecJSON: '[1,2]' }],
        [{ DiagramType: 'workflow', SpecJSON: `"${'x'.repeat(500_001)}"` }],
        [{ DiagramType: 'workflow', SpecJSON: { title: 'x'.repeat(500_001) } }],
    ])('rejects bad input %# without rendering', async (inputs) => {
        const { result } = await run(inputs);

        expect(result).toMatchObject({ Success: false, ResultCode: 'INVALID_INPUT' });
        expect(renderMock).not.toHaveBeenCalled();
    });
});
