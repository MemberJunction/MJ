/**
 * agent-consult.checks.ts — the 'agent-consult' bundle (AC1), VS-CON-4.
 *
 * Deterministic, server-transport, zero-LLM integration check for the sub-agent consult,
 * escalation, request creation, open-consult reload, and resumeRunId chain end to end:
 *
 * 1. `IT: Consult Parent` (`DriverClass = ITConsultParentAgent`, `ChatHandlingOption = Consult`,
 *    `MaxSubAgentConsultRounds = 1`) delegates to `IT: Consult Child` (`DriverClass = ITConsultChildAgent`).
 * 2. The child returns a `Chat` question ("Which aspect ratio should I use: 16:9 or 9:16?").
 * 3. `BaseAgent` records the consult on the Sub-Agent step's `OutputData.consult`, injects a
 *    `sub-agent-consult` message into the parent's loop, and continues (`terminate: false`).
 * 4. On its next turn, the parent escalates with its own `Chat` step. At `_depth === 0`, the
 *    parent run ends `AwaitingFeedback` (`FinalStep = 'Chat'`) and creates one `Requested`
 *    row in `MJ: AI Agent Requests`.
 * 5. Setting `Status = 'Responded'` and `Response` on that request and calling `Save()` triggers
 *    `MJAIAgentRequestEntityServer.resumeAgent()`, which spawns the resumed parent run via
 *    `AgentRunner.RunAgentInConversation(..., lastRunId = parentRun1.ID)`.
 * 6. During pre-execution (`loadOpenConsults` + `applyOpenConsults`), the resumed parent reloads
 *    the unanswered consult from `parentRun1`'s Sub-Agent step, re-populates `_openSubAgentConsults`,
 *    and injects the reloaded `sub-agent-consult` message BEFORE the user's answer message.
 * 7. `ITConsultParentAgent` extracts the child run ID from the injected consult message and
 *    invokes `IT: Consult Child` with `resumeRunId`.
 * 8. `ITConsultChildAgent` runs with `LastRunID = childRun1.ID` and sees
 *    `assistant: <question>` followed by `user: <answer>` on its first prompt, then completes.
 * 9. Both resumed runs finish `Completed`, and zero live model calls occur.
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import type { ChatMessage } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentRunner, BaseAgent } from '@memberjunction/ai-agents';
import type {
    AIPromptParams,
    AIPromptRunResult,
    MJAIAgentEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { MJAIAgentRequestEntity } from '@memberjunction/core-entities';
import { TestLLM, RegisterTestLLM } from '@memberjunction/unit-testing';
import {
    Assert,
    AssertEqual,
    IntegrationCheckContext,
    IntegrationCheckRegistry,
    NamedCheck,
    settle,
} from '@memberjunction/testing-integration';
import { DeleteById, RequireRows } from './agent-live-shared';

const PARENT_AGENT_NAME = 'IT: Consult Parent';
const CHILD_AGENT_NAME = 'IT: Consult Child';
const CHILD_QUESTION = 'Which aspect ratio should I use: 16:9 or 9:16?';
const USER_ANSWER = 'Use 16:9 landscape.';
const RESUME_POLL_ATTEMPTS = 60;
const RESUME_POLL_INTERVAL_MS = 250;
const CHAT_DRIVER_CLASSES: readonly string[] = [
    'OpenAILLM',
    'AzureLLM',
    'OpenRouterLLM',
    'AnthropicLLM',
    'GeminiLLM',
    'CerebrasLLM',
    'GroqLLM',
];

// ─── Scripted Agent Recording State ──────────────────────────────────────────────────────────────

interface RecordedPromptTurn {
    AgentClass: 'ITConsultParentAgent' | 'ITConsultChildAgent';
    Messages: Array<{ role: string; content: string; isVolatile: boolean }>;
}

interface ConsultScriptState {
    Turns: RecordedPromptTurn[];
    ExtractedResumeRunId: string | null;
}

let activeScriptState: ConsultScriptState | undefined;

function extractMessageText(content: ChatMessage['content']): string {
    if (typeof content === 'string') {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .map(block => (typeof block === 'object' && block !== null && 'text' in block && typeof block.text === 'string' ? block.text : ''))
            .join('\n');
    }
    return String(content ?? '');
}

function snapshotMessages(promptParams: AIPromptParams): Array<{ role: string; content: string; isVolatile: boolean }> {
    const raw: ChatMessage[] = promptParams.conversationMessages ?? [];
    return raw.map((m: ChatMessage) => {
        const meta = (m as unknown as { metadata?: { volatileState?: boolean } }).metadata;
        return {
            role: m.role,
            content: extractMessageText(m.content),
            isVolatile: meta?.volatileState === true,
        };
    });
}

function makeScriptedPromptResult(responsePayload: Record<string, unknown>): AIPromptRunResult {
    return {
        success: true,
        status: 'Completed',
        result: JSON.stringify(responsePayload),
    } as AIPromptRunResult;
}

// ─── Scripted BaseAgent Subclasses ───────────────────────────────────────────────────────────────

/**
 * Scripted parent agent (`DriverClass = ITConsultParentAgent`).
 * Overrides `executePrompt` so no `AIPromptRunner` or LLM call is made.
 */
@RegisterClass(BaseAgent, 'ITConsultParentAgent')
export class ITConsultParentAgent extends BaseAgent {
    protected override async executePrompt(promptParams: AIPromptParams): Promise<AIPromptRunResult> {
        const messages = snapshotMessages(promptParams);
        activeScriptState?.Turns.push({
            AgentClass: 'ITConsultParentAgent',
            Messages: messages,
        });
        const nonVolatile = messages.filter(m => !m.isVolatile);

        // Case 1: Resumed parent after child has completed its resumed run
        const hasCompletedChildResult = nonVolatile.some(
            m => m.content.includes('Brand reel built in 16:9 landscape.') || m.content.includes('"aspectRatio":"16:9"')
        );
        if (hasCompletedChildResult) {
            return makeScriptedPromptResult({
                taskComplete: true,
                message: 'Completed brand reel in 16:9 landscape after consulting user.',
            });
        }

        // Case 2: Resumed parent run — sees the reloaded open-consult message ("You asked your caller about a question from sub-agent")
        const reloadedConsultMsg = nonVolatile.find(m =>
            m.content.includes('You asked your caller about a question from sub-agent')
        );
        if (reloadedConsultMsg) {
            const match = reloadedConsultMsg.content.match(/resumeRunId:\s*"([0-9a-fA-F-]{36})"/);
            const childRunId = match ? match[1] : '';
            if (activeScriptState && childRunId) {
                activeScriptState.ExtractedResumeRunId = childRunId;
            }
            const lastUserMsg = [...nonVolatile].reverse().find(m => m.role === 'user');
            const answerToForward = lastUserMsg?.content ?? USER_ANSWER;
            return makeScriptedPromptResult({
                taskComplete: false,
                message: 'Forwarding user answer to IT: Consult Child via resumeRunId.',
                nextStep: {
                    type: 'Sub-Agent',
                    subAgent: {
                        name: CHILD_AGENT_NAME,
                        message: answerToForward,
                        resumeRunId: childRunId,
                        terminateAfter: false,
                    },
                },
            });
        }

        // Case 3: First parent run, turn 2 — sees in-run consult message ("## Sub-agent IT: Consult Child is asking you")
        // Escalates to the human caller by emitting its own Chat step.
        const inRunConsultMsg = nonVolatile.find(m =>
            m.content.includes(`## Sub-agent ${CHILD_AGENT_NAME} is asking you`)
        );
        if (inRunConsultMsg) {
            return makeScriptedPromptResult({
                taskComplete: false,
                message: `Escalating to caller: ${CHILD_QUESTION}`,
                nextStep: {
                    type: 'Chat',
                },
            });
        }

        // Case 4: First parent run, turn 1 — delegates to IT: Consult Child
        return makeScriptedPromptResult({
            taskComplete: false,
            message: 'Delegating brand reel creation to IT: Consult Child.',
            nextStep: {
                type: 'Sub-Agent',
                subAgent: {
                    name: CHILD_AGENT_NAME,
                    message: 'Please build the brand reel.',
                    terminateAfter: false,
                },
            },
        });
    }
}

/**
 * Scripted child agent (`DriverClass = ITConsultChildAgent`).
 * Asks `CHILD_QUESTION` on its first run; when resumed with `assistant: <question>` + `user: <answer>`, completes.
 */
@RegisterClass(BaseAgent, 'ITConsultChildAgent')
export class ITConsultChildAgent extends BaseAgent {
    protected override async executePrompt(promptParams: AIPromptParams): Promise<AIPromptRunResult> {
        const messages = snapshotMessages(promptParams);
        activeScriptState?.Turns.push({
            AgentClass: 'ITConsultChildAgent',
            Messages: messages,
        });
        const nonVolatile = messages.filter(m => !m.isVolatile);

        const sawQuestionAndAnswer =
            nonVolatile.some(m => m.role === 'assistant' && m.content.includes(CHILD_QUESTION)) &&
            nonVolatile.some(m => m.role === 'user' && m.content.includes(USER_ANSWER));

        if (sawQuestionAndAnswer) {
            return makeScriptedPromptResult({
                taskComplete: true,
                message: 'Brand reel built in 16:9 landscape.',
                payloadChangeRequest: {
                    newElements: {
                        aspectRatio: '16:9',
                        status: 'completed',
                    },
                },
            });
        }

        return makeScriptedPromptResult({
            taskComplete: false,
            message: CHILD_QUESTION,
            nextStep: {
                type: 'Chat',
            },
        });
    }
}

// ─── Bundle Fixture & Helpers ────────────────────────────────────────────────────────────────────

interface ConsultBundleFixture {
    ParentAgent: MJAIAgentEntityExtended;
    ChildAgent: MJAIAgentEntityExtended;
    Llm: TestLLM;
    RestoreLlm: () => void;
    RestoreConversationNaming: () => void;
    CreatedRequestIds: string[];
    CreatedRunIds: string[];
    CreatedConversationIds: string[];
}

let consultFixture: ConsultBundleFixture | undefined;

function requireFixture(): ConsultBundleFixture {
    if (!consultFixture) {
        throw new Error('The agent-consult fixture is not initialized — bundle Setup must run before checks.');
    }
    return consultFixture;
}

interface RunSummaryRow {
    ID: string;
    AgentID: string;
    ParentRunID: string | null;
    LastRunID: string | null;
    Status: string;
    FinalStep: string | null;
    ConversationID: string | null;
}

interface StepRow {
    ID: string;
    StepNumber: number;
    StepType: string;
    StepName: string | null;
    Status: string;
    TargetLogID: string | null;
    ParentID: string | null;
}

async function readRunSteps(provider: IMetadataProvider, user: UserInfo, runId: string): Promise<StepRow[]> {
    const result = await RunView.FromMetadataProvider(provider).RunView<StepRow>(
        {
            EntityName: 'MJ: AI Agent Run Steps',
            ExtraFilter: `AgentRunID='${EscapeSQLString(runId)}'`,
            OrderBy: 'StepNumber ASC',
            Fields: ['ID', 'StepNumber', 'StepType', 'StepName', 'Status', 'TargetLogID', 'ParentID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user
    );
    return RequireRows(result, `step read for run ${runId}`);
}

async function loadRunSummary(ctx: IntegrationCheckContext, runId: string): Promise<RunSummaryRow | undefined> {
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const res = await rv.RunView<RunSummaryRow>(
        {
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: `ID='${EscapeSQLString(runId)}'`,
            Fields: ['ID', 'AgentID', 'ParentRunID', 'LastRunID', 'Status', 'FinalStep', 'ConversationID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        ctx.User
    );
    return res.Success ? res.Results[0] : undefined;
}

async function findChildRunsForParent(ctx: IntegrationCheckContext, parentRunId: string): Promise<RunSummaryRow[]> {
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const res = await rv.RunView<RunSummaryRow>(
        {
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: `ParentRunID='${EscapeSQLString(parentRunId)}'`,
            OrderBy: '__mj_CreatedAt ASC',
            Fields: ['ID', 'AgentID', 'ParentRunID', 'LastRunID', 'Status', 'FinalStep', 'ConversationID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        ctx.User
    );
    return res.Success ? res.Results : [];
}

// ─── Checks ──────────────────────────────────────────────────────────────────────────────────────

export const AgentConsultChecks: NamedCheck[] = [
    {
        Id: 'agent-consult.AC1',
        Name: 'AC1: Child Chat consult → parent escalates → AwaitingFeedback + Requested row → Respond triggers resumeAgent, reloads open consult before user message, resumes child with assistant+user messages, and completes both runs with zero LLM calls',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const fx = requireFixture();
            const state: ConsultScriptState = {
                Turns: [],
                ExtractedResumeRunId: null,
            };
            activeScriptState = state;

            try {
                // 1. Run the parent agent via AgentRunner.RunAgent
                const runner = new AgentRunner(ctx.Provider);
                const firstResult = await runner.RunAgent({
                    agent: fx.ParentAgent,
                    conversationMessages: [{ role: 'user', content: 'Create the brand reel.' }],
                    contextUser: ctx.User,
                    provider: ctx.Provider,
                });

                Assert(!!firstResult.agentRun?.ID, 'AC1: first parent RunAgent call returned no agentRun');
                const parentRun1Id = firstResult.agentRun.ID;
                fx.CreatedRunIds.push(parentRun1Id);

                // Track child run 1 created under parentRun1
                const firstChildRuns = await findChildRunsForParent(ctx, parentRun1Id);
                for (const cr of firstChildRuns) {
                    fx.CreatedRunIds.push(cr.ID);
                }
                AssertEqual(firstChildRuns.length, 1, 'AC1: expected exactly 1 child run under first parent run');
                const childRun1 = firstChildRuns[0];
                AssertEqual(childRun1.Status, 'AwaitingFeedback', 'AC1: first child run status');
                AssertEqual(childRun1.FinalStep, 'Chat', 'AC1: first child run FinalStep');

                // 2. Assert first parent run is AwaitingFeedback with FinalStep='Chat'
                const parentRun1Row = await loadRunSummary(ctx, parentRun1Id);
                Assert(!!parentRun1Row, `AC1: parent run ${parentRun1Id} not found`);
                AssertEqual(parentRun1Row!.Status, 'AwaitingFeedback', 'AC1: first parent run must pause AwaitingFeedback');
                AssertEqual(parentRun1Row!.FinalStep, 'Chat', 'AC1: first parent run FinalStep must be Chat');

                // 3. Assert exactly one MJ: AI Agent Requests row exists (Status='Requested', OriginatingAgentRunID=parentRun1Id)
                const rv = RunView.FromMetadataProvider(ctx.Provider);
                const reqResult = await rv.RunView<MJAIAgentRequestEntity>(
                    {
                        EntityName: 'MJ: AI Agent Requests',
                        ExtraFilter: `OriginatingAgentRunID='${EscapeSQLString(parentRun1Id)}'`,
                        OrderBy: '__mj_CreatedAt DESC',
                        ResultType: 'entity_object',
                        BypassCache: true,
                    },
                    ctx.User
                );
                Assert(reqResult.Success, `AC1: RunView on MJ: AI Agent Requests failed: ${reqResult.ErrorMessage}`);
                AssertEqual(reqResult.Results.length, 1, 'AC1: expected exactly 1 MJ: AI Agent Requests row for first parent run');
                const request = reqResult.Results[0];
                fx.CreatedRequestIds.push(request.ID);
                AssertEqual(request.Status, 'Requested', 'AC1: request row initial Status');
                Assert(UUIDsEqual(request.OriginatingAgentRunID, parentRun1Id), 'AC1: request OriginatingAgentRunID must match first parent run');

                // 4. Respond to the request and Save() — MJAIAgentRequestEntityServer.Save() spawns resumeAgent()
                request.Status = 'Responded';
                request.Response = USER_ANSWER;
                const saved = await request.Save();
                Assert(saved, `AC1: saving Responded request failed: ${request.LatestResult?.CompleteMessage ?? 'unknown'}`);

                // 5. Poll ResumingAgentRunID until populated
                let resumedParentRunId: string | null = null;
                for (let attempt = 0; attempt < RESUME_POLL_ATTEMPTS; attempt++) {
                    await settle(RESUME_POLL_INTERVAL_MS);
                    const pollRes = await rv.RunView<{ ResumingAgentRunID: string | null }>(
                        {
                            EntityName: 'MJ: AI Agent Requests',
                            ExtraFilter: `ID='${EscapeSQLString(request.ID)}'`,
                            Fields: ['ResumingAgentRunID'],
                            ResultType: 'simple',
                            BypassCache: true,
                        },
                        ctx.User
                    );
                    const rid = pollRes.Success ? pollRes.Results[0]?.ResumingAgentRunID ?? null : null;
                    if (rid) {
                        resumedParentRunId = rid;
                        fx.CreatedRunIds.push(rid);
                        break;
                    }
                }
                Assert(!!resumedParentRunId, 'AC1: ResumingAgentRunID was never linked on MJ: AI Agent Requests within poll window');
                Assert(!UUIDsEqual(resumedParentRunId!, parentRun1Id), 'AC1: resumed parent run must be a new run ID');

                // Also discover any child runs of resumedParentRunId for teardown and assertions
                const resumedChildRuns = await findChildRunsForParent(ctx, resumedParentRunId!);
                for (const cr of resumedChildRuns) {
                    fx.CreatedRunIds.push(cr.ID);
                }

                // 6. Verify the resumed parent run and its conversation linkage
                const parentRun2Row = await loadRunSummary(ctx, resumedParentRunId!);
                Assert(!!parentRun2Row, `AC1: resumed parent run ${resumedParentRunId} not found`);
                if (parentRun2Row?.ConversationID) {
                    fx.CreatedConversationIds.push(parentRun2Row.ConversationID);
                }
                Assert(
                    UUIDsEqual(parentRun2Row!.LastRunID, parentRun1Id),
                    `AC1: resumed parent LastRunID (${parentRun2Row!.LastRunID}) must equal first parent run (${parentRun1Id})`
                );
                AssertEqual(parentRun2Row!.Status, 'Completed', 'AC1: resumed parent run must end Completed');
                AssertEqual(parentRun2Row!.FinalStep, 'Success', 'AC1: resumed parent run FinalStep must be Success');

                // 7. Verify the resumed parent has a Sub-Agent step whose child run has LastRunID = first child run
                const parent2Steps = await readRunSteps(ctx.Provider, ctx.User, resumedParentRunId!);
                const subAgentSteps = parent2Steps.filter((s: StepRow) => s.StepType === 'Sub-Agent');
                AssertEqual(subAgentSteps.length, 1, 'AC1: resumed parent run must have 1 Sub-Agent step');
                Assert(!!subAgentSteps[0].TargetLogID, 'AC1: resumed parent Sub-Agent step must link TargetLogID to resumed child run');

                AssertEqual(resumedChildRuns.length, 1, 'AC1: expected 1 child run under resumed parent run');
                const childRun2 = resumedChildRuns[0];
                Assert(
                    UUIDsEqual(subAgentSteps[0].TargetLogID, childRun2.ID),
                    'AC1: Sub-Agent step TargetLogID must match resumed child run ID'
                );
                Assert(
                    UUIDsEqual(childRun2.LastRunID, childRun1.ID),
                    `AC1: resumed child run LastRunID (${childRun2.LastRunID}) must equal first child run (${childRun1.ID})`
                );
                AssertEqual(childRun2.Status, 'Completed', 'AC1: resumed child run must end Completed');
                AssertEqual(childRun2.FinalStep, 'Success', 'AC1: resumed child run FinalStep must be Success');

                // 8. Verify message ordering on the resumed parent's first prompt and the resumed child's first prompt
                const parentTurns = state.Turns.filter(t => t.AgentClass === 'ITConsultParentAgent');
                const childTurns = state.Turns.filter(t => t.AgentClass === 'ITConsultChildAgent');
                AssertEqual(parentTurns.length, 4, 'AC1: ITConsultParentAgent should have executed 4 prompt turns (2 in run 1, 2 in run 2)');
                AssertEqual(childTurns.length, 2, 'AC1: ITConsultChildAgent should have executed 2 prompt turns (1 in run 1, 1 in run 2)');
                Assert(
                    UUIDsEqual(state.ExtractedResumeRunId, childRun1.ID),
                    `AC1: parent extracted resumeRunId (${state.ExtractedResumeRunId}) from reloaded consult message matching childRun1 (${childRun1.ID})`
                );

                // Resumed parent's first prompt turn (parentTurns[2]): open consult message is before the last user message
                const resumedParentFirstMsgs = parentTurns[2].Messages.filter(m => !m.isVolatile);
                const consultIdx = resumedParentFirstMsgs.findIndex(m =>
                    m.content.includes('You asked your caller about a question from sub-agent')
                );
                const lastUserIdx = resumedParentFirstMsgs.length - 1;
                Assert(consultIdx >= 0, 'AC1: resumed parent first prompt must contain the reloaded open-consult message');
                Assert(
                    consultIdx < lastUserIdx && resumedParentFirstMsgs[lastUserIdx].role === 'user' && resumedParentFirstMsgs[lastUserIdx].content.includes(USER_ANSWER),
                    `AC1: reloaded open-consult message (idx ${consultIdx}) must appear before the last user message (idx ${lastUserIdx})`
                );

                // Resumed child's first prompt turn (childTurns[1]): sees assistant:<question> then user:<answer>
                const resumedChildMsgs = childTurns[1].Messages.filter(m => !m.isVolatile);
                const assistantQIdx = resumedChildMsgs.findIndex(m => m.role === 'assistant' && m.content.includes(CHILD_QUESTION));
                const userAIdx = resumedChildMsgs.findIndex(m => m.role === 'user' && m.content.includes(USER_ANSWER));
                Assert(assistantQIdx >= 0, 'AC1: resumed child first prompt must include assistant:<question>');
                Assert(userAIdx > assistantQIdx, 'AC1: resumed child first prompt must include user:<answer> after assistant:<question>');

                // Verify zero TestLLM calls occurred
                AssertEqual(fx.Llm.Calls.length, 0, 'AC1: zero LLM driver calls should occur when scripted BaseAgent subclasses override executePrompt');
            } finally {
                activeScriptState = undefined;
            }
        },
    },
];

for (const check of AgentConsultChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// ─── Bundle Lifecycle ────────────────────────────────────────────────────────────────────────────

IntegrationCheckRegistry.Instance.RegisterLifecycle('agent-consult', {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        await AIEngine.Instance.Config(false, ctx.User, ctx.Provider);
        const parentAgent = AIEngine.Instance.Agents.find(a => (a.Name ?? '') === PARENT_AGENT_NAME);
        const childAgent = AIEngine.Instance.Agents.find(a => (a.Name ?? '') === CHILD_AGENT_NAME);
        if (!parentAgent || !childAgent) {
            throw new Error(
                `Seeded agents '${PARENT_AGENT_NAME}' / '${CHILD_AGENT_NAME}' not found — push metadata-optional/integration-test`
            );
        }

        // Guard all chat drivers with a failing TestLLM so no code path can reach a network model
        const llm = new TestLLM();
        llm.SetDefaultOutcome({
            kind: 'fail',
            error: new Error('agent-consult is a zero-LLM bundle; no chat driver should be called'),
        });
        const restoreLlm = RegisterTestLLM(llm, [...CHAT_DRIVER_CLASSES]);

        // Bypass AgentRunner.generateConversationName so RunAgentInConversation uses the deterministic
        // fallback name ("Chat with IT: Consult Parent") instead of running the 'Name Conversation' prompt.
        const runnerProto = AgentRunner.prototype as unknown as {
            generateConversationName: (...args: unknown[]) => Promise<{ name: string; description: string } | null>;
        };
        const originalGenerateConversationName = runnerProto.generateConversationName;
        runnerProto.generateConversationName = async () => null;
        const restoreConversationNaming = (): void => {
            runnerProto.generateConversationName = originalGenerateConversationName;
        };

        consultFixture = {
            ParentAgent: parentAgent,
            ChildAgent: childAgent,
            Llm: llm,
            RestoreLlm: restoreLlm,
            RestoreConversationNaming: restoreConversationNaming,
            CreatedRequestIds: [],
            CreatedRunIds: [],
            CreatedConversationIds: [],
        };
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        const fx = consultFixture;
        consultFixture = undefined;
        activeScriptState = undefined;
        if (!fx) {
            return;
        }
        fx.RestoreConversationNaming();
        fx.Llm.Reset();
        fx.RestoreLlm();

        const rv = RunView.FromMetadataProvider(ctx.Provider);

        // Discover any runs (and child/resumed runs) for ParentAgent or ChildAgent so nothing is ever orphaned
        const allRunIds = new Set<string>(fx.CreatedRunIds);
        const agentRunsRes = await rv.RunView<{ ID: string; ConversationID: string | null }>(
            {
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: `AgentID IN ('${EscapeSQLString(fx.ParentAgent.ID)}', '${EscapeSQLString(fx.ChildAgent.ID)}')`,
                Fields: ['ID', 'ConversationID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            ctx.User
        );
        for (const r of agentRunsRes.Success ? agentRunsRes.Results : []) {
            allRunIds.add(r.ID);
            if (r.ConversationID) {
                fx.CreatedConversationIds.push(r.ConversationID);
            }
        }
        for (const runId of [...allRunIds]) {
            const childRes = await rv.RunView<{ ID: string; ConversationID: string | null }>(
                {
                    EntityName: 'MJ: AI Agent Runs',
                    ExtraFilter: `ParentRunID='${EscapeSQLString(runId)}' OR LastRunID='${EscapeSQLString(runId)}'`,
                    Fields: ['ID', 'ConversationID'],
                    ResultType: 'simple',
                    BypassCache: true,
                },
                ctx.User
            );
            for (const r of childRes.Success ? childRes.Results : []) {
                allRunIds.add(r.ID);
                if (r.ConversationID) {
                    fx.CreatedConversationIds.push(r.ConversationID);
                }
            }
        }

        // Discover any MJ: AI Agent Requests linked to any of those runs
        const allReqIds = new Set<string>(fx.CreatedRequestIds);
        for (const runId of allRunIds) {
            const reqsRes = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: AI Agent Requests',
                    ExtraFilter: `OriginatingAgentRunID='${EscapeSQLString(runId)}' OR ResumingAgentRunID='${EscapeSQLString(runId)}'`,
                    Fields: ['ID'],
                    ResultType: 'simple',
                    BypassCache: true,
                },
                ctx.User
            );
            for (const req of reqsRes.Success ? reqsRes.Results : []) {
                allReqIds.add(req.ID);
            }
        }

        // 1. Delete MJ: AI Agent Requests first (links OriginatingAgentRunID, OriginatingAgentRunStepID, ResumingAgentRunID)
        for (const reqId of allReqIds) {
            await DeleteById('MJ: AI Agent Requests', reqId, ctx.Provider, ctx.User).catch((err: unknown) =>
                console.error(`[agent-consult] request cleanup failed for ${reqId}:`, err)
            );
        }

        // 2. Delete MJ: AI Agent Run Steps for all runs (leaves before parents)
        for (const runId of allRunIds) {
            try {
                const steps = await readRunSteps(ctx.Provider, ctx.User, runId);
                let remaining = [...steps];
                while (remaining.length > 0) {
                    const parents = new Set(remaining.map(s => s.ParentID).filter((id): id is string => !!id));
                    const leaves = remaining.filter(s => !parents.has(s.ID));
                    const batch = leaves.length > 0 ? leaves : remaining;
                    for (const step of batch) {
                        await DeleteById('MJ: AI Agent Run Steps', step.ID, ctx.Provider, ctx.User);
                    }
                    remaining = leaves.length > 0 ? remaining.filter(s => !leaves.includes(s)) : [];
                }
            } catch (err) {
                console.error(`[agent-consult] step cleanup failed for run ${runId}:`, err);
            }
        }

        // 3. Delete MJ: AI Agent Runs (dependents on ParentRunID / LastRunID first)
        const runSummaries: RunSummaryRow[] = [];
        for (const runId of allRunIds) {
            const row = await loadRunSummary(ctx, runId);
            if (row) {
                runSummaries.push(row);
                if (row.ConversationID) {
                    fx.CreatedConversationIds.push(row.ConversationID);
                }
            }
        }
        let remainingRuns = [...runSummaries];
        while (remainingRuns.length > 0) {
            const referencedIds = new Set<string>();
            for (const r of remainingRuns) {
                if (r.ParentRunID) referencedIds.add(r.ParentRunID.toLowerCase());
                if (r.LastRunID) referencedIds.add(r.LastRunID.toLowerCase());
            }
            const leafRuns = remainingRuns.filter(r => !referencedIds.has(r.ID.toLowerCase()));
            const batch = leafRuns.length > 0 ? leafRuns : remainingRuns;
            for (const r of batch) {
                await DeleteById('MJ: AI Agent Runs', r.ID, ctx.Provider, ctx.User).catch((err: unknown) =>
                    console.error(`[agent-consult] run cleanup failed for ${r.ID}:`, err)
                );
            }
            remainingRuns = leafRuns.length > 0 ? remainingRuns.filter(r => !leafRuns.includes(r)) : [];
        }

        // 4. Delete MJ: Conversation Details then MJ: Conversations
        for (const convId of new Set(fx.CreatedConversationIds)) {
            try {
                const detailsRes = await rv.RunView<{ ID: string }>(
                    {
                        EntityName: 'MJ: Conversation Details',
                        ExtraFilter: `ConversationID='${EscapeSQLString(convId)}'`,
                        Fields: ['ID'],
                        ResultType: 'simple',
                        BypassCache: true,
                    },
                    ctx.User
                );
                for (const d of detailsRes.Success ? detailsRes.Results : []) {
                    await DeleteById('MJ: Conversation Details', d.ID, ctx.Provider, ctx.User);
                }
                await DeleteById('MJ: Conversations', convId, ctx.Provider, ctx.User);
            } catch (err) {
                console.error(`[agent-consult] conversation cleanup failed for ${convId}:`, err);
            }
        }
    },
});
