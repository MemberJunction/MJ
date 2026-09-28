/**
 * Tests for the `'Tasks'` primitive on LoopAgentType — the capability gate (D3), spec validation
 * with retry correctives (D16), and single-node constant folding (D9).
 *
 * The gate gets the most coverage because it is the only Loop parameter that is *enforced* rather
 * than advisory. Every other flag merely shapes the prompt, so an agent that ignores the omission
 * still works; this one governs whether an agent may create durable rows that outlive its run and
 * execute on a server-side dispatcher, so failing open would be a real escalation.
 *
 * `HarnessAgentType` is covered explicitly. It extends `LoopAgentType` and *intentionally* inherits
 * `DetermineNextStep`, which means adding `'Tasks'` to the Loop union hands the primitive to
 * external agent harnesses (Claude Code / Codex / Pi running inside MJ) at the same moment. That
 * inheritance is the mechanism working as designed — but it means the gate has to hold through the
 * harness path too, and asserting it on Loop alone would not prove that.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import type { AIPromptRunResult, ExecuteAgentParams, TaskGraphSpec } from '@memberjunction/ai-core-plus';

// Partial mock: LoopAgentType now imports a RUNTIME value from the ai-core-plus barrel (the pure
// task-graph validator), which pulls @memberjunction/core-entities — and therefore BaseEntity —
// into the module graph. A total mock would have to restate every export core-entities touches, so
// spread the real module and override only the logging functions these tests care about.
vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn(),
    IsVerboseLoggingEnabled: vi.fn(() => false),
}));

function mockPromptResult(response: Record<string, unknown>): AIPromptRunResult {
    return {
        success: true,
        result: JSON.stringify(response),
        chatResult: {} as AIPromptRunResult['chatResult'],
    };
}

/** Params carrying a per-run override in `data.__agentTypePromptParams` — the highest-precedence source. */
function paramsWith(enableTaskGraphs: boolean | undefined): ExecuteAgentParams {
    return {
        data: { __agentTypePromptParams: enableTaskGraphs === undefined ? {} : { enableTaskGraphs } },
    } as unknown as ExecuteAgentParams;
}

/**
 * Params shaped like a REAL run: no runtime override, and the opt-in living only in the agent's
 * own `AgentTypePromptParams` JSON. This is what every production invocation looks like — the
 * merged bag renders the prompt but is never written back to `params.data`.
 */
function paramsFromAgentConfig(agentTypePromptParams: string | null, runtime?: Record<string, unknown>): ExecuteAgentParams {
    return {
        agent: { Name: 'Workflow Planner', AgentTypePromptParams: agentTypePromptParams },
        data: runtime === undefined ? {} : { __agentTypePromptParams: runtime },
    } as unknown as ExecuteAgentParams;
}

const graph = (over: Partial<TaskGraphSpec> = {}): TaskGraphSpec => ({
    workflowName: 'Quarterly review',
    tasks: [
        { tempId: 'a', name: 'Gather', description: 'gather the data', kind: 'Agent' as const, configuration: { agentName: 'Query Builder' }, dependsOn: [] },
        { tempId: 'b', name: 'Summarize', description: 'summarize it', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: ['a'] },
    ],
    ...over,
});

const singleNode = (over: Partial<TaskGraphSpec> = {}): TaskGraphSpec => ({
    workflowName: 'One thing',
    tasks: [{ tempId: 'a', name: 'Do it', description: 'do the thing', kind: 'Agent' as const, configuration: { agentName: 'Query Builder' }, dependsOn: [] }],
    ...over,
});

const emit = (tasks: unknown) => mockPromptResult({ taskComplete: false, nextStep: { type: 'Tasks', tasks } });

describe('LoopAgentType — the Tasks primitive', () => {
    let agent: LoopAgentType;

    beforeEach(() => {
        agent = new LoopAgentType();
    });

    describe('capability gate (D3)', () => {
        it('rejects a graph from an agent that has not opted in', async () => {
            const result = await agent.DetermineNextStep(emit(graph()), paramsWith(false), {}, {});
            expect(result.step).toBe('Retry');
            expect(result.errorMessage).toMatch(/not enabled/i);
        });

        it('rejects when the flag is simply absent — the gate fails CLOSED', async () => {
            // The whole point of a default-off capability: silence must not be consent. If an
            // agent's params bag has never heard of task graphs, it cannot have opted into them.
            const result = await agent.DetermineNextStep(emit(graph()), paramsWith(undefined), {}, {});
            expect(result.step).toBe('Retry');
            expect(result.errorMessage).toMatch(/not enabled/i);
        });

        it('rejects when there is no params bag at all', async () => {
            const result = await agent.DetermineNextStep(emit(graph()), {} as ExecuteAgentParams, {}, {});
            expect(result.step).toBe('Retry');
            expect(result.errorMessage).toMatch(/not enabled/i);
        });

        it('does not accept a truthy non-true value', async () => {
            // Guards against a JSON round-trip turning the flag into the string "true", which a
            // loose truthiness check would honor and a capability gate must not.
            const params = { data: { __agentTypePromptParams: { enableTaskGraphs: 'true' } } } as unknown as ExecuteAgentParams;
            const result = await agent.DetermineNextStep(emit(graph()), params, {}, {});
            expect(result.step).toBe('Retry');
            expect(result.errorMessage).toMatch(/not enabled/i);
        });

        it('steers the rejected agent toward the capability it DOES have', async () => {
            // A bare "not allowed" leaves the model with nothing to do differently; naming
            // Sub-Agent/Actions keeps the run productive instead of looping on the same emission.
            const result = await agent.DetermineNextStep(emit(graph()), paramsWith(false), {}, {});
            expect(result.message).toMatch(/Sub-Agent/);
            expect(result.message).toMatch(/Actions/);
        });

        it('admits a graph when the opt-in lives only in the agent config, as in every real run', async () => {
            // The regression this file missed: every case above supplies the flag through the
            // runtime bag, which production never populates. The Workflow Planner carries
            // enableTaskGraphs in its AgentTypePromptParams and was still refused on every run.
            const result = await agent.DetermineNextStep(
                emit(graph()), paramsFromAgentConfig('{"enableTaskGraphs": true}'), {}, {},
            );
            expect(result.step).not.toBe('Retry');
            expect(result.errorMessage).toBeUndefined();
        });

        it('lets a runtime override switch the agent config OFF', async () => {
            const result = await agent.DetermineNextStep(
                emit(graph()), paramsFromAgentConfig('{"enableTaskGraphs": true}', { enableTaskGraphs: false }), {}, {},
            );
            expect(result.step).toBe('Retry');
            expect(result.errorMessage).toMatch(/not enabled/i);
        });

        it('lets a runtime override switch the agent config ON', async () => {
            const result = await agent.DetermineNextStep(
                emit(graph()), paramsFromAgentConfig('{"enableTaskGraphs": false}', { enableTaskGraphs: true }), {}, {},
            );
            expect(result.step).not.toBe('Retry');
        });

        it('a runtime bag that is silent on the flag defers to the agent config', async () => {
            const result = await agent.DetermineNextStep(
                emit(graph()), paramsFromAgentConfig('{"enableTaskGraphs": true}', { includeScratchpadDocs: true }), {}, {},
            );
            expect(result.step).not.toBe('Retry');
        });

        it('fails CLOSED on agent config that is absent, false, or unparseable', async () => {
            for (const raw of [null, '{"enableTaskGraphs": false}', '{"enableTaskGraphs": "true"}', 'not json', '{}']) {
                const result = await agent.DetermineNextStep(emit(graph()), paramsFromAgentConfig(raw), {}, {});
                expect(result.step, `config ${String(raw)}`).toBe('Retry');
                expect(result.errorMessage, `config ${String(raw)}`).toMatch(/not enabled/i);
            }
        });

        it('admits a graph from an opted-in agent', async () => {
            const result = await agent.DetermineNextStep(emit(graph()), paramsWith(true), {}, {});
            expect(result.step).toBe('Tasks');
            expect(result.taskGraph?.spec.workflowName).toBe('Quarterly review');
            expect(result.taskGraph?.folded).toBe(false);
        });
    });

    describe('validation + correctives (D16)', () => {
        it('rejects a Tasks step with no graph attached', async () => {
            const result = await agent.DetermineNextStep(emit(undefined), paramsWith(true), {}, {});
            expect(result.step).toBe('Retry');
            expect(result.errorMessage).toMatch(/not specified/i);
        });

        it('rejects a cyclic graph and names the failure code', async () => {
            const cyclic = graph({
                tasks: [
                    { tempId: 'a', name: 'A', description: 'a', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: ['b'] },
                    { tempId: 'b', name: 'B', description: 'b', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: ['a'] },
                ],
            });
            const result = await agent.DetermineNextStep(emit(cyclic), paramsWith(true), {}, {});
            expect(result.step).toBe('Retry');
            expect(result.errorMessage).toContain('CycleDetected');
        });

        it('reports EVERY validation failure in one corrective, not just the first', async () => {
            // A model fixing a malformed graph should see all problems at once rather than
            // discovering them one round-trip at a time.
            const broken = graph({
                workflowName: '',
                tasks: [
                    { tempId: 'a', name: 'A', description: 'a', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: ['ghost'] },
                    { tempId: 'a', name: 'A2', description: 'a2', dependsOn: [] },
                ],
            });
            const result = await agent.DetermineNextStep(emit(broken), paramsWith(true), {}, {});
            expect(result.step).toBe('Retry');
            expect(result.errorMessage).toContain('MissingWorkflowName');
            expect(result.errorMessage).toContain('UnknownDependency');
            expect(result.errorMessage).toContain('DuplicateTempId');
            expect(result.errorMessage).toContain('NoAssignment');
        });

        it('asks for the COMPLETE graph on retry, not a patch', async () => {
            // A partial re-emission would have to be merged against a graph the loop no longer
            // holds, so the corrective has to be explicit about wanting the whole thing back.
            const result = await agent.DetermineNextStep(emit(graph({ workflowName: '' })), paramsWith(true), {}, {});
            expect(result.message).toMatch(/complete graph/i);
        });
    });

    describe('single-node constant folding (D9)', () => {
        it('folds a lone agent node into an in-run Sub-Agent call', async () => {
            const result = await agent.DetermineNextStep(emit(singleNode()), paramsWith(true), {}, {});
            expect(result.step).toBe('Sub-Agent');
            expect(result.subAgent?.name).toBe('Query Builder');
            expect(result.subAgent?.terminateAfter).toBe(false);
        });

        it('records the fold rather than hiding it', async () => {
            // The graph is written to the run step either way, so forensics show why it did not
            // reach the dispatcher and Save as Workflow (D17) can still attach to the spec.
            const result = await agent.DetermineNextStep(emit(singleNode()), paramsWith(true), {}, {});
            expect(result.taskGraph?.folded).toBe(true);
            expect(result.taskGraph?.spec.tasks).toHaveLength(1);
            expect(result.taskGraph?.foldReason).toBeTruthy();
        });

        it('does not fold when the graph explicitly requests durability', async () => {
            const result = await agent.DetermineNextStep(emit(singleNode({ durable: true })), paramsWith(true), {}, {});
            expect(result.step).toBe('Tasks');
            expect(result.taskGraph?.folded).toBe(false);
        });

        it('does not fold when continuation is non-default', async () => {
            // Folding runs the work in-turn, so there is no completion event to continue FROM.
            const result = await agent.DetermineNextStep(emit(singleNode({ continuation: 'reinvoke' })), paramsWith(true), {}, {});
            expect(result.step).toBe('Tasks');
            expect(result.taskGraph?.folded).toBe(false);
        });

        it('folds when continuation is explicitly the default', async () => {
            const result = await agent.DetermineNextStep(emit(singleNode({ continuation: 'message' })), paramsWith(true), {}, {});
            expect(result.step).toBe('Sub-Agent');
        });

        it('does not fold a lone HUMAN node — there is no sub-agent to call', async () => {
            const human = singleNode({
                tasks: [{ tempId: 'a', name: 'Approve', description: 'approve it', kind: 'Human' as const, configuration: {}, dependsOn: [] }],
            });
            const result = await agent.DetermineNextStep(emit(human), paramsWith(true), {}, {});
            expect(result.step).toBe('Tasks');
            expect(result.taskGraph?.folded).toBe(false);
        });

        it('does not fold a two-node graph', async () => {
            const result = await agent.DetermineNextStep(emit(graph()), paramsWith(true), {}, {});
            expect(result.step).toBe('Tasks');
            expect(result.taskGraph?.folded).toBe(false);
        });

        it('explains WHY a graph did not fold', async () => {
            const result = await agent.DetermineNextStep(emit(singleNode({ durable: true })), paramsWith(true), {}, {});
            expect(result.taskGraph?.folded).toBe(false);
            // The reason lives on the fold decision; an unfolded graph carries no foldReason,
            // which is itself the signal that it went to the dispatcher.
            expect(result.taskGraph?.foldReason).toBeUndefined();
        });
    });
});
