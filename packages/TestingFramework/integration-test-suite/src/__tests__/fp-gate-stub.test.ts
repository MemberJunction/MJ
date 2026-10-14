/**
 * The Feature Pipeline gate stub (answer table + driver) and the golden-title copy check, without a database: the gate
 * bundles measure the pipeline only as far as the stub answers deterministically and keeps the driver contract, and
 * the copy check is what keeps the gates' golden titles equal to the installed golden set.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityInfo, InMemoryLocalStorageProvider, UserInfo, type RunViewParams, type RunViewResult } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { BaseFeaturePipelineDriver, type FeaturePipelineComputeHooks, type FeaturePipelineComputeRequest } from '@memberjunction/record-set-processor';
import type { RecordProcessorContext } from '@memberjunction/record-set-processor-base';
import type { GoldenCase } from '@memberjunction/testing-engine';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import { InstrumentedLocalStorageProvider, type IntegrationCheckContext } from '@memberjunction/testing-integration';
import { FeaturePipelineGateFixtures, PREFIX } from '../checks/fp-gates/fp-gate-fixture';
import { FeaturePipelineGateStubDriver, FeaturePipelineGateStubTable } from '../checks/fp-gates/feature-pipeline-gate-stub-driver';
import { GOLDEN_TITLES, GoldenTitleCopy, type GoldenTitle } from '../checks/fp-gates/golden-titles';

const table = FeaturePipelineGateStubTable.Instance;

/** Hooks that record their call order and hand the driver `promptData`. */
function hooks(promptData: Record<string, unknown>, order: string[]): FeaturePipelineComputeHooks {
    return {
        BeforeBuildContext: vi.fn<FeaturePipelineComputeHooks['BeforeBuildContext']>(async () => { order.push('BeforeBuildContext'); }),
        BuildPromptData: vi.fn<FeaturePipelineComputeHooks['BuildPromptData']>(async () => { order.push('BuildPromptData'); return promptData; }),
        BeforePromptExecute: vi.fn<FeaturePipelineComputeHooks['BeforePromptExecute']>(async () => undefined),
        AfterPromptExecute: vi.fn<FeaturePipelineComputeHooks['AfterPromptExecute']>(async (result) => result.result),
    };
}

/** A compute request for one person whose prompt data carries `title` at `record.CurrentJobTitle`. */
function request(promptData: Record<string, unknown>, order: string[] = []): FeaturePipelineComputeRequest {
    const provider = new EntitiesOnlyProvider([]);
    const context: RecordProcessorContext = { contextUser: new UserInfo(provider, { ID: 'U-1', Name: 'Tester' }), provider };
    const prompt = new MJAIPromptEntityExtended(new EntityInfo({ ID: 'E-1', Name: 'MJ: AI Prompts', Fields: [{ Name: 'ID', IsPrimaryKey: true, TSType: 'string' }] }));
    return { Record: { EntityID: 'E-2', RecordID: 'P-1' }, Context: context, Prompt: prompt, Hooks: hooks(promptData, order) };
}

/** The golden-set case an installation carries for one golden title. */
function installedCase(g: GoldenTitle): GoldenCase {
    return { ID: g.ID, Input: { CurrentJobTitle: g.Title }, Expected: { JobFunctions: [...g.Functions], SeniorityLevel: [...g.Seniority] }, LabelSource: 'model-consensus' };
}

describe('FeaturePipelineGateStubTable', () => {
    beforeEach(() => table.Clear());

    it('keys inputs by the Feature Value key normalisation (case, whitespace, NFC)', () => {
        table.Answers.set(FeaturePipelineGateStubTable.KeyOf('Head Cheesemaker'), { SeniorityLevel: 'Manager' });
        expect(table.AnswerFor('  head   CHEESEMAKER ')).toEqual({ SeniorityLevel: 'Manager' });
        expect(FeaturePipelineGateStubTable.KeyOf('Jefe de Producción')).toBe(FeaturePipelineGateStubTable.KeyOf('jefe de producción'));
    });

    it('answers from the degraded table only in degraded mode, and from the golden table otherwise', () => {
        const key = FeaturePipelineGateStubTable.KeyOf('Owner');
        table.Answers.set(key, { SeniorityLevel: 'C-Level' });
        table.Degraded.set(key, { SeniorityLevel: 'Board Member' });
        expect(table.AnswerFor('Owner')).toEqual({ SeniorityLevel: 'C-Level' });
        table.Mode = 'degraded';
        expect(table.AnswerFor('Owner')).toEqual({ SeniorityLevel: 'Board Member' });
        table.Answers.set(FeaturePipelineGateStubTable.KeyOf('Founder'), { SeniorityLevel: 'C-Level' });
        expect(table.AnswerFor('Founder')).toEqual({ SeniorityLevel: 'C-Level' });
    });

    it('falls back only for inputs with no table entry', () => {
        table.Answers.set(FeaturePipelineGateStubTable.KeyOf('Owner'), { Label: 'B' });
        expect(table.AnswerFor('Unknown Title')).toBeUndefined();
        table.Fallback = { Label: 'A' };
        expect(table.AnswerFor('Unknown Title')).toEqual({ Label: 'A' });
        expect(table.AnswerFor('Owner')).toEqual({ Label: 'B' });
    });

    it('ResetCalls keeps the answers; Clear restores every default', () => {
        table.Answers.set('owner', { Label: 'A' });
        table.Calls.push('Owner');
        table.ResetCalls();
        expect(table.Calls).toEqual([]);
        expect(table.Answers.size).toBe(1);
        table.Mode = 'degraded';
        table.InputField = 'Name';
        table.Fallback = { Label: 'A' };
        table.Clear();
        expect([table.Answers.size, table.Degraded.size, table.Fallback, table.InputField, table.Mode]).toEqual([0, 0, undefined, 'CurrentJobTitle', 'golden']);
    });
});

describe('FeaturePipelineGateStubDriver', () => {
    beforeEach(() => table.Clear());

    it('is the class the stub pipeline type names', () => {
        const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseFeaturePipelineDriver>(BaseFeaturePipelineDriver, 'FeaturePipelineGateStubDriver');
        expect(driver).toBeInstanceOf(FeaturePipelineGateStubDriver);
    });

    it('runs BeforeBuildContext then BuildPromptData, logs the input, and answers with a copy of the table entry', async () => {
        const entry = { SeniorityLevel: 'Manager', Functions: [{ JobFunctionID: 'F-1', Confidence: 0.9, Sequence: 1 }] };
        table.Answers.set(FeaturePipelineGateStubTable.KeyOf('Store Manager'), entry);
        const order: string[] = [];

        const result = await new FeaturePipelineGateStubDriver().ComputeOutputs(request({ record: { CurrentJobTitle: 'Store Manager' } }, order));

        expect(order).toEqual(['BeforeBuildContext', 'BuildPromptData']);
        expect(table.Calls).toEqual(['Store Manager']);
        expect(result).toEqual({ Success: true, RawResult: entry });
        expect('RawResult' in result && result.RawResult).not.toBe(entry);
    });

    it('reads the configured input field', async () => {
        table.InputField = 'Name';
        table.Fallback = { Label: 'A' };
        await new FeaturePipelineGateStubDriver().ComputeOutputs(request({ record: { Name: 'Widget', CurrentJobTitle: 'Owner' } }));
        expect(table.Calls).toEqual(['Widget']);
    });

    it('fails the record, naming the input, when the table has no answer', async () => {
        const result = await new FeaturePipelineGateStubDriver().ComputeOutputs(request({ record: { CurrentJobTitle: 'Astronaut' } }));
        expect(result).toEqual({ Success: false, ErrorMessage: "FeaturePipelineGateStubDriver has no answer for 'Astronaut'" });
        expect(table.Calls).toEqual(['Astronaut']);
    });
});

describe('GoldenTitleCopy.Differences', () => {
    const installed = (): GoldenCase[] => GOLDEN_TITLES.map(installedCase);

    it('carries 52 distinct titles', () => {
        expect(GOLDEN_TITLES).toHaveLength(52);
        expect(new Set(GOLDEN_TITLES.map((g) => FeaturePipelineGateStubTable.KeyOf(g.Title))).size).toBe(52);
    });

    it('is empty for the same set', () => {
        expect(GoldenTitleCopy.Differences(GOLDEN_TITLES, installed())).toEqual([]);
    });

    it('reports a different count, a moved title, a changed label and a swapped primary', () => {
        expect(GoldenTitleCopy.Differences(GOLDEN_TITLES, installed().slice(0, 51))).toEqual(['52 titles in the copy, 51 cases installed']);

        const moved = installed();
        [moved[0], moved[1]] = [moved[1], moved[0]];
        expect(GoldenTitleCopy.Differences(GOLDEN_TITLES, moved)).toHaveLength(2);

        const relabelled = installed();
        relabelled[2] = { ...relabelled[2], Expected: { ...relabelled[2].Expected, SeniorityLevel: ['Director'] } };
        expect(GoldenTitleCopy.Differences(GOLDEN_TITLES, relabelled)).toEqual([
            "g03 'Creamery Manager': labels differ (copy Operations | Manager; installed Operations | Director)",
        ]);

        const swapped = installed();
        swapped[6] = { ...swapped[6], Expected: { ...swapped[6].Expected, SeniorityLevel: ['Manager', 'Individual Contributor'] } };
        expect(GoldenTitleCopy.Differences(GOLDEN_TITLES, swapped)).toHaveLength(1);
    });

    it('reports a missing output as a label difference', () => {
        const missing = installed();
        missing[0] = { ...missing[0], Expected: { SeniorityLevel: ['C-Level'] } };
        expect(GoldenTitleCopy.Differences(GOLDEN_TITLES, missing)).toHaveLength(1);
    });
});

describe('FeaturePipelineGateFixtures.UpdateBizAppsRows', () => {
    /** A context whose provider records the RunView it is asked for and returns no rows. */
    function context(seen: RunViewParams[]): IntegrationCheckContext {
        const provider = new EntitiesOnlyProvider([]);
        const empty: RunViewResult<never> = { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' };
        vi.spyOn(provider, 'RunView').mockImplementation(async (params: RunViewParams) => { seen.push(params); return empty; });
        return { User: new UserInfo(provider, { ID: 'U-1', Name: 'Tester' }), Provider: provider, Storage: new InstrumentedLocalStorageProvider(new InMemoryLocalStorageProvider()) };
    }

    it('narrows every filter to the fixture ID prefix of the entity', async () => {
        const seen: RunViewParams[] = [];
        const ctx = context(seen);
        await FeaturePipelineGateFixtures.UpdateBizAppsRows(ctx, 'MJ_BizApps_Common: People', `Status = 'Active'`, { Status: 'Active' });
        await FeaturePipelineGateFixtures.UpdateBizAppsRows(ctx, 'MJ_BizApps_Common: Person Job Functions', 'Sequence = 1', { Source: 'Manual' });
        expect(seen.map((p) => p.ExtraFilter)).toEqual([
            `(Status = 'Active') AND ID LIKE '${PREFIX}%'`,
            `(Sequence = 1) AND PersonID LIKE '${PREFIX}%'`,
        ]);
    });

    it('refuses an entity the fixture does not write', async () => {
        const seen: RunViewParams[] = [];
        await expect(FeaturePipelineGateFixtures.UpdateBizAppsRows(context(seen), 'MJ: Users', '1 = 1', { Name: 'x' }))
            .rejects.toThrow('UpdateBizAppsRows: MJ: Users is not an entity the gate fixture writes');
        expect(seen).toEqual([]);
    });
});
