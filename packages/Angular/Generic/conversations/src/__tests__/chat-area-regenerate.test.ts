// Angular components in this package are partial-compiled — load the JIT compiler first.
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { ConversationEngine, type MJConversationBranchEntity, type MJConversationDetailEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import { MAIN_OPEN_VIEW, type ConversationOpenView } from '../lib/utils/conversation-forks';

/**
 * `OnRegenerateRequested`: regenerating an answer creates a Regenerate fork at the user
 * message the answer replied to, opens it, then runs the agent for that user message again inside it.
 * The first answer is never changed.
 */

interface ComposerStub { ReadOnly: boolean; IsSending: boolean; RerunAgentForMessage: ReturnType<typeof vi.fn> }

function row(id: string, sequence: number, role: 'User' | 'AI', branchId: string | null = null): MJConversationDetailEntity {
    return { ID: id, ConversationID: 'CONV-1', Sequence: sequence, Role: role, BranchID: branchId } as MJConversationDetailEntity;
}

const USER_ROW = row('USER-1-MSG', 1, 'User');
const AI_ROW = row('AI-2', 2, 'AI');

function createHarness(opts: { messages?: MJConversationDetailEntity[]; isSending?: boolean; reloaded?: boolean; rerun?: boolean; canFork?: boolean } = {}) {
    const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
    const open = component as unknown as Record<string, unknown>;
    const composer: ComposerStub = { ReadOnly: false, IsSending: opts.isSending ?? false, RerunAgentForMessage: vi.fn(async () => opts.rerun ?? true) };
    const reload = vi.fn(async () => opts.reloaded ?? true);
    const refresh = vi.fn(async () => undefined);
    Object.assign(open, {
        _conversationId: 'CONV-1',
        CurrentUser: { ID: 'USER-1' },
        openView: MAIN_OPEN_VIEW as ConversationOpenView,
        viewChangeInFlight: false,
        forkStartInFlight: false,
        // Out of order on purpose: the handler sorts the window by Sequence.
        messages: opts.messages ?? [AI_ROW, USER_ROW],
        isActiveConversation: (id: string | null | undefined) => id === 'CONV-1',
        getActiveMessageInputComponent: () => composer,
        reloadWindowForView: reload,
        RefreshForkSummaries: refresh,
        RealtimeSession: { IsActiveFor: vi.fn(() => false), EndRealtimeSession: vi.fn(async () => undefined) },
        branches: [],
        cdr: { detectChanges: vi.fn(), markForCheck: vi.fn() },
    });
    Object.defineProperty(component, 'CanFork', { get: () => opts.canFork ?? true, configurable: true });
    return { component, open, composer, reload, refresh };
}

describe('ConversationChatAreaComponent.OnRegenerateRequested', () => {
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

    it('creates a Regenerate fork at the user message, opens it and reruns the agent inside it', async () => {
        const h = createHarness();

        await h.component.OnRegenerateRequested(AI_ROW);

        expect(create).toHaveBeenCalledWith(
            { ConversationID: 'CONV-1', Kind: 'Regenerate', ParentBranchID: null, ForkFromSequence: 1, SourceDetailID: 'AI-2' },
            { ID: 'USER-1' }
        );
        expect(h.component.OpenView).toEqual({ Kind: 'Fork', BranchID: 'FORK-NEW' });
        expect(h.reload).toHaveBeenCalledOnce();
        expect(h.refresh).toHaveBeenCalled();
        expect(h.composer.RerunAgentForMessage).toHaveBeenCalledWith(USER_ROW, 'FORK-NEW');
        expect(notify).not.toHaveBeenCalled();
    });

    it("starts the fork on the branch of the user message when that message is in a fork", async () => {
        const userInFork = row('USER-T1', 5, 'User', 'T1');
        const aiInFork = row('AI-T1', 6, 'AI', 'T1');
        const h = createHarness({ messages: [aiInFork, userInFork] });

        await h.component.OnRegenerateRequested(aiInFork);

        expect(create).toHaveBeenCalledWith(
            { ConversationID: 'CONV-1', Kind: 'Regenerate', ParentBranchID: 'T1', ForkFromSequence: 5, SourceDetailID: 'AI-T1' },
            { ID: 'USER-1' }
        );
        expect(h.composer.RerunAgentForMessage).toHaveBeenCalledWith(userInFork, 'FORK-NEW');
    });

    it('makes no fork when the window holds no earlier user message', async () => {
        const h = createHarness({ messages: [AI_ROW] });

        await h.component.OnRegenerateRequested(AI_ROW);

        expect(create).not.toHaveBeenCalled();
        expect(h.composer.RerunAgentForMessage).not.toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith('Could not find the message this reply answers', 'error', 3000);
    });

    it('makes no fork while the composer is still sending', async () => {
        const h = createHarness({ isSending: true });

        await h.component.OnRegenerateRequested(AI_ROW);

        expect(create).not.toHaveBeenCalled();
        expect(h.composer.RerunAgentForMessage).not.toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith('Wait for the current reply to finish', 'error', 3000);
    });

    it('reports a rerun the composer refused', async () => {
        const h = createHarness({ rerun: false });

        await h.component.OnRegenerateRequested(AI_ROW);

        expect(h.composer.RerunAgentForMessage).toHaveBeenCalledWith(USER_ROW, 'FORK-NEW');
        expect(notify).toHaveBeenCalledWith('The fork was created but the reply was not regenerated', 'error', 3000);
    });

    it('reports a rerun that threw', async () => {
        const h = createHarness();
        h.composer.RerunAgentForMessage.mockRejectedValueOnce(new Error('turn failed'));

        await h.component.OnRegenerateRequested(AI_ROW);

        expect(notify).toHaveBeenCalledWith('The fork was created but the reply was not regenerated', 'error', 3000);
    });

    it('reports a fork that could not be created and does not rerun', async () => {
        const h = createHarness();
        create.mockRejectedValueOnce(new Error('save failed'));

        await h.component.OnRegenerateRequested(AI_ROW);

        expect(h.composer.RerunAgentForMessage).not.toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith('Could not create a fork for the regenerated reply', 'error', 3000);
    });

    it('reruns the latest answer in place, with no fork, for a person who may not fork', async () => {
        const h = createHarness({ canFork: false });
        const inPlace = vi.fn(async () => undefined);
        h.open['rerunTurnInPlace'] = inPlace;

        await h.component.OnRegenerateRequested(AI_ROW);

        expect(create).not.toHaveBeenCalled();
        expect(h.composer.RerunAgentForMessage).not.toHaveBeenCalled();
        expect(inPlace).toHaveBeenCalledWith(USER_ROW);
    });

    it('runs the same flow from the deprecated OnRetryMessage', async () => {
        const h = createHarness();

        h.component.OnRetryMessage(AI_ROW);
        await vi.waitFor(() => expect(h.composer.RerunAgentForMessage).toHaveBeenCalledWith(USER_ROW, 'FORK-NEW'));

        expect(create).toHaveBeenCalledTimes(1);
    });
});

describe('ConversationChatAreaComponent.reloadWindowForView', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    function createReloadHarness(loadFailed: boolean): ConversationChatAreaComponent {
        const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
        const open = component as unknown as Record<string, unknown>;
        open['_conversationId'] = 'CONV-1';
        open['CurrentUser'] = { ID: 'USER-1' };
        open['openView'] = MAIN_OPEN_VIEW;
        open['viewReloadToken'] = 0;
        open['conversationLoadToken'] = 1;
        open['pinsDuringViewReload'] = null;
        open['pinsHydrated'] = false;
        open['windowStore'] = {
            PinnedTotalCount: 0,
            PinnedDetails: [],
            LoadFailed: loadFailed,
            LoadLatest: vi.fn(async () => undefined),
            SetPinnedCount: vi.fn(),
            GetSnapshot: vi.fn(() => ({})),
        };
        open['isActiveConversationLoad'] = () => true;
        open['loadBranchesOrNull'] = vi.fn(async () => []);
        open['applyWindowSnapshot'] = vi.fn();
        open['loadPeripheralData'] = vi.fn(async () => undefined);
        open['reloadPinsForScope'] = vi.fn(async () => undefined);
        open['agentStateService'] = { startPolling: vi.fn() };
        open['cdr'] = { detectChanges: vi.fn() };
        return component;
    }

    function reload(component: ConversationChatAreaComponent): Promise<boolean> {
        return (component as unknown as { reloadWindowForView: () => Promise<boolean> }).reloadWindowForView();
    }

    it('reports a reload whose window read failed as not reloaded', async () => {
        expect(await reload(createReloadHarness(true))).toBe(false);
    });

    it('reports a reload whose window read succeeded as reloaded', async () => {
        expect(await reload(createReloadHarness(false))).toBe(true);
    });
});
