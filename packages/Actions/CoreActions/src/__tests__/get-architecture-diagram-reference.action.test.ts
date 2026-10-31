import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});
vi.mock('@memberjunction/actions-base', () => ({}));
vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));

const referenceMock = vi.fn();
vi.mock('@memberjunction/ai-diagrams', () => ({
    GetDiagramReference: (...args: unknown[]) => referenceMock(...args),
}));

import { GetArchitectureDiagramReferenceAction } from '../custom/visualization/get-architecture-diagram-reference.action';

class TestableAction extends GetArchitectureDiagramReferenceAction {
    public RunForTest(params: RunActionParams): Promise<ActionResultSimple> {
        return this.InternalRunAction(params);
    }
}

const run = (inputs: Record<string, unknown>) =>
    new TestableAction().RunForTest({
        Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Type: 'Input', Value })),
    } as RunActionParams);

describe('GetArchitectureDiagramReferenceAction', () => {
    beforeEach(() => referenceMock.mockReset());

    it('returns the reference guide for a specific DiagramType', async () => {
        referenceMock.mockReturnValue({ Success: true, Content: '# MJ Data Flow Diagram Spec' });

        const result = await run({ DiagramType: 'Dataflow' });

        expect(referenceMock).toHaveBeenCalledWith('Dataflow');
        expect(result).toEqual({
            Success: true,
            ResultCode: 'SUCCESS',
            Message: '# MJ Data Flow Diagram Spec',
        });
    });

    it('returns all reference guides when DiagramType is omitted', async () => {
        referenceMock.mockReturnValue({ Success: true, Content: '# All MJ Diagram Specs' });

        const result = await run({});

        expect(referenceMock).toHaveBeenCalledWith(undefined);
        expect(result).toEqual({
            Success: true,
            ResultCode: 'SUCCESS',
            Message: '# All MJ Diagram Specs',
        });
    });

    it('passes the package error code through when DiagramType is unknown', async () => {
        referenceMock.mockReturnValue({ Success: false, ErrorCode: 'NOT_FOUND', Message: 'Unknown diagram kind' });

        expect(await run({ DiagramType: 'unknown' })).toEqual({
            Success: false,
            ResultCode: 'NOT_FOUND',
            Message: 'Unknown diagram kind',
        });
    });
});
