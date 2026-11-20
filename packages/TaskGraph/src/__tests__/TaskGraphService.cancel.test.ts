/**
 * `TaskGraphService.Cancel` accepts only a UUID as the graph's ID.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RunView, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import { TaskGraphService, type TaskGraphSubmitContext } from '../TaskGraphService';

const NOT_A_UUID = "0' AND 'marker'='marker";

function context(): TaskGraphSubmitContext {
    return {
        EnvironmentID: '',
        ContextUser: { ID: '11111111-2222-4333-8444-555555555555', Type: 'Owner' } as unknown as UserInfo,
        Provider: {} as IMetadataProvider,
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('TaskGraphService.Cancel', () => {
    it('refuses an ID that is not a UUID and puts no part of it into a filter', async () => {
        const filters: string[] = [];
        const runView = vi.fn(async (params: RunViewParams) => {
            filters.push(params.ExtraFilter ?? '');
            return { Success: true, Results: [] };
        });
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runView } as unknown as RunView);

        const result = await new TaskGraphService().Cancel(NOT_A_UUID, context());

        expect(filters.filter((f) => f.includes('marker'))).toEqual([]);
        expect(result.Success).toBe(false);
    });
});
