/**
 * CreateMermaidDiagramAction is a thin wrapper over MermaidRenderer. These tests pin the wrapper's
 * half of the contract: input validation happens before any render, renderer failures map to the
 * action's declared result codes, and the SVG is sanitized before it is returned.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

vi.mock('@memberjunction/actions-base', () => ({}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
}));

const renderMock = vi.fn();

vi.mock('../custom/visualization/shared/mermaid-renderer', () => ({
    MermaidRenderer: { Instance: { Render: (...args: unknown[]) => renderMock(...args) } },
}));

import { CreateMermaidDiagramAction } from '../custom/visualization/create-mermaid-diagram.action';

/** Exposes the protected entry point without weakening its type. */
class TestableCreateMermaidDiagramAction extends CreateMermaidDiagramAction {
    public RunForTest(params: RunActionParams): Promise<ActionResultSimple> {
        return this.InternalRunAction(params);
    }
}

function paramsFor(inputs: Record<string, unknown>): RunActionParams {
    return {
        Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Type: 'Input', Value })),
    } as RunActionParams;
}

const run = (inputs: Record<string, unknown>) => new TestableCreateMermaidDiagramAction().RunForTest(paramsFor(inputs));

describe('CreateMermaidDiagramAction', () => {
    beforeEach(() => {
        renderMock.mockReset();
    });

    it('returns the rendered SVG as the message', async () => {
        renderMock.mockResolvedValue({ Success: true, Svg: '<svg xmlns="http://www.w3.org/2000/svg"><g><text>A</text></g></svg>' });

        const result = await run({ Code: 'flowchart TD\nA-->B' });

        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(result.Message).toContain('<svg');
        expect(renderMock).toHaveBeenCalledWith('flowchart TD\nA-->B', 'default', {});
    });

    it('strips script from the rendered SVG', async () => {
        renderMock.mockResolvedValue({
            Success: true,
            Svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><g onclick="x()"><text>A</text></g></svg>',
        });

        const result = await run({ Code: 'flowchart TD\nA-->B' });

        expect(result.Message).not.toContain('<script');
        expect(result.Message).not.toContain('onclick');
    });

    it('passes Theme and Config through to the renderer', async () => {
        renderMock.mockResolvedValue({ Success: true, Svg: '<svg xmlns="http://www.w3.org/2000/svg"/>' });

        await run({ Code: 'pie\n"A": 1', Theme: 'forest', Config: '{"fontSize": 14}' });

        expect(renderMock).toHaveBeenCalledWith('pie\n"A": 1', 'forest', { fontSize: 14 });
    });

    it('renders plain labels that look like "on...=" outside a tag', async () => {
        renderMock.mockResolvedValue({ Success: true, Svg: '<svg xmlns="http://www.w3.org/2000/svg"/>' });

        const result = await run({ Code: 'flowchart TD\nA{condition = true}-->B[onboarding = complete]-->C{online = true}' });

        expect(result.ResultCode).toBe('SUCCESS');
    });

    it.each([
        ['RENDER_FAILED', 'DIAGRAM_GENERATION_FAILED'],
        ['BROWSER_UNAVAILABLE', 'BROWSER_UNAVAILABLE'],
        ['TIMEOUT', 'TIMEOUT'],
    ])('maps a renderer %s failure to result code %s', async (errorCode, resultCode) => {
        renderMock.mockResolvedValue({ Success: false, ErrorCode: errorCode, Message: 'details' });

        const result = await run({ Code: 'flowchart TD\nA-->B' });

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe(resultCode);
        expect(result.Message).toContain('details');
    });

    it('tells the caller to fall back to Create SVG Diagram when no browser can render', async () => {
        renderMock.mockResolvedValue({ Success: false, ErrorCode: 'BROWSER_UNAVAILABLE', Message: 'details' });

        const result = await run({ Code: 'flowchart TD\nA-->B' });

        expect(result.Message).toContain('Create SVG Diagram');
    });

    it.each([
        [{}, 'MISSING_PARAMETERS'],
        [{ Code: 'flowchart TD\nA-->B', Theme: 'neon' }, 'INVALID_THEME'],
        [{ Code: 'x'.repeat(100_001) }, 'CODE_TOO_LARGE'],
        [{ Code: 'flowchart TD\nA["<script>"]-->B' }, 'INVALID_CODE'],
        [{ Code: 'flowchart TD\nA["<img src=x onerror=alert(1)>"]-->B' }, 'INVALID_CODE'],
    ])('rejects bad input %# without rendering', async (inputs, resultCode) => {
        const result = await run(inputs);

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe(resultCode);
        expect(renderMock).not.toHaveBeenCalled();
    });
});
