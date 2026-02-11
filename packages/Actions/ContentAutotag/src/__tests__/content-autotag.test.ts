import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {
        protected async InternalRunAction(): Promise<unknown> { return {}; }
    }
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target
}));

vi.mock('@memberjunction/core-actions', () => ({
    VectorizeEntityAction: class VectorizeEntityAction {
        protected async InternalRunAction(): Promise<unknown> {
            return { Success: true, ResultCode: 'SUCCESS' };
        }
    }
}));

vi.mock('@memberjunction/content-autotagging', () => ({
    AutotagLocalFileSystem: class AutotagLocalFileSystem {
        async Autotag(): Promise<void> {}
    },
    AutotagRSSFeed: class AutotagRSSFeed {
        async Autotag(): Promise<void> {}
    },
    AutotagWebsite: class AutotagWebsite {
        async Autotag(): Promise<void> {}
    }
}));

vi.mock('@memberjunction/actions-base', () => ({
    ActionParam: class ActionParam {
        Name: string = '';
        Value: unknown = null;
        Type: string = 'Input';
    },
    ActionResultSimple: class ActionResultSimple {
        Success: boolean = false;
        ResultCode: string = '';
        Message?: string;
    },
    RunActionParams: class RunActionParams {
        Params: unknown[] = [];
        ContextUser: unknown = null;
    }
}));

import { AutotagAndVectorizeContentAction } from '../generic/content-autotag-and-vectorize.action';

describe('AutotagAndVectorizeContentAction', () => {
    let action: AutotagAndVectorizeContentAction;

    beforeEach(() => {
        action = new AutotagAndVectorizeContentAction();
    });

    it('should be instantiable', () => {
        expect(action).toBeDefined();
    });

    it('should be an instance of the class', () => {
        expect(action).toBeInstanceOf(AutotagAndVectorizeContentAction);
    });

    describe('InternalRunAction', () => {
        it('should throw when Autotag param is missing', async () => {
            const params = {
                Params: [{ Name: 'Vectorize', Value: 1, Type: 'Input' }],
                ContextUser: {}
            };

            await expect(
                (action as unknown as Record<string, (p: unknown) => Promise<unknown>>).InternalRunAction(params)
            ).rejects.toThrow('Autotag and Vectorize params are required.');
        });

        it('should throw when Vectorize param is missing', async () => {
            const params = {
                Params: [{ Name: 'Autotag', Value: 1, Type: 'Input' }],
                ContextUser: {}
            };

            await expect(
                (action as unknown as Record<string, (p: unknown) => Promise<unknown>>).InternalRunAction(params)
            ).rejects.toThrow('Autotag and Vectorize params are required.');
        });

        it('should return success when both params present but disabled', async () => {
            const params = {
                Params: [
                    { Name: 'Autotag', Value: 0, Type: 'Input' },
                    { Name: 'Vectorize', Value: 0, Type: 'Input' }
                ],
                ContextUser: {}
            };

            const result = await (action as unknown as Record<string, (p: unknown) => Promise<{ Success: boolean; ResultCode: string }>>).InternalRunAction(params);
            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');
        });

        it('should run autotagging when Autotag is 1', async () => {
            const params = {
                Params: [
                    { Name: 'Autotag', Value: 1, Type: 'Input' },
                    { Name: 'Vectorize', Value: 0, Type: 'Input' }
                ],
                ContextUser: {}
            };

            const result = await (action as unknown as Record<string, (p: unknown) => Promise<{ Success: boolean; ResultCode: string }>>).InternalRunAction(params);
            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');
        });
    });
});
