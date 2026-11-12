import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EntityInfo, UserInfo } from '@memberjunction/core';
import { DecisionResult, type DecisionAnswer } from '@memberjunction/ai';
import { MJAIPromptEntityExtended, type AIPromptRunResult } from '@memberjunction/ai-core-plus';
import { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner, type AIDecisionParams, type AIDecisionRunResult, type ShadowDecisionRunner } from '@memberjunction/ai-prompts';
import { RealtimeTurnModerator, type TurnModeratorContextInput } from '../realtime/realtime-turn-moderator';
import { REALTIME_MODERATOR_CALIBRATION_KEY } from '../realtime/realtime-moderator-decision';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn(), LogStatusEx: vi.fn() };
});

const MODERATOR_PROMPT_ID = 'aaaaaaaa-9999-4000-8000-000000000001';
const JEV_RESOLVED = 'typesafe/jev-1.13-20260917';
const user = new UserInfo(null, { ID: 'aaaaaaaa-5555-4000-8000-000000000001', Email: 'test@example.com' });

function entityInfo(name: string, fields: string[]): EntityInfo {
    return new EntityInfo({ Name: name, Fields: fields.map(field => ({ Name: field, Type: 'nvarchar', IsPrimaryKey: field === 'ID' })) });
}

function prompt(id: string, name: string): MJAIPromptEntityExtended {
    const p = new MJAIPromptEntityExtended(entityInfo('MJ: AI Prompts', ['ID', 'Name']));
    p.ID = id;
    p.Name = name;
    return p;
}

function realtimeType(moderator: Record<string, unknown>): MJAIAgentTypeEntity {
    const t = new MJAIAgentTypeEntity(entityInfo('MJ: AI Agent Types', ['ID', 'Name', 'DefaultConfiguration']));
    t.ID = 'aaaaaaaa-9999-4000-8000-000000000002';
    t.Name = 'Realtime';
    t.DefaultConfiguration = JSON.stringify({ realtime: { turnTaking: { moderator: { promptId: MODERATOR_PROMPT_ID, ...moderator } } } });
    return t;
}

function decisionRun(probabilities: number[]): AIDecisionRunResult {
    const Answers: Record<string, DecisionAnswer> = {};
    probabilities.forEach((p, i) => { Answers[`a${i + 1}`] = { Kind: 'Likelihood', Probability: p }; });
    const driver = new DecisionResult(true, new Date(0), new Date(1));
    driver.Answers = Answers;
    driver.ResolvedModel = JEV_RESOLVED;
    return { success: true, Answers, modelInfo: { modelId: 'model-jev', modelName: 'Jev' }, DecisionResult: driver };
}

class ScriptedRunner implements ShadowDecisionRunner {
    public readonly Calls: AIDecisionParams[] = [];
    constructor(private readonly reply: AIDecisionRunResult) {}
    public async ExecuteDecision(params: AIDecisionParams): Promise<AIDecisionRunResult> {
        this.Calls.push(params);
        return this.reply;
    }
    public async WaitForPendingPromptRunSaves(): Promise<void> {
        return;
    }
}

class TestModerator extends RealtimeTurnModerator {
    public Runner: ScriptedRunner | undefined;
    protected override CreateDecisionRunner(): ShadowDecisionRunner | undefined {
        return this.Runner;
    }
}

const CTX: TurnModeratorContextInput = {
    RoomKey: 'room-1',
    Roster: [
        { AgentSessionID: 's-sage', Names: ['Sage'], Role: 'General help', Mode: 'proactive' },
        { AgentSessionID: 's-skip', Names: ['Skip'], Role: 'Data analysis', Mode: 'proactive' }
    ],
    Lookback: [{ Speaker: 'Ann', IsAgent: false, Text: 'Skip, how did sales do last quarter?' }],
    LatestTurn: { Speaker: 'Ann', IsAgent: false, Text: 'Skip, how did sales do last quarter?' },
    ConsecutiveAgentOnlyTurns: 0,
    AgentRunID: 'aaaaaaaa-9999-4000-8000-000000000003',
    ContextUser: user
};

/** The prompt runner's `ExecutePrompt`, spied. */
function spyOnPrompts() {
    return vi.spyOn(AIPromptRunner.prototype, 'ExecutePrompt');
}

describe('RealtimeTurnModerator - decision modes', () => {
    let moderator: TestModerator;
    let promptSpy: ReturnType<typeof spyOnPrompts>;

    function configure(moderatorConfig: Record<string, unknown>): void {
        vi.spyOn(AIEngine.Instance, 'AgentTypes', 'get').mockReturnValue([realtimeType(moderatorConfig)]);
    }

    beforeEach(() => {
        moderator = new TestModerator();
        vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([prompt(MODERATOR_PROMPT_ID, 'Realtime: Turn Moderator'), prompt('aaaaaaaa-9999-4000-8000-000000000004', 'Default Decision')]);
        vi.spyOn(AIEngine.Instance, 'Agents', 'get').mockReturnValue([]);
        vi.spyOn(AIEngine.Instance, 'GetDecisionCalibrations').mockReturnValue([]);
        promptSpy = spyOnPrompts();
        promptSpy.mockResolvedValue({
            success: true, result: { speakers: [{ agent: 'Sage' }] }
        } as AIPromptRunResult);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('in Prompt mode, asks no decision', async () => {
        configure({ decisionMode: 'Prompt' });
        moderator.Runner = new ScriptedRunner(decisionRun([0.1, 0.99]));

        expect(await moderator.Decide(CTX)).toEqual(['s-sage']);
        expect(moderator.Runner.Calls).toEqual([]);
    });

    it('by default (Shadow), speaks the prompt\'s pick and asks one Likelihood per agent beside it', async () => {
        configure({});
        moderator.Runner = new ScriptedRunner(decisionRun([0.1, 0.99]));

        expect(await moderator.Decide(CTX)).toEqual(['s-sage']);
        expect(promptSpy).toHaveBeenCalledTimes(1);
        expect(moderator.Runner.Calls).toHaveLength(1);
        expect(moderator.Runner.Calls[0].prompt?.Name).toBe('Default Decision');
        expect(Object.keys(moderator.Runner.Calls[0].Questions)).toEqual(['a1', 'a2']);
    });

    it('in Decision mode with a calibration, the decision picks the speakers and the prompt does not run', async () => {
        configure({ decisionMode: 'Decision' });
        vi.spyOn(AIEngine.Instance, 'GetDecisionCalibrations').mockReturnValue([{ ...REALTIME_MODERATOR_CALIBRATION_KEY, ResolvedModel: JEV_RESOLVED, A: 1, B: 0 }]);
        moderator.Runner = new ScriptedRunner(decisionRun([0.1, 0.99]));

        expect(await moderator.Decide(CTX)).toEqual(['s-skip']);
        expect(promptSpy).not.toHaveBeenCalled();
    });

    it('in Decision mode without a calibration, falls back to the prompt', async () => {
        configure({ decisionMode: 'Decision' });
        moderator.Runner = new ScriptedRunner(decisionRun([0.1, 0.99]));

        expect(await moderator.Decide(CTX)).toEqual(['s-sage']);
        expect(promptSpy).toHaveBeenCalledTimes(1);
    });

    it('asks the configured decision prompt, and skips the decision when it is not in the catalog', async () => {
        configure({ decisionPromptName: 'Moderator Decision' });
        moderator.Runner = new ScriptedRunner(decisionRun([0.1, 0.99]));

        expect(await moderator.Decide(CTX)).toEqual(['s-sage']);
        expect(moderator.Runner.Calls).toEqual([]);
    });

    it('keeps the onError policy when the prompt fails after an unsure decision', async () => {
        configure({ decisionMode: 'Decision', onError: 'addressed-only' });
        promptSpy.mockResolvedValue({ success: false, errorMessage: 'boom' } as AIPromptRunResult);
        moderator.Runner = new ScriptedRunner(decisionRun([0.1, 0.99]));

        expect(await moderator.Decide(CTX)).toEqual(['s-skip']);
    });
});
