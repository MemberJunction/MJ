/**
 * Unit tests for ConversationCompactionManager.
 *
 * Covers:
 * - ResolveEffectiveBudget: the Agent → AgentType → Model → Default resolution chain,
 *   model clamping (never silently exceed the model), percent inheritance and floors
 * - CompactIfNeeded: under-trigger no-op, boundary selection math, recursive input
 *   (prior summary + delta only), boundary-row write, prompt-failure containment,
 *   and the per-conversation re-entrancy guard
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConversationWindowSourceRow } from '@memberjunction/core-entities';

// ---------------------------------------------------------------------------
// Mocks (before importing the module under test)
// ---------------------------------------------------------------------------

// The manager loads window ROWS fresh per pass (RunView, mocked below) and folds them
// through the REAL ConversationEngine.AssembleContextWindow — tests exercise the actual
// fold math over these source rows instead of a pre-assembled window fixture.
const mockRows: { rows: ConversationWindowSourceRow[]; success: boolean; errorMessage?: string } = { rows: [], success: true };
const mockDetailEntity = {
    ID: '',
    SummaryOfEarlierConversation: null as string | null,
    SummaryPromptRunID: null as string | null,
    LatestResult: { CompleteMessage: '' },
    Load: vi.fn().mockResolvedValue(true),
    Save: vi.fn().mockResolvedValue(true),
};
const mockExecutePrompt = vi.fn();
const mockRunViewFn = vi.fn().mockImplementation(async () =>
    mockRows.success
        ? { Success: true, Results: mockRows.rows }
        : { Success: false, Results: [], ErrorMessage: mockRows.errorMessage || 'load failed' });

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: {
            ...actual.RunView,
            FromMetadataProvider: vi.fn().mockImplementation(() => ({ RunView: mockRunViewFn })),
        },
        Metadata: { Provider: { GetEntityObject: vi.fn().mockImplementation(async () => mockDetailEntity) } },
        LogError: vi.fn(),
        LogStatusEx: vi.fn(),
    };
});

vi.mock('@memberjunction/ai-prompts', () => ({
    AIPromptRunner: class MockRunner {
        ExecutePrompt = mockExecutePrompt;
    },
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Prompts: [
                { ID: 'PROMPT-SYSTEM', Name: 'Conversation Summary' },
                { ID: 'PROMPT-OVERRIDE', Name: 'Custom Summary' },
            ],
        },
    },
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
    AIPromptParams: class MockParams {},
    // Mirror of the real string-result extraction (prompt.types.ts) so the manager's
    // summary-text handling behaves identically under the module mock.
    ExtractPromptResultText: (result: { result?: unknown; rawResult?: string }) =>
        (typeof result.result === 'string' && result.result.trim().length > 0)
            ? result.result.trim()
            : (result.rawResult || '').trim(),
}));

import { ConversationCompactionManager, EffectiveContextBudget } from '../ConversationCompactionManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AgentShape = {
    ContextWindowMaxTokens: number | null;
    CompactionTriggerPercent: number | null;
    CompactionTargetPercent: number | null;
    ConversationSummaryPromptID: string | null;
};
type AgentTypeShape = AgentShape;

function makeAgent(overrides: Partial<AgentShape> = {}): AgentShape {
    return {
        ContextWindowMaxTokens: null,
        CompactionTriggerPercent: null,
        CompactionTargetPercent: null,
        ConversationSummaryPromptID: null,
        ...overrides,
    };
}

function makeType(overrides: Partial<AgentTypeShape> = {}): AgentTypeShape {
    return {
        ContextWindowMaxTokens: null,
        CompactionTriggerPercent: 75,
        CompactionTargetPercent: 30,
        ConversationSummaryPromptID: null,
        ...overrides,
    };
}

function sourceRow(sequence: number, role: 'User' | 'AI', text: string, summary?: string): ConversationWindowSourceRow {
    return {
        ID: `detail-${sequence}`,
        Sequence: sequence,
        Role: role,
        Message: text,
        SummaryOfEarlierConversation: summary || null,
    };
}

/** 1 token ≈ 1 char estimator — makes boundary math exact in tests. */
const oneCharOneToken = (messages: Array<{ content: unknown }>): number =>
    messages.reduce((total, m) => total + (typeof m.content === 'string' ? m.content.length : 0), 0);

function budget(overrides: Partial<EffectiveContextBudget> = {}): EffectiveContextBudget {
    return { MaxTokens: 10_000, TriggerTokens: 100, TargetTokens: 2000, ClampedToModel: false, BoundedBy: 'Agent', ...overrides };
}

function baseInput(overrides: Record<string, unknown> = {}) {
    return {
        ConversationId: 'CONV-1',
        // Budget resolution shapes are structural — the manager only reads the knob fields
        Agent: makeAgent() as never,
        AgentType: makeType() as never,
        Budget: budget(),
        ContextUser: { ID: 'user-1' } as never,
        EstimateTokens: oneCharOneToken,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConversationCompactionManager', () => {
    beforeEach(() => {
        mockRows.rows = [];
        mockRows.success = true;
        mockRows.errorMessage = undefined;
        mockRunViewFn.mockClear();
        mockDetailEntity.ID = '';
        mockDetailEntity.SummaryOfEarlierConversation = null;
        mockDetailEntity.SummaryPromptRunID = null;
        mockDetailEntity.Load.mockClear().mockResolvedValue(true);
        mockDetailEntity.Save.mockClear().mockResolvedValue(true);
        mockExecutePrompt.mockReset().mockResolvedValue({
            success: true,
            result: 'NEW SUMMARY',
            promptRun: { ID: 'PROMPT-RUN-1' },
        });
    });

    describe('ResolveEffectiveBudget', () => {
        it('agent value wins over type and model', () => {
            const b = ConversationCompactionManager.ResolveEffectiveBudget(
                makeAgent({ ContextWindowMaxTokens: 50_000 }) as never,
                makeType({ ContextWindowMaxTokens: 90_000 }) as never,
                200_000
            );
            expect(b.MaxTokens).toBe(50_000);
            expect(b.BoundedBy).toBe('Agent');
            expect(b.ClampedToModel).toBe(false);
        });

        it('type value used when agent is null; model when both null; default when all unknown', () => {
            expect(ConversationCompactionManager.ResolveEffectiveBudget(makeAgent() as never, makeType({ ContextWindowMaxTokens: 90_000 }) as never, 200_000))
                .toMatchObject({ MaxTokens: 90_000, BoundedBy: 'AgentType' });
            expect(ConversationCompactionManager.ResolveEffectiveBudget(makeAgent() as never, makeType() as never, 200_000))
                .toMatchObject({ MaxTokens: 200_000, BoundedBy: 'Model' });
            expect(ConversationCompactionManager.ResolveEffectiveBudget(makeAgent() as never, makeType() as never, null))
                .toMatchObject({ MaxTokens: 8000, BoundedBy: 'Default' });
        });

        it('clamps a configured budget that exceeds the model and flags it', () => {
            const b = ConversationCompactionManager.ResolveEffectiveBudget(
                makeAgent({ ContextWindowMaxTokens: 500_000 }) as never,
                makeType() as never,
                128_000
            );
            expect(b.MaxTokens).toBe(128_000);
            expect(b.ClampedToModel).toBe(true);
            expect(b.BoundedBy).toBe('Model');
        });

        it('computes trigger/target from percents with agent-over-type precedence', () => {
            const b = ConversationCompactionManager.ResolveEffectiveBudget(
                makeAgent({ ContextWindowMaxTokens: 10_000, CompactionTriggerPercent: 50 }) as never,
                makeType({ CompactionTargetPercent: 20 }) as never,
                null
            );
            expect(b.TriggerTokens).toBe(5000);  // agent's 50%
            expect(b.TargetTokens).toBe(2000);   // type's 20%
        });

        it('null type falls back to framework percent defaults (75/30)', () => {
            const b = ConversationCompactionManager.ResolveEffectiveBudget(
                makeAgent({ ContextWindowMaxTokens: 10_000 }) as never,
                null,
                null
            );
            expect(b.TriggerTokens).toBe(7500);
            expect(b.TargetTokens).toBe(3000);
        });
    });

    describe('CompactIfNeeded', () => {
        it('no-ops (no prompt call, no write) when the window is under the trigger', async () => {
            mockRows.rows = [sourceRow(1, 'User', 'short')];
            const outcome = await ConversationCompactionManager.CompactIfNeeded(baseInput() as never);
            expect(outcome.Fired).toBe(false);
            expect(outcome.SkippedReason).toContain('under');
            expect(mockExecutePrompt).not.toHaveBeenCalled();
            expect(mockDetailEntity.Save).not.toHaveBeenCalled();
        });

        it('fires over the trigger: recursive input = prior summary + delta only, boundary row written', async () => {
            // 6 messages × 1000 chars; row 1 also carries the prior summary. Trigger 100;
            // target 2000 with reserve 1500 → tail budget 500 → even one message (1000)
            // exceeds it, and the newest-row clamp then forces the boundary to seq 5
            // (never the newest row). Delta = seq 1..4.
            const text = 'x'.repeat(1000);
            mockRows.rows = [1, 2, 3, 4, 5, 6].map(n =>
                sourceRow(n, n % 2 ? 'User' : 'AI', text, n === 1 ? 'OLD SUMMARY' : undefined));
            const outcome = await ConversationCompactionManager.CompactIfNeeded(baseInput() as never);

            expect(outcome.Fired).toBe(true);
            expect(outcome.BoundarySequence).toBe(5);
            expect(outcome.PromptRunId).toBe('PROMPT-RUN-1');
            expect(outcome.SummaryText).toBe('NEW SUMMARY');
            expect(outcome.PromptRun).toEqual({ ID: 'PROMPT-RUN-1' });

            // Recursive pattern: prompt data = prior summary + ONLY the folded delta
            const promptParams = mockExecutePrompt.mock.calls[0][0];
            expect(promptParams.data.priorSummary).toBe('OLD SUMMARY');
            expect(promptParams.data.deltaMessages).toContain('[seq 1]');
            expect(promptParams.data.deltaMessages).toContain('[seq 4]');
            expect(promptParams.data.deltaMessages).not.toContain('[seq 5]');
            expect(promptParams.data.deltaMessages).not.toContain('[seq 6]');

            // Boundary row write: summary + prompt-run linkage through the entity save path
            expect(mockDetailEntity.Load).toHaveBeenCalledWith('detail-5');
            expect(mockDetailEntity.SummaryOfEarlierConversation).toBe('NEW SUMMARY');
            expect(mockDetailEntity.SummaryPromptRunID).toBe('PROMPT-RUN-1');
            expect(mockDetailEntity.Save).toHaveBeenCalled();
        });

        it('never selects the newest raw row as boundary, even when it alone exceeds the tail budget', async () => {
            // seq 4 (1000 chars) alone exceeds the 500-token tail budget — unclamped, the
            // walk would leave the boundary on seq 4 (the newest). The clamp forces seq 3.
            mockRows.rows = [
                sourceRow(1, 'User', 'a'.repeat(2000)),
                sourceRow(2, 'AI', 'b'.repeat(2000)),
                sourceRow(3, 'User', 'c'.repeat(2000)),
                sourceRow(4, 'AI', 'd'.repeat(1000)),
            ];
            const outcome = await ConversationCompactionManager.CompactIfNeeded(baseInput() as never);
            expect(outcome.Fired).toBe(true);
            expect(outcome.BoundarySequence).toBe(3);
            expect(mockDetailEntity.Load).toHaveBeenCalledWith('detail-3');
        });

        it('honors ExcludeDetailIds — the in-flight placeholder row never participates in the fold', async () => {
            const text = 'x'.repeat(1000);
            // Without the exclusion, seq 7 (the placeholder) would be the newest row and
            // the clamped boundary would land on seq 6; with it, the boundary is seq 5.
            mockRows.rows = [1, 2, 3, 4, 5, 6, 7].map(n => sourceRow(n, 'User', text));
            const outcome = await ConversationCompactionManager.CompactIfNeeded(baseInput({
                ExcludeDetailIds: ['detail-7'],
            }) as never);
            expect(outcome.Fired).toBe(true);
            expect(outcome.BoundarySequence).toBe(5);
            expect(mockDetailEntity.Load).toHaveBeenCalledWith('detail-5');
        });

        it('stamps AgentRunId onto the summary prompt params (per-run cost rollup linkage)', async () => {
            mockRows.rows = [1, 2, 3, 4, 5, 6].map(n => sourceRow(n, 'User', 'x'.repeat(1000)));
            const outcome = await ConversationCompactionManager.CompactIfNeeded(baseInput({
                AgentRunId: 'RUN-42',
            }) as never);
            expect(outcome.Fired).toBe(true);
            const promptParams = mockExecutePrompt.mock.calls[0][0];
            expect(promptParams.agentRunId).toBe('RUN-42');
        });

        it('fails LOUD (error outcome, no prompt, no write) when the window load fails', async () => {
            mockRows.success = false;
            mockRows.errorMessage = 'db unreachable';
            const outcome = await ConversationCompactionManager.CompactIfNeeded(baseInput() as never);
            expect(outcome.Fired).toBe(false);
            expect(outcome.ErrorMessage).toContain('Failed to load conversation window');
            expect(outcome.ErrorMessage).toContain('db unreachable');
            expect(mockExecutePrompt).not.toHaveBeenCalled();
            expect(mockDetailEntity.Save).not.toHaveBeenCalled();
        });

        it('skips (no LLM call) when the projected gain is under the minimum — the churn guard', async () => {
            // The live-observed degenerate config: a large prior summary + small tail with a
            // tiny budget. 5 × 150-char messages → tail budget 500 keeps 3 (450), folding 2:
            // before ≈ 1300 + 750 = 2050; projected after ≈ 1500 + 450 = 1950 → gain ~100 < 500.
            mockRows.rows = [19, 20, 21, 22, 23].map(n =>
                sourceRow(n, 'User', 'y'.repeat(150), n === 19 ? 's'.repeat(1300) : undefined));
            const outcome = await ConversationCompactionManager.CompactIfNeeded(baseInput({ ConversationId: 'CONV-CHURN-A' }) as never);
            expect(outcome.Fired).toBe(false);
            expect(outcome.SkippedReason).toContain('Projected gain');
            expect(mockExecutePrompt).not.toHaveBeenCalled();
            expect(mockDetailEntity.Save).not.toHaveBeenCalled();
        });

        it('warns exactly once per conversation when the summary alone meets the trigger', async () => {
            mockRows.rows = [19, 20, 21, 22, 23].map(n =>
                sourceRow(n, 'User', 'y'.repeat(150), n === 19 ? 's'.repeat(1300) : undefined));
            const first = await ConversationCompactionManager.CompactIfNeeded(baseInput({ ConversationId: 'CONV-CHURN-B' }) as never);
            const second = await ConversationCompactionManager.CompactIfNeeded(baseInput({ ConversationId: 'CONV-CHURN-B' }) as never);
            expect(first.Warnings.some(w => w.includes('can never get under the trigger'))).toBe(true);
            expect(second.Warnings.some(w => w.includes('can never get under the trigger'))).toBe(false);
        });

        it('skips when there are too few addressable messages to fold', async () => {
            mockRows.rows = [1, 2, 3].map(n => sourceRow(n, 'User', 'x'.repeat(200)));
            const outcome = await ConversationCompactionManager.CompactIfNeeded(baseInput() as never);
            expect(outcome.Fired).toBe(false);
            expect(outcome.SkippedReason).toContain('No foldable boundary');
            expect(mockExecutePrompt).not.toHaveBeenCalled();
        });

        it('contains prompt failures: no write, error surfaced, conversation untouched', async () => {
            mockExecutePrompt.mockResolvedValue({ success: false, errorMessage: 'model exploded', promptRun: { ID: 'RUN-X' } });
            mockRows.rows = [1, 2, 3, 4, 5, 6].map(n => sourceRow(n, 'User', 'x'.repeat(1000)));
            const outcome = await ConversationCompactionManager.CompactIfNeeded(baseInput() as never);
            expect(outcome.Fired).toBe(false);
            expect(outcome.ErrorMessage).toBe('model exploded');
            expect(mockDetailEntity.Save).not.toHaveBeenCalled();
        });

        it('surfaces a failed boundary-row save as an error outcome', async () => {
            mockDetailEntity.Save.mockResolvedValue(false);
            mockDetailEntity.LatestResult.CompleteMessage = 'FK violation';
            mockRows.rows = [1, 2, 3, 4, 5, 6].map(n => sourceRow(n, 'User', 'x'.repeat(1000)));
            const outcome = await ConversationCompactionManager.CompactIfNeeded(baseInput() as never);
            expect(outcome.Fired).toBe(false);
            expect(outcome.ErrorMessage).toContain('FK violation');
        });

        it('uses the agent/type ConversationSummaryPromptID override when set', async () => {
            mockRows.rows = [1, 2, 3, 4, 5, 6].map(n => sourceRow(n, 'User', 'x'.repeat(1000)));
            const outcome = await ConversationCompactionManager.CompactIfNeeded(baseInput({
                Agent: makeAgent({ ConversationSummaryPromptID: 'PROMPT-OVERRIDE' }) as never,
            }) as never);
            expect(outcome.Fired).toBe(true);
            expect(outcome.PromptId).toBe('PROMPT-OVERRIDE');
        });

        it('serializes concurrent passes for the same conversation (re-entrancy guard)', async () => {
            mockRows.rows = [1, 2, 3, 4, 5, 6].map(n => sourceRow(n, 'User', 'x'.repeat(1000)));
            let releasePrompt: (value: unknown) => void = () => undefined;
            mockExecutePrompt.mockImplementation(() => new Promise(resolve => {
                releasePrompt = () => resolve({ success: true, result: 'NEW SUMMARY', promptRun: { ID: 'PROMPT-RUN-1' } });
            }));

            const first = ConversationCompactionManager.CompactIfNeeded(baseInput() as never);
            // Give the first call a tick to take the in-flight slot
            await new Promise(resolve => setImmediate(resolve));
            const second = await ConversationCompactionManager.CompactIfNeeded(baseInput() as never);
            expect(second.Fired).toBe(false);
            expect(second.SkippedReason).toContain('in flight');

            releasePrompt(undefined);
            const firstOutcome = await first;
            expect(firstOutcome.Fired).toBe(true);
        });
    });
});
