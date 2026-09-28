/**
 * @fileoverview The chat area's host rules for an agent turn, at the component that applies them
 * (`MessageInputComponent.routeMessage`).
 *
 * The pure routing matrix is pinned in agent-turn-routing.test.ts. These pin the wiring around
 * it: `BeforeAgentTurn` fires once per turn, on every route, before any row exists; a canceled
 * turn leaves nothing behind; `MentionOnly` starts no turn for an untagged message; a redirect
 * runs the other agent; a host `AgentTurnHandler` replaces MJ's path; the allowed list holds on
 * the conversation manager's delegation; and the history floor reaches every call.
 *
 * Instantiated via the prototype (no constructor/TestBed) with only the members these paths
 * touch stubbed — the same style as message-input-streaming.test.ts.
 */
import '@angular/compiler'; // JIT support — the component import evaluates Angular decorators in vitest's node env
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from '@angular/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { TaskGraphSubmitOperation } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';

import { MessageInputComponent } from '../lib/components/message/message-input.component';
import type { BeforeAgentTurnEventArgs, AfterAgentTurnEventArgs } from '../lib/events/chat-events';
import { PlanModePreference } from '../lib/utils/plan-mode-preference';
import type { AgentTurnHandler, AgentTurnResult, AgentTurnRoute } from '../lib/models/agent-turn.model';
import type { MentionParseResult } from '../lib/models/conversation-state.model';

const MANAGER = { ID: 'AAAAAAAA-0000-0000-0000-000000000001', Name: 'Sage' };
const RESEARCH = { ID: 'AAAAAAAA-0000-0000-0000-000000000002', Name: 'Research' };
const WRITER = { ID: 'AAAAAAAA-0000-0000-0000-000000000003', Name: 'Writer' };
const PINNED = { ID: 'AAAAAAAA-0000-0000-0000-000000000004', Name: 'Pinned' };
const HOST = { ID: 'AAAAAAAA-0000-0000-0000-000000000005', Name: 'Host Default' };
const AGENTS = [MANAGER, RESEARCH, WRITER, PINNED, HOST];

type Fn = ReturnType<typeof vi.fn>;

/** A conversation detail row stand-in that counts its saves. */
class FakeDetail {
    public ID: string;
    public ConversationID = 'conv-1';
    public Role: string;
    public Message = '';
    public Status: 'Complete' | 'Error' | 'In-Progress' = 'Complete';
    public AgentID: string | null = null;
    public ParentID: string | null = null;
    public HiddenToUser = false;
    public Error: string | null = null;
    public ResponseForm: string | null = null;
    public ActionableCommands: string | null = null;
    public AutomaticCommands: string | null = null;
    public __mj_CreatedAt: Date;
    public LatestResult = null;
    public Saves = 0;

    constructor(id: string, role: string, createdAt: Date = new Date()) {
        this.ID = id;
        this.Role = role;
        this.__mj_CreatedAt = createdAt;
    }

    public async Save(): Promise<boolean> {
        this.Saves++;
        return true;
    }

    public async Load(): Promise<boolean> {
        return true;
    }
}

/** A successful agent result whose reply is plain chat. */
function chatResult(runId = 'run-1', payload: Record<string, unknown> = {}) {
    return { success: true, agentRun: { ID: runId, AgentID: null, FinalStep: 'Chat', Message: 'done' }, payload };
}

function mentionsOf(...agents: Array<{ ID: string; Name: string; Preset?: string }>): MentionParseResult {
    const mentions = agents.map(a => ({ type: 'agent' as const, id: a.ID, name: a.Name, configurationId: a.Preset }));
    return { mentions, agentMention: mentions[0] ?? null, userMentions: [], entityMentions: [], skillMentions: [] };
}

const NO_MENTIONS = mentionsOf();

interface Harness {
    component: MessageInputComponent;
    created: FakeDetail[];
    before: BeforeAgentTurnEventArgs[];
    after: AfterAgentTurnEventArgs[];
    sent: FakeDetail[];
    processMessage: Fn;
    invokeSubAgent: Fn;
    findLatestOutput: Fn;
    nameConversation: Fn;
    addTask: Fn;
    hostRows: Map<string, FakeDetail>;
    set(fields: Record<string, unknown>): void;
    route(message: FakeDetail, mentions?: MentionParseResult, isFirstMessage?: boolean): Promise<void>;
}

function buildHarness(): Harness {
    const created: FakeDetail[] = [];
    const before: BeforeAgentTurnEventArgs[] = [];
    const after: AfterAgentTurnEventArgs[] = [];
    const sent: FakeDetail[] = [];
    const hostRows = new Map<string, FakeDetail>();
    let nextId = 0;

    const beforeEmitter = new EventEmitter<BeforeAgentTurnEventArgs>();
    const afterEmitter = new EventEmitter<AfterAgentTurnEventArgs>();
    const sentEmitter = new EventEmitter<FakeDetail>();
    beforeEmitter.subscribe(e => before.push(e));
    afterEmitter.subscribe(e => after.push(e));
    sentEmitter.subscribe(d => sent.push(d));

    const processMessage = vi.fn(async () => chatResult('run-manager'));
    const invokeSubAgent = vi.fn(async () => chatResult('run-agent'));
    const findLatestOutput = vi.fn(async () => null);
    const addTask = vi.fn(() => 'task-1');

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
        AutoNameConversation: true,
        ConverationManagerAgent: MANAGER,
        ConversationHistory: [],
        _pendingRequestedSkillIDs: [],
        completionTimestamps: new Map<string, number>(),
        registeredCallbacks: new Map(),
        inFlightWatches: new Map(),
        // One emitter under both names, as the component declares them (Object.create skips the field initialisers).
        BeforeAgentTurn: beforeEmitter,
        beforeAgentTurn: beforeEmitter,
        AfterAgentTurn: afterEmitter,
        afterAgentTurn: afterEmitter,
        MessageSent: sentEmitter,
        messageSent: sentEmitter,
        ArtifactCreated: new EventEmitter(),
        MessageComplete: new EventEmitter(),
        dataCache: {
            createConversationDetail: vi.fn(async () => {
                const row = new FakeDetail(`row-${++nextId}`, 'AI');
                created.push(row);
                return row;
            }),
            getConversationDetail: vi.fn(async (id: string) => hostRows.get(id) ?? null),
        },
        agentService: {
            ProcessMessage: processMessage,
            invokeSubAgent,
            FindConfigurationPresetForAgent: vi.fn(async () => undefined),
            FindLatestAgentOutputVersion: findLatestOutput,
        },
        activeTasks: {
            add: addTask,
            remove: vi.fn(),
            getByConversationDetailId: vi.fn(() => undefined),
            updateStatusByConversationDetailId: vi.fn(),
        },
        streamingService: { registerMessageCallback: vi.fn(), unregisterMessageCallback: vi.fn() },
    });
    const nameConversation = vi.fn(async () => undefined);
    fields['nameConversation'] = nameConversation;

    const routeMessage = (component as unknown as {
        routeMessage(message: FakeDetail, mentions: MentionParseResult, isFirstMessage: boolean): Promise<void>;
    }).routeMessage.bind(component);

    return {
        component, created, before, after, sent, processMessage, invokeSubAgent, findLatestOutput,
        nameConversation, addTask, hostRows,
        set: (values) => Object.assign(fields, values),
        route: (message, mentions = NO_MENTIONS, isFirstMessage = false) => routeMessage(message, mentions, isFirstMessage),
    };
}

function userMessage(text = 'hello'): FakeDetail {
    const message = new FakeDetail('user-msg-1', 'User');
    message.Message = text;
    return message;
}

function aiReply(agentId: string, createdAt: Date = new Date('2026-09-01T10:00:00.000Z')): FakeDetail {
    const reply = new FakeDetail(`reply-${agentId}`, 'AI', createdAt);
    reply.AgentID = agentId;
    return reply;
}

/** Each route, the setup that makes it the one chosen, and the agent it picks. */
const ROUTES: ReadonlyArray<{
    route: AgentTurnRoute;
    agent: { ID: string; Name: string };
    setup: (h: Harness) => MentionParseResult;
}> = [
    { route: 'Mention', agent: RESEARCH, setup: () => mentionsOf(RESEARCH) },
    { route: 'Continuity', agent: WRITER, setup: h => { h.set({ ConversationHistory: [aiReply(WRITER.ID)] }); return NO_MENTIONS; } },
    { route: 'ConversationDefault', agent: PINNED, setup: h => { h.set({ ConversationDefaultAgentId: PINNED.ID }); return NO_MENTIONS; } },
    { route: 'HostDefault', agent: HOST, setup: h => { h.set({ DefaultAgentId: HOST.ID }); return NO_MENTIONS; } },
    { route: 'ConversationManager', agent: MANAGER, setup: () => NO_MENTIONS },
];

describe('MessageInputComponent — host rules for an agent turn', () => {
    let notify: Fn;
    let h: Harness;

    beforeEach(() => {
        vi.spyOn(AIEngineBase.Instance, 'Agents', 'get').mockReturnValue(AGENTS as never);
        vi.spyOn(PlanModePreference, 'IsEnabled').mockReturnValue(false);
        vi.spyOn(PlanModePreference, 'ClaimPendingNew').mockImplementation(() => undefined);
        notify = vi.fn();
        vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: notify } as unknown as MJNotificationService);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        h = buildHarness();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('BeforeAgentTurn fires once per turn, on every route, before any row exists', () => {
        it.each(ROUTES)('route $route', async ({ route, agent, setup }) => {
            const mentions = setup(h);
            let rowsWhenAnnounced = -1;
            h.component.BeforeAgentTurn.subscribe(() => { rowsWhenAnnounced = h.created.length; });

            await h.route(userMessage(), mentions);

            expect(h.before).toHaveLength(1);
            expect(h.before[0].Route).toBe(route);
            expect(h.before[0].AgentId).toBe(agent.ID);
            expect(h.before[0].AgentName).toBe(agent.Name);
            expect(h.before[0].UserMessageId).toBe('user-msg-1');
            expect(rowsWhenAnnounced).toBe(0);

            if (route === 'ConversationManager') {
                expect(h.processMessage).toHaveBeenCalledOnce();
                expect(h.invokeSubAgent).not.toHaveBeenCalled();
            } else {
                expect(h.invokeSubAgent).toHaveBeenCalledOnce();
                expect(h.invokeSubAgent.mock.calls[0][0]).toBe(agent.Name);
            }
            expect(h.after).toHaveLength(1);
        });
    });

    describe('a canceled turn leaves nothing behind', () => {
        it.each(ROUTES)('route $route', async ({ setup }) => {
            const mentions = setup(h);
            h.component.BeforeAgentTurn.subscribe(e => { e.Cancel = true; e.CancelReason = 'guardrail'; });
            const message = userMessage();

            await h.route(message, mentions);

            expect(h.before).toHaveLength(1);
            expect(h.created).toHaveLength(0);
            expect(message.Saves).toBe(0);
            expect(h.addTask).not.toHaveBeenCalled();
            expect(h.processMessage).not.toHaveBeenCalled();
            expect(h.invokeSubAgent).not.toHaveBeenCalled();
            expect(h.after).toHaveLength(0);
            expect(notify).not.toHaveBeenCalled();
        });
    });

    describe("AgentReplyMode 'MentionOnly'", () => {
        beforeEach(() => h.set({ AgentReplyMode: 'MentionOnly' }));

        it('posts an untagged message with no turn: no event, no row, no agent', async () => {
            h.set({ ConversationHistory: [aiReply(WRITER.ID)], ConversationDefaultAgentId: PINNED.ID, DefaultAgentId: HOST.ID });

            await h.route(userMessage());

            expect(h.before).toHaveLength(0);
            expect(h.after).toHaveLength(0);
            expect(h.created).toHaveLength(0);
            expect(h.processMessage).not.toHaveBeenCalled();
            expect(h.invokeSubAgent).not.toHaveBeenCalled();
            expect(notify).not.toHaveBeenCalled();
        });

        it('still answers a message that tags an agent', async () => {
            await h.route(userMessage(), mentionsOf(RESEARCH));

            expect(h.before.map(e => e.Route)).toEqual(['Mention']);
            expect(h.invokeSubAgent.mock.calls[0][0]).toBe('Research');
        });

        it('still names the conversation from its first message', async () => {
            await h.route(userMessage(), NO_MENTIONS, true);
            expect(h.nameConversation).toHaveBeenCalledOnce();
        });
    });

    describe('AllowedAgentIDs', () => {
        it('under MentionOnly, ignores a tag for an agent the chat does not allow', async () => {
            h.set({ AgentReplyMode: 'MentionOnly', AllowedAgentIDs: [RESEARCH.ID] });

            await h.route(userMessage(), mentionsOf(WRITER));

            expect(h.before).toHaveLength(0);
            expect(h.created).toHaveLength(0);
        });

        it('hands the list to the conversation manager, which routes only among those agents', async () => {
            h.set({ AllowedAgentIDs: [MANAGER.ID, RESEARCH.ID] });

            await h.route(userMessage());

            expect(h.processMessage.mock.calls[0][8]).toEqual([MANAGER.ID, RESEARCH.ID]);
        });

        it("refuses the manager's delegation to a disallowed agent before any row is written for it", async () => {
            h.set({ AllowedAgentIDs: [MANAGER.ID, RESEARCH.ID] });
            h.processMessage.mockResolvedValueOnce({
                success: true,
                agentRun: { ID: 'run-manager', FinalStep: 'Success', Message: 'Handing off' },
                payload: { invokeAgent: 'Writer', reasoning: 'writing task' },
            });

            await h.route(userMessage());

            expect(h.created).toHaveLength(1); // the manager's own reply row only
            expect(h.invokeSubAgent).not.toHaveBeenCalled();
            expect(notify).toHaveBeenCalledOnce();
            expect(notify.mock.calls[0][0]).toContain('Writer');
        });

        it("lets the manager's delegation to an allowed agent run", async () => {
            h.set({ AllowedAgentIDs: [MANAGER.ID, RESEARCH.ID] });
            h.processMessage.mockResolvedValueOnce({
                success: true,
                agentRun: { ID: 'run-manager', FinalStep: 'Success', Message: 'Handing off' },
                payload: { invokeAgent: 'Research', reasoning: 'research task' },
            });

            await h.route(userMessage());

            expect(h.invokeSubAgent).toHaveBeenCalledOnce();
            expect(h.invokeSubAgent.mock.calls[0][0]).toBe('Research');
        });

        it('does not submit a workflow with an agent step the chat does not allow', async () => {
            const submit = vi.spyOn(TaskGraphSubmitOperation.prototype, 'Execute');
            h.set({ AllowedAgentIDs: [MANAGER.ID, RESEARCH.ID] });
            h.processMessage.mockResolvedValueOnce({
                success: true,
                agentRun: { ID: 'run-manager', FinalStep: 'Success', Message: 'Planning' },
                payload: {
                    taskGraph: {
                        workflowName: 'Report',
                        tasks: [
                            { tempId: 't1', name: 'Find', description: '', kind: 'Agent', configuration: { agentName: 'Research' }, dependsOn: [] },
                            { tempId: 't2', name: 'Write', description: '', kind: 'Agent', configuration: { agentName: 'Writer' }, dependsOn: ['t1'] },
                        ],
                    },
                },
            });

            await h.route(userMessage());

            expect(submit).not.toHaveBeenCalled();
            expect(h.created).toHaveLength(1); // no workflow row
            expect(notify.mock.calls[0][0]).toContain('Writer');
        });
    });

    describe('RedirectAgentId', () => {
        it('runs the turn with the agent a listener redirected it to', async () => {
            h.component.BeforeAgentTurn.subscribe(e => { e.RedirectAgentId = WRITER.ID; });

            await h.route(userMessage(), mentionsOf(RESEARCH));

            expect(h.invokeSubAgent).toHaveBeenCalledOnce();
            expect(h.invokeSubAgent.mock.calls[0][0]).toBe('Writer');
            expect(h.after).toHaveLength(1);
        });

        it('sends a redirect to the conversation manager through the manager path', async () => {
            h.component.BeforeAgentTurn.subscribe(e => { e.RedirectAgentId = MANAGER.ID; });

            await h.route(userMessage(), mentionsOf(RESEARCH));

            expect(h.processMessage).toHaveBeenCalledOnce();
            expect(h.invokeSubAgent).not.toHaveBeenCalled();
        });

        it('a pinned or host default that names the manager still calls it directly, as before', async () => {
            h.set({ DefaultAgentId: MANAGER.ID });

            await h.route(userMessage());

            expect(h.before[0].Route).toBe('HostDefault');
            expect(h.processMessage).not.toHaveBeenCalled();
            expect(h.invokeSubAgent.mock.calls[0][0]).toBe('Sage');
        });

        it('refuses a redirect to an agent the chat does not allow, writing nothing', async () => {
            h.set({ AllowedAgentIDs: [RESEARCH.ID] });
            h.component.BeforeAgentTurn.subscribe(e => { e.RedirectAgentId = WRITER.ID; });

            await h.route(userMessage(), mentionsOf(RESEARCH));

            expect(h.invokeSubAgent).not.toHaveBeenCalled();
            expect(h.created).toHaveLength(0);
            expect(notify).toHaveBeenCalledOnce();
        });
    });

    describe('AgentTurnHandler', () => {
        const FLOOR = new Date('2026-09-01T12:00:00.000Z');

        function handlerReturning(result: AgentTurnResult): { handler: AgentTurnHandler; calls: Fn } {
            const calls = vi.fn(async () => result);
            return { handler: calls as unknown as AgentTurnHandler, calls };
        }

        it("runs the turn on the host's server instead of MJ's path and shows the rows it reports", async () => {
            const reply = new FakeDetail('host-reply-1', 'AI');
            const status = new FakeDetail('host-status-1', 'AI');
            h.hostRows.set(status.ID, status).set(reply.ID, reply);
            const agentResult = chatResult('run-host');
            const { handler, calls } = handlerReturning({
                Success: true,
                ReplyDetailIds: [status.ID, reply.ID],
                AgentRunId: 'run-host',
                Result: agentResult as never,
            });
            h.set({ AgentTurnHandler: handler, AgentHistoryFrom: FLOOR, _pendingRequestedSkillIDs: [] });

            await h.route(userMessage('@Research find it'), mentionsOf({ ...RESEARCH, Preset: 'preset-high' }));

            expect(calls).toHaveBeenCalledOnce();
            expect(calls.mock.calls[0][0]).toMatchObject({
                ConversationId: 'conv-1',
                UserMessageId: 'user-msg-1',
                MessageText: '@Research find it',
                AgentId: RESEARCH.ID,
                AgentName: 'Research',
                Route: 'Mention',
                AgentHistoryFrom: FLOOR,
                ConfigurationPresetId: 'preset-high',
                PlanMode: false,
            });
            expect(h.created).toHaveLength(0);
            expect(h.processMessage).not.toHaveBeenCalled();
            expect(h.invokeSubAgent).not.toHaveBeenCalled();
            expect(h.sent.filter(d => d.Role === 'AI').map(d => d.ID)).toEqual([status.ID, reply.ID]);
            expect(h.after).toHaveLength(1);
            expect(h.after[0].AgentRunId).toBe('run-host');
        });

        it('is not called when BeforeAgentTurn cancels the turn', async () => {
            const { handler, calls } = handlerReturning({ Success: true });
            h.set({ AgentTurnHandler: handler });
            h.component.BeforeAgentTurn.subscribe(e => { e.Cancel = true; });

            await h.route(userMessage());

            expect(calls).not.toHaveBeenCalled();
        });

        it('shows why a failed turn failed, writes nothing and fires no AfterAgentTurn', async () => {
            const { handler } = handlerReturning({ Success: false, ErrorMessage: 'quota reached' });
            h.set({ AgentTurnHandler: handler });

            await h.route(userMessage());

            expect(notify).toHaveBeenCalledOnce();
            expect(notify.mock.calls[0][0]).toBe('quota reached');
            expect(h.created).toHaveLength(0);
            expect(h.after).toHaveLength(0);
        });

        it('reports a handler that throws as a failed turn', async () => {
            const throwing = vi.fn(async () => { throw new Error('host unreachable'); });
            h.set({ AgentTurnHandler: throwing as unknown as AgentTurnHandler });

            await h.route(userMessage());

            expect(notify.mock.calls[0][0]).toBe('host unreachable');
            expect(h.after).toHaveLength(0);
        });

        it('fires no AfterAgentTurn when the handler reports no result', async () => {
            const { handler } = handlerReturning({ Success: true, ReplyDetailIds: [] });
            h.set({ AgentTurnHandler: handler });

            await h.route(userMessage());

            expect(h.after).toHaveLength(0);
            expect(notify).not.toHaveBeenCalled();
        });

        it('passes the header picker preset on routes other than a mention', async () => {
            const { handler, calls } = handlerReturning({ Success: true });
            h.set({ AgentTurnHandler: handler, AgentConfigurationPresetId: 'preset-draft', DefaultAgentId: HOST.ID });

            await h.route(userMessage());

            expect(calls.mock.calls[0][0]).toMatchObject({ Route: 'HostDefault', ConfigurationPresetId: 'preset-draft' });
        });
    });

    describe('AgentHistoryFrom', () => {
        const FLOOR = new Date('2026-09-01T12:00:00.000Z');

        it('reaches the conversation manager run', async () => {
            h.set({ AgentHistoryFrom: FLOOR });

            await h.route(userMessage());

            expect(h.processMessage.mock.calls[0][9]).toBe(FLOOR);
        });

        it('reaches a direct agent run and the payload it continues from', async () => {
            h.set({ AgentHistoryFrom: FLOOR });

            await h.route(userMessage(), mentionsOf(RESEARCH));

            expect(h.invokeSubAgent.mock.calls[0][14]).toBe(FLOOR);
            expect(h.findLatestOutput.mock.calls[0][2]).toBe(FLOOR);
        });

        it('makes continuity consider only replies written at or after it', async () => {
            h.set({
                AgentHistoryFrom: FLOOR,
                ConversationHistory: [aiReply(WRITER.ID, new Date('2026-09-01T11:00:00.000Z'))],
            });

            await h.route(userMessage());

            expect(h.before[0].Route).toBe('ConversationManager');
        });

        it('leaves continuity alone for a reply written after it', async () => {
            h.set({
                AgentHistoryFrom: FLOOR,
                ConversationHistory: [aiReply(WRITER.ID, new Date('2026-09-01T12:30:00.000Z'))],
            });

            await h.route(userMessage());

            expect(h.before[0]).toMatchObject({ Route: 'Continuity', AgentId: WRITER.ID });
        });

        it('is not sent at all when unset', async () => {
            await h.route(userMessage(), mentionsOf(RESEARCH));

            expect(h.invokeSubAgent.mock.calls[0][14]).toBeNull();
        });
    });

    describe('AutoNameConversation', () => {
        it('names a new conversation from its first message by default', async () => {
            await h.route(userMessage(), NO_MENTIONS, true);
            expect(h.nameConversation).toHaveBeenCalledOnce();
        });

        it('leaves naming to the host when turned off', async () => {
            h.set({ AutoNameConversation: false });
            await h.route(userMessage(), NO_MENTIONS, true);
            expect(h.nameConversation).not.toHaveBeenCalled();
        });

        it('never names from a later message', async () => {
            await h.route(userMessage(), NO_MENTIONS, false);
            expect(h.nameConversation).not.toHaveBeenCalled();
        });
    });

    it('with default rules and no conversation manager, says no agent is available instead of sitting silent', async () => {
        h.set({ ConverationManagerAgent: null });

        await h.route(userMessage());

        expect(h.before).toHaveLength(0);
        expect(h.created).toHaveLength(0);
        expect(notify).toHaveBeenCalledOnce();
    });
});
