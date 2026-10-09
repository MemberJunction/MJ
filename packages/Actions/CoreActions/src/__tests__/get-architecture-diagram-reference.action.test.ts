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
    GetArchitectureDiagramReference: (...args: unknown[]) => referenceMock(...args),
}));

import { GetArchitectureDiagramReferenceAction } from '../custom/visualization/get-architecture-diagram-reference.action';

class TestableAction extends GetArchitectureDiagramReferenceAction {
    public RunForTest(params: RunActionParams): Promise<ActionResultSimple> {
        return this.InternalRunAction(params);
    }
}

const run = (inputs: Record<string, unknown>) => new TestableAction().RunForTest(
    { Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Type: 'Input', Value })) } as RunActionParams);

describe('GetArchitectureDiagramReferenceAction', () => {
    beforeEach(() => referenceMock.mockReset());

    it('returns the requested material as the message', async () => {
        referenceMock.mockReturnValue({ Success: true, Content: '{ "type": "object" }' });

        const result = await run({ Topic: 'Schema', DiagramType: 'Dataflow' });

        expect(referenceMock).toHaveBeenCalledWith('schema', 'dataflow');
        expect(result).toEqual({ Success: true, ResultCode: 'SUCCESS', Message: '{ "type": "object" }' });
    });

    it('passes the package error code through', async () => {
        referenceMock.mockReturnValue({ Success: false, ErrorCode: 'NOT_FOUND', Message: 'missing' });

        expect(await run({ Topic: 'brand-marks' })).toEqual({ Success: false, ResultCode: 'NOT_FOUND', Message: 'missing' });
        expect(referenceMock).toHaveBeenCalledWith('brand-marks', undefined);
    });

    it('requires a topic', async () => {
        expect(await run({ DiagramType: 'workflow' })).toMatchObject({ Success: false, ResultCode: 'INVALID_INPUT' });
        expect(referenceMock).not.toHaveBeenCalled();
    });
});
