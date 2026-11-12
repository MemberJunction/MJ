import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EntityInfo, RunView, UserInfo } from '@memberjunction/core';
import { DecisionResult, type DecisionAnswer, type DecisionCalibrationEntry } from '@memberjunction/ai';
import {
    MJAIAgentEntityExtended,
    MJAIPromptEntityExtended,
    type AgentConfiguration,
    type AIPromptRunResult,
    type DecisionAnsweringModel,
    type ExecuteAgentParams
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import {
    AIPromptRunner,
    type AIDecisionParams,
    type AIDecisionRunResult,
    type DecisionUseMode,
    type ShadowDecisionRunner
} from '@memberjunction/ai-prompts';
import { MJAIAgentNoteEntity } from '@memberjunction/core-entities';
import { MemoryManagerAgent } from '../memory-manager-agent';
import {
    MEMORY_CONTRADICTION_CALIBRATION_KEY,
    MEMORY_DUPLICATE_QUESTION,
    MEMORY_NOTE_DEDUPE_CALIBRATION_KEY
} from '../memory-decision-uses';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn(), LogStatusEx: vi.fn() };
});

const JEV: DecisionAnsweringModel = { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917' };
const user = new UserInfo(null, { ID: 'aaaaaaaa-5555-4000-8000-000000000001', Email: 'test@example.com' });

function entityInfo(name: string, fields: string[]): EntityInfo {
    return new EntityInfo({ Name: name, Fields: fields.map(field => ({ Name: field, Type: 'nvarchar', IsPrimaryKey: field === 'ID' })) });
}

function prompt(name: string): MJAIPromptEntityExtended {
    const p = new MJAIPromptEntityExtended(entityInfo('MJ: AI Prompts', ['ID', 'Name']));
    p.ID = `aaaaaaaa-8888-4000-8000-${String(name.length).padStart(12, '0')}`;
    p.Name = name;
    return p;
}

function storedNote(id: string, createdAt: string, importance: number): MJAIAgentNoteEntity {
    const n = new MJAIAgentNoteEntity(entityInfo('MJ: AI Agent Notes', ['ID', 'Type', 'Note', '__mj_CreatedAt', 'ImportanceScore', 'AccessCount', 'AgentID', 'UserID', 'CompanyID']));
    n.LoadFromData({ ID: id, Type: 'Preference', Note: `note ${id}`, __mj_CreatedAt: new Date(createdAt), ImportanceScore: importance, AccessCount: 1 });
    return n;
}

/** A decision answering `duplicate` / `contradicts` with the given probability, from Jev. */
function decisionRun(answers: Record<string, number>): AIDecisionRunResult {
    const Answers: Record<string, DecisionAnswer> = {};
    for (const [k, p] of Object.entries(answers)) {
        Answers[k] = { Kind: 'Likelihood', Probability: p };
    }
    const driver = new DecisionResult(true, new Date(0), new Date(1));
    driver.Answers = Answers;
    driver.ResolvedModel = JEV.ResolvedModel ?? undefined;
    return { success: true, Answers, modelInfo: { modelId: 'model-jev', modelName: 'Jev' }, DecisionResult: driver };
}

/** Records the decisions it is asked and answers them all the same way. */
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

class TestMemoryManager extends MemoryManagerAgent {
    public Runner: ScriptedRunner | undefined;

    public Configure(mode: DecisionUseMode, promptParams: Record<string, unknown> | undefined): void {
        this['_memoryDecisionMode'] = mode;
        this['_runPromptParams'] = promptParams;
    }

    public DedupeNote(content: string, similar: MJAIAgentNoteEntity[]): Promise<{ shouldAdd: boolean; reason: string }> {
        return this['decideNoteDedupe'](new AIPromptRunner(), prompt('Memory Manager - Deduplicate Note'),
            { type: 'Preference', content, confidence: 90 }, similar.map(note => ({ note, similarity: 0.9 })), user);
    }

    public Contradiction(a: MJAIAgentNoteEntity, b: MJAIAgentNoteEntity): ReturnType<MemoryManagerAgent['decideContradiction']> {
        return this['decideContradiction'](a, b, prompt('Memory Manager - Detect Contradictions'), new AIPromptRunner(), user);
    }

    public RunExecute(params: ExecuteAgentParams): ReturnType<MemoryManagerAgent['executeAgentInternal']> {
        const config: AgentConfiguration = { success: true };
        return this.executeAgentInternal(params, config);
    }

    public get Mode(): DecisionUseMode {
        return this['_memoryDecisionMode'];
    }

    protected override CreateMemoryDecisionRunner(): ShadowDecisionRunner | undefined {
        return this.Runner;
    }
}

function calibrations(...keys: Array<{ Use: string; Question: string }>): (name: string) => readonly DecisionCalibrationEntry[] {
    const entries = keys.map(k => ({ ...k, ResolvedModel: JEV.ResolvedModel ?? '', A: 1, B: 0 }));
    return (name: string) => (name === 'Jev' ? entries : []);
}

/** The prompt runner's `ExecutePrompt`, spied. */
function spyOnPrompts() {
    return vi.spyOn(AIPromptRunner.prototype, 'ExecutePrompt');
}

describe('MemoryManagerAgent - dedupe and contradiction decisions', () => {
    let agent: TestMemoryManager;
    let promptSpy: ReturnType<typeof spyOnPrompts>;

    beforeEach(() => {
        agent = new TestMemoryManager();
        vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([prompt('Default Decision'), prompt('Memory Decision')]);
        vi.spyOn(AIEngine.Instance, 'GetDecisionCalibrations').mockImplementation(calibrations());
        promptSpy = spyOnPrompts();
        promptSpy.mockResolvedValue({
            success: true, result: { shouldAdd: false, reason: 'prompt says duplicate' }
        } as AIPromptRunResult);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('asks no decision when the master switch is off, whatever the mode', async () => {
        agent.Runner = new ScriptedRunner(decisionRun({ duplicate: 0.01 }));
        agent.Configure('Decision', undefined);

        const verdict = await agent.DedupeNote('Prefers dark mode', [storedNote('A', '2026-10-01', 5)]);

        expect(verdict).toEqual({ shouldAdd: false, reason: 'prompt says duplicate' });
        expect(agent.Runner.Calls).toEqual([]);
        expect(promptSpy).toHaveBeenCalledTimes(1);
    });

    it('in Shadow, answers from the prompt and asks the duplicate question beside it on the run\'s decision prompt', async () => {
        agent.Runner = new ScriptedRunner(decisionRun({ duplicate: 0.01 }));
        agent.Configure('Shadow', { decisionsEnabled: true, decisionPromptName: 'Memory Decision' });

        const verdict = await agent.DedupeNote('Prefers dark mode', [storedNote('A', '2026-10-01', 5)]);

        expect(verdict.shouldAdd).toBe(false);
        expect(promptSpy).toHaveBeenCalledTimes(1);
        expect(agent.Runner.Calls).toHaveLength(1);
        expect(agent.Runner.Calls[0].prompt?.Name).toBe('Memory Decision');
        expect(Object.keys(agent.Runner.Calls[0].Questions)).toEqual([MEMORY_DUPLICATE_QUESTION]);
        expect(agent.Runner.Calls[0].contextUser).toBe(user);
    });

    it('in Decision, a calibrated confident answer replaces the prompt', async () => {
        vi.spyOn(AIEngine.Instance, 'GetDecisionCalibrations').mockImplementation(calibrations(MEMORY_NOTE_DEDUPE_CALIBRATION_KEY));
        agent.Runner = new ScriptedRunner(decisionRun({ duplicate: 0.05 }));
        agent.Configure('Decision', { decisionsEnabled: true });

        const verdict = await agent.DedupeNote('Prefers dark mode', [storedNote('A', '2026-10-01', 5)]);

        expect(verdict.shouldAdd).toBe(true);
        expect(verdict.reason).toContain('decision');
        expect(promptSpy).not.toHaveBeenCalled();
    });

    it('in Decision, falls back to the prompt when the answering model has no calibration', async () => {
        agent.Runner = new ScriptedRunner(decisionRun({ duplicate: 0.05 }));
        agent.Configure('Decision', { decisionsEnabled: true });

        const verdict = await agent.DedupeNote('Prefers dark mode', [storedNote('A', '2026-10-01', 5)]);

        expect(verdict).toEqual({ shouldAdd: false, reason: 'prompt says duplicate' });
        expect(agent.Runner.Calls).toHaveLength(1);
        expect(promptSpy).toHaveBeenCalledTimes(1);
    });

    it('fails closed as the prompt does when the decision is unsure and the prompt fails', async () => {
        vi.spyOn(AIEngine.Instance, 'GetDecisionCalibrations').mockImplementation(calibrations(MEMORY_NOTE_DEDUPE_CALIBRATION_KEY));
        promptSpy.mockResolvedValue({ success: false, result: undefined } as AIPromptRunResult);
        agent.Runner = new ScriptedRunner(decisionRun({ duplicate: 0.5 }));
        agent.Configure('Decision', { decisionsEnabled: true });

        const verdict = await agent.DedupeNote('Prefers dark mode', [storedNote('A', '2026-10-01', 5)]);

        expect(verdict.shouldAdd).toBe(false);
    });

    it('in Decision, revokes the older note of a calibrated contradiction without the prompt', async () => {
        vi.spyOn(AIEngine.Instance, 'GetDecisionCalibrations').mockImplementation(calibrations(MEMORY_CONTRADICTION_CALIBRATION_KEY));
        agent.Runner = new ScriptedRunner(decisionRun({ contradicts: 0.95 }));
        agent.Configure('Decision', { decisionsEnabled: true });

        const verdict = await agent.Contradiction(storedNote('A', '2026-09-01', 5), storedNote('B', '2026-10-01', 5));

        expect(verdict).toMatchObject({ isContradiction: true, keepNoteId: 'B', revokeNoteId: 'A' });
        expect(promptSpy).not.toHaveBeenCalled();
    });

    describe('reading the mode from the run', () => {
        beforeEach(() => {
            vi.spyOn(AIEngine.Instance, 'Agents', 'get').mockReturnValue([]);
            vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({
                Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: ''
            });
        });

        function params(data: Record<string, unknown> | undefined): ExecuteAgentParams {
            const mm = new MJAIAgentEntityExtended(entityInfo('MJ: AI Agents', ['ID', 'Name', 'AgentTypePromptParams']));
            mm.ID = 'aaaaaaaa-6666-4000-8000-000000000001';
            mm.Name = 'Memory Manager';
            return { agent: mm, conversationMessages: [], contextUser: user, data };
        }

        it.each<[Record<string, unknown> | undefined, DecisionUseMode]>([
            [undefined, 'Shadow'],
            [{ memoryDecisionMode: 'decision' }, 'Decision'],
            [{ memoryDecisionMode: 'Prompt' }, 'Prompt'],
            [{ memoryDecisionMode: 'sometimes' }, 'Shadow']
        ])('reads data %j as %s', async (data, mode) => {
            await agent.RunExecute(params(data));
            expect(agent.Mode).toBe(mode);
        });
    });
});
