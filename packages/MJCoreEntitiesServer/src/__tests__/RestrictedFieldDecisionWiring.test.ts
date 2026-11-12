import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EntityFieldInfo, EntityFieldTSType, EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { DecisionAnswer, DecisionCalibrationEntry } from '@memberjunction/ai';
import type { AIDecisionParams, AIDecisionRunResult, ShadowDecisionRunner } from '@memberjunction/ai-prompts';
import type { MJConversationEntity } from '@memberjunction/core-entities';

const engine = vi.hoisted(() => ({
    Config: vi.fn(),
    Prompts: [] as Array<{ Name: string; Status: string }>,
    Calibrations: [] as DecisionCalibrationEntry[],
    GetDecisionCalibrations(name: string) { return name === 'Jev' ? this.Calibrations : []; }
}));
const promptRun = vi.hoisted(() => ({ ExecutePrompt: vi.fn() }));

vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: engine } }));
vi.mock('@memberjunction/ai-prompts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai-prompts')>();
    return { ...actual, AIPromptRunner: vi.fn().mockImplementation(function () { return promptRun; }) };
});

import {
    InspectAndStampRestrictedFieldsForComment,
    RegisterRestrictedFieldLLMClassifier,
    SetRestrictedFieldDecisionRunner
} from '../custom/RestrictedFieldCommentClassifier';
import {
    RESTRICTED_FIELD_CLASSIFIER_USE,
    RESTRICTED_FIELD_DECISION_QUESTION,
    SetRestrictedFieldClassifierDecisionMode
} from '../custom/RestrictedFieldDecision';

function makeUser(id: string): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = id;
    return u;
}

function makeEntity(): EntityInfo {
    const fields = [
        { Name: 'ID', DisplayNameOrName: 'ID', IsPrimaryKey: true, HasFieldPermissions: false, TSType: EntityFieldTSType.String },
        { Name: 'Salary', DisplayNameOrName: 'Annual Compensation', Description: 'Base annual salary', IsPrimaryKey: false, HasFieldPermissions: true, TSType: EntityFieldTSType.Number }
    ] as unknown as EntityFieldInfo[];
    return {
        ID: 'entity-emp',
        Name: 'Employees',
        DisplayNameOrName: 'Employees',
        PrimaryKeys: [fields[0]],
        FirstPrimaryKey: fields[0],
        Fields: fields,
        FieldLevelSecurityApplies: true,
        GetUserPermisions: vi.fn().mockReturnValue({ CanRead: true }),
        GetDeniedReadFields: vi.fn((user: UserInfo) => new Set(user.ID === 'contractor' ? ['salary'] : []))
    } as unknown as EntityInfo;
}

function makeConversation(): MJConversationEntity {
    return {
        ID: 'conv-1',
        IsSaved: true,
        LinkedEntityID: 'entity-emp',
        LinkedRecordID: 'emp-1',
        AnchorType: 'Section',
        AnchorKey: 'notes',
        AnchorMetadata: null,
        AnchorMetadataObject: {},
        Save: vi.fn().mockResolvedValue(true)
    } as unknown as MJConversationEntity;
}

function decisionRun(answers: Record<string, DecisionAnswer>): AIDecisionRunResult {
    return {
        success: true,
        Answers: answers,
        modelInfo: { modelName: 'Jev' },
        DecisionResult: { ResolvedModel: 'typesafe/jev-test' }
    } as unknown as AIDecisionRunResult;
}

function makeRunner(result: AIDecisionRunResult): ShadowDecisionRunner & { ExecuteDecision: ReturnType<typeof vi.fn> } {
    return {
        ExecuteDecision: vi.fn().mockResolvedValue(result),
        WaitForPendingPromptRunSaves: vi.fn().mockResolvedValue(undefined)
    } as unknown as ShadowDecisionRunner & { ExecuteDecision: ReturnType<typeof vi.fn> };
}

async function inspect() {
    return InspectAndStampRestrictedFieldsForComment({
        Provider: { ProviderType: 'Database', Entities: [] } as unknown as IMetadataProvider,
        ContextUser: makeUser('hr'),
        Conversation: makeConversation(),
        EntityInfo: makeEntity(),
        MessageText: 'They want mid-six-figures now.',
        RecordValues: { ID: 'emp-1', Salary: 215000 }
    });
}

const fit: DecisionCalibrationEntry = {
    Use: RESTRICTED_FIELD_CLASSIFIER_USE,
    Question: RESTRICTED_FIELD_DECISION_QUESTION,
    ResolvedModel: 'typesafe/jev-test',
    A: 1,
    B: 0
};

describe('restricted-field classifier: the decision use', () => {
    beforeEach(() => {
        RegisterRestrictedFieldLLMClassifier(null);
        engine.Prompts = [
            { Name: 'Anchored Comment Restricted Field Classifier', Status: 'Active' },
            { Name: 'Default Decision', Status: 'Active' }
        ];
        engine.Calibrations = [];
        engine.Config.mockReset().mockResolvedValue(undefined);
        promptRun.ExecutePrompt.mockReset().mockResolvedValue({ success: true, result: { restrictedFields: [] } });
    });

    afterEach(() => {
        SetRestrictedFieldClassifierDecisionMode(undefined);
        SetRestrictedFieldDecisionRunner(null);
    });

    it('Prompt mode: only the governed prompt answers', async () => {
        SetRestrictedFieldClassifierDecisionMode('Prompt');
        const runner = makeRunner(decisionRun({ f1: { Kind: 'Likelihood', Probability: 0.9 } }));
        SetRestrictedFieldDecisionRunner(runner);
        promptRun.ExecutePrompt.mockResolvedValue({ success: true, result: { restrictedFields: ['salary'] } });

        const res = await inspect();
        expect(res.DetectedFields).toEqual(['Salary']);
        expect(runner.ExecuteDecision).not.toHaveBeenCalled();
    });

    it('Shadow mode (default): the prompt answers and the decision is asked beside it as the user', async () => {
        const runner = makeRunner(decisionRun({ f1: { Kind: 'Likelihood', Probability: 0.9 } }));
        SetRestrictedFieldDecisionRunner(runner);

        const res = await inspect();
        expect(res.DetectedFields).toEqual([]);
        expect(runner.ExecuteDecision).toHaveBeenCalledTimes(1);
        const params = runner.ExecuteDecision.mock.calls[0][0] as AIDecisionParams;
        expect(params.contextUser?.ID).toBe('hr');
        expect(Object.keys(params.Questions)).toEqual(['f1']);
        expect(params.State).toEqual({ recordType: 'Employees', anchor: 'Section: notes', comment: 'They want mid-six-figures now.' });
    });

    it('Decision mode: a calibrated answer at or above 0.2 flags the field without the prompt', async () => {
        SetRestrictedFieldClassifierDecisionMode('Decision');
        engine.Calibrations = [fit];
        SetRestrictedFieldDecisionRunner(makeRunner(decisionRun({ f1: { Kind: 'Likelihood', Probability: 0.3 } })));

        const res = await inspect();
        expect(res.DetectedFields).toEqual(['Salary']);
        expect(promptRun.ExecutePrompt).not.toHaveBeenCalled();
    });

    it('Decision mode: no calibration for the answering model falls back to the prompt', async () => {
        SetRestrictedFieldClassifierDecisionMode('Decision');
        SetRestrictedFieldDecisionRunner(makeRunner(decisionRun({ f1: { Kind: 'Likelihood', Probability: 0.99 } })));
        promptRun.ExecutePrompt.mockResolvedValue({ success: true, result: { restrictedFields: [] } });

        const res = await inspect();
        expect(res.DetectedFields).toEqual([]);
        expect(promptRun.ExecutePrompt).toHaveBeenCalledTimes(1);
    });

    it('Decision mode: no Default Decision prompt falls back to the prompt', async () => {
        SetRestrictedFieldClassifierDecisionMode('Decision');
        engine.Prompts = [{ Name: 'Anchored Comment Restricted Field Classifier', Status: 'Active' }];
        const runner = makeRunner(decisionRun({}));
        SetRestrictedFieldDecisionRunner(runner);
        promptRun.ExecutePrompt.mockResolvedValue({ success: true, result: { restrictedFields: ['Salary'] } });

        const res = await inspect();
        expect(res.DetectedFields).toEqual(['Salary']);
        expect(runner.ExecuteDecision).not.toHaveBeenCalled();
    });

    it('flags nothing, and asks nothing, when the AI engine cannot load', async () => {
        SetRestrictedFieldClassifierDecisionMode('Decision');
        engine.Config.mockRejectedValue(new Error('no db'));
        const runner = makeRunner(decisionRun({}));
        SetRestrictedFieldDecisionRunner(runner);

        const res = await inspect();
        expect(res.DetectedFields).toEqual([]);
        expect(runner.ExecuteDecision).not.toHaveBeenCalled();
        expect(promptRun.ExecutePrompt).not.toHaveBeenCalled();
    });
});
