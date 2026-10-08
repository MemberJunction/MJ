import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { ConversationEngine, type MJConversationBranchEntity, type MJConversationDetailEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import { MAIN_OPEN_VIEW, type ConversationOpenView } from '../lib/utils/conversation-forks';

/** The person's own message on fork T1, after the agent row D-10 (its predecessor on the path). */
const MESSAGE = { ID: 'D-11', ConversationID: 'CONV-1', BranchID: 'T1', Sequence: 11, Role: 'User', UserID: 'USER-1', User: 'Maya Chen', Message: 'Draft the launch email' } as MJConversationDetailEntity;
const PATH = [
    { ID: 'D-1', ConversationID: 'CONV-1', BranchID: null, Sequence: 1, Role: 'User', UserID: 'USER-1', Message: 'Plan a launch' },
    { ID: 'D-10', ConversationID: 'CONV-1', BranchID: 'T1', Sequence: 10, Role: 'AI', AgentID: 'A-1', Agent: 'Sage', UserID: 'USER-1' },
    MESSAGE,
] as MJConversationDetailEntity[];
const DRAFT: ConversationOpenView = { Kind: 'DraftFork', ParentBranchID: 'T1', ForkFromSequence: 10, AnchorDetailID: 'D-10', SourceDetailID: 'D-11' };

/** A composer stub that holds `text` as its unsent draft. */
function composer(text = '') {
    const draft = { Text: text };
    return {
        draft,
        conversationId: 'CONV-1',
        GetSerializedDraft: vi.fn(() => draft.Text),
        SetDraft: vi.fn((value: string) => { draft.Text = value; }),
    };
}

function createHarness(opts: { reloaded?: boolean; sessionFor?: string; view?: ConversationOpenView; canFork?: boolean; composerText?: string; messages?: MJConversationDetailEntity[] } = {}) {
    const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
    const open = component as unknown as Record<string, unknown>;
    const reload = vi.fn(async () => opts.reloaded ?? true);
    const realtime = { IsActiveFor: vi.fn((id: string) => id === opts.sessionFor), EndRealtimeSession: vi.fn(async () => undefined) };
    const input = composer(opts.composerText);
    Object.assign(open, {
        messages: opts.messages ?? PATH,
        windowStore: { GetSnapshot: () => ({ Cursor: { HasMoreAbove: false } }) },
        messageInputComponents: [input],
        _conversationId: 'CONV-1',
        CurrentUser: { ID: 'USER-1' },
        ReadOnly: false,
        Conversation: null,
        openView: opts.view ?? MAIN_OPEN_VIEW,
        viewChangeInFlight: false,
        forkStartInFlight: false,
        isActiveConversation: (id: string | null | undefined) => id === 'CONV-1',
        reloadWindowForView: reload,
        RefreshForkSummaries: vi.fn(async () => undefined),
        RealtimeSession: realtime,
        branches: [],
        cdr: { detectChanges: vi.fn(), markForCheck: vi.fn() },
        // The class field Object.create does not run: the composer's bound branch resolver.
        ResolveComposerBranch: () => (open['resolveComposerBranch'] as () => Promise<string | null | undefined>).call(component),
    });
    Object.defineProperty(component, 'CanFork', { get: () => opts.canFork ?? true, configurable: true });
    return { component, open, reload, realtime, input };
}

describe('ConversationChatAreaComponent fork start actions', () => {
    let notify: ReturnType<typeof vi.fn>;
    let create: MockInstance<ConversationEngine['CreateFork']>;

    beforeEach(() => {
        notify = vi.fn();
        vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: notify } as unknown as MJNotificationService);
        create = vi.spyOn(ConversationEngine.Instance, 'CreateFork').mockResolvedValue({ ID: 'FORK-NEW' } as MJConversationBranchEntity);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Fork from here', () => {
        it('opens a new fork that replaces the message at once: from the row before it, no dialog, nothing created, its path loaded', async () => {
            const h = createHarness();

            await h.component.OnForkRequested(MESSAGE);

            expect(h.component.OpenView).toEqual({ ...DRAFT, SourceAuthorName: 'Maya Chen' });
            expect(create).not.toHaveBeenCalled();
            expect(h.reload).toHaveBeenCalledOnce();
            expect(h.component.OpenViewTitle).toBe('New fork');
            expect(h.open['forkStartInFlight']).toBe(false);
        });

        it('starts before the first message when the message has no row before it', async () => {
            const first = PATH[0];
            const h = createHarness();

            await h.component.OnForkRequested(first);

            expect(h.component.OpenView).toEqual({ Kind: 'DraftFork', ParentBranchID: null, ForkFromSequence: null, AnchorDetailID: null, SourceDetailID: 'D-1', SourceAuthorName: null });
            await h.component.ResolveComposerBranch();
            expect(create.mock.calls[0][0]).toEqual({ ConversationID: 'CONV-1', Kind: 'Fork', ParentBranchID: null, ForkFromSequence: null, SourceDetailID: 'D-1' });
        });

        it('opens no draft, with a notice, when the row before the message is not known', async () => {
            const h = createHarness({ messages: [MESSAGE] });
            h.open['windowStore'] = { GetSnapshot: () => ({ Cursor: { HasMoreAbove: true } }) };
            vi.spyOn(ConversationEngine.Instance, 'LoadDetailWindow').mockResolvedValue({ Failed: true, Details: [] } as unknown as Awaited<ReturnType<ConversationEngine['LoadDetailWindow']>>);

            await h.component.OnForkRequested(MESSAGE);

            expect(h.component.OpenView).toEqual(MAIN_OPEN_VIEW);
            expect(notify).toHaveBeenCalledWith('Could not locate the message before this one', 'error', 3000);
            expect(h.input.SetDraft).not.toHaveBeenCalled();
        });

        it("puts the message's text in an empty composer when the draft opens", async () => {
            const h = createHarness();

            await h.component.OnForkRequested(MESSAGE);

            expect(h.input.SetDraft).toHaveBeenCalledWith('Draft the launch email');
            expect(h.input.draft.Text).toBe('Draft the launch email');
        });

        it('keeps unsent text in the composer', async () => {
            const h = createHarness({ composerText: 'half-written thought' });

            await h.component.OnForkRequested(MESSAGE);

            expect(h.component.OpenView).toEqual({ ...DRAFT, SourceAuthorName: 'Maya Chen' });
            expect(h.input.SetDraft).not.toHaveBeenCalled();
            expect(h.input.draft.Text).toBe('half-written thought');
        });

        it("does nothing for an agent answer or another person's message", async () => {
            const answer = createHarness();
            await answer.component.OnForkRequested(PATH[1]);
            expect(answer.component.OpenView).toEqual(MAIN_OPEN_VIEW);

            const other = createHarness();
            await other.component.OnForkRequested({ ...MESSAGE, UserID: 'USER-2' } as MJConversationDetailEntity);
            expect(other.component.OpenView).toEqual(MAIN_OPEN_VIEW);
            expect(other.input.SetDraft).not.toHaveBeenCalled();
        });

        it('creates the fork on the first send with Kind Fork and the replaced message as its source, and no name', async () => {
            const h = createHarness();
            await h.component.OnForkRequested(MESSAGE);

            const id = await h.component.ResolveComposerBranch();

            expect(id).toBe('FORK-NEW');
            expect(create).toHaveBeenCalledOnce();
            expect(create.mock.calls[0][0]).toEqual({ ConversationID: 'CONV-1', Kind: 'Fork', ParentBranchID: 'T1', ForkFromSequence: 10, SourceDetailID: 'D-11' });
            expect(create.mock.calls[0][0]).not.toHaveProperty('Name');
            expect(h.component.OpenView).toEqual({ Kind: 'Fork', BranchID: 'FORK-NEW' });
        });

        it('does nothing for a person who may not write', async () => {
            const h = createHarness();
            h.open['ReadOnly'] = true;

            await h.component.OnForkRequested(MESSAGE);

            expect(h.component.OpenView).toEqual(MAIN_OPEN_VIEW);
        });

        it('does nothing for a person who may not fork', async () => {
            const h = createHarness({ canFork: false });

            await h.component.OnForkRequested(MESSAGE);

            expect(h.component.OpenView).toEqual(MAIN_OPEN_VIEW);
            expect(create).not.toHaveBeenCalled();
        });

        it('is ignored while another start action runs', async () => {
            const h = createHarness();
            h.open['forkStartInFlight'] = true;

            await h.component.OnForkRequested(MESSAGE);

            expect(h.component.OpenView).toEqual(MAIN_OPEN_VIEW);
        });

        it('ends a voice session of the conversation when the draft opens', async () => {
            const h = createHarness({ sessionFor: 'CONV-1' });
            await h.component.OnForkRequested(MESSAGE);
            expect(h.realtime.EndRealtimeSession).toHaveBeenCalledOnce();
        });

        it('does not open a draft for a message of another conversation', async () => {
            const h = createHarness();
            expect(await h.component.OpenDraftFork({ ...MESSAGE, ConversationID: 'CONV-2' } as MJConversationDetailEntity)).toBe(false);
        });

        it('creates the fork when the first send resolves its branch, opens it and returns its id', async () => {
            const h = createHarness({ view: DRAFT });
            const resolve = h.open['resolveComposerBranch'] as () => Promise<string | null | undefined>;

            expect(await resolve.call(h.component)).toBe('FORK-NEW');

            expect(create).toHaveBeenCalledWith(
                { ConversationID: 'CONV-1', Kind: 'Fork', ParentBranchID: 'T1', ForkFromSequence: 10, SourceDetailID: 'D-11' },
                { ID: 'USER-1' }
            );
            expect(h.component.OpenView).toEqual({ Kind: 'Fork', BranchID: 'FORK-NEW' });
            expect(h.reload).toHaveBeenCalledOnce();
        });

        it('creates one fork for two sends that resolve at the same time, and blocks other start actions meanwhile', async () => {
            const h = createHarness({ view: DRAFT });
            const resolve = h.open['resolveComposerBranch'] as () => Promise<string | null | undefined>;

            const first = resolve.call(h.component);
            const second = resolve.call(h.component);
            expect(h.open['forkStartInFlight']).toBe(true);
            await h.component.OnForkRequested(MESSAGE);
            expect(h.component.OpenView).toEqual(DRAFT);

            expect(await Promise.all([first, second])).toEqual(['FORK-NEW', 'FORK-NEW']);
            expect(create).toHaveBeenCalledOnce();
            expect(h.reload).toHaveBeenCalledOnce();
            expect(h.open['forkStartInFlight']).toBe(false);
        });

        it('tries again on the next send after a failed creation', async () => {
            create.mockRejectedValueOnce(new Error('denied'));
            const h = createHarness({ view: DRAFT });
            const resolve = h.open['resolveComposerBranch'] as () => Promise<string | null | undefined>;

            expect(await resolve.call(h.component)).toBeUndefined();
            expect(await resolve.call(h.component)).toBe('FORK-NEW');
            expect(create).toHaveBeenCalledTimes(2);
        });

        it('creates nothing when the person goes back to Main from a draft', async () => {
            const h = createHarness({ view: DRAFT });

            expect(await h.component.BackToMain()).toBe(true);

            expect(h.component.OpenView).toEqual(MAIN_OPEN_VIEW);
            expect(create).not.toHaveBeenCalled();
        });

        it('stops the send when the fork cannot be created or opened', async () => {
            const draft: ConversationOpenView = { Kind: 'DraftFork', ParentBranchID: null, ForkFromSequence: 3, AnchorDetailID: 'D-3', SourceDetailID: 'D-4' };
            create.mockRejectedValueOnce(new Error('denied'));
            const h = createHarness({ view: draft });
            const resolve = h.open['resolveComposerBranch'] as () => Promise<string | null | undefined>;
            expect(await resolve.call(h.component)).toBeUndefined();
            expect(notify).toHaveBeenCalledWith('Could not create the fork; the message was not sent', 'error', 3000);

            const h2 = createHarness({ view: draft, reloaded: false });
            const resolve2 = h2.open['resolveComposerBranch'] as () => Promise<string | null | undefined>;
            expect(await resolve2.call(h2.component)).toBeUndefined();
            expect(notify).toHaveBeenCalledWith('The fork was created but could not be opened; the message was not sent', 'error', 3000);
        });
    });
});
