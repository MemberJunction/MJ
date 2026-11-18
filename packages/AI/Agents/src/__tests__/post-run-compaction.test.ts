/**
 * Unit tests for Item 3.1: Automatic Post-Run Compaction, Memory Extraction & Scratchpad Pruning (`compactAfterRun`).
 *
 * Verifies:
 * 1. `compactAfterRun: false` / `undefined` / `{ enabled: false }` leaves `conversationMessages` and scratchpad untouched.
 * 2. `compactAfterRun: true` and `{ enabled: true, messageCountThreshold: N }` compacts older messages once the
 *    threshold is reached while preserving `index 0` (initial goal), `system` messages, already-compacted messages,
 *    and the most recent turns.
 * 3. `maxScratchpadNotes` prunes excess low-priority scratchpad note lines first (preserving `[HIGH]`, `[IMPORTANT]`,
 *    `[PINNED]`, `❗`, `⚠️`) and trims completed tasks via `ScratchpadManager`.
 * 4. `extractMemories` triggers `triggerPostRunMemoryExtraction` when `agentRun.Success` is `true`, and skips when
 *    `extractMemories === false` or `agentRun.Success === false`.
 * 5. Error containment: exceptions inside `runPostRunCompaction` or individual phases are caught and logged via
 *    `LogError` without failing `finalizeAgentRun`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
    AgentChatMessage,
    BaseAgentNextStep,
    ExecuteAgentParams,
    ExecuteAgentResult,
    MessageLifecycleEvent,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { ChatMessage } from '@memberjunction/ai';
import * as mjCore from '@memberjunction/core';

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            get Agents(): MJAIAgentEntityExtended[] {
                return [];
            },
            get Skills(): never[] {
                return [];
            },
            get AgentRelationships(): never[] {
                return [];
            },
            GetSkillsForAgent: (): never[] => [],
            GetAutoActivatableSkillsForAgent: (): never[] => [],
        },
    },
}));

import { BaseAgent } from '../base-agent';
import { ScratchpadManager } from '../ScratchpadManager';

class TestablePostRunAgent extends BaseAgent {
    public MemoryExtractionCalls: Array<{ params: ExecuteAgentParams; agentRun: MJAIAgentRunEntityExtended }> = [];
    public ThrowOnMemoryExtraction = false;
    public ThrowOnRunPostRunCompaction = false;
    public ThrowOnCompactMessage = false;

    public get Scratchpad(): ScratchpadManager {
        return this.scratchpadManager;
    }

    public BindRunContext(params: ExecuteAgentParams, agentRun: MJAIAgentRunEntityExtended): void {
        this._executeParams = params;
        this._agentRun = agentRun;
    }

    public async InvokeRunPostRunCompaction(
        params: ExecuteAgentParams,
        agentRun: MJAIAgentRunEntityExtended
    ): Promise<void> {
        return super.runPostRunCompaction(params, agentRun);
    }

    public async InvokeFinalizeAgentRun<P>(
        finalStep: BaseAgentNextStep<P>,
        payload?: P
    ): Promise<ExecuteAgentResult<P>> {
        return super.finalizeAgentRun(finalStep, payload);
    }

    protected override async runPostRunCompaction(
        params: ExecuteAgentParams,
        agentRun: MJAIAgentRunEntityExtended
    ): Promise<void> {
        if (this.ThrowOnRunPostRunCompaction) {
            throw new Error('Simulated fatal compaction failure');
        }
        return super.runPostRunCompaction(params, agentRun);
    }

    protected override async triggerPostRunMemoryExtraction(
        params: ExecuteAgentParams,
        agentRun: MJAIAgentRunEntityExtended
    ): Promise<void> {
        if (this.ThrowOnMemoryExtraction) {
            throw new Error('Simulated memory extraction failure');
        }
        this.MemoryExtractionCalls.push({ params, agentRun });
    }

    protected override async compactMessage(
        message: AgentChatMessage,
        config: {
            compactMode: 'First N Chars' | 'AI Summary';
            compactLength: number;
            compactPromptId: string;
            originalLength: number;
        },
        params: ExecuteAgentParams
    ): Promise<string> {
        if (this.ThrowOnCompactMessage) {
            throw new Error('Simulated compactMessage failure');
        }
        return super.compactMessage(message, config, params);
    }

    protected override logStatus(_message: string): void {
        // Silence console output in unit tests
    }
}

function createFakeAgentRun(success = true): MJAIAgentRunEntityExtended {
    const runRecord = {
        ID: 'run-test-001',
        AgentID: 'agent-test-001',
        Status: success ? 'Completed' : 'Failed',
        Success: success,
        ErrorMessage: null as string | null,
        CompletedAt: null as Date | null,
        FinalStep: null as string | null,
        Message: null as string | null,
        FinalPayloadObject: null as Record<string, string> | null,
        FinalPayload: null as string | null,
        TotalTokensUsed: 0,
        TotalCost: 0,
        TotalPromptTokensUsed: 0,
        TotalCompletionTokensUsed: 0,
        TotalTokensUsedRollup: 0,
        TotalPromptTokensUsedRollup: 0,
        TotalCompletionTokensUsedRollup: 0,
        TotalCostRollup: 0,
        Steps: [] as never[],
        Save: vi.fn().mockResolvedValue(true),
    };
    return runRecord as Parameters<TestablePostRunAgent['InvokeRunPostRunCompaction']>[1];
}

function createFakeParams(
    messages: ChatMessage[],
    compactAfterRun?: ExecuteAgentParams['compactAfterRun'],
    onMessageLifecycle?: ExecuteAgentParams['onMessageLifecycle']
): ExecuteAgentParams {
    const agentEntity = {
        ID: 'agent-test-001',
        Name: 'TestAgent',
        InjectNotes: true,
        InjectExamples: false,
    } as ExecuteAgentParams['agent'];

    const contextUser = {
        ID: 'user-test-001',
        Name: 'Tester',
    } as ExecuteAgentParams['contextUser'];

    return {
        agent: agentEntity,
        conversationMessages: messages,
        contextUser,
        compactAfterRun,
        onMessageLifecycle,
    };
}

function buildLongMessages(count: number, bodyRepeats = 40): ChatMessage[] {
    const messages: ChatMessage[] = [
        {
            role: 'user',
            content: 'Initial user goal: Analyze quarterly revenue across all regions and summarize anomalies.',
        },
    ];
    for (let i = 1; i < count; i++) {
        messages.push({
            role: 'user',
            content: `Message #${i}: ` + 'Detailed tool output and intermediate analysis data. '.repeat(bodyRepeats),
            metadata: {
                turnAdded: i,
                messageType: 'action-result',
            },
        } as AgentChatMessage);
    }
    return messages;
}

describe('BaseAgent post-run compaction (compactAfterRun)', () => {
    let agent: TestablePostRunAgent;

    beforeEach(() => {
        agent = new TestablePostRunAgent();
        vi.restoreAllMocks();
    });

    describe('disabled / opt-in configuration', () => {
        it('does nothing when compactAfterRun is undefined', async () => {
            const messages = buildLongMessages(25);
            const originalContents = messages.map(m => m.content);
            const params = createFakeParams(messages, undefined);
            const run = createFakeAgentRun(true);

            await agent.InvokeRunPostRunCompaction(params, run);

            expect(messages.map(m => m.content)).toEqual(originalContents);
            expect(agent.MemoryExtractionCalls).toHaveLength(0);
        });

        it('does nothing when compactAfterRun is false', async () => {
            const messages = buildLongMessages(25);
            const originalContents = messages.map(m => m.content);
            const params = createFakeParams(messages, false);
            const run = createFakeAgentRun(true);

            await agent.InvokeRunPostRunCompaction(params, run);

            expect(messages.map(m => m.content)).toEqual(originalContents);
            expect(agent.MemoryExtractionCalls).toHaveLength(0);
        });

        it('does nothing when compactAfterRun.enabled is false', async () => {
            const messages = buildLongMessages(25);
            const originalContents = messages.map(m => m.content);
            agent.Scratchpad.SetNotes('Note 1\nNote 2\nNote 3\nNote 4');
            const params = createFakeParams(messages, {
                enabled: false,
                messageCountThreshold: 5,
                maxScratchpadNotes: 1,
                extractMemories: true,
            });
            const run = createFakeAgentRun(true);

            await agent.InvokeRunPostRunCompaction(params, run);

            expect(messages.map(m => m.content)).toEqual(originalContents);
            expect(agent.Scratchpad.GetNoteLines()).toHaveLength(4);
            expect(agent.MemoryExtractionCalls).toHaveLength(0);
        });
    });

    describe('message window pre-compaction', () => {
        it('does not compact messages when message count is below threshold', async () => {
            const messages = buildLongMessages(8);
            const originalContents = messages.map(m => m.content);
            const params = createFakeParams(messages, true); // default threshold = 20
            const run = createFakeAgentRun(true);

            await agent.InvokeRunPostRunCompaction(params, run);

            expect(messages.map(m => m.content)).toEqual(originalContents);
            // Memory extraction still runs because compactAfterRun: true enables extractMemories by default
            expect(agent.MemoryExtractionCalls).toHaveLength(1);
        });

        it('compacts older messages while preserving index 0 and the most recent 4 messages when >= 9 messages', async () => {
            const messages = buildLongMessages(10);
            const originalGoal = messages[0].content;
            const recentTailOriginals = messages.slice(6).map(m => m.content);
            const lifecycleEvents: MessageLifecycleEvent[] = [];

            const params = createFakeParams(
                messages,
                {
                    enabled: true,
                    messageCountThreshold: 6,
                    extractMemories: false,
                },
                (event) => lifecycleEvents.push(event)
            );
            const run = createFakeAgentRun(true);

            await agent.InvokeRunPostRunCompaction(params, run);

            // Index 0 (initial goal) is preserved verbatim
            expect(messages[0].content).toBe(originalGoal);
            expect((messages[0] as AgentChatMessage).metadata?.wasCompacted).toBeUndefined();

            // Messages 1..5 are compacted in-place with expansion metadata
            for (let i = 1; i <= 5; i++) {
                const msg = messages[i] as AgentChatMessage;
                expect(msg.metadata?.wasCompacted).toBe(true);
                expect(msg.metadata?.canExpand).toBe(true);
                expect(msg.metadata?.originalContent).toBeDefined();
                expect((msg.metadata?.tokensSaved ?? 0)).toBeGreaterThan(0);
                expect(String(msg.content)).toContain('[Compacted:');
            }

            // Last 4 messages (indices 6..9) are preserved verbatim
            expect(messages.slice(6).map(m => m.content)).toEqual(recentTailOriginals);
            for (let i = 6; i < 10; i++) {
                expect((messages[i] as AgentChatMessage).metadata?.wasCompacted).toBeUndefined();
            }

            // Lifecycle callback invoked once for each compacted message (indices 1..5)
            expect(lifecycleEvents).toHaveLength(5);
            expect(lifecycleEvents.map(e => e.messageIndex)).toEqual([1, 2, 3, 4, 5]);
            expect(lifecycleEvents.every(e => e.type === 'message-compacted')).toBe(true);
        });

        it('skips system messages, already-compacted messages, summary messages, and volatileState fragments', async () => {
            const messages: AgentChatMessage[] = [
                { role: 'user', content: 'Goal message' },
                { role: 'system', content: 'System instruction '.repeat(50) },
                {
                    role: 'user',
                    content: 'Already compacted snippet',
                    metadata: { messageType: 'action-result', wasCompacted: true },
                },
                {
                    role: 'user',
                    content: 'Prior conversation summary '.repeat(50),
                    metadata: { isConversationSummary: true },
                },
                {
                    role: 'user',
                    content: '<mj-runtime-state>volatile</mj-runtime-state>',
                    metadata: { volatileState: true },
                },
                {
                    role: 'user',
                    content: 'Volatile action result that should be compacted. '.repeat(40),
                    metadata: { messageType: 'action-result', turnAdded: 1 },
                },
                { role: 'user', content: 'Recent 1' },
                { role: 'assistant', content: 'Recent 2' },
                { role: 'user', content: 'Recent 3' },
                { role: 'assistant', content: 'Recent 4' },
            ];

            const params = createFakeParams(messages, {
                enabled: true,
                messageCountThreshold: 6,
                extractMemories: false,
            });
            const run = createFakeAgentRun(true);

            await agent.InvokeRunPostRunCompaction(params, run);

            // Indices 1..4 skipped; only index 5 was newly compacted
            expect(messages[1].content).toBe('System instruction '.repeat(50));
            expect(messages[2].content).toBe('Already compacted snippet');
            expect(messages[3].content).toBe('Prior conversation summary '.repeat(50));
            expect(messages[4].content).toBe('<mj-runtime-state>volatile</mj-runtime-state>');
            expect(messages[5].metadata?.wasCompacted).toBe(true);
            expect(String(messages[5].content)).toContain('[Compacted:');
        });

        it('skips non-volatile user/assistant conversational messages, messages with toolCalls, and legacy isCompacted messages', async () => {
            const plainUserContent = 'User conversational follow-up '.repeat(30);
            const plainAssistantContent = 'Assistant conversational reply '.repeat(30);
            const toolCallAssistantContent = 'Calling search tool '.repeat(30);
            const legacyCompactedContent = 'Legacy compacted action output '.repeat(30);
            const volatileSubAgentContent = 'Sub-agent detailed result payload '.repeat(40);

            const messages: AgentChatMessage[] = [
                { role: 'user', content: 'Initial user goal' },
                { role: 'user', content: plainUserContent },
                { role: 'assistant', content: plainAssistantContent },
                {
                    role: 'assistant',
                    content: toolCallAssistantContent,
                    toolCalls: [{ id: 'call-1', type: 'function', function: { name: 'search', arguments: '{}' } }],
                    metadata: { messageType: 'action-result' },
                },
                {
                    role: 'user',
                    content: legacyCompactedContent,
                    metadata: { messageType: 'action-result', isCompacted: true } as AgentChatMessage['metadata'],
                },
                {
                    role: 'user',
                    content: volatileSubAgentContent,
                    metadata: { messageType: 'sub-agent-result', turnAdded: 2 },
                },
                { role: 'user', content: 'Recent 1' },
                { role: 'assistant', content: 'Recent 2' },
                { role: 'user', content: 'Recent 3' },
                { role: 'assistant', content: 'Recent 4' },
            ];

            const params = createFakeParams(messages, {
                enabled: true,
                messageCountThreshold: 6,
                extractMemories: false,
            });
            const run = createFakeAgentRun(true);

            await agent.InvokeRunPostRunCompaction(params, run);

            // Indices 1..4 are untouched
            expect(messages[1].content).toBe(plainUserContent);
            expect(messages[1].metadata?.wasCompacted).toBeUndefined();
            expect(messages[2].content).toBe(plainAssistantContent);
            expect(messages[2].metadata?.wasCompacted).toBeUndefined();
            expect(messages[3].content).toBe(toolCallAssistantContent);
            expect(messages[3].metadata?.wasCompacted).toBeUndefined();
            expect(messages[4].content).toBe(legacyCompactedContent);
            expect(messages[4].metadata?.wasCompacted).toBeUndefined();

            // Index 5 (volatile sub-agent-result) is compacted
            expect(messages[5].metadata?.wasCompacted).toBe(true);
            expect(String(messages[5].content)).toContain('[Compacted:');
        });
    });

    describe('scratchpad pruning', () => {
        it('prunes excess low-priority scratchpad notes first while preserving high-priority notes and trims completed tasks', async () => {
            agent.Scratchpad.SetNotes([
                'Low priority step 1 observation',
                '[HIGH] Must filter by OrganizationID',
                'Low priority step 2 observation',
                '[PINNED] Primary currency is USD',
                '⚠️ Rate limit is 100 req/min',
                'Latest low priority step 3 observation',
            ].join('\n'));

            agent.Scratchpad.UpsertTasks([
                { id: 't1', title: 'Done 1', status: 'completed' },
                { id: 't2', title: 'Done 2', status: 'completed' },
                { id: 't3', title: 'Done 3', status: 'completed' },
                { id: 't4', title: 'Active 1', status: 'in_progress' },
                { id: 't5', title: 'Pending 1', status: 'pending' },
            ]);

            const params = createFakeParams(buildLongMessages(4), {
                enabled: true,
                messageCountThreshold: 50,
                maxScratchpadNotes: 4,
                extractMemories: false,
            });
            const run = createFakeAgentRun(true);

            await agent.InvokeRunPostRunCompaction(params, run);

            // Notes pruned from 6 down to 4: oldest two low-priority notes removed, all 3 high-priority + newest low-priority kept
            expect(agent.Scratchpad.GetNoteLines()).toEqual([
                '[HIGH] Must filter by OrganizationID',
                '[PINNED] Primary currency is USD',
                '⚠️ Rate limit is 100 req/min',
                'Latest low priority step 3 observation',
            ]);

            // Tasks pruned from 5 down to 4 (oldest completed task t1 removed)
            expect(agent.Scratchpad.GetTasks().map(t => t.id)).toEqual(['t2', 't3', 't4', 't5']);
        });
    });

    describe('memory extraction trigger', () => {
        it('triggers post-run memory extraction when extractMemories is true and agentRun.Success is true', async () => {
            const params = createFakeParams(buildLongMessages(4), {
                enabled: true,
                extractMemories: true,
            });
            const run = createFakeAgentRun(true);

            await agent.InvokeRunPostRunCompaction(params, run);

            expect(agent.MemoryExtractionCalls).toHaveLength(1);
            expect(agent.MemoryExtractionCalls[0].agentRun).toBe(run);
        });

        it('does not trigger memory extraction when agentRun.Success is false', async () => {
            const params = createFakeParams(buildLongMessages(4), {
                enabled: true,
                extractMemories: true,
            });
            const run = createFakeAgentRun(false);

            await agent.InvokeRunPostRunCompaction(params, run);

            expect(agent.MemoryExtractionCalls).toHaveLength(0);
        });

        it('does not trigger memory extraction when extractMemories is false', async () => {
            const params = createFakeParams(buildLongMessages(4), {
                enabled: true,
                extractMemories: false,
            });
            const run = createFakeAgentRun(true);

            await agent.InvokeRunPostRunCompaction(params, run);

            expect(agent.MemoryExtractionCalls).toHaveLength(0);
        });
    });

    describe('error isolation & finalizeAgentRun resilience', () => {
        it('catches and logs errors in runPostRunCompaction inside finalizeAgentRun without failing the run', async () => {
            const logErrorSpy = vi.spyOn(mjCore, 'LogError').mockImplementation(() => undefined);
            const params = createFakeParams(buildLongMessages(4), true);
            const run = createFakeAgentRun(true);

            agent.BindRunContext(params, run);
            agent.ThrowOnRunPostRunCompaction = true;

            const finalStep: BaseAgentNextStep<{ answer: string }> = {
                step: 'Success',
                terminate: true,
                newPayload: { answer: 'done' },
            };

            const result = await agent.InvokeFinalizeAgentRun(finalStep, { answer: 'done' });

            expect(result.success).toBe(true);
            expect(run.Status).toBe('Completed');
            expect(run.Success).toBe(true);
            expect(logErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Post-run compaction error for agent run run-test-001 (contained): Simulated fatal compaction failure')
            );
        });

        it('isolates errors between phases inside runPostRunCompaction so later phases still run', async () => {
            const logErrorSpy = vi.spyOn(mjCore, 'LogError').mockImplementation(() => undefined);
            agent.ThrowOnCompactMessage = true;
            agent.ThrowOnMemoryExtraction = true;
            agent.Scratchpad.SetNotes('Note 1\nNote 2\nNote 3');

            const params = createFakeParams(buildLongMessages(10), {
                enabled: true,
                messageCountThreshold: 5,
                maxScratchpadNotes: 1,
                extractMemories: true,
            });
            const run = createFakeAgentRun(true);

            // Should not throw despite both compactMessage and triggerPostRunMemoryExtraction throwing
            await expect(agent.InvokeRunPostRunCompaction(params, run)).resolves.toBeUndefined();

            // Scratchpad pruning (Phase 2) still succeeded between failing Phase 1 and failing Phase 3
            expect(agent.Scratchpad.GetNoteLines()).toEqual(['Note 3']);
            expect(logErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Post-run message window compaction failed (contained): Simulated compactMessage failure')
            );
            expect(logErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Post-run memory extraction failed (contained): Simulated memory extraction failure')
            );
        });
    });
});
