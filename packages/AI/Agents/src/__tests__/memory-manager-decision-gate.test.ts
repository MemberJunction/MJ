import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { LikelihoodAnswer, PlattCalibration } from '@memberjunction/ai';
import { MJAIAgentRunStepEntityExtended, type AIPromptRunResult } from '@memberjunction/ai-core-plus';
import type { AIDecisionRunResult } from '@memberjunction/ai-prompts';
import { AIEngine } from '@memberjunction/aiengine';
import { MemoryManagerAgent } from '../memory-manager-agent';
import { AgentDecisionService } from '../AgentDecisionService';
import {
    JudgeMemoryNotes,
    type MemoryNoteCandidate,
    type MemoryNoteEngineSource
} from '../memory-note-gate';

// Mock LogStatus and LogError from @memberjunction/core
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn()
    };
});

interface NoteShape {
    type: 'Preference' | 'Constraint' | 'Context' | 'Example' | 'Issue';
    content: string;
    confidence: number;
    scopeLevel?: 'global' | 'company' | 'user';
}

interface ThreadShape {
    conversationId: string;
    messages: Array<{ role: string; message: string }>;
}

class TestMemoryManagerAgent extends MemoryManagerAgent {
    public SetDecisionService(service: AgentDecisionService): void {
        this._agentDecisionService = service;
    }

    public InvokeFilterCandidateNotes(
        notes: NoteShape[],
        threads: ThreadShape[],
        user: UserInfo
    ): Promise<NoteShape[]> {
        const self = this as unknown as {
            filterCandidateNotes(
                notes: NoteShape[],
                threads: ThreadShape[],
                user: UserInfo
            ): Promise<NoteShape[]>;
        };
        return self.filterCandidateNotes(notes, threads, user);
    }

    public InvokeAttachDecisionPromptRun(
        step: MJAIAgentRunStepEntityExtended,
        result: AIDecisionRunResult
    ): void {
        this.attachDecisionPromptRun(step, result);
    }
}

describe('MemoryManagerAgent - Decision Gate Integration', () => {
    const mockUser = { ID: 'user-1', Email: 'test@example.com' } as unknown as UserInfo;

    const sampleNotes: NoteShape[] = [
        { type: 'Preference', content: 'Prefers dark mode theme', confidence: 95 },
        { type: 'Constraint', content: 'Do not touch production DB', confidence: 85 },
        { type: 'Context', content: 'Short', confidence: 90 }, // content length < 10
        { type: 'Issue', content: 'Build failed on missing module', confidence: 70 }
    ];

    const sampleThreads: ThreadShape[] = [
        {
            conversationId: 'conv-1',
            messages: [
                { role: 'user', message: 'I prefer dark mode' },
                { role: 'assistant', message: 'Understood' }
            ]
        }
    ];

    let agent: TestMemoryManagerAgent;

    beforeEach(() => {
        agent = new TestMemoryManagerAgent();
    });

    it('has EnableDecisionGate false by default', () => {
        expect(agent.EnableDecisionGate).toBe(false);
    });

    it('allows toggling EnableDecisionGate via property setter', () => {
        agent.EnableDecisionGate = true;
        expect(agent.EnableDecisionGate).toBe(true);
        agent.EnableDecisionGate = false;
        expect(agent.EnableDecisionGate).toBe(false);
    });

    it('filters by self-confidence and length when EnableDecisionGate is false (default)', async () => {
        const mockDecisionService = {
            Ask: vi.fn()
        } as unknown as AgentDecisionService;
        agent.SetDecisionService(mockDecisionService);

        const filtered = await agent.InvokeFilterCandidateNotes(sampleNotes, sampleThreads, mockUser);

        // sampleNotes[0] (95, len >= 10): kept
        // sampleNotes[1] (85, len >= 10): kept
        // sampleNotes[2] (90, len < 10): dropped by length
        // sampleNotes[3] (70, len >= 10): dropped by confidence (< 80)
        expect(filtered).toHaveLength(2);
        expect(filtered[0].content).toBe('Prefers dark mode theme');
        expect(filtered[1].content).toBe('Do not touch production DB');

        // Decision service should never be called when gate is disabled
        expect(mockDecisionService.Ask).not.toHaveBeenCalled();
    });

    it('falls back to self-confidence filter and logs when decision service call fails', async () => {
        agent.EnableDecisionGate = true;

        const mockDecisionService = {
            Ask: vi.fn().mockResolvedValue({
                success: false,
                errorMessage: 'Rate limit exceeded',
                Answers: {}
            } as AIDecisionRunResult)
        } as unknown as AgentDecisionService;
        agent.SetDecisionService(mockDecisionService);

        const filtered = await agent.InvokeFilterCandidateNotes(sampleNotes, sampleThreads, mockUser);

        // Should have called decision service once
        expect(mockDecisionService.Ask).toHaveBeenCalledTimes(1);

        // On failure, falls back to confidence filter: notes with confidence >= 80 and len >= 10
        expect(filtered).toHaveLength(2);
        expect(filtered[0].content).toBe('Prefers dark mode theme');
        expect(filtered[1].content).toBe('Do not touch production DB');
    });

    it('falls back to the confidence filter when the answering model has no calibration', async () => {
        agent.EnableDecisionGate = true;

        const answers: Record<string, LikelihoodAnswer> = {
            n1: { Kind: 'Likelihood', Probability: 0.99 },
            n2: { Kind: 'Likelihood', Probability: 0.95 }
        };

        const mockDecisionService = {
            Ask: vi.fn().mockResolvedValue({
                success: true,
                Answers: answers,
                modelInfo: { modelName: 'uncalibrated-model-v1' }
            } as unknown as AIDecisionRunResult)
        } as unknown as AgentDecisionService;
        agent.SetDecisionService(mockDecisionService);

        const filtered = await agent.InvokeFilterCandidateNotes(sampleNotes, sampleThreads, mockUser);

        expect(mockDecisionService.Ask).toHaveBeenCalledTimes(1);
        // An uncalibrated model hasn't been shown to beat the self-reported confidence, so its
        // batch is filtered as it would be with the gate off: confidence >= 80 and length >= 10.
        expect(filtered.map(n => n.content)).toEqual(['Prefers dark mode theme', 'Do not touch production DB']);
    });

    it('keeps the notes whose calibrated probability reaches the threshold when a calibrated model answers', async () => {
        agent.EnableDecisionGate = true;
        // After the length check: n1 "Prefers dark mode theme" (self 95), n2 "Do not touch production DB"
        // (self 85), n3 "Build failed on missing module" (self 70). Jev's raw 0.95 and 0.9 calibrate
        // above the threshold, its raw 0.6 well below it, so the gate overrides the self-report both ways.
        const answers: Record<string, LikelihoodAnswer> = {
            n1: { Kind: 'Likelihood', Probability: 0.95 },
            n2: { Kind: 'Likelihood', Probability: 0.6 },
            n3: { Kind: 'Likelihood', Probability: 0.9 }
        };
        const mockDecisionService = {
            Ask: vi.fn().mockResolvedValue({
                success: true,
                Answers: answers,
                modelInfo: { modelId: 'model-jev', modelName: 'Jev' }
            } as unknown as AIDecisionRunResult)
        } as unknown as AgentDecisionService;
        agent.SetDecisionService(mockDecisionService);

        const filtered = await agent.InvokeFilterCandidateNotes(sampleNotes, sampleThreads, mockUser);

        expect(filtered.map(n => n.content)).toEqual(['Prefers dark mode theme', 'Build failed on missing module']);
    });

    it('correctly attaches PromptRun to run step for cost/token rollup', () => {
        class MockStepEntity {
            public ID: string = 'step-1';
            public TargetLogID: string | null = null;
            public PromptRun?: AIPromptRunResult;
        }

        const step = new MockStepEntity() as unknown as MJAIAgentRunStepEntityExtended;
        const fakePromptRun = { ID: 'prompt-run-123' } as unknown as AIPromptRunResult;
        const result: AIDecisionRunResult = {
            success: true,
            Answers: {},
            promptRun: fakePromptRun
        } as unknown as AIDecisionRunResult;

        agent.InvokeAttachDecisionPromptRun(step, result);

        expect(step.TargetLogID).toBe('prompt-run-123');
        expect(step.PromptRun).toBe(fakePromptRun);
    });

    it('batches decision calls when note count exceeds prompt question cap', async () => {
        agent.EnableDecisionGate = true;

        // Mock AIEngine to return a cap of 2 questions per call
        const originalInstance = AIEngine.Instance;
        const mockPromptId = 'prompt-decision-1';
        const mockEngine = {
            Prompts: [{ ID: mockPromptId, Name: 'Default Decision' }],
            PromptModels: [{ PromptID: mockPromptId, ModelID: 'model-cap-2', Status: 'Active' }],
            ModelVendors: [],
            GetEffectiveModelConfiguration: () => ({ Decision: { MaxQuestionsPerCall: 2 } })
        } as unknown as MemoryNoteEngineSource;

        const manyNotes: NoteShape[] = [
            { type: 'Preference', content: 'Long note one for candidate testing', confidence: 90 },
            { type: 'Preference', content: 'Long note two for candidate testing', confidence: 90 },
            { type: 'Preference', content: 'Long note three for candidate testing', confidence: 90 },
            { type: 'Preference', content: 'Long note four for candidate testing', confidence: 90 },
            { type: 'Preference', content: 'Long note five for candidate testing', confidence: 90 }
        ];

        // 5 notes with cap 2 = 3 batches ([2, 2, 1])
        const mockDecisionService = {
            Ask: vi.fn().mockResolvedValue({
                success: false, // fallback to confidence so we can check returned count
                errorMessage: 'Simulated failover test'
            } as AIDecisionRunResult)
        } as unknown as AgentDecisionService;
        agent.SetDecisionService(mockDecisionService);

        // Spy on MemoryNotePromptQuestionCap to return 2
        const capSpy = vi.spyOn(await import('../memory-note-gate'), 'MemoryNotePromptQuestionCap')
            .mockReturnValue(2);

        const filtered = await agent.InvokeFilterCandidateNotes(manyNotes, sampleThreads, mockUser);

        expect(mockDecisionService.Ask).toHaveBeenCalledTimes(3);
        expect(filtered).toHaveLength(5);

        capSpy.mockRestore();
    });
});
