/**
 * Parameter sync after a SQL edit (#4789 A17): a parameter whose name survives keeps `IsServerSet`
 * (or an SQL edit would silently unlock it), and the reserved `Context` object is never kept as a
 * parameter row. Rows a person authored (`DetectionMethod` `Manual`) are left exactly as written,
 * whichever save triggers the sync.
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

interface FieldRow {
    QueryID: string;
    Name: string;
    Description: string | null;
    Sequence: number;
    SQLBaseType: string;
    DetectionMethod: string;
    Save: ReturnType<typeof vi.fn>;
    Delete: ReturnType<typeof vi.fn>;
}

const existing: ParamRow[] = [];
const existingFields: FieldRow[] = [];

import { NamesExtractionLeavesAlone, SyncFields, SyncParameters } from '../custom/query-extraction/sync';
import type { ExtractedField, ExtractedParameter } from '../custom/query-extraction/types';

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

/** Stored rows are read from the database (never a cache): a RunView returning the test's rows. */
const runViewProvider = {
    RunView: vi.fn(async ({ EntityName }: { EntityName: string }) => ({
        Success: true,
        Results: EntityName === 'MJ: Query Parameters' ? existing : existingFields,
    })),
} as unknown as IRunViewProvider;

const created: ParamRow[] = [];
const metadataProvider = {
    GetEntityObject: vi.fn(async () => {
        const fresh = row('', false);
        created.push(fresh);
        return fresh;
    }),
} as unknown as IMetadataProvider;

async function sync(params: ExtractedParameter[]): Promise<void> {
    await SyncParameters('q-1', params, { ID: 'u-1' } as UserInfo, metadataProvider, runViewProvider, true);
}

beforeEach(() => {
    existing.length = 0;
    existingFields.length = 0;
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

    it('reads the stored rows from the database, bypassing every cache', async () => {
        await sync([extracted('ChapterID')]);

        expect(runViewProvider.RunView).toHaveBeenCalledWith(
            expect.objectContaining({ EntityName: 'MJ: Query Parameters', ExtraFilter: "QueryID='q-1'", BypassCache: true }),
            expect.anything()
        );
    });

    it("refuses the reserved Context object and its members as parameters, and removes an old 'Context' row", async () => {
        const oldContext = row('Context', false);
        existing.push(oldContext);

        await sync([extracted('Context.UserID', 'string'), extracted('Context'), extracted('ChapterID')]);

        expect(created.map(c => c.Name)).toEqual(['ChapterID']);
        expect(oldContext.Delete).toHaveBeenCalled();
    });

    it('leaves an authored parameter as written: no update, no delete, no second row', async () => {
        const authored = row('Region', false);
        authored.DetectionMethod = 'Manual';
        authored.Type = 'string';
        authored.Description = 'The sales region, written by a person';
        const extractedRow = row('Stale', false);
        existing.push(authored, extractedRow);

        await sync([extracted('Region', 'number'), extracted('Since', 'date')]);

        expect(authored.Type).toBe('string');
        expect(authored.Description).toBe('The sales region, written by a person');
        expect(authored.DetectionMethod).toBe('Manual');
        expect(authored.Save).not.toHaveBeenCalled();
        expect(authored.Delete).not.toHaveBeenCalled();
        expect(extractedRow.Delete).toHaveBeenCalled();
        expect(created.map(c => c.Name)).toEqual(['Since']);
    });

    it('keeps an authored parameter the SQL no longer uses', async () => {
        const authored = row('Region', false);
        authored.DetectionMethod = 'Manual';
        existing.push(authored);

        await sync([]);

        expect(authored.Delete).not.toHaveBeenCalled();
        expect(created).toEqual([]);
    });
});

describe('SyncFields', () => {
    function fieldRow(name: string, detectionMethod: string): FieldRow {
        return {
            QueryID: 'q-1', Name: name, Description: `${name}, as written`, Sequence: 7, SQLBaseType: 'nvarchar', DetectionMethod: detectionMethod,
            Save: vi.fn(async () => true), Delete: vi.fn(async () => true),
        };
    }
    function extractedField(name: string): ExtractedField {
        return { name, description: `Computed column: ${name}`, type: 'number', optional: true, isComputed: true, sqlBaseType: 'int', sqlFullType: 'int' };
    }

    it('leaves authored fields as written and syncs only the extracted ones', async () => {
        const authored = fieldRow('Runs', 'Manual');
        const authoredGone = fieldRow('Retired', 'Manual');
        const stale = fieldRow('Old', 'AI');
        existingFields.push(authored, authoredGone, stale);

        await SyncFields('q-1', [extractedField('Runs'), extractedField('Cost')], { ID: 'u-1' } as UserInfo, metadataProvider, runViewProvider, true);

        expect(authored.Description).toBe('Runs, as written');
        expect(authored.Sequence).toBe(7);
        expect(authored.Save).not.toHaveBeenCalled();
        expect(authoredGone.Delete).not.toHaveBeenCalled();
        expect(stale.Delete).toHaveBeenCalled();
        expect(created.map(c => c.Name)).toEqual(['Cost']);
    });
});

describe('NamesExtractionLeavesAlone', () => {
    it('is the declared names plus every authored row, lower-cased', () => {
        const names = NamesExtractionLeavesAlone(
            [{ Name: 'Region', DetectionMethod: 'Manual' }, { Name: 'Since', DetectionMethod: 'AI' }, { Name: 'Year', DetectionMethod: 'Parser' }],
            new Set(['month'])
        );
        expect([...names].sort()).toEqual(['month', 'region']);
    });
});
