import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { AIEngine } from '@memberjunction/aiengine';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import type { DecisionAnswer, DecisionCalibrationEntry } from '@memberjunction/ai';
import type { AIDecisionRunResult, ShadowDecisionRunner } from '@memberjunction/ai-prompts';
import { configInfo } from '../Config/config';
import { AdvancedGeneration, type SmartFieldIdentificationResult } from '../Misc/advanced_generation';
import {
    BuildSmartFieldQuestions,
    BuildSmartFieldState,
    CompareSmartFieldDecision,
    NameFieldCandidates,
    ReadSmartFieldVerdict,
    SmartFieldResultFromVerdict,
    type SmartFieldDecisionEntity,
} from '../Misc/smart-field-decision';

const ENTITY: SmartFieldDecisionEntity = {
    Name: 'Members',
    Description: 'People who belong to the association',
    Fields: [
        { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
        { Name: 'FullName', Type: 'nvarchar', Description: 'The member\'s name' },
        { Name: 'Email', Type: 'nvarchar' },
        { Name: 'JoinedAt', Type: 'datetimeoffset' },
        { Name: 'CompanyID', Type: 'uniqueidentifier', RelatedEntityID: 'c', RelatedEntity: 'Companies' },
        { Name: '__mj_CreatedAt', Type: 'datetimeoffset' },
    ],
};

/** An identity fit for every question, so calibrated = raw. */
const IDENTITY_FITS: DecisionCalibrationEntry[] = ['view', 'search', 'allowSearch'].map(q => ({
    Use: 'codegen-smart-fields', Question: q, ResolvedModel: 'jev-1', A: 1, B: 0,
}));
const IDENTITY_CALIBRATIONS = (model: string): readonly DecisionCalibrationEntry[] => (model === 'Jev' ? IDENTITY_FITS : []);

// Calibrations are read from AIEngineBase.Instance, which AIEngine wraps; serve the fixture fits there.
beforeEach(() => {
    vi.spyOn(AIEngineBase.Instance, 'GetDecisionCalibrations').mockImplementation(IDENTITY_CALIBRATIONS);
});
afterEach(() => vi.restoreAllMocks());
const JEV = { ModelName: 'Jev', ResolvedModel: 'jev-1' };

const lk = (p: number): DecisionAnswer => ({ Kind: 'Likelihood', Probability: p });
const ANSWERS: Record<string, DecisionAnswer> = {
    name: { Kind: 'Choice', Value: 'FullName', Confidence: 0.85, Probabilities: { FullName: 0.85, Email: 0.15 } },
    // view: FullName, Email, JoinedAt, CompanyID
    view_1: lk(0.9), view_2: lk(0.8), view_3: lk(0.3), view_4: lk(0.6),
    // search: FullName, Email
    search_1: lk(0.95), search_2: lk(0.7),
    allowSearch: lk(0.9),
};

describe('smart field decision', () => {
    it('asks a name Choice over the text fields that are not keys or system columns', () => {
        expect(NameFieldCandidates(ENTITY).map(f => f.Name)).toEqual(['FullName', 'Email']);
        const q = BuildSmartFieldQuestions(ENTITY);
        expect(q['name']).toMatchObject({ Kind: 'Choice', Options: [{ Value: 'FullName' }, { Value: 'Email' }] });
        expect(Object.keys(q).filter(k => k.startsWith('view_'))).toHaveLength(4);
        expect(Object.keys(q).filter(k => k.startsWith('search_'))).toHaveLength(2);
        expect(q['view_4']).toMatchObject({ Kind: 'Likelihood' });
        expect((q['view_4'] as { Instructions: string }).Instructions).toContain('"CompanyID" (uniqueidentifier, a reference to Companies)');
        expect(q['allowSearch']).toMatchObject({ Kind: 'Likelihood' });
    });

    it('asks no name Choice for one candidate, and takes it as the name', () => {
        const one: SmartFieldDecisionEntity = { Name: 'Tags', Fields: [{ Name: 'ID', Type: 'int', IsPrimaryKey: true }, { Name: 'Label', Type: 'varchar' }] };
        expect(BuildSmartFieldQuestions(one)['name']).toBeUndefined();
        const answers = { view_1: lk(0.9), search_1: lk(0.9), allowSearch: lk(0.2) };
        const result = SmartFieldResultFromVerdict(one, ReadSmartFieldVerdict(one, answers, JEV));
        expect(result?.nameFields).toEqual(['Label']);
        expect(result?.allowUserSearch).toBe(false);
    });

    it('states field metadata only', () => {
        const state = BuildSmartFieldState(ENTITY);
        expect(state['entity']).toBe('Members');
        expect((state['fields'] as unknown[])[4]).toEqual({ name: 'CompanyID', type: 'uniqueidentifier', primaryKey: false, references: 'Companies', description: null });
    });

    it('builds the prompt-shaped result from calibrated answers', () => {
        const result = SmartFieldResultFromVerdict(ENTITY, ReadSmartFieldVerdict(ENTITY, ANSWERS, JEV));
        expect(result).toMatchObject({
            nameFields: ['FullName', 'Email'],
            defaultInView: ['FullName', 'Email', 'CompanyID'],
            searchableFields: ['FullName', 'Email'],
            allowUserSearch: true,
            searchPredicates: [],
            fullTextSearchFields: [],
            confidence: 'high',
        });
        expect(result?.enableFullTextSearch).toBeUndefined();
    });

    it('is unsure when a Likelihood is uncalibrated or unanswered, or the name went unranked', () => {
        const other = { ModelName: 'Jev', ResolvedModel: 'jev-2' };
        expect(SmartFieldResultFromVerdict(ENTITY, ReadSmartFieldVerdict(ENTITY, ANSWERS, other))).toBeNull();
        const { view_2: _dropped, ...missing } = ANSWERS;
        expect(SmartFieldResultFromVerdict(ENTITY, ReadSmartFieldVerdict(ENTITY, missing, JEV))).toBeNull();
        const { name: _name, ...noName } = ANSWERS;
        expect(SmartFieldResultFromVerdict(ENTITY, ReadSmartFieldVerdict(ENTITY, noName, JEV))).toBeNull();
    });

    it('compares with the prompt on name, view and search, keeping per-field labels for the fit', () => {
        const verdict = ReadSmartFieldVerdict(ENTITY, ANSWERS, { ModelName: 'Uncalibrated' });
        const prompt: SmartFieldIdentificationResult = {
            nameFields: ['FullName'], nameFieldsReason: '', defaultInView: ['fullname', 'Email', 'CompanyID'], defaultInViewReason: '',
            searchableFields: ['FullName', 'Email'], searchableFieldsReason: '', allowUserSearch: true, confidence: 'high',
        };
        const agreed = CompareSmartFieldDecision(verdict, prompt);
        expect(agreed.Agreed).toBe(true);
        expect((agreed.Details?.['View'] as Array<{ Field: string; Prompt: boolean }>)[2]).toMatchObject({ Field: 'JoinedAt', Prompt: false, Raw: 0.3, Calibrated: null });

        const differs = CompareSmartFieldDecision(verdict, { ...prompt, nameFields: ['Email'] });
        expect(differs.Agreed).toBe(false);
        expect(differs.Summary).toContain('name differed (FullName vs Email)');
        expect(CompareSmartFieldDecision(verdict, null).Agreed).toBe(false);
    });
});

describe('AdvancedGeneration.identifyFields by mode', () => {
    const original = configInfo.advancedGeneration;
    const promptResult: SmartFieldIdentificationResult = {
        nameFields: ['Email'], nameFieldsReason: 'prompt', defaultInView: ['Email'], defaultInViewReason: '',
        searchableFields: ['Email'], searchableFieldsReason: '', allowUserSearch: true, confidence: 'medium',
    };
    let promptCalls = 0;

    function generation(mode: 'Prompt' | 'Shadow' | 'Decision', run: Partial<AIDecisionRunResult> | null): { ag: AdvancedGeneration; asked: () => number } {
        (configInfo as { advancedGeneration: unknown }).advancedGeneration = {
            ...(original ?? {}),
            enableAdvancedGeneration: true,
            smartFieldDecisionMode: mode,
            features: [{ name: 'SmartFieldIdentification', enabled: true }],
        };
        const ag = new AdvancedGeneration();
        let asked = 0;
        const runner: ShadowDecisionRunner = {
            ExecuteDecision: async () => {
                asked++;
                return { success: run !== null, Answers: {}, ...run } as AIDecisionRunResult;
            },
            WaitForPendingPromptRunSaves: async () => undefined,
        };
        (ag as unknown as { SmartFieldDecisionRunner: ShadowDecisionRunner }).SmartFieldDecisionRunner = runner;
        (ag as unknown as { identifyFieldsWithPrompt: () => Promise<SmartFieldIdentificationResult> }).identifyFieldsWithPrompt = async () => {
            promptCalls++;
            return promptResult;
        };
        return { ag, asked: () => asked };
    }

    beforeEach(() => {
        promptCalls = 0;
        vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([{ Name: 'Default Decision', Status: 'Active' }] as never);
    });

    afterEach(() => {
        (configInfo as { advancedGeneration: unknown }).advancedGeneration = original;
        vi.restoreAllMocks();
    });

    const jevRun = { Answers: ANSWERS, modelInfo: { modelName: 'Jev' }, DecisionResult: { ResolvedModel: 'jev-1' } } as unknown as Partial<AIDecisionRunResult>;

    it('Prompt (the default) asks no decision', async () => {
        const { ag, asked } = generation('Prompt', jevRun);
        expect(await ag.identifyFields(ENTITY, {} as never)).toBe(promptResult);
        expect(asked()).toBe(0);
    });

    it('Shadow returns the prompt\'s result and asks the decision beside it', async () => {
        const { ag, asked } = generation('Shadow', jevRun);
        expect(await ag.identifyFields(ENTITY, {} as never)).toBe(promptResult);
        expect(asked()).toBe(1);
    });

    it('Decision answers from a calibrated decision without running the prompt', async () => {
        const { ag } = generation('Decision', jevRun);
        const result = await ag.identifyFields(ENTITY, {} as never);
        expect(result?.nameFields[0]).toBe('FullName');
        expect(promptCalls).toBe(0);
    });

    it('Decision falls back to the prompt when the decision fails or is uncalibrated', async () => {
        const failed = generation('Decision', null);
        expect(await failed.ag.identifyFields(ENTITY, {} as never)).toBe(promptResult);
        const uncalibrated = generation('Decision', { ...jevRun, DecisionResult: { ResolvedModel: 'jev-2' } } as Partial<AIDecisionRunResult>);
        expect(await uncalibrated.ag.identifyFields(ENTITY, {} as never)).toBe(promptResult);
        expect(promptCalls).toBe(2);
    });
});
