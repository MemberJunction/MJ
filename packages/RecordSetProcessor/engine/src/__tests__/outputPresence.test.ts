/**
 * Unit tests for the write-back's output check. Only a processor that records its answers as Feature Values (Infer) is
 * checked: a target that looks missing (a null mapped field, no child row) counts as missing only when the record's
 * latest Pipeline answer for it is non-empty, i.e. the output was deleted or cleared since it was written. Every read
 * of a batch is one `RunViews` call. No database — the provider double answers the views.
 */

import { describe, it, expect, vi } from 'vitest';
import { EntityInfo, UserInfo, type RunViewParams, type RunViewResult } from '@memberjunction/core';
import { FeatureValueCacheService, type DataFeatureOutput, type DataFeatureSpec, type FeatureValueOutputItem } from '@memberjunction/feature-pipelines';
import type { IRecordProcessor, RecordProcessorContext, RecordRef, RecordResult } from '@memberjunction/record-set-processor-base';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import { WriteBackProcessor } from '../processors/WriteBackProcessor';
import { WatermarkService } from '../watermark/WatermarkService';
import type { OutputMappingConfig } from '../writeBack';
import { OutputPresenceReadError } from '../outputPresence';
import { InferProcessor } from '../processors/InferProcessor';

const USER = new UserInfo();
const PIPELINE = 'RP-PIPELINE';
const PEOPLE = new EntityInfo({
    ID: 'ENT-PEOPLE', Name: 'People',
    Fields: [
        { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
        { Name: 'SeniorityLevelID', Type: 'uniqueidentifier', RelatedEntity: 'Seniority Levels' },
        { Name: 'Nickname', Type: 'nvarchar' },
    ],
});
const PJF = new EntityInfo({
    ID: 'ENT-PJF', Name: 'Person Job Functions',
    Fields: [{ Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true }, { Name: 'PersonID', Type: 'uniqueidentifier' }, { Name: 'JobFunctionID', Type: 'uniqueidentifier' }],
});
const LEVELS = new EntityInfo({
    ID: 'ENT-LEVELS', Name: 'Seniority Levels',
    Fields: [{ Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true }, { Name: 'Name', Type: 'nvarchar' }],
});
const DIRECTOR_ID = 'DDDDDDDD-0000-4000-8000-000000000001';

/** The QA pipeline's mapping: a looked-up field on the person and reconciled job-function child rows. */
const MAPPING: OutputMappingConfig = {
    fields: { seniorityLevelID: '$.SeniorityLevel' },
    fieldLookups: { SeniorityLevelID: { matchField: 'Name', onLookupMiss: 'fail' } },
    childRecords: [{ entity: 'Person Job Functions', parentField: 'PersonID', fanOutRef: '$.Functions', map: { JobFunctionID: '$.JobFunctionID' } }],
};
/** The spec outputs that write the mapping's targets, as an Infer pipeline records them. */
const OUTPUTS: DataFeatureOutput[] = [
    { Name: 'SeniorityLevel', Ref: '$.SeniorityLevel', Target: { Mode: 'field', EntityFieldName: 'SeniorityLevelID' } },
    { Name: 'JobFunctions', Ref: '$.Functions', Target: { Mode: 'child', EntityName: 'Person Job Functions', ParentField: 'PersonID', Map: { JobFunctionID: '$.JobFunctionID' }, FanOutRef: 'Functions' } },
];

const P1 = 'AAAAAAAA-0000-4000-8000-000000000001';
const P2 = 'AAAAAAAA-0000-4000-8000-000000000002';
const P3 = 'AAAAAAAA-0000-4000-8000-000000000003';
const recordOf = (id: string): RecordRef => ({ EntityID: PEOPLE.ID, RecordID: id.toLowerCase() });
const records: RecordRef[] = [P1, P2, P3].map(recordOf);

type Row = Record<string, string | null>;
const viewResult = (rows: Row[]): RunViewResult<Row> => ({ Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' });
/** A recorded Pipeline answer row (the database's upper-case IDs); `json` for an array answer, else text. */
const answer = (recordID: string, feature: string, value: { Text?: string; JSON?: string } | null): Row => ({
    RecordID: recordID, FeatureName: feature, ValueText: value?.Text ?? null, ValueNumeric: null, ValueBoolean: null, ValueDate: null, ValueJSON: value?.JSON ?? null,
});

/** The rows each entity's view answers with. */
interface Tables { People?: Row[]; Children?: Row[]; Answers?: Row[]; Levels?: Row[] }

/** A provider whose batched views answer from `tables`; single views serve the seniority lookup. */
function providerWith(tables: Tables) {
    const provider = new EntitiesOnlyProvider([PEOPLE, PJF, LEVELS]);
    const rowsOf = (p: RunViewParams): Row[] => {
        switch (p.EntityName) {
            case 'People': return tables.People || [];
            case 'Person Job Functions': return tables.Children || [];
            case 'MJ: Feature Values': return tables.Answers || [];
            default: return [];
        }
    };
    const runViews = vi.spyOn(provider, 'RunViews').mockImplementation(async (params: RunViewParams[]) => params.map((p) => viewResult(rowsOf(p))));
    const runView = vi.spyOn(provider, 'RunView').mockImplementation(async (p: RunViewParams) =>
        viewResult(p.EntityName === 'Seniority Levels' ? (tables.Levels || []).filter((l) => (typeof p.ExtraFilter === 'string' ? p.ExtraFilter : '').includes(`'${l.Name}'`)) : rowsOf(p)));
    return { provider, runViews, runView };
}

/** An Infer-like inner processor: it records its answers as Feature Values. */
const recording = { ProcessRecord: async (): Promise<RecordResult> => ({ Status: 'Succeeded' }), RecordedAnswerOutputs: (): DataFeatureOutput[] => OUTPUTS };
/** An Action-like inner processor: it records no answers. */
const action: IRecordProcessor = { ProcessRecord: async (): Promise<RecordResult> => ({ Status: 'Succeeded' }) };
const contextOf = (provider: EntitiesOnlyProvider): RecordProcessorContext => ({ contextUser: USER, provider, entityID: PEOPLE.ID, recordProcessID: PIPELINE });
const check = (inner: IRecordProcessor, provider: EntitiesOnlyProvider, mapping: OutputMappingConfig = MAPPING, rs: RecordRef[] = records) =>
    new WriteBackProcessor(inner, mapping).RecordsWithOutputs(rs, contextOf(provider));

describe('WriteBackProcessor.RecordsWithOutputs of a processor that records its answers', () => {
    it('counts a record whose targets hold values as having its outputs, without resolving its answers', async () => {
        const { provider, runView } = providerWith({
            People: [{ ID: P1, SeniorityLevelID: DIRECTOR_ID }], Children: [{ PersonID: P1 }],
            Answers: [answer(P1, 'SeniorityLevel', { Text: 'Chief Wizard' })],
        });
        expect([...(await check(recording, provider, MAPPING, [recordOf(P1)]))]).toEqual([P1.toLowerCase()]);
        expect(runView).not.toHaveBeenCalled();
    });

    it('counts an answer recorded empty as present: a null field answered null, no child rows answered [] or null', async () => {
        const { provider } = providerWith({
            People: [{ ID: P1, SeniorityLevelID: null }, { ID: P2, SeniorityLevelID: DIRECTOR_ID }, { ID: P3, SeniorityLevelID: DIRECTOR_ID }],
            Children: [{ PersonID: P1 }],
            Answers: [answer(P1, 'SeniorityLevel', null), answer(P2, 'JobFunctions', { JSON: '[]' }), answer(P3, 'JobFunctions', null)],
        });
        const present = await check(recording, provider);
        expect([...present].sort()).toEqual([P1.toLowerCase(), P2.toLowerCase(), P3.toLowerCase()]);
    });

    it('counts a field answer whose lookup misses (the stored form is null) as present', async () => {
        const { provider } = providerWith({
            People: [{ ID: P1, SeniorityLevelID: null }], Children: [{ PersonID: P1 }],
            Answers: [answer(P1, 'SeniorityLevel', { Text: 'Chief Wizard' })], Levels: [{ ID: DIRECTOR_ID, Name: 'Director' }],
        });
        expect([...(await check(recording, provider, MAPPING, [recordOf(P1)]))]).toEqual([P1.toLowerCase()]);
    });

    it('resolves each distinct unmatched field answer once per batch, however many records share it', async () => {
        const { provider, runView } = providerWith({
            People: [P1, P2, P3].map((id) => ({ ID: id, SeniorityLevelID: null })),
            Children: [P1, P2, P3].map((id) => ({ PersonID: id })),
            Answers: [P1, P2, P3].map((id) => answer(id, 'SeniorityLevel', { Text: 'Chief Wizard' })),
            Levels: [{ ID: DIRECTOR_ID, Name: 'Director' }],
        });
        const present = await check(recording, provider);
        expect(present.size).toBe(3);
        expect(runView.mock.calls.filter(([p]) => p.EntityName === 'Seniority Levels')).toHaveLength(1);
    });

    it('counts a target deleted after a non-empty answer as missing: the field cleared, the child rows deleted', async () => {
        const { provider } = providerWith({
            People: [{ ID: P1, SeniorityLevelID: null }, { ID: P2, SeniorityLevelID: DIRECTOR_ID }],
            Children: [{ PersonID: P1 }],
            Answers: [
                answer(P1, 'SeniorityLevel', { Text: 'Director' }),
                answer(P2, 'JobFunctions', { JSON: '[{"JobFunctionID":"JF-1"}]' }),
            ],
            Levels: [{ ID: DIRECTOR_ID, Name: 'Director' }],
        });
        expect((await check(recording, provider, MAPPING, [recordOf(P1), recordOf(P2)])).size).toBe(0);
    });

    it('reads the newest answer of each record and feature', async () => {
        const { provider } = providerWith({
            People: [{ ID: P1, SeniorityLevelID: DIRECTOR_ID }],
            // newest first, as the view orders them: the latest answer was [], an older one was not
            Answers: [answer(P1, 'JobFunctions', { JSON: '[]' }), answer(P1, 'JobFunctions', { JSON: '[{"JobFunctionID":"JF-1"}]' })],
        });
        expect([...(await check(recording, provider, MAPPING, [recordOf(P1)]))]).toEqual([P1.toLowerCase()]);
    });

    it('counts a missing target with no recorded answer as missing', async () => {
        const { provider } = providerWith({ People: [{ ID: P1, SeniorityLevelID: DIRECTOR_ID }] });
        expect((await check(recording, provider, MAPPING, [recordOf(P1)])).size).toBe(0);
    });

    it('reads targets and answers for the batch in one batched view call', async () => {
        const { provider, runViews } = providerWith({});
        await check(recording, provider);
        expect(runViews).toHaveBeenCalledTimes(1);
        const [fieldsView, childView, answersView] = runViews.mock.calls[0][0];
        expect(fieldsView).toMatchObject({ EntityName: 'People', Fields: ['ID', 'SeniorityLevelID'] });
        expect(fieldsView.ExtraFilter).toBe(`ID IN (${records.map((r) => `'${r.RecordID}'`).join(', ')})`);
        expect(childView).toMatchObject({ EntityName: 'Person Job Functions', Fields: ['PersonID'] });
        expect(childView.ExtraFilter).toBe(`PersonID IN (${records.map((r) => `'${r.RecordID}'`).join(', ')})`);
        expect(answersView).toMatchObject({ EntityName: 'MJ: Feature Values', OrderBy: 'ComputedAt DESC, __mj_CreatedAt DESC, ID DESC' });
        expect(answersView.ExtraFilter).toContain(`RecordProcessID = '${PIPELINE}'`);
        expect(answersView.ExtraFilter).toContain(`Source = 'Pipeline'`);
        expect(answersView.ExtraFilter).toContain(`FeatureName IN ('SeniorityLevel', 'JobFunctions')`);
    });

    it('does not check a field no recorded output writes', async () => {
        const { provider, runViews } = providerWith({ People: [{ ID: P1, Nickname: null }] });
        expect((await check(recording, provider, { fields: { Nickname: '$.nickname' } })).size).toBe(3);
        expect(runViews).not.toHaveBeenCalled();
    });

    it('does not check a child mapping no recorded output writes (another entity or parent field)', async () => {
        const { provider, runViews } = providerWith({});
        const otherParent: OutputMappingConfig = { childRecords: [{ entity: 'Person Job Functions', parentField: 'ManagerID', map: {} }] };
        const otherEntity: OutputMappingConfig = { childRecords: [{ entity: 'Person Skills', parentField: 'PersonID', map: {} }] };
        expect((await check(recording, provider, otherParent)).size).toBe(3);
        expect((await check(recording, provider, otherEntity)).size).toBe(3);
        expect(runViews).not.toHaveBeenCalled();
    });

    it('does not check outside a pipeline run (no pipeline or entity in the context)', async () => {
        const { provider, runViews } = providerWith({});
        const present = await new WriteBackProcessor(recording, MAPPING).RecordsWithOutputs(records, { contextUser: USER, provider });
        expect(present.size).toBe(3);
        expect(runViews).not.toHaveBeenCalled();
    });

    it('counts every record as having its outputs, without a read, when the mapping writes only tags', async () => {
        const { provider, runViews } = providerWith({});
        const present = await check(recording, provider, { tags: [{ ref: '$.tags', rootTagId: 'ROOT' }] });
        expect(present.size).toBe(3);
        expect(runViews).not.toHaveBeenCalled();
    });

    it('throws when a view fails, naming it, so the gate processes the batch instead of skipping it', async () => {
        const provider = new EntitiesOnlyProvider([PEOPLE, PJF, LEVELS]);
        vi.spyOn(provider, 'RunViews').mockResolvedValue([viewResult([]), { ...viewResult([]), Success: false, ErrorMessage: 'boom' }, viewResult([])]);
        await expect(check(recording, provider)).rejects.toThrow(/Person Job Functions.*boom/);
    });

    it('refuses a child mapping whose parent field is not a plain identifier, naming the output check', async () => {
        const { provider } = providerWith({});
        const unsafe: OutputMappingConfig = { childRecords: [{ entity: 'Person Job Functions', parentField: 'PersonID; DROP', map: {} }] };
        await expect(check(recording, provider, unsafe)).rejects.toThrow(/^invalid parentField identifier 'PersonID; DROP'/);
    });
});

describe('OutputMappingPresence errors', () => {
    it('throws the typed read error when the records\' entity is not in metadata', async () => {
        const { provider } = providerWith({});
        await expect(check(recording, provider, MAPPING, [{ EntityID: 'ENT-UNKNOWN', RecordID: 'r-1' }])).rejects.toBeInstanceOf(OutputPresenceReadError);
    });
});

describe('WriteBackProcessor.RecordsWithOutputs of a processor that records no answers (Action, Agent, registry)', () => {
    it('does not check outputs: every record counts as having them and nothing is read', async () => {
        const { provider, runViews } = providerWith({ People: [{ ID: P1, SeniorityLevelID: null }] });
        const present = await check(action, provider);
        expect(present.size).toBe(3);
        expect(runViews).not.toHaveBeenCalled();
    });

    it('is skipped on its watermark as before when its mapped field is null', async () => {
        const { provider, runViews, runView } = providerWith({ People: [{ ID: P1, SeniorityLevelID: null }] });
        runView.mockResolvedValue(viewResult([{ RecordID: P1.toLowerCase(), Hash: 'hash-1' }]));
        const hashing: IRecordProcessor & { ComputeBasisHash: () => Promise<string> } = { ...action, ComputeBasisHash: async () => 'hash-1' };
        const processor = new WriteBackProcessor(hashing, MAPPING);
        const decisions = await WatermarkService.Instance.CheckBatchWatermarks({
            recordProcessID: PIPELINE, entityID: PEOPLE.ID, records: [recordOf(P1)], strategy: 'Checksum', skipUnchanged: true,
            processor, contextUser: USER, provider, ProcessorContext: contextOf(provider),
        });
        expect(decisions.get(P1.toLowerCase())?.shouldSkip).toBe(true);
        expect(runViews).not.toHaveBeenCalled();
    });
});

describe('the watermark gate over a confidence-floor abstention (lanes A and F together)', () => {
    /** The job-title spec: SeniorityLevel has a 'null' floor, so a below-floor answer is withheld and recorded with no value. */
    const FLOORED: DataFeatureSpec = {
        Name: 'JT', Description: 'jt', PromptID: 'PROMPT-1', Context: { Fields: ['CurrentJobTitle'] },
        Caching: { Cacheable: true, KeyFields: ['CurrentJobTitle'], Scope: 'pipeline' },
        Outputs: [{ ...OUTPUTS[0], ConfidenceRef: '$.SeniorityConfidence', MinConfidence: 0.5, OnLowConfidence: 'null' }, OUTPUTS[1]],
    };
    /** The Feature Value row an output's value is stored as: the cache service's own column conversion. */
    const stored = (recordID: string, feature: string, value: FeatureValueOutputItem['Value']): Row => {
        const typed = FeatureValueCacheService.ToTypedValue(value);
        return { RecordID: recordID, FeatureName: feature, ValueText: typed.ValueText, ValueNumeric: null, ValueBoolean: null, ValueDate: null, ValueJSON: typed.ValueJSON };
    };

    it('skips the abstained record (its recorded answer is "nothing") and re-derives the one whose pipeline-written value was deleted', async () => {
        const { provider, runView } = providerWith({
            // P1 abstained: seniority withheld (null) and no job functions ([]), both targets empty. P2's Director was deleted.
            People: [{ ID: P1, SeniorityLevelID: null }, { ID: P2, SeniorityLevelID: null }],
            Children: [{ PersonID: P2 }],
            Answers: [stored(P1, 'SeniorityLevel', null), stored(P1, 'JobFunctions', []), stored(P2, 'SeniorityLevel', 'Director'), stored(P2, 'JobFunctions', [{ JobFunctionID: 'JF-1' }])],
            Levels: [{ ID: DIRECTOR_ID, Name: 'Director' }],
        });
        // both records' inputs are unchanged since their last run
        runView.mockImplementation(async (p: RunViewParams) => viewResult(p.EntityName === 'Seniority Levels'
            ? [{ ID: DIRECTOR_ID, Name: 'Director' }]
            : [{ RecordID: P1.toLowerCase(), Hash: 'hash-1' }, { RecordID: P2.toLowerCase(), Hash: 'hash-1' }]));
        const infer = new InferProcessor('PROMPT-1', undefined, FLOORED, null);
        const hashing = Object.assign(infer, { ComputeBasisHash: async (): Promise<string> => 'hash-1' });
        const processor = new WriteBackProcessor(hashing, MAPPING);

        const decisions = await WatermarkService.Instance.CheckBatchWatermarks({
            recordProcessID: PIPELINE, entityID: PEOPLE.ID, records: [recordOf(P1), recordOf(P2)], strategy: 'Checksum', skipUnchanged: true,
            processor, contextUser: USER, provider, ProcessorContext: contextOf(provider),
        });

        expect(decisions.get(P1.toLowerCase())?.shouldSkip).toBe(true);
        expect(decisions.get(P2.toLowerCase())?.shouldSkip).toBe(false);
    });
});
