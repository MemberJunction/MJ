/**
 * PR 5 milestone B1 — attack 8 (owner-batch item 1, D5-21) and the write-back half of attack 13 (F-015).
 *
 * Attack 8: an `InferProcessor` run passes `inputAsOf` = the input record's `__mj_UpdatedAt` as the run loop read it, so
 * the derived value is effective from the instant its input took its value; a record with no `__mj_UpdatedAt` passes
 * none and the service falls back to the computation time (the service half is in
 * `FeaturePipelines/src/__tests__/feature-value-effective-dating.test.ts`).
 *
 * Attack 13: the pipeline's own write-back never records itself as Human (the guard compares the field with what the
 * pipeline last wrote), and a person's edit between two runs is recorded through `RecordHumanValue` (dated by the
 * service at the record's `__mj_UpdatedAt`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityInfo, UserInfo } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import type { AIPromptParams, AIPromptRunResult, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { ChatResult } from '@memberjunction/ai';
import type { RecordProcessorContext, RecordRef } from '@memberjunction/record-set-processor-base';
import type { HumanValueQuestion } from '@memberjunction/record-set-processor';
import { FeaturePipelineVersionService, FeatureValueCacheService, type DataFeatureSpec, type RecordFeatureValuesOutcome } from '@memberjunction/feature-pipelines';
import { KnowledgeHubMetadataEngine, type MJFeatureValueCacheEntity } from '@memberjunction/core-entities';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import { InferProcessor } from '../processors/InferProcessor';
import { FeaturePipelineHumanValueGuard } from '../processors/FeaturePipelineHumanValueGuard';

type PromptDouble = Pick<MJAIPromptEntityExtended, 'ID' | 'Name' | 'TemplateText' | 'ValidationBehavior'>;
const asPrompt = (p: PromptDouble): MJAIPromptEntityExtended => p as MJAIPromptEntityExtended;

const USER = new UserInfo();
const PEOPLE = new EntityInfo({ ID: 'ENT-P', Name: 'People', Fields: [{ Name: 'Title', TSType: 'string' }] });
const provider = new EntitiesOnlyProvider([PEOPLE]);
const context: RecordProcessorContext = { ContextUser: USER, RecordProcessID: 'rp-1', EntityID: 'ENT-P', ProcessRunID: 'run-1', Provider: provider };
const EDITED_AT = new Date('2026-02-14T10:30:00.000Z');
const OUTCOME: RecordFeatureValuesOutcome = { Upserted: 1, Unchanged: 0, Closed: 0, Previous: {} };

const spec: DataFeatureSpec = {
    Name: 'Level', Description: 'level', PromptID: 'PROMPT-1', Context: { Fields: ['Title'] },
    Caching: { Cacheable: true, KeyFields: ['Title'], Scope: 'pipeline' },
    Outputs: [{ Name: 'JobTitleLevel', Ref: '$.Level', Constraint: { Type: 'enum', Values: ['Director', 'Manager', 'VP'], OnViolation: 'fail' } }],
};

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'FeaturePipelineTypes', 'get').mockReturnValue([]);
    vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([asPrompt({ ID: 'PROMPT-1', Name: 'L', TemplateText: 'Title {{record.Title}} {{ ConstraintBlock }}', ValidationBehavior: 'Strict' })]);
    vi.spyOn(AIPromptRunner.prototype, 'ExecutePrompt').mockImplementation(async (_p: AIPromptParams): Promise<AIPromptRunResult> =>
        ({ success: true, result: { Level: 'Director' }, chatResult: new ChatResult(true, new Date(), new Date()) }));
    vi.spyOn(FeatureValueCacheService.Instance, 'Lookup').mockResolvedValue(null);
    vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
    vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockResolvedValue({ ID: 'cache-1' } as MJFeatureValueCacheEntity);
    vi.spyOn(FeaturePipelineVersionService.Instance, 'ResolveForRun').mockResolvedValue({ Version: 1, Status: 'Active' });
});

/** Runs the processor over one record and returns the inputAsOf its Feature Value write passed. */
async function inputAsOfOf(record: RecordRef): Promise<Date | null | undefined> {
    const write = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(OUTCOME);
    const result = await new InferProcessor('PROMPT-1', undefined, spec, null).ProcessRecord(record, context);
    expect(result.ErrorMessage).toBeUndefined();
    expect(write).toHaveBeenCalledTimes(1);
    return write.mock.calls[0][0].inputAsOf;
}

describe('attack 8: InferProcessor passes the input record\'s __mj_UpdatedAt as inputAsOf (D5-21)', () => {
    it('a record last updated at T writes with inputAsOf = T, not the computation time', async () => {
        expect(await inputAsOfOf({ EntityID: 'ENT-P', RecordID: 'p-1', Record: { ID: 'p-1', Title: 'Director of Sales', __mj_UpdatedAt: EDITED_AT } })).toEqual(EDITED_AT);
    });

    it('reads a stamp the view returned as text, and the field case-insensitively', async () => {
        expect(await inputAsOfOf({ EntityID: 'ENT-P', RecordID: 'p-2', Record: { ID: 'p-2', Title: 'VP', __MJ_UPDATEDAT: EDITED_AT.toISOString() } })).toEqual(EDITED_AT);
    });

    it('a record with no __mj_UpdatedAt passes none (the service falls back to the computation time)', async () => {
        expect(await inputAsOfOf({ EntityID: 'ENT-P', RecordID: 'p-3', Record: { ID: 'p-3', Title: 'Manager' } })).toBeNull();
    });

    it('an unparseable stamp passes none', async () => {
        expect(await inputAsOfOf({ EntityID: 'ENT-P', RecordID: 'p-4', Record: { ID: 'p-4', Title: 'Manager', __mj_UpdatedAt: 'not a date' } })).toBeNull();
    });

    it('InputAsOfOf reads the record the run loop holds', () => {
        expect(InferProcessor.InputAsOfOf({ EntityID: 'ENT-P', RecordID: 'p-5', Record: { __mj_UpdatedAt: EDITED_AT } })).toEqual(EDITED_AT);
        expect(InferProcessor.InputAsOfOf({ EntityID: 'ENT-P', RecordID: 'p-6' })).toBeNull();
    });
});

describe('attack 13 (write-back half): the pipeline\'s own write-back is never Human (F-015)', () => {
    const record: RecordRef = { EntityID: 'ENT-P', RecordID: 'p-1', Record: { ID: 'p-1', JobTitleLevel: 'Director' } };
    const targetSpec: DataFeatureSpec = {
        ...spec, Outputs: [{ Name: 'JobTitleLevel', Ref: '$.Level', Target: { Mode: 'field', EntityFieldName: 'JobTitleLevel' } }],
    };
    const guard = (previous: Record<string, { ValueText: string }>) => new FeaturePipelineHumanValueGuard({
        RecordProcessID: 'rp-1', EntityID: 'ENT-P', Record: record, Context: context, Spec: targetSpec,
        PreviousValues: () => Object.fromEntries(Object.entries(previous).map(([k, v]) => [k, { ValueText: v.ValueText, ValueNumeric: null, ValueBoolean: null, ValueDate: null, ValueJSON: null }])),
    });
    const question = (current: string): HumanValueQuestion => ({
        FieldName: 'JobTitleLevel', CurrentValue: current, Provider: provider,
        Resolve: async (v) => v, Equals: (a, b) => a === b,
    } as HumanValueQuestion);

    it('a field holding what the pipeline last wrote is not human-owned: no Human value is recorded', async () => {
        vi.spyOn(FeatureValueCacheService.Instance, 'GetLatestValue').mockResolvedValue(null);
        const human = vi.spyOn(FeatureValueCacheService.Instance, 'RecordHumanValue').mockResolvedValue(undefined);
        expect(await guard({ JobTitleLevel: { ValueText: 'Director' } }).IsHumanOwned(question('Director'))).toBe(false);
        expect(human).not.toHaveBeenCalled();
    });

    it('a person\'s edit between two runs is human-owned and recorded once through RecordHumanValue', async () => {
        vi.spyOn(FeatureValueCacheService.Instance, 'GetLatestValue').mockResolvedValue(null);
        const human = vi.spyOn(FeatureValueCacheService.Instance, 'RecordHumanValue').mockResolvedValue(undefined);
        const g = guard({ JobTitleLevel: { ValueText: 'Director' } });
        expect(await g.IsHumanOwned(question('Vice President'))).toBe(true);
        await g.RecordPreserved('JobTitleLevel', 'Vice President', provider);
        expect(human).toHaveBeenCalledTimes(1);
        expect(human.mock.calls[0][0]).toMatchObject({ RecordProcessID: 'rp-1', EntityID: 'ENT-P', RecordID: 'p-1', FeatureName: 'JobTitleLevel', Value: 'Vice President' });
    });
});
