/**
 * @fileoverview A driver fetches a page of its own locators in one session (5.8).
 *
 * The processor hands the first stage a whole page before running it (`Prepare`); Extract uses that to call a
 * driver's `FetchBatch` once per source, and each item then reads what came back for it instead of fetching
 * alone. An item the batch did not return is fetched alone; one the batch failed fails or retries alone.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { AutotagBase } from '@memberjunction/content-autotagging';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { HttpError } from '@memberjunction/network-utils';
import {
    BasePipelineStage,
    LocatorBatchFetchRequest,
    LocatorBatchFetchResult,
    LocatorFetchRequest,
    LocatorFetchResponse,
    Outcome,
    StageContext,
    StageOutcome,
    WorkingRecord,
    WorkingRecordEntity,
    WorkingRecordIdentity,
} from '@memberjunction/content-pipeline-base';
const fetchContent = vi.hoisted(() => vi.fn());
vi.mock('../ContentFetcher.js', () => ({ FetchContent: fetchContent }));

import { ExtractStage } from '../stages/ExtractStage.js';
import { ContentSourceConfigurationResolver } from '../ContentSourceConfigurationResolver.js';
import { PipelineProcessor } from '../PipelineProcessor.js';
import type { WorkingRecordCommitter } from '../WorkingRecordCommitter.js';
import type { WorkingRecordHydrator } from '../WorkingRecordHydrator.js';

const batches: LocatorBatchFetchRequest[] = [];
const singles: string[] = [];
/** What the batch returns for each locator; a locator left out is not returned at all. */
let batchAnswers: Record<string, 'ok' | 'gone' | 'flaky'> = {};

@RegisterClass(AutotagBase, 'BatchDriver')
class BatchDriver extends AutotagBase {
    public async SetContentItemsToProcess(): Promise<never[]> {
        return [];
    }
    public async Autotag(): Promise<number> {
        return 0;
    }
    public async Fetch(request: LocatorFetchRequest): Promise<LocatorFetchResponse> {
        singles.push(request.URL);
        return { Content: new TextEncoder().encode(`alone: ${request.URL}`), ResolvedURL: `${request.URL}.txt` };
    }
    public async FetchBatch(request: LocatorBatchFetchRequest): Promise<LocatorBatchFetchResult[]> {
        batches.push(request);
        return request.URLs.filter((url) => batchAnswers[url]).map((url) => {
            const answer = batchAnswers[url];
            if (answer === 'gone') {
                return { URL: url, Error: new HttpError('Request failed with status code 404', { Status: 404, Url: url, Method: 'GET' }) };
            }
            if (answer === 'flaky') {
                return { URL: url, Error: new Error('connection reset') };
            }
            return { URL: url, Response: { Content: new TextEncoder().encode(`batched: ${url}`), ResolvedURL: `${url}.txt` } };
        });
    }
}

function context(): StageContext {
    return {
        ContextUser: {} as never,
        Provider: {} as never,
        Configuration: {},
        IsTest: false,
        Signal: new AbortController().signal,
        ReportProgress: () => {},
        Log: { Info: () => {}, Warning: () => {}, Error: () => {} },
        ResolveAccess: async () => null,
    };
}

function item(url: string): WorkingRecord {
    const record = new WorkingRecord(new WorkingRecordIdentity('Content Item', url, `ID-${url}`));
    record.SetExtension('Pipeline', 'contentSourceID', 'SRC-1');
    return record;
}

beforeEach(() => {
    vi.restoreAllMocks();
    batches.length = 0;
    singles.length = 0;
    batchAnswers = {};
    fetchContent.mockReset();
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'GetContentSourceByID').mockReturnValue(undefined);
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'ContentFileTypes', 'get').mockReturnValue([
        { Name: 'Text', FileExtension: '.txt', ByteSignature: null, IsText: true, ExtractorKey: 'PlainText' },
    ] as never);
    vi.spyOn(ContentSourceConfigurationResolver.prototype, 'Resolve').mockResolvedValue({
        ContentSourceID: 'SRC-1',
        URL: 'store://root',
        Settings: {},
        DriverClass: 'BatchDriver',
        Parameters: {},
        Configuration: {},
        TypeConfiguration: {},
        Problems: [],
        IsValid: true,
    } as never);
});

describe('Extract fetching a page in one session', () => {
    it("fetches the page's items with one batch call, and each item reads its own bytes", async () => {
        batchAnswers = { 'store://a': 'ok', 'store://b': 'ok' };
        const records = [item('store://a'), item('store://b')];
        const stage = new ExtractStage();

        await stage.Prepare(records, context());
        for (const record of records) {
            expect((await stage.Run(record, context())).Status).toBe('Complete');
        }

        expect(batches).toHaveLength(1);
        expect(batches[0].URLs).toEqual(['store://a', 'store://b']);
        expect(singles).toEqual([]);
        expect(records.map((r) => r.Get('Text'))).toEqual(['batched: store://a', 'batched: store://b']);
    });

    it('fetches alone an item the batch did not return', async () => {
        batchAnswers = { 'store://a': 'ok' };
        const records = [item('store://a'), item('store://b')];
        const stage = new ExtractStage();

        await stage.Prepare(records, context());
        await stage.Run(records[1], context());

        expect(singles).toEqual(['store://b']);
        expect(records[1].Get('Text')).toBe('alone: store://b');
    });

    it('fails an item the batch reported gone, and retries one whose fetch failed in passing', async () => {
        batchAnswers = { 'store://gone': 'gone', 'store://flaky': 'flaky' };
        const gone = item('store://gone');
        const flaky = item('store://flaky');
        const stage = new ExtractStage();

        await stage.Prepare([gone, flaky], context());

        await expect(stage.Run(gone, context())).rejects.toThrow(/Cannot fetch 'store:\/\/gone'/);
        await expect(stage.Run(flaky, context())).rejects.toThrow(/Fetching 'store:\/\/flaky' failed/);
        expect(singles).toEqual([]);
    });

    it('leaves items whose bytes are kept out of the batch', async () => {
        const kept = item('store://kept');
        kept.SetExtension('Pipeline', 'fileID', 'FILE-1');

        await new ExtractStage().Prepare([kept], context());

        expect(batches).toHaveLength(0);
    });
});

// ─── the processor ────────────────────────────────────────────────────────────────────────────────────

const prepared: string[][] = [];
const ran: string[] = [];

@RegisterClass(BasePipelineStage, 'PreparingStage')
class PreparingStage extends BasePipelineStage {
    public readonly Name = 'PreparingStage';
    public readonly Entity: WorkingRecordEntity = 'Content Item';
    public readonly StatusField = 'ExtractionStatus';
    public override async Prepare(records: readonly WorkingRecord[]): Promise<void> {
        prepared.push(records.map((r) => r.Identity.RecordID!));
    }
    public async Run(record: WorkingRecord): Promise<StageOutcome> {
        ran.push(record.Identity.RecordID!);
        return Outcome.Complete();
    }
}

describe('a stage with a bulk step', () => {
    it('gets the whole page before any record runs, then each record is finished on its own', async () => {
        prepared.length = 0;
        ran.length = 0;
        const commits: string[] = [];
        const processor = new PipelineProcessor(
            { Stages: ['PreparingStage'], IsTest: false, Configuration: {} },
            {
                Hydrator: () =>
                    ({ Hydrate: async (_e: WorkingRecordEntity, id: string) => new WorkingRecord(new WorkingRecordIdentity('Content Item', `u/${id}`, id)) }) as unknown as WorkingRecordHydrator,
                Committer: () =>
                    ({
                        Commit: async (record: WorkingRecord, _field: string | null, status: string | null) => {
                            commits.push(`${record.Identity.RecordID}=${status}`);
                            return { RecordID: record.Identity.RecordID, ColumnsWritten: [], Created: false };
                        },
                    }) as unknown as WorkingRecordCommitter,
            },
        );

        expect(processor.ProcessBatch).toBeDefined();
        const results = await processor.ProcessBatch!(
            [{ RecordID: 'A' }, { RecordID: 'B' }] as never,
            { Provider: {}, ContextUser: {} } as never,
        );

        expect(prepared).toEqual([['A', 'B']]);
        expect(ran).toEqual(['A', 'B']);
        expect(commits).toEqual(['A=Complete', 'B=Complete']);
        expect([...results.values()].every((r) => r.Status === 'Succeeded')).toBe(true);
    });
});
