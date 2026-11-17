/**
 * @fileoverview Discover walks in parts (5.6), and drivers report removals (5.7).
 *
 * A driver that cannot finish in one run returns a resume token; the source keeps it (`DiscoverState`) and the
 * next walk carries on from it, keeping the first part's start for `LastDiscoveredAt` and staying due until it
 * finishes. A Sync walked in parts marks nothing gone by absence. A driver can yield `{ URL, Removed: true }`
 * and that item is marked for deletion without a Sync. Written against the stage and the processor with a
 * registered fake driver and stand-in storage.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { AutotagBase } from '@memberjunction/content-autotagging';
import {
    DiscoveredItem,
    DiscoverRequest,
    DiscoverWalkEnd,
    StageContext,
    WorkingRecord,
    WorkingRecordEntity,
    WorkingRecordIdentity,
} from '@memberjunction/content-pipeline-base';
import { DiscoverStage, ParseDiscoverState } from '../stages/DiscoverStage.js';
import { ContentSourceConfigurationResolver } from '../ContentSourceConfigurationResolver.js';
import { PipelineProcessor } from '../PipelineProcessor.js';
import { AccessResolver } from '../AccessResolver.js';
import { WorkingRecordCommitter } from '../WorkingRecordCommitter.js';
import type { WorkingRecordHydrator } from '../WorkingRecordHydrator.js';

/** The pages of a source that hands out two items a page, and a token while more remain. */
const PAGES: DiscoveredItem[][] = [
    [{ URL: 'https://x.test/1' }, { URL: 'https://x.test/2' }],
    [{ URL: 'https://x.test/3' }, { URL: 'https://x.test/old', Removed: true }],
];
const seen: DiscoverRequest[] = [];

@RegisterClass(AutotagBase, 'PagedDiscover')
class PagedDiscoverDriver extends AutotagBase {
    public override get SupportsExhaustiveWalk(): boolean {
        return true;
    }
    public async SetContentItemsToProcess(): Promise<never[]> {
        return [];
    }
    public async Autotag(): Promise<number> {
        return 0;
    }
    /** One page per walk: the token is the next page's number. */
    public async *Discover(request: DiscoverRequest): AsyncGenerator<DiscoveredItem, DiscoverWalkEnd | void, undefined> {
        seen.push(request);
        const page = request.ResumeToken ? Number(request.ResumeToken) : 0;
        yield* PAGES[page];
        return page + 1 < PAGES.length ? { ResumeToken: String(page + 1) } : undefined;
    }
}

function context(configuration: Record<string, unknown> = {}): StageContext {
    return {
        ContextUser: {} as never,
        Provider: {} as never,
        Configuration: configuration,
        IsTest: false,
        Signal: new AbortController().signal,
        ReportProgress: () => {},
        Log: { Info: () => {}, Warning: () => {}, Error: () => {} },
        ResolveAccess: async () => null,
    };
}

function source(state: string | null = null): WorkingRecord {
    const record = new WorkingRecord(new WorkingRecordIdentity('Content Source', 'https://x.test', 'SRC-1'));
    if (state) {
        record.SetExtension('Pipeline', 'discoverState', state);
    }
    record.SetExtension('Pipeline', 'lastDiscoveredAt', new Date('2026-01-01T00:00:00Z'));
    return record;
}

beforeEach(() => {
    vi.restoreAllMocks();
    seen.length = 0;
    vi.spyOn(ContentSourceConfigurationResolver.prototype, 'Resolve').mockResolvedValue({
        ContentSourceID: 'SRC-1',
        URL: 'https://x.test',
        Settings: {},
        DriverClass: 'PagedDiscover',
        Parameters: {},
        Configuration: {},
        Problems: [],
        IsValid: true,
    } as never);
});

describe('a walk in parts', () => {
    it('keeps where an unfinished walk stopped and leaves the source due', async () => {
        const record = source();

        const outcome = await new DiscoverStage().Run(record, context());

        expect(outcome.Status).toBe('Complete');
        expect(record.Children).toHaveLength(2);
        const state = ParseDiscoverState(record.GetExtension<Record<string, string>>('Pipeline', 'columns')?.DiscoverState);
        expect(state).toMatchObject({ ResumeToken: '1', Mode: 'Discover', ItemsFound: 2 });
        // Nothing that says the walk is done: ForceDiscovery stays set and LastDiscoveredAt stays put.
        expect(record.GetExtension('Pipeline', 'completionColumns')).toBeUndefined();
        expect(record.GetExtension('Discover', 'incomplete')).toBe(true);
    });

    it("hands the next walk the token, keeps the first part's Since, and finishes it", async () => {
        const firstStart = '2026-02-01T10:00:00.000Z';
        const record = source(JSON.stringify({ ResumeToken: '1', WalkStartedAt: firstStart, Mode: 'Discover', ItemsFound: 2 }));

        const outcome = await new DiscoverStage().Run(record, context());

        expect(seen[0].ResumeToken).toBe('1');
        expect(seen[0].Since).toEqual(new Date(new Date('2026-01-01T00:00:00Z').getTime() - 60_000));
        expect(outcome.Message).toContain('3 across the walk');
        expect(record.GetExtension('Pipeline', 'completionColumns')).toEqual({ ForceDiscovery: false, LastDiscoveredAt: new Date(firstStart) });
        expect(record.GetExtension('Pipeline', 'completionClears')).toEqual(['DiscoverState']);
        expect(record.GetExtension('Discover', 'resumed')).toBe(true);
    });

    it('starts afresh when the saved walk was of the other mode', async () => {
        const record = source(JSON.stringify({ ResumeToken: '1', WalkStartedAt: '2026-02-01T10:00:00.000Z', Mode: 'Sync', ItemsFound: 2 }));

        await new DiscoverStage().Run(record, context());

        expect(seen[0].ResumeToken).toBeNull();
    });

    it('gives the driver a deadline when the walk has a budget', async () => {
        const before = Date.now();
        await new DiscoverStage().Run(source(), context({ Tuning: { DiscoverWalkBudgetMs: 30_000 } }));
        const deadline = seen[0].Deadline!.getTime();
        expect(deadline).toBeGreaterThanOrEqual(before + 30_000);
        expect(deadline).toBeLessThan(before + 31_000);
    });

    it('reads no saved state that does not parse', () => {
        expect(ParseDiscoverState('{not json')).toBeNull();
        expect(ParseDiscoverState(JSON.stringify({ ResumeToken: '', WalkStartedAt: 'x' }))).toBeNull();
    });
});

describe('removals a driver reports', () => {
    it('are collected, not added as items', async () => {
        const record = source(JSON.stringify({ ResumeToken: '1', WalkStartedAt: '2026-02-01T10:00:00.000Z', Mode: 'Discover', ItemsFound: 2 }));

        await new DiscoverStage().Run(record, context());

        expect(record.Children.map((c) => c.Identity.EphemeralID)).toEqual(['https://x.test/3']);
        expect(record.GetExtension('Discover', 'removed')).toEqual(['https://x.test/old']);
    });
});

// ─── through the processor ────────────────────────────────────────────────────────────────────────────

/** Runs Discover over the source; returns which items were marked for deletion and the source's saved columns. */
async function runDiscover(state: string | null, configuration: Record<string, unknown> = {}, live: { ID: string; URL: string }[] = []) {
    // These sources need no session; the access layer has its own tests.
    vi.spyOn(AccessResolver.prototype, 'Artifact').mockResolvedValue(null);
    const marked: string[] = [];
    let sourceColumns: Record<string, unknown> = {};
    const provider = {
        RunView: async (params: { EntityName: string; ExtraFilter: string }) => {
            if (params.EntityName === 'MJ: Content Items' && params.ExtraFilter.includes('ParentID IS NULL') && params.ExtraFilter.includes('old')) {
                return { Success: true, Results: [{ ID: 'ITEM-OLD' }] };
            }
            return { Success: true, Results: live.map((r) => ({ ...r, __mj_CreatedAt: new Date('2025-01-01') })) };
        },
        GetEntityObject: async () => {
            const row: Record<string, unknown> = { ID: 'ITEM-OLD', DeleteStatus: null };
            return {
                Fields: [{ Name: 'ID' }, { Name: 'DeleteStatus' }],
                InnerLoad: async () => true,
                Save: async () => {
                    marked.push(String(row.ID));
                    return true;
                },
                get DeleteStatus() {
                    return row.DeleteStatus;
                },
                set DeleteStatus(v: unknown) {
                    row.DeleteStatus = v;
                },
                get ID() {
                    return row.ID;
                },
            };
        },
        EntityByName: () => ({ ID: 'E', Name: 'MJ: Content Items' }),
    };
    const storage = {
        Hydrator: () => ({ Hydrate: async () => source(state) }) as unknown as WorkingRecordHydrator,
        Committer: () =>
            ({
                Commit: async (record: WorkingRecord) => {
                    sourceColumns = {
                        ...(record.GetExtension<Record<string, unknown>>('Pipeline', 'columns') ?? {}),
                        ...(record.GetExtension<Record<string, unknown>>('Pipeline', 'completionColumns') ?? {}),
                    };
                    return { RecordID: 'SRC-1', ColumnsWritten: [], Created: false };
                },
                CommitChild: async () => ({ RecordID: 'C', ColumnsWritten: [], Created: true }),
            }) as unknown as WorkingRecordCommitter,
    };
    const processor = new PipelineProcessor({ Stages: ['Discover'], IsTest: false, Configuration: configuration }, storage);
    const result = await processor.ProcessRecord({ EntityID: 'E', RecordID: 'SRC-1' } as never, { Provider: provider, ContextUser: {} } as never);
    return { marked, result, sourceColumns };
}

describe('Discover through the processor', () => {
    it('marks an item the driver reported gone for deletion', async () => {
        const { marked, result } = await runDiscover(JSON.stringify({ ResumeToken: '1', WalkStartedAt: '2026-02-01T10:00:00.000Z', Mode: 'Discover', ItemsFound: 2 }));
        expect(result.Status).toBe('Succeeded');
        expect(marked).toContain('ITEM-OLD');
    });

    it('marks nothing gone by absence on a Sync walked in parts', async () => {
        const live = [{ ID: 'L1', URL: 'https://x.test/elsewhere' }];
        const { marked, result } = await runDiscover(null, { Mode: 'Sync' }, live);
        expect(result.Status).toBe('Succeeded');
        expect(marked).toEqual([]);
    });

    it('stores the walk state on the source when the walk is not finished', async () => {
        const { sourceColumns } = await runDiscover(null);
        expect(ParseDiscoverState(sourceColumns.DiscoverState as string)?.ResumeToken).toBe('1');
    });
});

// Keep the entity type import used (the harness above types records by it).
export type _Entity = WorkingRecordEntity;
