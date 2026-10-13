import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeDetectorRef } from '@angular/core';
import type { DomSanitizer } from '@angular/platform-browser';
import type { IMetadataProvider } from '@memberjunction/core';
import type { RecordSelectedEvent } from '@memberjunction/ng-entity-viewer';
import { QueryEngine } from '@memberjunction/core-entities';
import type { DashboardPanel } from '../models/dashboard-types';
import type { DashboardPartContext, DashboardPartEventArgs, DashboardProperty } from '../models/dashboard-properties';
import { ViewPartComponent } from './view-part.component';
import { QueryPartComponent } from './query-part.component';
import { WebURLPartComponent } from './weburl-part.component';

/**
 * How the View, Query and Web URL parts take values through their input mappings (plan § 4) and
 * raise their selection events (§ 4.1). Class-level: each part is built with `new` and driven
 * through its Panel and PropertyContext inputs, as the dashboard viewer drives it.
 */

const CHAPTER_A = 'A1B2C3D4-0000-4000-8000-00000000000A';
const CHAPTER_B = 'A1B2C3D4-0000-4000-8000-00000000000B';
const chapter: DashboardProperty = { Name: 'Chapter', Type: 'uuid' };

const cdr = { detectChanges: vi.fn(), markForCheck: vi.fn() } as unknown as ChangeDetectorRef;

function context(value: string | null): DashboardPartContext {
    return { Properties: [chapter], Values: { Chapter: value } };
}

/** A row selection in the entity viewer; the part reads only the record. */
function selection(record: Record<string, unknown>): RecordSelectedEvent {
    return { record } as Partial<RecordSelectedEvent> as RecordSelectedEvent;
}

function panel(config: DashboardPanel['config']): DashboardPanel {
    return { id: 'p1', title: 'Members', partTypeId: 'pt', config };
}

async function flush(): Promise<void> {
    for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe('View part', () => {
    let declared: Array<Record<string, unknown>>;
    let getEntityObject: ReturnType<typeof vi.fn>;
    let provider: IMetadataProvider;

    beforeEach(() => {
        declared = [{ Name: 'ChapterID', Type: 'uuid', Target: { Field: 'ChapterID', Operator: '=' } }];
        getEntityObject = vi.fn(async () => ({
            Name: 'Members',
            Load: vi.fn(async () => true),
            get PropertiesObject() { return declared; },
            ViewEntityInfo: { Name: 'Members', Fields: [{ Name: 'ID', Type: 'uniqueidentifier', IsBinaryFieldType: false }] },
        }));
        provider = { CurrentUser: { ID: 'u1' }, GetEntityObject: getEntityObject } as unknown as IMetadataProvider;
    });

    function viewPart(config: DashboardPanel['config'], ctx: DashboardPartContext | null): ViewPartComponent {
        const part = new ViewPartComponent(cdr);
        part.Provider = provider;
        if (ctx) part.PropertyContext = ctx;
        part.Panel = panel(config);
        return part;
    }

    it("passes a mapped value as the view's Properties under the view's own name", async () => {
        const part = viewPart({ type: 'View', viewId: 'v1', inputMappings: [{ Input: 'ChapterID', Property: 'Chapter' }] }, context(CHAPTER_A));
        await flush();
        expect(part.ErrorMessage).toBeNull();
        expect(part.ViewPropertyValues).toEqual({ ChapterID: CHAPTER_A });
    });

    it('takes a new value without reloading the view, and ignores a context whose values it does not use', async () => {
        const part = viewPart({ type: 'View', viewId: 'v1', inputMappings: [{ Input: 'ChapterID', Property: 'Chapter' }] }, context(CHAPTER_A));
        await flush();
        const loads = getEntityObject.mock.calls.length;
        const before = part.ViewPropertyValues;

        part.PropertyContext = { Properties: [chapter, { Name: 'Other', Type: 'string' }], Values: { Chapter: CHAPTER_A, Other: 'x' } };
        expect(part.ViewPropertyValues).toBe(before);

        part.PropertyContext = context(CHAPTER_B);
        expect(part.ViewPropertyValues).toEqual({ ChapterID: CHAPTER_B });
        expect(getEntityObject.mock.calls.length).toBe(loads);
    });

    it("shows a broken mapping on the part when the view's property was renamed, instead of running without the value", async () => {
        declared = [{ Name: 'ChapterKey', Type: 'uuid', Target: { Field: 'ChapterID', Operator: '=' } }];
        const part = viewPart({ type: 'View', viewId: 'v1', inputMappings: [{ Input: 'ChapterID', Property: 'Chapter' }] }, context(CHAPTER_A));
        await flush();
        expect(part.ErrorMessage).toBe('Input "ChapterID" is not one the part declares.');
        expect(part.HasView).toBe(false);
    });

    it('stops and names a required input with no value', async () => {
        declared = [{ Name: 'ChapterID', Type: 'uuid', IsRequired: true, Target: { Field: 'ChapterID', Operator: '=' } }];
        const part = viewPart({ type: 'View', viewId: 'v1', inputMappings: [{ Input: 'ChapterID', Property: 'Chapter' }] }, context(null));
        await flush();
        expect(part.ErrorMessage).toBe('Missing a value for "ChapterID".');
    });

    it('runs an unmapped part exactly as before: no Properties', async () => {
        const part = viewPart({ type: 'View', viewId: 'v1' }, null);
        await flush();
        expect(part.ViewPropertyValues).toBeNull();
        expect(part.HasView).toBe(true);
        expect(part.InputResolution).toBeNull();
    });

    it("raises RecordSelected with the record's fields", () => {
        const part = viewPart({ type: 'View', viewId: 'v1' }, null);
        const events: DashboardPartEventArgs[] = [];
        part.PartEvent.subscribe(e => events.push(e));
        part.OnRecordSelected(selection({ ID: CHAPTER_A, Name: 'A' }));
        expect(events).toEqual([{ Event: 'RecordSelected', Values: { ID: CHAPTER_A, Name: 'A' } }]);
    });

    it('offers Clear selection after a wired selection, and clearing raises the event with no values', () => {
        const part = viewPart({ type: 'View', viewId: 'v1' }, null);
        part.WiredEvents = ['RecordSelected'];
        const events: DashboardPartEventArgs[] = [];
        part.PartEvent.subscribe(e => events.push(e));
        part.OnRecordSelected(selection({ ID: CHAPTER_A }));
        expect(part.HasActiveSelection).toBe(true);
        part.ClearSelection();
        expect(part.HasActiveSelection).toBe(false);
        expect(events.at(-1)).toEqual({ Event: 'RecordSelected', Values: null });
    });
});

describe('Query part', () => {
    const parameters = [
        { Name: 'chapter_id', Type: 'string', Description: null, IsRequired: true, DefaultValue: null, IsServerSet: false },
        { Name: 'org_id', Type: 'string', Description: null, IsRequired: true, DefaultValue: null, IsServerSet: true },
    ];
    const engine = {
        Config: vi.fn(async () => undefined),
        Queries: [{ ID: 'Q1', Name: 'Members' }],
        GetQueryParameters: vi.fn(() => parameters),
        GetQueryFields: vi.fn(() => [{ Name: 'MemberID', SQLBaseType: 'uniqueidentifier' }]),
        FindQueryByName: vi.fn(),
    };
    const provider = {
        CurrentUser: { ID: 'u1' },
        GetEntityObject: vi.fn(async () => ({ Load: vi.fn(async () => true) })),
    } as unknown as IMetadataProvider;

    beforeEach(() => {
        engine.GetQueryParameters.mockClear();
        vi.spyOn(QueryEngine, 'GetProviderInstance').mockReturnValue(engine as unknown as QueryEngine);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    function queryPart(config: DashboardPanel['config'], ctx: DashboardPartContext | null): QueryPartComponent {
        const part = new QueryPartComponent(cdr);
        part.Provider = provider;
        if (ctx) part.PropertyContext = ctx;
        part.Panel = panel(config);
        return part;
    }

    it('passes a mapped value as the query viewer\'s MappedParameters under the parameter\'s own name', async () => {
        const part = queryPart({ type: 'Query', queryId: 'Q1', inputMappings: [{ Input: 'chapter_id', Property: 'Chapter' }] }, { Properties: [{ Name: 'Chapter', Type: 'string' }], Values: { Chapter: 'ch-1' } });
        await flush();
        expect(part.ErrorMessage).toBeNull();
        expect(part.MappedParameters).toEqual({ chapter_id: 'ch-1' });
    });

    it('refuses to map a server-set parameter', async () => {
        const part = queryPart({ type: 'Query', queryId: 'Q1', inputMappings: [{ Input: 'org_id', Default: { Value: 'x' } }] }, null);
        await flush();
        expect(part.ErrorMessage).toBe('Input "org_id" is set by the server and can\'t be mapped.');
    });

    it('runs an unmapped part as before, without loading the query\'s parameters', async () => {
        const part = queryPart({ type: 'Query', queryId: 'Q1' }, null);
        await flush();
        expect(part.MappedParameters).toBeNull();
        expect(engine.GetQueryParameters).not.toHaveBeenCalled();
    });

    it("raises RowSelected with the row's columns, and no values when the selection is emptied", () => {
        const part = queryPart({ type: 'Query', queryId: 'Q1' }, null);
        const events: DashboardPartEventArgs[] = [];
        part.PartEvent.subscribe(e => events.push(e));
        part.OnSelectionChange({ selectedIndices: [0], selectedRows: [{ MemberID: 'm1' }] });
        part.OnSelectionChange({ selectedIndices: [], selectedRows: [] });
        expect(events).toEqual([{ Event: 'RowSelected', Values: { MemberID: 'm1' } }, { Event: 'RowSelected', Values: null }]);
    });
});

describe('Web URL part', () => {
    const sanitizer = { bypassSecurityTrustResourceUrl: (url: string) => url } as unknown as DomSanitizer;

    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    function urlPart(config: DashboardPanel['config'], ctx: DashboardPartContext | null): WebURLPartComponent {
        const part = new WebURLPartComponent(cdr, sanitizer);
        if (ctx) part.PropertyContext = ctx;
        part.Panel = panel(config);
        return part;
    }

    it('fills each placeholder with its mapped value, URL-encoded', async () => {
        const part = urlPart(
            { type: 'WebURL', url: 'https://example.com/chapters/{chapterSlug}?q={Q}', inputMappings: [{ Input: 'chapterSlug', Property: 'Chapter' }, { Input: 'Q', Default: { Value: 'a b' } }] },
            { Properties: [{ Name: 'Chapter', Type: 'string' }], Values: { Chapter: 'x/y' } },
        );
        await flush();
        expect(part.RawUrl).toBe('https://example.com/chapters/x%2Fy?q=a%20b');
    });

    it('stops and names a placeholder with no value', async () => {
        const part = urlPart({ type: 'WebURL', url: 'https://example.com/{Chapter}', inputMappings: [{ Input: 'Chapter', Property: 'Chapter' }] }, context(null));
        await flush();
        expect(part.ErrorMessage).toBe('Missing a value for "Chapter".');
        expect(part.SafeUrl).toBeNull();
    });

    it('keeps an unmapped URL exactly as configured, braces and all', async () => {
        const part = urlPart({ type: 'WebURL', url: 'https://example.com/{Chapter}' }, null);
        await flush();
        expect(part.RawUrl).toBe('https://example.com/{Chapter}');
        expect(part.ErrorMessage).toBeNull();
    });
});
