/**
 * Every row the composer writes carries a branch (null is Main): the user row the branch of the send,
 * and every row of the agent turn the branch of that turn.
 *
 * Instantiated via the prototype with only the members each path touches stubbed — same style as
 * `message-input-resend.test.ts`.
 */
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from '@angular/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';
import { MessageInputComponent } from '../lib/components/message/message-input.component';
import { PlanModePreference } from '../lib/utils/plan-mode-preference';
import type { MentionParseResult } from '../lib/models/conversation-state.model';
import type { RealtimeSessionService } from '../lib/services/realtime-session.service';
import type { ConversationAgentService } from '../lib/services/conversation-agent.service';

type Row = { ID: string; ConversationID: string; BranchID: string | null | undefined; Message: string; Role: string; UserID: string; HiddenToUser?: boolean; ParentID: string | null; Save: ReturnType<typeof vi.fn> };

function newRow(id: string): Row {
    return { ID: id, ConversationID: '', BranchID: undefined, Message: '', Role: '', UserID: '', ParentID: null, Save: vi.fn(async () => true) };
}

interface Harness {
    component: MessageInputComponent;
    open: Record<string, unknown>;
    created: Row[];
    routeMessage: ReturnType<typeof vi.fn>;
}

function buildHarness(opts: { target?: string | null; resolve?: (() => Promise<string | null | undefined>) | null } = {}): Harness {
    const created: Row[] = [];
    const routeMessage = vi.fn(async () => undefined);
    const component = Object.create(MessageInputComponent.prototype) as MessageInputComponent;
    const open = component as unknown as Record<string, unknown>;
    const messageSentStub = { emit: vi.fn() };
    Object.assign(open, {
        ReadOnly: false,
        IsSending: false,
        EmptyStateMode: false,
        ConversationId: 'conv-1',
        CurrentUser: { ID: 'user-1' },
        TargetBranchID: opts.target === undefined ? 'T1' : opts.target,
        ResolveTargetBranch: opts.resolve ?? null,
        pendingAttachments: [],
        MessageText: 'typed text',
        _conversationHistory: [],
        dataCache: { createConversationDetail: vi.fn(async () => { const r = newRow(`row-${created.length + 1}`); created.push(r); return r; }) },
        attachmentService: { saveAttachments: vi.fn(async () => undefined) },
        UploadStateChanged: { emit: vi.fn() },
        InputBox: { mentionEditor: { clear: vi.fn() } },
        MessageSent: messageSentStub,
        messageSent: messageSentStub,
        parseMentionsFromMessage: vi.fn(() => ({ mentions: [], agentMention: null, userMentions: [] })),
        handleSuccessfulSend: vi.fn(async () => undefined),
        routeMessage,
    });
    return { component, open, created, routeMessage };
}

describe('MessageInputComponent — the branch of the user row', () => {
    it('SendMessageWithText writes the TargetBranchID input', async () => {
        const h = buildHarness();
        expect(await h.component.SendMessageWithText('hi')).toBe(true);
        expect(h.created[0].BranchID).toBe('T1');
    });

    it('SendMessageWithText writes Main when the target is Main', async () => {
        const h = buildHarness({ target: null });
        await h.component.SendMessageWithText('hi');
        expect(h.created[0].BranchID).toBeNull();
    });

    it('the TargetBranchID option wins over the input and the resolver', async () => {
        const resolve = vi.fn(async () => 'T5');
        const h = buildHarness({ resolve });
        await h.component.SendMessageWithText('edited', undefined, { IsResend: true, TargetBranchID: 'T9' });
        expect(h.created[0].BranchID).toBe('T9');
        expect(resolve).not.toHaveBeenCalled();
    });

    it('asks ResolveTargetBranch once and writes its answer', async () => {
        const resolve = vi.fn(async () => 'T5');
        const h = buildHarness({ resolve });
        await h.component.SendMessageWithText('hi');
        expect(resolve).toHaveBeenCalledOnce();
        expect(h.created[0].BranchID).toBe('T5');
    });

    it('writes nothing and returns false when the resolver answers undefined or throws', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        for (const resolve of [vi.fn(async () => undefined), vi.fn(async () => { throw new Error('no fork'); })]) {
            const h = buildHarness({ resolve });
            expect(await h.component.SendMessageWithText('hi')).toBe(false);
            expect(h.created).toHaveLength(0);
            expect(h.component.IsSending).toBe(false);
        }
        vi.restoreAllMocks();
    });

    it('OnTextSubmitted puts the text back into the composer when the resolver declines', async () => {
        const h = buildHarness({ resolve: vi.fn(async () => undefined) });
        const focus = vi.fn();
        h.open['InputBox'] = { mentionEditor: { clear: vi.fn() }, getPlainTextWithJsonMentions: () => '', focus };
        h.open['MessageText'] = '';

        await h.component.OnTextSubmitted('hello');

        expect(h.created).toHaveLength(0);
        expect(h.component.MessageText).toBe('hello');
        expect(h.component.IsSending).toBe(false);
    });

    it('OnTextSubmitted keeps what the composer already holds and adds the returned text after it', async () => {
        const h = buildHarness({ resolve: vi.fn(async () => undefined) });
        h.open['InputBox'] = { mentionEditor: { clear: vi.fn() }, getPlainTextWithJsonMentions: () => 'typed later', focus: vi.fn() };

        await h.component.OnTextSubmitted('hello');

        expect(h.component.MessageText).toBe('typed later\nhello');
    });

    it('OnTextSubmitted and OnSend write the resolved branch too', async () => {
        const h = buildHarness({ resolve: vi.fn(async () => 'T7') });
        await h.component.OnTextSubmitted('hello');
        expect(h.created[0].BranchID).toBe('T7');

        const h2 = buildHarness({ target: 'T2' });
        Object.defineProperty(h2.component, 'CanSend', { get: () => true });
        await h2.component.OnSend();
        expect(h2.created[0].BranchID).toBe('T2');
    });
});

describe('MessageInputComponent — the branch of the turn', () => {
    /** Runs the real routeMessage with routing stubbed; returns the stubs that receive the turn's branch. */
    function routeReal(h: Harness): {
        route: (m: MJConversationDetailEntity, turnBranchId?: string | null) => Promise<void>;
        decideAgentRouting: ReturnType<typeof vi.fn>;
        runAgentTurn: ReturnType<typeof vi.fn>;
    } {
        const decideAgentRouting = vi.fn(async () => null);
        const runAgentTurn = vi.fn(async () => undefined);
        Object.assign(h.open, {
            AutoNameConversation: false,
            collectRequestedSkillIDs: vi.fn(() => []),
            agentMentionIds: vi.fn(() => []),
            agentTurnCandidates: vi.fn(() => ({})),
            decideAgentRouting,
            resolveAgentTurnTarget: vi.fn(() => ({ AgentId: 'a1', Route: 'HostDefault' })),
            announceAgentTurn: vi.fn((_m: unknown, target: unknown) => target),
            runAgentTurn,
        });
        const real = MessageInputComponent.prototype as unknown as {
            routeMessage(m: MJConversationDetailEntity, r: object, first: boolean, t?: string | null): Promise<void>;
        };
        return {
            route: (m, t) => real.routeMessage.call(h.component, m, { mentions: [], agentMention: null, userMentions: [] }, false, t),
            decideAgentRouting,
            runAgentTurn,
        };
    }

    it('a routed message runs its turn on its own branch', async () => {
        const h = buildHarness();
        const r = routeReal(h);
        await r.route({ ID: 'u1', ConversationID: 'conv-1', BranchID: 'T3', Message: 'hi' } as MJConversationDetailEntity);
        expect(r.decideAgentRouting.mock.calls[0][2]).toBe('T3');
        expect(r.runAgentTurn.mock.calls[0][3]).toBe('T3');
    });

    it('a rerun runs its turn on the target branch', async () => {
        const h = buildHarness();
        const r = routeReal(h);
        await r.route({ ID: 'u1', ConversationID: 'conv-1', BranchID: null, Message: 'hi' } as MJConversationDetailEntity, 'T8');
        expect(r.decideAgentRouting.mock.calls[0][2]).toBe('T8');
        expect(r.runAgentTurn.mock.calls[0][3]).toBe('T8');
    });

    it('RerunAgentForMessage routes with the target branch, else the user message branch', async () => {
        const h = buildHarness();
        const user = { ID: 'u1', ConversationID: 'conv-1', BranchID: null, Message: 'hi' } as MJConversationDetailEntity;
        await h.component.RerunAgentForMessage(user, 'T8');
        expect(h.routeMessage.mock.calls[0][3]).toBe('T8');
        await h.component.RerunAgentForMessage(user);
        expect(h.routeMessage.mock.calls[1][3]).toBeNull();
    });

    it('createTurnRow makes an AI row in the conversation on the turn branch', async () => {
        const h = buildHarness();
        const make = (MessageInputComponent.prototype as unknown as { createTurnRow(c: string, b: string | null): Promise<Row> }).createTurnRow;
        const row = await make.call(h.component, 'conv-9', 'T4');
        expect(row).toMatchObject({ ConversationID: 'conv-9', BranchID: 'T4', Role: 'AI', HiddenToUser: false });
    });

    it('tells a host turn handler the branch of the turn', () => {
        const h = buildHarness();
        Object.assign(h.open, { agentNameFor: () => 'Sage', ApplicationId: null, AppContext: null, AgentHistoryFrom: null, AgentConfigurationPresetId: null, _pendingRequestedSkillIDs: [] });
        Object.defineProperty(h.component, 'PlanModeEnabled', { get: () => false });
        const build = (MessageInputComponent.prototype as unknown as {
            buildAgentTurnRequest(u: object, t: object, m: null, v: null, b: string | null): { BranchID: string | null };
        }).buildAgentTurnRequest;
        const request = build.call(h.component, { ID: 'u1', ConversationID: 'conv-1', Message: 'hi' }, { AgentId: 'a1', Route: 'HostDefault' }, null, null, 'T4');
        expect(request.BranchID).toBe('T4');
    });

    it('starts voice on the target branch', async () => {
        const h = buildHarness({ target: 'T6' });
        const start = vi.fn(async (..._args: Parameters<RealtimeSessionService['StartRealtimeSession']>) => undefined);
        Object.assign(h.open, { realtimeSession: { StartRealtimeSession: start }, ApplicationId: null, AppContext: null, toastService: { error: vi.fn() } });
        const go = (MessageInputComponent.prototype as unknown as { startRealtimeWithAgent(a: string, n: string): Promise<void> }).startRealtimeWithAgent;
        await go.call(h.component, 'agent-1', 'Sage');
        expect(start.mock.calls[0][12]).toBe('T6');
    });
});

describe('MessageInputComponent — overlapping turns keep their own branch', () => {
    const MANAGER = { ID: 'AAAAAAAA-0000-0000-0000-000000000001', Name: 'Sage' };
    const RESEARCH = { ID: 'AAAAAAAA-0000-0000-0000-000000000002', Name: 'Research' };
    const NO_MENTIONS: MentionParseResult = { mentions: [], agentMention: null, userMentions: [], entityMentions: [], skillMentions: [] };

    /** A conversation detail stand-in for the full agent-turn path. */
    class TurnRow {
        public ConversationID = '';
        public BranchID: string | null | undefined = undefined;
        public Role = 'AI';
        public UserID = '';
        public Message = '';
        public Status: 'Complete' | 'Error' | 'In-Progress' = 'Complete';
        public AgentID: string | null = null;
        public ParentID: string | null = null;
        public HiddenToUser = false;
        public Error: string | null = null;
        public ResponseForm: string | null = null;
        public ActionableCommands: string | null = null;
        public AutomaticCommands: string | null = null;
        public __mj_CreatedAt = new Date('2026-10-01T10:00:00.000Z');
        public LatestResult = null;
        constructor(public ID: string) {}
        public async Save(): Promise<boolean> { return true; }
        public async Load(): Promise<boolean> { return true; }
    }

    function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
        let resolve: (value: T) => void = () => undefined;
        const promise = new Promise<T>(r => { resolve = r; });
        return { promise, resolve };
    }

    function chatResult(runId: string) {
        return { success: true, agentRun: { ID: runId, AgentID: null, FinalStep: 'Chat', Message: 'done' }, payload: {} };
    }

    /** A composer that runs real sends and real agent turns, with the services stubbed. */
    function buildTurnHarness(history: TurnRow[] = []) {
        const created: TurnRow[] = [];
        const processMessage = vi.fn(async (): Promise<object> => chatResult('run-manager'));
        const invokeSubAgent = vi.fn(async () => chatResult('run-agent'));
        const findPreset = vi.fn(async (..._args: Parameters<ConversationAgentService['FindConfigurationPresetForAgent']>): Promise<string | undefined> => undefined);
        const findLatestOutput = vi.fn(async () => null);
        const component = Object.create(MessageInputComponent.prototype) as MessageInputComponent;
        const open = component as unknown as Record<string, unknown>;
        const sent = new EventEmitter<TurnRow>();
        Object.assign(open, {
            ReadOnly: false, IsSending: false, EmptyStateMode: false, pendingAttachments: [], MessageText: '',
            TargetBranchID: 'T1', ResolveTargetBranch: null,
            ConversationId: 'conv-1', ConversationName: 'Test', CurrentUser: { ID: 'user-1' },
            ApplicationId: null, AppContext: null, DefaultAgentId: null, ConversationDefaultAgentId: null,
            AgentConfigurationPresetId: null, AgentReplyMode: 'Always', AllowedAgentIDs: null, AgentHistoryFrom: null,
            AgentTurnHandler: null, AutoNameConversation: false, ConverationManagerAgent: MANAGER,
            ConversationHistory: history, _pendingRequestedSkillIDs: [],
            completionTimestamps: new Map<string, number>(), registeredCallbacks: new Map(), inFlightWatches: new Map(),
            BeforeAgentTurn: new EventEmitter(), AfterAgentTurn: new EventEmitter(),
            MessageSent: sent, messageSent: sent, ArtifactCreated: new EventEmitter(), MessageComplete: new EventEmitter(),
            parseMentionsFromMessage: vi.fn(() => NO_MENTIONS),
            collectRequestedSkillIDs: vi.fn(() => []),
            // No stray timers once a test ends.
            cleanupCompletionTimestamp: vi.fn(),
            refocusTextarea: vi.fn(),
            dataCache: { createConversationDetail: vi.fn(async () => { const r = new TurnRow(`row-${created.length + 1}`); created.push(r); return r; }) },
            agentService: { ProcessMessage: processMessage, invokeSubAgent, FindConfigurationPresetForAgent: findPreset, FindLatestAgentOutputVersion: findLatestOutput },
            activeTasks: { add: vi.fn(() => 'task-1'), remove: vi.fn(), getByConversationDetailId: vi.fn(() => undefined), updateStatusByConversationDetailId: vi.fn() },
            streamingService: { registerMessageCallback: vi.fn(), unregisterMessageCallback: vi.fn() },
        });
        return { component, open, created, processMessage, invokeSubAgent, findPreset, findLatestOutput };
    }

    beforeEach(() => {
        vi.spyOn(AIEngineBase.Instance, 'Agents', 'get').mockReturnValue([MANAGER, RESEARCH] as never);
        vi.spyOn(PlanModePreference, 'IsEnabled').mockReturnValue(false);
        vi.spyOn(PlanModePreference, 'ClaimPendingNew').mockImplementation(() => undefined);
        vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: vi.fn() } as unknown as MJNotificationService);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("a manager turn's placeholder and delegated row stay on its fork when Main sends meanwhile", async () => {
        const h = buildTurnHarness();
        const managerA = deferred<object>();
        h.processMessage.mockImplementationOnce(() => managerA.promise);

        const turnA = h.component.OnTextSubmitted('first, in fork T1');
        await vi.waitFor(() => expect(h.processMessage).toHaveBeenCalledTimes(1));
        h.open['TargetBranchID'] = null; // the person goes back to Main
        await h.component.OnTextSubmitted('second, in Main');
        managerA.resolve({
            success: true,
            agentRun: { ID: 'run-manager', FinalStep: 'Success', Message: 'Handing off' },
            payload: { invokeAgent: 'Research', reasoning: 'research task' },
        });
        await turnA;

        const [userA, placeholderA, userB, placeholderB, delegateA] = h.created;
        expect(h.created).toHaveLength(5);
        expect([userA.Role, userA.Message, userA.BranchID]).toEqual(['User', 'first, in fork T1', 'T1']);
        expect([placeholderA.ParentID, placeholderA.BranchID]).toEqual([userA.ID, 'T1']);
        expect([userB.Role, userB.Message, userB.BranchID]).toEqual(['User', 'second, in Main', null]);
        expect([placeholderB.ParentID, placeholderB.BranchID]).toEqual([userB.ID, null]);
        expect([delegateA.ParentID, delegateA.AgentID, delegateA.BranchID]).toEqual([placeholderA.ID, RESEARCH.ID, 'T1']);
        // The delegate's history reads stay on turn A's fork too.
        expect(h.findLatestOutput).toHaveBeenCalledWith('conv-1', RESEARCH.ID, null, 'T1');
        expect(h.findPreset).toHaveBeenLastCalledWith('conv-1', RESEARCH.ID, 'T1');
    });

    it("a continuation's reply row stays on its fork when Main sends before the reply row exists", async () => {
        const earlier = new TurnRow('reply-earlier');
        earlier.AgentID = RESEARCH.ID;
        const h = buildTurnHarness([earlier]);
        const presetA = deferred<string | undefined>();
        h.findPreset.mockImplementationOnce(() => presetA.promise);

        const turnA = h.component.OnTextSubmitted('first, in fork T1');
        await vi.waitFor(() => expect(h.findPreset).toHaveBeenCalledTimes(1));
        h.open['TargetBranchID'] = null;
        await h.component.OnTextSubmitted('second, in Main');
        presetA.resolve(undefined);
        await turnA;

        const [userA, userB, replyB, replyA] = h.created;
        expect(h.created).toHaveLength(4);
        expect([userA.BranchID, userB.BranchID]).toEqual(['T1', null]);
        expect([replyB.ParentID, replyB.AgentID, replyB.BranchID]).toEqual([userB.ID, RESEARCH.ID, null]);
        expect([replyA.ParentID, replyA.AgentID, replyA.BranchID]).toEqual([userA.ID, RESEARCH.ID, 'T1']);
        expect(h.findPreset.mock.calls.map(call => call[2])).toEqual(['T1', null]);
    });
});

describe('message-input.component.ts — every created row is either a user row or a turn row', () => {
    const source = readFileSync(fileURLToPath(new URL('../lib/components/message/message-input.component.ts', import.meta.url)), 'utf8');

    it('creates rows in exactly four places: createTurnRow and the three user-row paths', () => {
        expect(source.match(/this\.dataCache\.createConversationDetail\(/g)?.length).toBe(4);
    });

    it('never reads the removed CurrentBranchId input', () => {
        expect(source.includes('CurrentBranchId')).toBe(false);
    });
});
