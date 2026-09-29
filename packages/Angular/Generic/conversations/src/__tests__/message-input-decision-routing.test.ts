/**
 * @fileoverview Decision routing at the component that applies it (`MessageInputComponent`),
 * with `RunDecision` mocked.
 *
 * The pure pieces (the questions, the thresholds, the timeout) are pinned in
 * decision-routing.test.ts. These pin the wiring: with `EnableDecisionRouting` off (the default)
 * there is no call and routing is unchanged; with it on, a confident answer routes the turn, and
 * anything else keeps continuity; a tagged message or a form response makes no call; and a
 * confident artifact answer reaches the agent's run as its payload source.
 *
 * Instantiated via the prototype (no constructor/TestBed) with only the members these paths
 * touch stubbed, the same style as agent-turn-host-rules.test.ts.
 */
import '@angular/compiler'; // JIT support — the component import evaluates Angular decorators in vitest's node env
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { EventEmitter } from '@angular/core';
import type { ChoiceAnswer, DecisionAnswer, LikelihoodAnswer } from '@memberjunction/ai';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ConversationUtility, DECISION_ROUTING_TIMEOUT_MS, type MJAIAgentEntityExtended, type RoutingAgent } from '@memberjunction/ai-core-plus';
import type { RunDecisionParams, RunDecisionResult } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';

import { MessageInputComponent } from '../lib/components/message/message-input.component';
import type { BeforeAgentTurnEventArgs } from '../lib/events/chat-events';
import { PlanModePreference } from '../lib/utils/plan-mode-preference';
import type { AgentArtifactSummary } from '../lib/utils/agent-artifact-summary';
import type { AgentPayloadSource } from '../lib/services/conversation-agent.service';
import type { MentionParseResult } from '../lib/models/conversation-state.model';

const MANAGER = { ID: 'AAAAAAAA-0000-0000-0000-000000000001', Name: 'Sage', Description: 'Routes each request.' } satisfies RoutingAgent;
const RESEARCH = { ID: 'AAAAAAAA-0000-0000-0000-000000000002', Name: 'Research', Description: 'Finds sources.' } satisfies RoutingAgent;
const WRITER = { ID: 'AAAAAAAA-0000-0000-0000-000000000003', Name: 'Writer', Description: 'Drafts documents.' } satisfies RoutingAgent;
const AGENTS = [MANAGER, RESEARCH, WRITER];

const VERSION = 'BBBBBBBB-0000-0000-0000-000000000001';

type Fn = ReturnType<typeof vi.fn>;
type RunDecisionMock = Mock<(params: RunDecisionParams) => Promise<RunDecisionResult>>;
type FindArtifactsMock = Mock<(conversationId: string, agentId: string, historyFrom?: Date | null) => Promise<AgentArtifactSummary[]>>;
type FindVersionMock = Mock<(versionId: string) => Promise<AgentPayloadSource | null>>;

/** A conversation detail row stand-in that counts its saves. */
class FakeDetail {
    public ID: string;
    public ConversationID = 'conv-1';
    public Role: 'AI' | 'Error' | 'User';
    public Message = '';
    public Status: 'Complete' | 'Error' | 'In-Progress' = 'Complete';
    public AgentID: string | null = null;
    public ParentID: string | null = null;
    public HiddenToUser = false;
    public Error: string | null = null;
    public ResponseForm: string | null = null;
    public ActionableCommands: string | null = null;
    public AutomaticCommands: string | null = null;
    public __mj_CreatedAt = new Date('2026-09-01T10:00:00.000Z');
    public LatestResult = null;
    public Saves = 0;

    constructor(id: string, role: 'AI' | 'Error' | 'User', message = '') {
        this.ID = id;
        this.Role = role;
        this.Message = message;
    }

    public async Save(): Promise<boolean> {
        this.Saves++;
        return true;
    }

    public async Load(): Promise<boolean> {
        return true;
    }
}

function chatResult(runId: string) {
    return { success: true, agentRun: { ID: runId, AgentID: null, FinalStep: 'Chat', Message: 'done' }, payload: {} };
}

function mentionsOf(...agents: RoutingAgent[]): MentionParseResult {
    const mentions = agents.map(a => ({ type: 'agent' as const, id: a.ID, name: a.Name ?? '' }));
    return { mentions, agentMention: mentions[0] ?? null, userMentions: [], entityMentions: [], skillMentions: [] };
}

const NO_MENTIONS = mentionsOf();

function choice(value: string, confidence: number): ChoiceAnswer {
    return { Kind: 'Choice', Value: value, Confidence: confidence, Probabilities: { [value]: confidence } };
}

function likelihood(probability: number): LikelihoodAnswer {
    return { Kind: 'Likelihood', Probability: probability };
}

function answered(answers: Record<string, DecisionAnswer>): RunDecisionResult {
    return { Success: true, Answers: answers };
}

interface Harness {
    component: MessageInputComponent;
    before: BeforeAgentTurnEventArgs[];
    runDecision: RunDecisionMock;
    findArtifacts: FindArtifactsMock;
    findVersion: FindVersionMock;
    processMessage: Fn;
    invokeSubAgent: Fn;
    set(fields: Record<string, unknown>): void;
    route(message: FakeDetail, mentions?: MentionParseResult): Promise<void>;
}

function buildHarness(): Harness {
    const before: BeforeAgentTurnEventArgs[] = [];
    const beforeEmitter = new EventEmitter<BeforeAgentTurnEventArgs>();
    beforeEmitter.subscribe(e => before.push(e));
    const sentEmitter = new EventEmitter<FakeDetail>();
    const afterEmitter = new EventEmitter();
    let nextId = 0;

    const runDecision: RunDecisionMock = vi.fn(async () => answered({}));
    const findArtifacts: FindArtifactsMock = vi.fn(async () => []);
    const findVersion: FindVersionMock = vi.fn(async (versionId: string) => ({
        artifactId: 'artifact-1', versionId, versionNumber: 1, payload: { title: 'Press kit' },
    }));
    const processMessage = vi.fn(async () => chatResult('run-manager'));
    const invokeSubAgent = vi.fn(async () => chatResult('run-agent'));

    const component = Object.create(MessageInputComponent.prototype) as MessageInputComponent;
    const fields = component as unknown as Record<string, unknown>;
    Object.assign(fields, {
        ConversationId: 'conv-1',
        ConversationName: 'Test',
        CurrentUser: { ID: 'user-1' },
        ApplicationId: null,
        AppContext: null,
        DefaultAgentId: null,
        ConversationDefaultAgentId: null,
        AgentConfigurationPresetId: null,
        AgentReplyMode: 'Always',
        AllowedAgentIDs: null,
        MentionPeople: null,
        AgentHistoryFrom: null,
        AgentTurnHandler: null,
        AutoNameConversation: false,
        EnableDecisionRouting: false,
        ConverationManagerAgent: MANAGER,
        ConversationHistory: [],
        _pendingRequestedSkillIDs: [],
        completionTimestamps: new Map<string, number>(),
        registeredCallbacks: new Map(),
        inFlightWatches: new Map(),
        BeforeAgentTurn: beforeEmitter,
        beforeAgentTurn: beforeEmitter,
        AfterAgentTurn: afterEmitter,
        afterAgentTurn: afterEmitter,
        MessageSent: sentEmitter,
        messageSent: sentEmitter,
        ArtifactCreated: new EventEmitter(),
        MessageComplete: new EventEmitter(),
        dataCache: {
            createConversationDetail: vi.fn(async () => new FakeDetail(`row-${++nextId}`, 'AI')),
            getConversationDetail: vi.fn(async () => null),
        },
        agentService: {
            RunDecision: runDecision,
            FindAgentArtifacts: findArtifacts,
            FindArtifactVersionById: findVersion,
            ProcessMessage: processMessage,
            invokeSubAgent,
            FindConfigurationPresetForAgent: vi.fn(async () => undefined),
            FindLatestAgentOutputVersion: vi.fn(async () => null),
        },
        activeTasks: {
            add: vi.fn(() => 'task-1'),
            remove: vi.fn(),
            getByConversationDetailId: vi.fn(() => undefined),
            updateStatusByConversationDetailId: vi.fn(),
        },
        streamingService: { registerMessageCallback: vi.fn(), unregisterMessageCallback: vi.fn() },
    });

    const routeMessage = (component as unknown as {
        routeMessage(message: FakeDetail, mentions: MentionParseResult, isFirstMessage: boolean): Promise<void>;
    }).routeMessage.bind(component);

    return {
        component, before, runDecision, findArtifacts, findVersion, processMessage, invokeSubAgent,
        set: values => Object.assign(fields, values),
        route: (message, mentions = NO_MENTIONS) => routeMessage(message, mentions, false),
    };
}

function userMessage(text = 'Now turn it into a press release'): FakeDetail {
    return new FakeDetail('user-msg-1', 'User', text);
}

function reply(agent: RoutingAgent, id: string, text: string): FakeDetail {
    const row = new FakeDetail(id, 'AI', text);
    row.AgentID = agent.ID;
    return row;
}

/** Research answered, then Writer: continuity is Writer. */
const TWO_AGENTS = () => [
    new FakeDetail('u1', 'User', 'Find sources'),
    reply(RESEARCH, 'a1', 'Here are five sources.'),
    new FakeDetail('u2', 'User', 'Draft a summary'),
    reply(WRITER, 'a2', 'Summary drafted.'),
];

/** A confident move away from Writer, to the given agent. */
function leavesTo(agent: RoutingAgent, extra: Record<string, DecisionAnswer> = {}): RunDecisionResult {
    return answered({ route: choice(agent.ID, 0.9), continues: likelihood(0.1), ...extra });
}

function routeOptionValues(params: RunDecisionParams): string[] {
    const route = params.Questions['route'];
    return route?.Kind === 'Choice' ? route.Options.map(o => o.Value) : [];
}

describe('MessageInputComponent — decision routing', () => {
    let h: Harness;

    beforeEach(() => {
        vi.spyOn(AIEngineBase.Instance, 'Agents', 'get').mockReturnValue(AGENTS as unknown as MJAIAgentEntityExtended[]);
        vi.spyOn(PlanModePreference, 'IsEnabled').mockReturnValue(false);
        vi.spyOn(PlanModePreference, 'ClaimPendingNew').mockImplementation(() => undefined);
        vi.spyOn(MJNotificationService, 'Instance', 'get')
            .mockReturnValue({ CreateSimpleNotification: vi.fn() } as unknown as MJNotificationService);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        h = buildHarness();
        h.set({ ConversationHistory: TWO_AGENTS() });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('off by default', () => {
        it('the input defaults to false', () => {
            const construct = MessageInputComponent as unknown as new (...deps: unknown[]) => MessageInputComponent;
            expect(new construct().EnableDecisionRouting).toBe(false);
        });

        it('makes no call and routes to the last agent, exactly as before', async () => {
            h.runDecision.mockResolvedValue(leavesTo(RESEARCH));

            await h.route(userMessage());

            expect(h.runDecision).not.toHaveBeenCalled();
            expect(h.findArtifacts).not.toHaveBeenCalled();
            expect(h.before.map(e => [e.Route, e.AgentId])).toEqual([['Continuity', WRITER.ID]]);
            expect(h.invokeSubAgent.mock.calls[0][0]).toBe('Writer');
            expect(h.invokeSubAgent.mock.calls[0][9]).toBeUndefined();
        });
    });

    describe('on', () => {
        beforeEach(() => h.set({ EnableDecisionRouting: true }));

        it('a confident Choice of another agent routes the turn to it, labelled DecisionRouted', async () => {
            h.runDecision.mockResolvedValue(leavesTo(RESEARCH));

            await h.route(userMessage());

            expect(h.runDecision).toHaveBeenCalledOnce();
            expect(h.before.map(e => [e.Route, e.AgentId])).toEqual([['DecisionRouted', RESEARCH.ID]]);
            expect(h.invokeSubAgent.mock.calls[0][0]).toBe('Research');
        });

        it('asks once, with the time limit, about the conversation as it is now', async () => {
            h.runDecision.mockResolvedValue(leavesTo(RESEARCH));

            await h.route(userMessage());

            const params = h.runDecision.mock.calls[0][0];
            expect(params.TimeoutMS).toBe(DECISION_ROUTING_TIMEOUT_MS);
            expect(routeOptionValues(params)).toEqual([WRITER.ID, RESEARCH.ID, MANAGER.ID]);
            expect(params.State).toContain('Writer: Summary drafted.');
            expect(params.State).toContain('Now turn it into a press release');
        });

        it('choosing the conversation manager sends the turn down the manager path', async () => {
            h.runDecision.mockResolvedValue(leavesTo(MANAGER));

            await h.route(userMessage());

            expect(h.before.map(e => [e.Route, e.AgentId])).toEqual([['ConversationManager', MANAGER.ID]]);
            expect(h.processMessage).toHaveBeenCalledOnce();
            expect(h.invokeSubAgent).not.toHaveBeenCalled();
        });

        it('ignores a routed agent the chat does not allow, and never offers it', async () => {
            h.set({ AllowedAgentIDs: [WRITER.ID, MANAGER.ID] });
            h.runDecision.mockResolvedValue(leavesTo(RESEARCH));

            await h.route(userMessage());

            expect(routeOptionValues(h.runDecision.mock.calls[0][0])).toEqual([WRITER.ID, MANAGER.ID]);
            expect(h.before.map(e => [e.Route, e.AgentId])).toEqual([['Continuity', WRITER.ID]]);
        });

        it.each([
            ['a low-confidence Choice', async () => answered({ route: choice(RESEARCH.ID, 0.5), continues: likelihood(0.1) })],
            ['an ambiguous Likelihood', async () => answered({ route: choice(RESEARCH.ID, 0.9), continues: likelihood(0.5) })],
            ['a failed decision', async (): Promise<RunDecisionResult> => ({ Success: false, ErrorMessage: 'no model', Answers: {} })],
            ['a call that throws', async (): Promise<RunDecisionResult> => { throw new Error('network down'); }],
        ])('%s keeps continuity', async (_label, answer) => {
            h.runDecision.mockImplementation(answer);

            await h.route(userMessage());

            expect(h.before.map(e => [e.Route, e.AgentId])).toEqual([['Continuity', WRITER.ID]]);
            expect(h.invokeSubAgent.mock.calls[0][0]).toBe('Writer');
        });

        it('an answer slower than 250 ms keeps continuity', async () => {
            vi.useFakeTimers();
            h.runDecision.mockImplementation(() => new Promise<RunDecisionResult>(resolve =>
                setTimeout(() => resolve(leavesTo(RESEARCH)), DECISION_ROUTING_TIMEOUT_MS + 100)));

            const routed = h.route(userMessage());
            await vi.advanceTimersByTimeAsync(DECISION_ROUTING_TIMEOUT_MS + 1);
            await routed;

            expect(h.before.map(e => [e.Route, e.AgentId])).toEqual([['Continuity', WRITER.ID]]);
        });

        it('makes no call for a message that tags an agent', async () => {
            await h.route(userMessage('@Research more sources'), mentionsOf(RESEARCH));

            expect(h.runDecision).not.toHaveBeenCalled();
            expect(h.before.map(e => [e.Route, e.AgentId])).toEqual([['Mention', RESEARCH.ID]]);
        });

        it('makes no call for a form response, which goes back to the last agent', async () => {
            const form = ConversationUtility.CreateFormResponse('submit', [{ name: 'tone', value: 'formal' }]);

            await h.route(userMessage(form));

            expect(h.runDecision).not.toHaveBeenCalled();
            expect(h.before.map(e => [e.Route, e.AgentId])).toEqual([['Continuity', WRITER.ID]]);
        });

        it('makes no call before any agent has answered', async () => {
            h.set({ ConversationHistory: [] });

            await h.route(userMessage());

            expect(h.runDecision).not.toHaveBeenCalled();
            expect(h.before.map(e => e.Route)).toEqual(['ConversationManager']);
        });

        it('makes no call under MentionOnly', async () => {
            h.set({ AgentReplyMode: 'MentionOnly' });

            await h.route(userMessage());

            expect(h.runDecision).not.toHaveBeenCalled();
            expect(h.before).toHaveLength(0);
        });

        it('rebuilds the options from the conversation\'s agents for every message', async () => {
            h.set({ ConversationHistory: TWO_AGENTS().slice(0, 2) });
            await h.route(userMessage());
            h.set({ ConversationHistory: TWO_AGENTS() });
            await h.route(userMessage());

            expect(h.runDecision).toHaveBeenCalledTimes(2);
            expect(routeOptionValues(h.runDecision.mock.calls[0][0])).toEqual([RESEARCH.ID, MANAGER.ID]);
            expect(routeOptionValues(h.runDecision.mock.calls[1][0])).toEqual([WRITER.ID, RESEARCH.ID, MANAGER.ID]);
        });

        describe('artifact targeting', () => {
            beforeEach(() => {
                h.findArtifacts.mockImplementation(async (_conversationId, agentId) =>
                    agentId === WRITER.ID
                        ? [{ artifactId: 'artifact-1', artifactName: 'Summary', ArtifactType: 'Report', Versions: [{ versionId: VERSION, versionNumber: 1, versionName: null }] }]
                        : []);
            });

            it('adds the artifact question to the same call', async () => {
                await h.route(userMessage());

                expect(h.runDecision).toHaveBeenCalledOnce();
                const artifact = h.runDecision.mock.calls[0][0].Questions['artifact'];
                expect(artifact?.Kind === 'Choice' ? artifact.Options.map(o => o.Value) : []).toEqual([VERSION, 'none']);
            });

            it('a confident answer sets the version the agent continues from', async () => {
                h.runDecision.mockResolvedValue(answered({
                    route: choice(WRITER.ID, 0.9), continues: likelihood(0.9), artifact: choice(VERSION, 0.9),
                }));

                await h.route(userMessage());

                expect(h.findVersion).toHaveBeenCalledWith(VERSION);
                expect(h.invokeSubAgent.mock.calls[0][0]).toBe('Writer');
                expect(h.invokeSubAgent.mock.calls[0][9]).toBe(VERSION);
            });

            it.each([
                ['"none"', choice('none', 0.95)],
                ['a low-confidence answer', choice(VERSION, 0.5)],
            ])('%s leaves it unset', async (_label, artifact) => {
                h.runDecision.mockResolvedValue(answered({ route: choice(WRITER.ID, 0.9), continues: likelihood(0.9), artifact }));

                await h.route(userMessage());

                expect(h.findVersion).not.toHaveBeenCalled();
                expect(h.invokeSubAgent.mock.calls[0][9]).toBeUndefined();
            });

            it('does not hand one agent\'s version to another agent\'s turn', async () => {
                h.runDecision.mockResolvedValue(leavesTo(RESEARCH, { artifact: choice(VERSION, 0.9) }));

                await h.route(userMessage());

                expect(h.invokeSubAgent.mock.calls[0][0]).toBe('Research');
                expect(h.findVersion).not.toHaveBeenCalled();
            });
        });
    });
});
