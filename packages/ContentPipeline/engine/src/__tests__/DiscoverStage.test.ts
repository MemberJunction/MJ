import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseDiscoverDriver,
    DiscoverRequest,
    DiscoveredItem,
    StageContext,
    WorkingRecord,
    WorkingRecordIdentity,
} from '@memberjunction/content-pipeline-base';
import type { AccessArtifact } from '@memberjunction/content-pipeline-base';
import { DiscoverStage } from '../stages/DiscoverStage.js';
import { ContentSourceConfigurationResolver } from '../ContentSourceConfigurationResolver.js';

/** What the fake driver yields this test. */
let items: DiscoveredItem[] = [];
let sawSignalAbortedAt: number | null = null;
/** Lets a test cancel the run from inside the walk, deterministically. */
let abortAfterItem: { Index: number; Controller: AbortController } | null = null;
/** Every request the driver was handed, so a test can assert what reached it. */
const seenRequests: DiscoverRequest[] = [];

@RegisterClass(BaseDiscoverDriver, 'TestDiscover')
class TestDiscoverDriver extends BaseDiscoverDriver {
    public readonly Key = 'TestDiscover';
    public async *Discover(request: DiscoverRequest): AsyncIterable<DiscoveredItem> {
        seenRequests.push(request);
        let index = 0;
        for (const item of items) {
            if (request.Signal.aborted) {
                sawSignalAbortedAt = index;
                return;
            }
            yield item;
            index++;
            if (abortAfterItem && abortAfterItem.Index === index) {
                abortAfterItem.Controller.abort();
            }
        }
    }
}

const progress: string[] = [];

/** Sessions the stage asked for, so a test can assert it asked at all. */
export const accessRequests: { ContentSourceID: string; Role?: string }[] = [];

function contextWith(signal?: AbortSignal, access: AccessArtifact | null = null): StageContext {
    return {
        ContextUser: {} as never,
        Provider: {} as never,
        Configuration: {},
        IsTest: false,
        Scope: 'Filter',
        Attempt: 1,
        MaxAttempts: 1,
        IsReplay: false,
        Signal: signal ?? new AbortController().signal,
        ReportProgress: (m: string) => progress.push(m),
        Log: { Info: () => {}, Warning: () => {}, Error: () => {} },
        ResolveAccess: async (contentSourceID: string, role?: string) => {
            accessRequests.push({ ContentSourceID: contentSourceID, Role: role });
            return access;
        },
    };
}

function sourceRecord(): WorkingRecord {
    return new WorkingRecord(new WorkingRecordIdentity('Content Source', 'https://example.com', 'SRC-1'));
}

/** Stub the configuration resolver so these tests need no database. */
function stubResolver(overrides: Record<string, unknown> = {}): void {
    vi.spyOn(ContentSourceConfigurationResolver.prototype, 'Resolve').mockResolvedValue({
        ContentSourceID: 'SRC-1',
        URL: 'https://example.com',
        Settings: { DiscoverDriverKey: 'TestDiscover' },
        Parameters: {},
        Configuration: {},
        DeclaredFields: [],
        Problems: [],
        IsValid: true,
        ...overrides,
    } as never);
}

beforeEach(() => {
    items = [];
    progress.length = 0;
    sawSignalAbortedAt = null;
    abortAfterItem = null;
    vi.restoreAllMocks();
});

describe('DiscoverStage', () => {
    it('turns each found item into a child working record', async () => {
        stubResolver();
        items = [{ URL: 'https://example.com/a' }, { URL: 'https://example.com/b' }];
        const record = sourceRecord();
        const outcome = await new DiscoverStage().Run(record, contextWith());
        expect(outcome.Status).toBe('Complete');
        expect(record.Children.map((c) => c.Identity.EphemeralID)).toEqual([
            'https://example.com/a',
            'https://example.com/b',
        ]);
    });

    it('gives children an EPHEMERAL identity — they are not persisted yet', async () => {
        stubResolver();
        items = [{ URL: 'https://example.com/a' }];
        const record = sourceRecord();
        await new DiscoverStage().Run(record, contextWith());
        expect(record.Children[0].Identity.IsPersisted).toBe(false);
        expect(record.Children[0].Identity.Key).toBe('https://example.com/a');
    });

    it('tags each proposed field with the driver that found it, at its own confidence', async () => {
        stubResolver();
        items = [{ URL: 'https://example.com/a', Fields: [{ Field: 'Title', Value: 'From listing', Confidence: 3 }] }];
        const record = sourceRecord();
        await new DiscoverStage().Run(record, contextWith());
        const child = record.Children[0];
        expect(child.Get('Title')).toBe('From listing');
        expect(child.GetField('Title')?.Confidence).toBe(3);
        expect(child.GetField('Title')?.SetBy).toBe('Discover.TestDiscover');
    });

    it('raises the completion signal for an item that already carries everything', async () => {
        stubResolver();
        items = [{ URL: 'https://example.com/a', Complete: true }, { URL: 'https://example.com/b' }];
        const record = sourceRecord();
        await new DiscoverStage().Run(record, contextWith());
        expect(record.Children[0].IsComplete).toBe(true);
        expect(record.Children[1].IsComplete).toBe(false);
    });

    it('reports how many items it found', async () => {
        stubResolver();
        items = [{ URL: 'https://example.com/a' }];
        await new DiscoverStage().Run(sourceRecord(), contextWith());
        expect(progress.at(-1)).toBe('found 1 item(s)');
    });

    it('records the item count on the source record', async () => {
        stubResolver();
        items = [{ URL: 'a' }, { URL: 'b' }, { URL: 'c' }];
        const record = sourceRecord();
        await new DiscoverStage().Run(record, contextWith());
        expect(record.GetExtension<number>('Discover', 'itemCount')).toBe(3);
    });
});

describe('DiscoverStage — stopping', () => {
    it('stops cleanly mid-walk and returns Retry, keeping what it already found', async () => {
        stubResolver();
        items = [{ URL: 'a' }, { URL: 'b' }, { URL: 'c' }];
        const controller = new AbortController();
        abortAfterItem = { Index: 1, Controller: controller };
        const record = sourceRecord();

        const outcome = await new DiscoverStage().Run(record, contextWith(controller.signal));

        // Stopping is not a failure: what was found stays on the record and the run can resume.
        expect(outcome.Status).toBe('Retry');
        expect(record.Children).toHaveLength(1);
        expect(record.Children[0].Identity.EphemeralID).toBe('a');
    });

    it('does not open the source at all when already cancelled', async () => {
        stubResolver();
        items = [{ URL: 'a' }];
        const controller = new AbortController();
        controller.abort();
        const record = sourceRecord();
        const outcome = await new DiscoverStage().Run(record, contextWith(controller.signal));
        expect(outcome.Status).toBe('Retry');
        expect(record.Children).toHaveLength(0);
    });
});

describe('DiscoverStage — configuration failures are fatal', () => {
    it('refuses a source that does not meet its type declaration', async () => {
        stubResolver({ IsValid: false, Problems: [{ Key: 'URL', Message: 'Feed URL is required' }] });
        await expect(new DiscoverStage().Run(sourceRecord(), contextWith())).rejects.toThrow(/Feed URL is required/);
    });

    it('refuses a source naming no Discover driver', async () => {
        stubResolver({ Settings: {} });
        await expect(new DiscoverStage().Run(sourceRecord(), contextWith())).rejects.toThrow(/No Discover driver/);
    });

    it('refuses a driver key nothing registered', async () => {
        stubResolver({ Settings: { DiscoverDriverKey: 'NotRegistered' } });
        await expect(new DiscoverStage().Run(sourceRecord(), contextWith())).rejects.toThrow(/is not registered/);
    });

    it('refuses a Content Source that has not been persisted', async () => {
        stubResolver();
        const unsaved = new WorkingRecord(new WorkingRecordIdentity('Content Source', 'https://example.com'));
        await expect(new DiscoverStage().Run(unsaved, contextWith())).rejects.toThrow(/not been persisted/);
    });
});

describe('discovery can need credentials too', () => {
    beforeEach(() => {
        stubResolver();
        seenRequests.length = 0;
    });

    it('asks for a session for the source it is about to walk', async () => {
        // An intranet site or an authenticated feed cannot even be ENUMERATED anonymously, so the
        // session has to reach the walk and not only the later fetch of each item.
        accessRequests.length = 0;
        await new DiscoverStage().Run(sourceRecord(), contextWith());
        expect(accessRequests).toEqual([{ ContentSourceID: 'SRC-1', Role: undefined }]);
    });

    it('hands the artifact to the driver', async () => {
        accessRequests.length = 0;
        const artifact = { Headers: { Authorization: 'Bearer token' } };
        await new DiscoverStage().Run(sourceRecord(), contextWith(undefined, artifact));
        expect(seenRequests.at(-1)?.Access).toBe(artifact);
    });

    it('passes null through for a source that needs none, which is the ordinary case', async () => {
        await new DiscoverStage().Run(sourceRecord(), contextWith());
        expect(seenRequests.at(-1)?.Access).toBeNull();
    });
});
