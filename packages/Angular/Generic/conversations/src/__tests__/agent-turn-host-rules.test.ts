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
    public Loads = 0;
    /** A row from the database (or one the server named); false for a new, unsaved placeholder. */
    public IsSaved = true;

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
        this.Loads++;
        return true;
    }

    public GetAll(): Record<string, unknown> {
        return { ID: this.ID, Role: this.Role, Message: this.Message, Status: this.Status, __mj_CreatedAt: this.__mj_CreatedAt };
    }

    public async LoadFromData(data: { ID: string; __mj_CreatedAt: Date }): Promise<boolean> {
        this.ID = data.ID;
        this.__mj_CreatedAt = data.__mj_CreatedAt;
        this.IsSaved = true;
        return true;
    }
}

/** When the server created each acknowledged reply row. */
const ACK_CREATED_AT = new Date('2026-10-12T10:00:00.000Z');

/** An agent-service mock that acknowledges the run (naming the reply row the server created) before it returns. */
function acknowledging(ackArgIndex: number, result: () => unknown): Fn {
    let replies = 0;
    return vi.fn(async (...args: unknown[]) => {
        const onAccepted = args[ackArgIndex] as ((reply: { ConversationDetailId: string; CreatedAt: Date }) => void) | undefined;
        onAccepted?.({ ConversationDetailId: `server-reply-${++replies}`, CreatedAt: ACK_CREATED_AT });
        return result();
    });
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
    findPreset: Fn;
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

    const processMessage = acknowledging(3, () => chatResult('run-manager'));
    const invokeSubAgent = acknowledging(5, () => chatResult('run-agent'));
    const findPreset = vi.fn(async () => undefined);
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
                row.IsSaved = false; // a new, unsaved entity, as GetEntityObject gives one
                created.push(row);
                return row;
            }),
            getConversationDetail: vi.fn(async (id: string) => hostRows.get(id) ?? null),
        },
        agentService: {
            ProcessMessage: processMessage,
            invokeSubAgent,
            FindConfigurationPresetForAgent: findPreset,
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
        component, created, before, after, sent, processMessage, invokeSubAgent, findPreset, findLatestOutput,
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
    });

    describe('Continuity, Return to Sage, and follow-up preset resolution', () => {
        it('after a handoff, routes the next unmentioned message to the target; after @Sage it goes to Sage and stays there until a newer handoff', async () => {
            const t1 = new Date('2026-09-01T10:00:00.000Z');
            const t2 = new Date('2026-09-01T10:01:00.000Z');
            const t3 = new Date('2026-09-01T10:02:00.000Z');
            const t4 = new Date('2026-09-01T10:03:00.000Z');
            const t5 = new Date('2026-09-01T10:04:00.000Z');

            const sageHandoff = aiReply(MANAGER.ID, t1);
            const researchReply = aiReply(RESEARCH.ID, t2);
            researchReply.ParentID = sageHandoff.ID;

            // 1. After a handoff, an unmentioned message continues with the handoff target (Research)
            h.set({ ConversationHistory: [sageHandoff, researchReply] });
            await h.route(userMessage('follow up for research'));
            expect(h.before.at(-1)).toMatchObject({ Route: 'Continuity', AgentId: RESEARCH.ID });
            expect(h.invokeSubAgent.mock.calls.at(-1)?.[0]).toBe('Research');

            // 2. User returns to Sage via @Sage mention (or ReturnToSage()) and Sage replies
            const returnUserMsg = new FakeDetail('user-return-sage', 'User', t3);
            returnUserMsg.ParentID = researchReply.ID;
            returnUserMsg.Message = `@{"type":"agent","id":"${MANAGER.ID}","name":"Sage"} take it back`;
            const sageReplyAfterReturn = aiReply(MANAGER.ID, t4);
            sageReplyAfterReturn.ID = 'reply-sage-after';
            sageReplyAfterReturn.ParentID = returnUserMsg.ID;

            h.set({ ConversationHistory: [sageHandoff, researchReply, returnUserMsg, sageReplyAfterReturn] });
            await h.route(userMessage('next unmentioned turn stays with Sage'));
            expect(h.before.at(-1)).toMatchObject({ Route: 'ConversationManager', AgentId: MANAGER.ID });

            // 3. A newer handoff after @Sage takes continuity again
            const writerHandoffTarget = aiReply(WRITER.ID, t5);
            writerHandoffTarget.ParentID = sageReplyAfterReturn.ID;
            h.set({ ConversationHistory: [sageHandoff, researchReply, returnUserMsg, sageReplyAfterReturn, writerHandoffTarget] });
            await h.route(userMessage('follow up for writer'));
            expect(h.before.at(-1)).toMatchObject({ Route: 'Continuity', AgentId: WRITER.ID });
        });

        it('ReturnToSage() inserts the conversation manager mention chip into InputBox', () => {
            const insertMention = vi.fn(() => true);
            h.set({ InputBox: { InsertMention: insertMention }, MessageText: '' });

            h.component.ReturnToSage();

            expect(insertMention).toHaveBeenCalledOnce();
            expect(insertMention).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: MANAGER.ID,
                    name: 'Sage',
                    type: 'agent',
                }),
                true,
            );
            expect(h.component.MessageText).toBe('');
        });

        it('uses the continued agent preset from ResolveConversationAgentPreset and ignores a header preset owned by Sage', async () => {
            const sagePreset = { ID: 'preset-sage', AgentID: MANAGER.ID, AIConfigurationID: 'cfg-sage', Status: 'Active', IsDefault: true };
            const researchPreset = { ID: 'preset-research', AgentID: RESEARCH.ID, AIConfigurationID: 'cfg-research', Status: 'Active', IsDefault: true };
            vi.spyOn(AIEngineBase.Instance, 'AgentConfigurations', 'get').mockReturnValue([sagePreset, researchPreset] as never);
            const defaultSpy = vi.spyOn(AIEngineBase.Instance, 'GetDefaultAgentConfigurationPreset').mockImplementation(
                (agentId: string) => (agentId === RESEARCH.ID ? researchPreset : sagePreset) as never
            );
            vi.spyOn(AIEngineBase.Instance, 'GetAgentConfigurationPresets').mockImplementation(
                (agentId: string) => (agentId === RESEARCH.ID ? [researchPreset] : [sagePreset]) as never
            );

            // Header mode picker holds Sage's preset, while continuity routes to Research
            h.set({
                AgentConfigurationPresetId: 'preset-sage',
                ConversationHistory: [aiReply(RESEARCH.ID)],
            });

            await h.route(userMessage('continue with research'));

            expect(defaultSpy).toHaveBeenCalledWith(RESEARCH.ID);
            // arg index 10 of invokeSubAgent is agentConfigurationPresetId — must be Research's preset ID, NOT Sage's
            expect(h.invokeSubAgent.mock.calls[0][10]).toBe('preset-research');
        });

        it('uses the header picker preset on continuation when it belongs to the continued agent', async () => {
            const researchFast = { ID: 'preset-research-fast', AgentID: RESEARCH.ID, AIConfigurationID: 'cfg-fast', Status: 'Active', IsDefault: false };
            const researchDefault = { ID: 'preset-research-default', AgentID: RESEARCH.ID, AIConfigurationID: 'cfg-default', Status: 'Active', IsDefault: true };
            vi.spyOn(AIEngineBase.Instance, 'AgentConfigurations', 'get').mockReturnValue([researchFast, researchDefault] as never);
            vi.spyOn(AIEngineBase.Instance, 'GetDefaultAgentConfigurationPreset').mockReturnValue(researchDefault as never);
            vi.spyOn(AIEngineBase.Instance, 'GetAgentConfigurationPresets').mockReturnValue([researchFast, researchDefault] as never);

            h.set({
                AgentConfigurationPresetId: 'preset-research-fast',
                ConversationHistory: [aiReply(RESEARCH.ID)],
            });

            await h.route(userMessage('continue with research'));

            expect(h.invokeSubAgent.mock.calls[0][10]).toBe('preset-research-fast');
        });

        it('resolves the continuation preset via ResolveConversationAgentPreset without also calling FindConfigurationPresetForAgent', async () => {
            const researchPreset = { ID: 'preset-research', AgentID: RESEARCH.ID, AIConfigurationID: 'cfg-research', Status: 'Active', IsDefault: true };
            vi.spyOn(AIEngineBase.Instance, 'AgentConfigurations', 'get').mockReturnValue([researchPreset] as never);
            vi.spyOn(AIEngineBase.Instance, 'GetDefaultAgentConfigurationPreset').mockReturnValue(researchPreset as never);
            vi.spyOn(AIEngineBase.Instance, 'GetAgentConfigurationPresets').mockReturnValue([researchPreset] as never);

            h.set({
                ConversationHistory: [aiReply(RESEARCH.ID)],
            });

            await h.route(userMessage('continue with research'));

            expect(h.findPreset).not.toHaveBeenCalled();
            expect(h.invokeSubAgent.mock.calls[0][10]).toBe('preset-research');
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
                TargetArtifactVersionId: null,
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

describe('MessageInputComponent — only the server writes agent replies (A19)', () => {
    let h: Harness;

    beforeEach(() => {
        vi.spyOn(AIEngineBase.Instance, 'Agents', 'get').mockReturnValue(AGENTS as never);
        vi.spyOn(PlanModePreference, 'IsEnabled').mockReturnValue(false);
        vi.spyOn(PlanModePreference, 'ClaimPendingNew').mockImplementation(() => undefined);
        vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: vi.fn() } as unknown as MJNotificationService);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        h = buildHarness();
    });

    afterEach(() => vi.restoreAllMocks());

    it.each(ROUTES)('never saves a reply row on route $route', async ({ setup }) => {
        await h.route(userMessage(), setup(h));

        expect(h.created.length).toBeGreaterThan(0);
        for (const reply of h.created) {
            expect(reply.Saves).toBe(0);
        }
    });

    it("shows an unsaved 'Starting…' placeholder before the run is acknowledged", async () => {
        let atCall: { sent: boolean; saved: boolean; status: string } | null = null;
        h.invokeSubAgent.mockImplementationOnce(async (...args: unknown[]) => {
            const placeholder = h.created[0];
            atCall = { sent: h.sent.includes(placeholder), saved: placeholder.IsSaved, status: placeholder.Status };
            (args[5] as (r: { ConversationDetailId: string; CreatedAt: Date }) => void)({ ConversationDetailId: 'server-reply-9', CreatedAt: ACK_CREATED_AT });
            return chatResult('run-agent');
        });

        await h.route(userMessage(), mentionsOf(RESEARCH));

        expect(atCall).toEqual({ sent: true, saved: false, status: 'In-Progress' });
        expect(h.created[0].Message).toBe('⏳ Starting...');
    });

    it("becomes the server's row on the ack: its ID, and its creation time for the timer", async () => {
        await h.route(userMessage(), mentionsOf(RESEARCH));

        const reply = h.created[0];
        expect(reply.ID).toBe('server-reply-1');
        expect(reply.__mj_CreatedAt).toBe(ACK_CREATED_AT);
        expect(reply.IsSaved).toBe(true);
    });

    it('keys the active task by the reply row the ack names, and adds it only then', async () => {
        await h.route(userMessage(), mentionsOf(RESEARCH));

        expect(h.addTask).toHaveBeenCalledOnce();
        expect(h.addTask.mock.calls[0][0]).toMatchObject({ conversationDetailId: 'server-reply-1', relatedMessageId: 'user-msg-1' });
    });

    it('shows the reply as the server wrote it once the run returns, by reloading it', async () => {
        await h.route(userMessage(), mentionsOf(RESEARCH));

        expect(h.created[0].Loads).toBeGreaterThan(0);
        expect(h.created[0].Saves).toBe(0);
    });

    it('marks a run the server never acknowledged as failed on screen only, never saving it', async () => {
        h.invokeSubAgent.mockImplementationOnce(async () => ({ success: false, errorMessage: 'MJAPI unreachable' }));

        await h.route(userMessage(), mentionsOf(RESEARCH));

        const reply = h.created[0];
        expect(reply.Saves).toBe(0);
        expect(reply.IsSaved).toBe(false);
        expect(reply.Status).toBe('Error');
        expect(reply.Message).toContain('MJAPI unreachable');
        expect(h.addTask).not.toHaveBeenCalled();
    });

    it("hides the manager's silent reply (bookkeeping a person may write), and its words stay the server's", async () => {
        h.processMessage.mockImplementationOnce(acknowledging(3, () => ({
            success: true,
            agentRun: { ID: 'run-manager', FinalStep: 'Success', Message: '' },
            payload: {},
        })));

        await h.route(userMessage());

        const managerReply = h.created[0];
        expect(managerReply.HiddenToUser).toBe(true);
        expect(managerReply.Saves).toBe(1);
        expect(managerReply.Message).toBe('⏳ Starting...'); // never rewritten by the chat
    });

    it("shows the manager's 'Continuing with X' line when it hands the turn back, written by the server", async () => {
        h.set({ ConversationHistory: [aiReply(WRITER.ID)] });
        h.component.BeforeAgentTurn.subscribe(e => { e.RedirectAgentId = MANAGER.ID; });
        h.processMessage.mockImplementationOnce(acknowledging(3, () => ({
            success: true,
            agentRun: { ID: 'run-manager', FinalStep: 'Success', Message: '' },
            payload: {},
        })));
        let lineAtCall: { message: string; status: string; agent: string | null; saved: boolean } | null = null;
        h.invokeSubAgent.mockImplementationOnce(async (...args: unknown[]) => {
            const line = h.created[1];
            lineAtCall = { message: line.Message, status: line.Status, agent: line.AgentID, saved: line.IsSaved };
            (args[5] as (r: { ConversationDetailId: string; CreatedAt: Date; AnnouncementDetailId?: string }) => void)({
                ConversationDetailId: 'server-reply-7', CreatedAt: ACK_CREATED_AT, AnnouncementDetailId: 'server-line-7',
            });
            return chatResult('run-writer');
        });

        await h.route(userMessage());

        const [, line, reply] = h.created;
        expect(lineAtCall).toEqual({ message: 'Continuing with **Writer** for refinement...', status: 'Complete', agent: MANAGER.ID, saved: false });
        expect(h.invokeSubAgent.mock.calls[0][15]).toEqual({ AnnouncedByAgentId: MANAGER.ID });
        expect(line.ID).toBe('server-line-7');
        expect(line.Saves).toBe(0);
        expect(reply.ID).toBe('server-reply-7');
        expect(reply.ParentID).toBe('row-2'); // the line's placeholder: the server threads the reply under the line it writes
        expect(reply.Saves).toBe(0);
    });
});
