/**
 * SyncParameters re-extraction vs. declared values: a 'Manual' parameter (declared by a user or
 * through metadata) keeps its non-empty SampleValue and its DetectionMethod when the query is
 * re-extracted; an 'AI' parameter takes the newly extracted sample. SQL-derived properties (Type,
 * IsRequired, DefaultValue, Description) follow the extraction in both cases.
 */
import { describe, it, expect, vi } from 'vitest';
import type { BaseEntity, IMetadataProvider, IRunViewProvider, RunViewResult, UserInfo } from '@memberjunction/core';
import type { MJQueryParameterEntity } from '@memberjunction/core-entities';
import { SyncParameters } from '../custom/query-extraction/sync';
import type { ExtractedParameter } from '../custom/query-extraction/types';

type ParameterStubShape = Pick<
    MJQueryParameterEntity,
    'QueryID' | 'Name' | 'Type' | 'IsRequired' | 'DefaultValue' | 'Description' | 'SampleValue' | 'DetectionMethod' | 'Save' | 'Delete'
>;

const GUID = '00000000-0000-0000-0000-000000000000';
const USER = {} as UserInfo;
const NO_NEW_ROWS: IMetadataProvider = {} as IMetadataProvider;

function existingParam(overrides: Partial<ParameterStubShape>): ParameterStubShape {
    return {
        QueryID: 'q-1', Name: 'ActivityID', Type: 'string', IsRequired: true, DefaultValue: null,
        Description: 'old description', SampleValue: GUID, DetectionMethod: 'Manual',
        Save: vi.fn(async () => true), Delete: vi.fn(async () => true),
        ...overrides
    };
}

/** A cold-cache run-view provider that returns the given rows as the query's existing parameters. */
function runViewReturning(rows: ParameterStubShape[]): IRunViewProvider {
    const result: Pick<RunViewResult, 'Success' | 'Results'> = { Success: true, Results: rows };
    const shape: Pick<IRunViewProvider, 'RunView'> = {
        RunView: <T = BaseEntity>() => Promise.resolve(result as RunViewResult<T>)
    };
    return shape as IRunViewProvider;
}

function extracted(overrides: Partial<ExtractedParameter>): ExtractedParameter {
    return {
        name: 'ActivityID', type: 'string', isRequired: true, description: 'new description', usage: [],
        DefaultValue: null, SampleValue: 'Example', ...overrides
    };
}

describe('SyncParameters — declared sample values', () => {
    it("keeps a 'Manual' parameter's SampleValue and DetectionMethod; SQL-derived fields still follow the extraction", async () => {
        const row = existingParam({});
        await SyncParameters('q-1', [extracted({})], USER, NO_NEW_ROWS, runViewReturning([row]), true);

        expect(row.SampleValue).toBe(GUID);
        expect(row.DetectionMethod).toBe('Manual');
        expect(row.Description).toBe('new description');
        expect(row.Save).toHaveBeenCalledTimes(1);
    });

    it("does not save a 'Manual' parameter when only the sample would have changed", async () => {
        const row = existingParam({ Description: 'new description' });
        await SyncParameters('q-1', [extracted({})], USER, NO_NEW_ROWS, runViewReturning([row]), true);

        expect(row.SampleValue).toBe(GUID);
        expect(row.Save).not.toHaveBeenCalled();
    });

    it("fills an empty SampleValue on a 'Manual' parameter and leaves it 'Manual'", async () => {
        const row = existingParam({ SampleValue: null });
        await SyncParameters('q-1', [extracted({ SampleValue: GUID })], USER, NO_NEW_ROWS, runViewReturning([row]), true);

        expect(row.SampleValue).toBe(GUID);
        expect(row.DetectionMethod).toBe('Manual');
    });

    it("replaces an 'AI' parameter's SampleValue with the extracted one", async () => {
        const row = existingParam({ DetectionMethod: 'AI', SampleValue: 'Example' });
        await SyncParameters('q-1', [extracted({ SampleValue: GUID })], USER, NO_NEW_ROWS, runViewReturning([row]), true);

        expect(row.SampleValue).toBe(GUID);
        expect(row.DetectionMethod).toBe('AI');
        expect(row.Save).toHaveBeenCalledTimes(1);
    });

    it("drops a 'Manual' parameter's declared SampleValue when the extracted type differs", async () => {
        const row = existingParam({ Type: 'string', SampleValue: GUID });
        await SyncParameters('q-1', [extracted({ type: 'number', SampleValue: '10' })], USER, NO_NEW_ROWS, runViewReturning([row]), true);

        expect(row.Type).toBe('number');
        expect(row.SampleValue).toBe('10');
        expect(row.DetectionMethod).toBe('Manual');
        expect(row.Save).toHaveBeenCalledTimes(1);
    });
});
