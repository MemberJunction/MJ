/**
 * @fileoverview Decision routing at the component that applies it (`MessageInputComponent`),
 * with `RunDecision` mocked.
 *
 * The pure pieces (the questions, the thresholds, the timeout) are pinned in
 * decision-routing.test.ts. These pin the wiring: with `EnableDecisionRouting` off (the default)
 * there is no call and routing is unchanged; with it on, a confident answer routes the turn, and
 * anything else keeps continuity; a tagged message or a form response makes no call; and a
 * confident artifact answer reaches the agent's run as its payload source. Only agents in the
 * '@' list (the person's permission-filtered set) are ever offered.
 *
 * The component is built by Angular's own injector, with typed doubles for the services these
 * paths use. Agents, conversation rows and agent runs are real entity objects on a minimal
 * entity definition, and the '@' list's cache is stubbed. Nothing is cast.
 */
import '@angular/compiler'; // JIT support — the component import evaluates Angular decorators in vitest's node env
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { Injector } from '@angular/core';
import type { ChoiceAnswer, DecisionAnswer, LikelihoodAnswer } from '@memberjunction/ai';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ConversationUtility, MJAIAgentEntityExtended, MJAIAgentRunEntityExtended, type ExecuteAgentResult } from '@memberjunction/ai-core-plus';
import { EntityInfo, UserInfo } from '@memberjunction/core';
import { MJAIAgentRunSchema, MJAIAgentSchema, MJConversationDetailEntity, MJConversationDetailSchema } from '@memberjunction/core-entities';
import type { RunDecisionParams, RunDecisionResult } from '@memberjunction/graphql-dataprovider';

import { MessageInputComponent } from '../lib/components/message/message-input.component';
import type { BeforeAgentTurnEventArgs } from '../lib/events/chat-events';
import type { AgentTurnHandler } from '../lib/models/agent-turn.model';
import { ActiveTasksService } from '../lib/services/active-tasks.service';
import { ConversationAgentService } from '../lib/services/conversation-agent.service';
import { ConversationAttachmentService } from '../lib/services/conversation-attachment.service';
import { ConversationBridgeService } from '../lib/services/conversation-bridge.service';
import { ConversationStreamingService } from '../lib/services/conversation-streaming.service';
import { DataCacheService } from '../lib/services/data-cache.service';
import { DialogService } from '../lib/services/dialog.service';
import { MentionAutocompleteService } from '../lib/services/mention-autocomplete.service';
import { MentionParserService } from '../lib/services/mention-parser.service';
import { RealtimeSessionService } from '../lib/services/realtime-session.service';
import { ToastService } from '../lib/services/toast.service';
import { PlanModePreference } from '../lib/utils/plan-mode-preference';
import { DECISION_ROUTING_TIMEOUT_MS, type RoutingAgent } from '../lib/utils/decision-routing';
import type { MentionParseResult } from '../lib/models/conversation-state.model';

/**
 * A minimal entity definition with the named fields, so the fixtures below are real entity objects:
 * the ID is the primary key, and every other field can be set and reads back what was set.
 */
function entityInfo(name: string, fieldNames: readonly string[]): EntityInfo {
    const entityId = `entity-${name}`;
    return new EntityInfo({
        ID: entityId, Name: name, SchemaName: '__mj', BaseTable: name, BaseView: `vw${name}`,
        Fields: fieldNames.map((field, index) => ({
            ID: `${entityId}-${field}`, EntityID: entityId, Sequence: index + 1, Name: field, Entity: name,
            Type: field === 'ID' ? 'uniqueidentifier' : 'nvarchar', IsPrimaryKey: field === 'ID', AllowUpdateAPI: true,
        })),
    });
}

const AGENT_ENTITY = entityInfo('MJ: AI Agents', Object.keys(MJAIAgentSchema.shape));
const AGENT_RUN_ENTITY = entityInfo('MJ: AI Agent Runs', Object.keys(MJAIAgentRunSchema.shape));
const DETAIL_ENTITY = entityInfo('MJ: Conversation Details', Object.keys(MJConversationDetailSchema.shape));

/** The agent fields routing reads. */
type AgentFields = Pick<MJAIAgentEntityExtended, 'ID' | 'Name' | 'Description' | 'Status' | 'IsRestricted'>;

function agent(fields: AgentFields): MJAIAgentEntityExtended {
    const row = new MJAIAgentEntityExtended(AGENT_ENTITY);
    row.Hydrate(fields);
    return row;
}

const MANAGER = agent({ ID: 'AAAAAAAA-0000-0000-0000-000000000001', Name: 'Sage', Description: 'Routes each request.', Status: 'Active', IsRestricted: false });
const RESEARCH = agent({ ID: 'AAAAAAAA-0000-0000-0000-000000000002', Name: 'Research', Description: 'Finds sources.', Status: 'Active', IsRestricted: false });
const WRITER = agent({ ID: 'AAAAAAAA-0000-0000-0000-000000000003', Name: 'Writer', Description: 'Drafts documents.', Status: 'Active', IsRestricted: false });
/** Answered earlier in the conversation, and has since been disabled. */
const RETIRED = agent({ ID: 'AAAAAAAA-0000-0000-0000-000000000004', Name: 'Archivist', Description: 'Files old drafts.', Status: 'Disabled', IsRestricted: false });
/** Active, but restricted to system use. */
const INTERNAL = agent({ ID: 'AAAAAAAA-0000-0000-0000-000000000005', Name: 'Scheduler', Description: 'Runs scheduled jobs.', Status: 'Active', IsRestricted: true });
const AGENTS = [MANAGER, RESEARCH, WRITER, RETIRED, INTERNAL];
/**
 * The '@' list's agents for this person (`GetAvailableAgents`): the active, unrestricted ones,
 * all of which the person may run. Routing offers participants only from this set.
 */
const RUNNABLE = [MANAGER, RESEARCH, WRITER];

const VERSION = 'BBBBBBBB-0000-0000-0000-000000000001';
const PROMPT_RUN = 'EEEEEEEE-0000-0000-0000-000000000001';
const CREATED_AT = new Date('2026-09-01T10:00:00.000Z');

/** A conversation row that saves and loads without a database. */
class TestDetail extends MJConversationDetailEntity {
    public override async Save(): Promise<boolean> {
        return true;
    }

    public override async Load(): Promise<boolean> {
        return true;
    }
}

function detail(id: string, role: MJConversationDetailEntity['Role'], message = '', agentId: string | null = null): TestDetail {
    const row = new TestDetail(DETAIL_ENTITY);
    row.Hydrate({
        ID: id, ConversationID: 'conv-1', Role: role, Message: message, Status: 'Complete', AgentID: agentId,
        ParentID: null, HiddenToUser: false, __mj_CreatedAt: CREATED_AT,
    });
    return row;
}

function chatResult(runId: string): ExecuteAgentResult<Record<string, unknown>> {
    const agentRun = new MJAIAgentRunEntityExtended(AGENT_RUN_ENTITY);
    agentRun.Hydrate({ ID: runId, AgentID: null, FinalStep: 'Chat', Message: 'done' });
    return { success: true, agentRun, payload: {} };
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

/** The part of each service the routing paths call. */
type AgentServiceDouble = Pick<ConversationAgentService,
    'RunDecision' | 'FindAgentArtifacts' | 'FindArtifactVersionById' | 'ProcessMessage' | 'invokeSubAgent'
    | 'FindConfigurationPresetForAgent' | 'FindLatestAgentOutputVersion'>;
type DataCacheDouble = Pick<DataCacheService, 'createConversationDetail' | 'getConversationDetail'>;
type ActiveTasksDouble = Pick<ActiveTasksService, 'add' | 'remove' | 'getByConversationDetailId' | 'updateStatusByConversationDetailId'>;
type StreamingDouble = Pick<ConversationStreamingService, 'registerMessageCallback' | 'unregisterMessageCallback'>;

interface ServiceDoubles {
    agentService: AgentServiceDouble;
    dataCache: DataCacheDouble;
    activeTasks: ActiveTasksDouble;
    streaming: StreamingDouble;
}

/** The component's constructor parameters, in order. */
const COMPONENT_DEPS = [
    DialogService, ToastService, ConversationAgentService, DataCacheService, ActiveTasksService,
    ConversationStreamingService, MentionParserService, ConversationAttachmentService, ConversationBridgeService,
    RealtimeSessionService,
];

/** Builds the component through Angular's injector, with the doubles in place of the services. */
function buildComponent(doubles: ServiceDoubles): MessageInputComponent {
    const injector = Injector.create({
        providers: [
            { provide: ConversationAgentService, useValue: doubles.agentService },
            { provide: DataCacheService, useValue: doubles.dataCache },
            { provide: ActiveTasksService, useValue: doubles.activeTasks },
            { provide: ConversationStreamingService, useValue: doubles.streaming },
            // The routing paths never reach these.
            ...[DialogService, ToastService, MentionParserService, ConversationAttachmentService, ConversationBridgeService, RealtimeSessionService]
                .map(token => ({ provide: token, useValue: {} })),
            { provide: MessageInputComponent, deps: COMPONENT_DEPS },
        ],
    });
    return injector.get(MessageInputComponent);
}

interface Harness {
    component: MessageInputComponent;
    before: BeforeAgentTurnEventArgs[];
    runDecision: Mock<ConversationAgentService['RunDecision']>;
    findArtifacts: Mock<ConversationAgentService['FindAgentArtifacts']>;
    findVersion: Mock<ConversationAgentService['FindArtifactVersionById']>;
    processMessage: Mock<ConversationAgentService['ProcessMessage']>;
    invokeSubAgent: Mock<ConversationAgentService['invokeSubAgent']>;
    set(values: Partial<MessageInputComponent>): void;
    route(message: MJConversationDetailEntity, mentions?: MentionParseResult): Promise<void>;
}

function buildHarness(): Harness {
    let nextId = 0;
    const runDecision = vi.fn<ConversationAgentService['RunDecision']>(async () => answered({}));
    const findArtifacts = vi.fn<ConversationAgentService['FindAgentArtifacts']>(async () => []);
    const findVersion = vi.fn<ConversationAgentService['FindArtifactVersionById']>(async versionId => ({
        artifactId: 'artifact-1', versionId, versionNumber: 1, payload: { title: 'Press kit' },
    }));
    const processMessage = vi.fn<ConversationAgentService['ProcessMessage']>(async () => chatResult('run-manager'));
    const invokeSubAgent = vi.fn<ConversationAgentService['invokeSubAgent']>(async () => chatResult('run-agent'));

    const component = buildComponent({
        agentService: {
            RunDecision: runDecision,
            FindAgentArtifacts: findArtifacts,
            FindArtifactVersionById: findVersion,
            ProcessMessage: processMessage,
            invokeSubAgent,
            FindConfigurationPresetForAgent: vi.fn<ConversationAgentService['FindConfigurationPresetForAgent']>(async () => undefined),
            FindLatestAgentOutputVersion: vi.fn<ConversationAgentService['FindLatestAgentOutputVersion']>(async () => null),
        },
        dataCache: {
            createConversationDetail: vi.fn<DataCacheService['createConversationDetail']>(async () => detail(`row-${++nextId}`, 'AI')),
            getConversationDetail: vi.fn<DataCacheService['getConversationDetail']>(async () => null),
        },
        activeTasks: {
            add: vi.fn<ActiveTasksService['add']>(() => 'task-1'),
            remove: vi.fn<ActiveTasksService['remove']>(),
            getByConversationDetailId: vi.fn<ActiveTasksService['getByConversationDetailId']>(() => undefined),
            updateStatusByConversationDetailId: vi.fn<ActiveTasksService['updateStatusByConversationDetailId']>(() => true),
        },
        streaming: {
            registerMessageCallback: vi.fn<ConversationStreamingService['registerMessageCallback']>(),
            unregisterMessageCallback: vi.fn<ConversationStreamingService['unregisterMessageCallback']>(),
        },
    });
    Object.assign(component, {
        ConversationId: 'conv-1',
        ConversationName: 'Test',
        CurrentUser: Object.assign(new UserInfo(), { ID: 'user-1' }),
        ConverationManagerAgent: MANAGER,
    });

    const before: BeforeAgentTurnEventArgs[] = [];
    component.BeforeAgentTurn.subscribe(e => before.push(e));

    return {
        component, before, runDecision, findArtifacts, findVersion, processMessage, invokeSubAgent,
        set: values => Object.assign(component, values),
        // routeMessage is private; element access reaches it with its real signature.
        route: (message, mentions = NO_MENTIONS) => component['routeMessage'](message, mentions, false),
    };
}

function userMessage(text = 'Now turn it into a press release'): TestDetail {
    return detail('user-msg-1', 'User', text);
}

function reply(from: RoutingAgent, id: string, text: string): TestDetail {
    return detail(id, 'AI', text, from.ID);
}

/** Research answered, then Writer: continuity is Writer. */
const TWO_AGENTS = () => [
    detail('u1', 'User', 'Find sources'),
    reply(RESEARCH, 'a1', 'Here are five sources.'),
    detail('u2', 'User', 'Draft a summary'),
    reply(WRITER, 'a2', 'Summary drafted.'),
];

/** A confident move away from Writer, to the given agent. */
function leavesTo(to: RoutingAgent, extra: Record<string, DecisionAnswer> = {}): RunDecisionResult {
    return answered({ route: choice(to.ID, 0.9), continues: likelihood(0.1), ...extra });
}

function routeOptionValues(params: RunDecisionParams): string[] {
    const route = params.Questions['route'];
    return route?.Kind === 'Choice' ? route.Options.map(o => o.Value) : [];
}

describe('MessageInputComponent — decision routing', () => {
    let h: Harness;

    beforeEach(() => {
        vi.spyOn(AIEngineBase.Instance, 'Agents', 'get').mockReturnValue(AGENTS);
        vi.spyOn(MentionAutocompleteService.Instance, 'GetAvailableAgents').mockReturnValue(RUNNABLE);
        vi.spyOn(PlanModePreference, 'IsEnabled').mockReturnValue(false);
        vi.spyOn(PlanModePreference, 'ClaimPendingNew').mockImplementation(() => undefined);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        h = buildHarness();
        h.set({ ConversationHistory: TWO_AGENTS() });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    describe('off by default', () => {
        it('the input defaults to false', () => {
            expect(h.component.EnableDecisionRouting).toBe(false);
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

        /**
         * Composers are cached per conversation. Opening another conversation rebinds this hidden
         * composer's history to [] and its pinned agent to null; the call does that, then answers.
         */
        function switchesAwayThenAnswers(result: RunDecisionResult): void {
            h.runDecision.mockImplementation(async () => {
                h.set({ ConversationHistory: [], ConversationDefaultAgentId: null });
                return result;
            });
        }

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

        it('logs the verdict with the decision\'s prompt run, in verbose mode', async () => {
            vi.stubEnv('MJ_VERBOSE', 'true');
            const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
            h.runDecision.mockResolvedValue({ ...leavesTo(RESEARCH), PromptRunID: PROMPT_RUN });

            await h.route(userMessage());

            const lines = log.mock.calls.map(args => args.join(' '));
            expect(lines).toContain(`Decision routing: Routed, routed to Research (prompt run ${PROMPT_RUN})`);
        });

        it('choosing the conversation manager sends the turn down the manager path', async () => {
            h.runDecision.mockResolvedValue(leavesTo(MANAGER));

            await h.route(userMessage());

            expect(h.before.map(e => [e.Route, e.AgentId])).toEqual([['ConversationManager', MANAGER.ID]]);
            expect(h.processMessage).toHaveBeenCalledOnce();
            expect(h.invokeSubAgent).not.toHaveBeenCalled();
        });

        it('never offers, or routes to, an agent that is no longer active or is restricted', async () => {
            h.set({ ConversationHistory: [reply(RETIRED, 'r1', 'Filed the old draft.'), reply(INTERNAL, 'r2', 'Export scheduled.'), ...TWO_AGENTS()] });
            h.runDecision.mockResolvedValue(leavesTo(RETIRED));

            await h.route(userMessage());

            expect(routeOptionValues(h.runDecision.mock.calls[0][0])).toEqual([WRITER.ID, RESEARCH.ID, MANAGER.ID]);
            expect(h.before.map(e => [e.Route, e.AgentId])).toEqual([['Continuity', WRITER.ID]]);
            expect(h.findArtifacts.mock.calls.map(([, agentId]) => agentId)).toEqual([WRITER.ID, RESEARCH.ID]);
        });

        it('never offers, or routes to, an agent that answered here but that the person can\'t run', async () => {
            // Research answered in this (shared) conversation, but isn't in this person's '@' list.
            vi.spyOn(MentionAutocompleteService.Instance, 'GetAvailableAgents').mockReturnValue([MANAGER, WRITER]);
            h.runDecision.mockResolvedValue(leavesTo(RESEARCH));

            await h.route(userMessage());

            const params = h.runDecision.mock.calls[0][0];
            expect(routeOptionValues(params)).toEqual([WRITER.ID, MANAGER.ID]);
            expect(h.findArtifacts.mock.calls.map(([, agentId]) => agentId)).toEqual([WRITER.ID]);
            expect(h.before.map(e => [e.Route, e.AgentId])).toEqual([['Continuity', WRITER.ID]]);
            expect(h.invokeSubAgent.mock.calls.map(call => call[0])).toEqual(['Writer']);
            // Its earlier reply is still part of the conversation the decision reads, under its name.
            expect(params.State).toContain('Research: Here are five sources.');
        });

        it('makes no call before the \'@\' list has loaded, which keeps today\'s routing', async () => {
            vi.spyOn(MentionAutocompleteService.Instance, 'GetAvailableAgents').mockReturnValue([]);
            h.runDecision.mockResolvedValue(leavesTo(RESEARCH));

            await h.route(userMessage());

            expect(h.runDecision).not.toHaveBeenCalled();
            expect(h.findArtifacts).not.toHaveBeenCalled();
            expect(h.before.map(e => [e.Route, e.AgentId])).toEqual([['Continuity', WRITER.ID]]);
        });

        it('makes no call when the last agent is no longer active, which keeps today\'s routing', async () => {
            h.set({ ConversationHistory: [...TWO_AGENTS(), detail('u3', 'User', 'Tidy it'), reply(RETIRED, 'r1', 'Filed.')] });

            await h.route(userMessage());

            expect(h.runDecision).not.toHaveBeenCalled();
            expect(h.before.map(e => [e.Route, e.AgentId])).toEqual([['Continuity', RETIRED.ID]]);
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

        it('a failure while loading the artifacts keeps continuity, and makes no call', async () => {
            h.findArtifacts.mockRejectedValue(new Error('artifact query failed'));

            await h.route(userMessage());

            expect(h.runDecision).not.toHaveBeenCalled();
            expect(h.before.map(e => [e.Route, e.AgentId])).toEqual([['Continuity', WRITER.ID]]);
            expect(h.invokeSubAgent.mock.calls[0][0]).toBe('Writer');
        });

        describe('when the person opens another conversation during the call', () => {
            it('a kept thread still goes to the last agent', async () => {
                switchesAwayThenAnswers(answered({ route: choice(WRITER.ID, 0.9), continues: likelihood(0.9) }));

                await h.route(userMessage());

                expect(h.before.map(e => [e.Route, e.AgentId])).toEqual([['Continuity', WRITER.ID]]);
                expect(h.invokeSubAgent.mock.calls[0][0]).toBe('Writer');
            });

            it('someone else still goes to the conversation\'s pinned agent', async () => {
                h.set({ ConversationDefaultAgentId: RESEARCH.ID });
                switchesAwayThenAnswers(leavesTo(MANAGER));

                await h.route(userMessage());

                expect(h.before.map(e => [e.Route, e.AgentId])).toEqual([['ConversationDefault', RESEARCH.ID]]);
            });
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

            it('keeps the version when the person opens another conversation during the call', async () => {
                switchesAwayThenAnswers(answered({
                    route: choice(WRITER.ID, 0.9), continues: likelihood(0.9), artifact: choice(VERSION, 0.9),
                }));

                await h.route(userMessage());

                expect(h.invokeSubAgent.mock.calls[0][0]).toBe('Writer');
                expect(h.invokeSubAgent.mock.calls[0][9]).toBe(VERSION);
            });

            describe('with a host AgentTurnHandler', () => {
                let handler: Mock<AgentTurnHandler>;

                beforeEach(() => {
                    handler = vi.fn<AgentTurnHandler>(async () => ({ Success: true }));
                    h.set({ AgentTurnHandler: handler });
                });

                it('hands the handler the version, since the host runs the turn', async () => {
                    h.runDecision.mockResolvedValue(answered({
                        route: choice(WRITER.ID, 0.9), continues: likelihood(0.9), artifact: choice(VERSION, 0.9),
                    }));

                    await h.route(userMessage());

                    expect(handler).toHaveBeenCalledOnce();
                    expect(handler.mock.calls[0][0]).toMatchObject({ AgentId: WRITER.ID, Route: 'Continuity', TargetArtifactVersionId: VERSION });
                    expect(h.invokeSubAgent).not.toHaveBeenCalled();
                });

                it('hands it no version for another agent\'s turn, or without a confident answer', async () => {
                    h.runDecision.mockResolvedValueOnce(leavesTo(RESEARCH, { artifact: choice(VERSION, 0.9) }));
                    await h.route(userMessage());
                    h.runDecision.mockResolvedValueOnce(answered({ route: choice(WRITER.ID, 0.9), continues: likelihood(0.9) }));
                    await h.route(userMessage());

                    expect(handler.mock.calls.map(([request]) => [request.AgentId, request.TargetArtifactVersionId]))
                        .toEqual([[RESEARCH.ID, null], [WRITER.ID, null]]);
                });
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
