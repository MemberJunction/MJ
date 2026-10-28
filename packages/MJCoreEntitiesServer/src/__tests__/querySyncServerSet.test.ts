/**
 * Parameter sync after a SQL edit (#4789 A17): a parameter whose name survives keeps `IsServerSet`
 * (or an SQL edit would silently unlock it), and the reserved `Context` object is never kept as a
 * parameter row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, IRunViewProvider, UserInfo } from '@memberjunction/core';

interface ParamRow {
    QueryID: string;
    Name: string;
    Type: string;
    IsRequired: boolean;
    IsServerSet: boolean;
    DefaultValue: string | null;
    Description: string | null;
    SampleValue: string | null;
    DetectionMethod: string;
    Save: ReturnType<typeof vi.fn>;
    Delete: ReturnType<typeof vi.fn>;
}

const { existing } = vi.hoisted(() => ({ existing: [] as ParamRow[] }));

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        QueryEngine: { Instance: { Loaded: true, GetQueryParameters: () => existing } },
    };
});

import { SyncParameters } from '../custom/query-extraction/sync';
import type { ExtractedParameter } from '../custom/query-extraction/types';

function row(name: string, isServerSet: boolean): ParamRow {
    return {
        QueryID: 'q-1', Name: name, Type: 'number', IsRequired: true, IsServerSet: isServerSet, DefaultValue: null,
        Description: null, SampleValue: null, DetectionMethod: 'AI',
        Save: vi.fn(async () => true), Delete: vi.fn(async () => true),
    };
}

function extracted(name: string, type: ExtractedParameter['type'] = 'number'): ExtractedParameter {
    return { name, type, isRequired: true, description: `about ${name}`, usage: [], DefaultValue: null, SampleValue: null };
}

const created: ParamRow[] = [];
const metadataProvider = {
    GetEntityObject: vi.fn(async () => {
        const fresh = row('', false);
        created.push(fresh);
        return fresh;
    }),
} as unknown as IMetadataProvider;

async function sync(params: ExtractedParameter[]): Promise<void> {
    await SyncParameters('q-1', params, { ID: 'u-1' } as UserInfo, metadataProvider, {} as IRunViewProvider, true);
}

beforeEach(() => {
    existing.length = 0;
    created.length = 0;
});

describe('SyncParameters', () => {
    it('keeps IsServerSet on a parameter whose name survives an SQL edit, even when its other properties change', async () => {
        const chapter = row('ChapterID', true);
        existing.push(chapter, row('Region', false));

        // The edited SQL still uses ChapterID (now as a string) and drops Region.
        await sync([extracted('ChapterID', 'string'), extracted('Since', 'date')]);

        expect(chapter.IsServerSet).toBe(true);
        expect(chapter.Type).toBe('string');
        expect(chapter.Save).toHaveBeenCalled();
        expect(chapter.Delete).not.toHaveBeenCalled();
        expect(existing[1].Delete).toHaveBeenCalled();
        expect(created.map(c => [c.Name, c.IsServerSet])).toEqual([['Since', false]]);
    });

    it("refuses the reserved Context object and its members as parameters, and removes an old 'Context' row", async () => {
        const oldContext = row('Context', false);
        existing.push(oldContext);

        await sync([extracted('Context.UserID', 'string'), extracted('Context'), extracted('ChapterID')]);

        expect(created.map(c => c.Name)).toEqual(['ChapterID']);
        expect(oldContext.Delete).toHaveBeenCalled();
    });
});
