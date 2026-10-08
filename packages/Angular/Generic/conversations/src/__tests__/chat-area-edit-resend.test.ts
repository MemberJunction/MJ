// Angular components in this package are partial-compiled — load the JIT compiler first.
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { ConversationEngine, type ConversationScope, type MJConversationBranchEntity, type MJConversationDetailEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import { MAIN_OPEN_VIEW, type ConversationOpenView } from '../lib/utils/conversation-forks';

/**
 * `OnEditResendRequested`: an edit creates an Edit fork at the row before the edited
 * message, opens it, then sends the edited text into it. The original message is never changed.
 */

interface ComposerStub { ReadOnly: boolean; IsSending: boolean; SendMessageWithText: ReturnType<typeof vi.fn> }

const EDITED = { Message: { ID: 'DETAIL-2', ConversationID: 'CONV-1', Sequence: 2, BranchID: null } as MJConversationDetailEntity, NewText: 'edited' };

function createHarness(opts: { isSending?: boolean; reloaded?: boolean; sent?: boolean; sessionFor?: string; forkPoint?: { ParentBranchID: string | null; ForkFromSequence: number | null } | undefined; canFork?: boolean } = {}) {
    const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
    const open = component as unknown as Record<string, unknown>;
    const order: string[] = [];
    const composer: ComposerStub = { ReadOnly: false, IsSending: opts.isSending ?? false, SendMessageWithText: vi.fn(async () => opts.sent ?? true) };
    const reload = vi.fn(async () => { order.push('reload'); return opts.reloaded ?? true; });
    const realtime = { IsActiveFor: vi.fn((id: string) => id === opts.sessionFor), EndRealtimeSession: vi.fn(async () => { order.push('ended'); }) };
    const refresh = vi.fn(async () => undefined);
    const forkPoint = 'forkPoint' in opts ? opts.forkPoint : { ParentBranchID: null, ForkFromSequence: 1 };
    Object.assign(open, {
        _conversationId: 'CONV-1',
        CurrentUser: { ID: 'USER-1' },
        openView: MAIN_OPEN_VIEW as ConversationOpenView,
        viewChangeInFlight: false,
        forkStartInFlight: false,
        isActiveConversation: (id: string | null | undefined) => id === 'CONV-1',
        getActiveMessageInputComponent: () => composer,
        resolveEditForkPoint: vi.fn(async () => forkPoint),
        reloadWindowForView: reload,
        RefreshForkSummaries: refresh,
        RealtimeSession: realtime,
        branches: [],
        scopeFallbackLogged: null,
        cdr: { detectChanges: vi.fn(), markForCheck: vi.fn() },
    });
    Object.defineProperty(component, 'CanFork', { get: () => opts.canFork ?? true, configurable: true });
    return { component, open, composer, reload, realtime, refresh, order };
}

describe('ConversationChatAreaComponent.OnEditResendRequested', () => {
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

    it('creates an Edit fork at the row before the message, opens it and sends the edited text into it', async () => {
        const h = createHarness();

        await h.component.OnEditResendRequested(EDITED);

        expect(create).toHaveBeenCalledWith(
            { ConversationID: 'CONV-1', Kind: 'Edit', ParentBranchID: null, ForkFromSequence: 1, SourceDetailID: 'DETAIL-2' },
            { ID: 'USER-1' }
        );
        expect(h.component.OpenView).toEqual({ Kind: 'Fork', BranchID: 'FORK-NEW' });
        expect(h.refresh).toHaveBeenCalled();
        expect(h.composer.SendMessageWithText).toHaveBeenCalledWith('edited', undefined, { IsResend: true, TargetBranchID: 'FORK-NEW' });
        expect(notify).not.toHaveBeenCalled();
    });

    it('makes no fork while the composer is still sending', async () => {
        const h = createHarness({ isSending: true });
        await h.component.OnEditResendRequested(EDITED);
        expect(create).not.toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith('Wait for the current reply to finish', 'error', 3000);
    });

    it('makes no fork when the row before the message cannot be found', async () => {
        const h = createHarness({ forkPoint: undefined });
        await h.component.OnEditResendRequested(EDITED);
        expect(create).not.toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith('Could not locate the message before this one', 'error', 3000);
    });

    it('reports a fork that could not be created and sends nothing', async () => {
        create.mockRejectedValue(new Error('denied'));
        const h = createHarness();
        await h.component.OnEditResendRequested(EDITED);
        expect(notify).toHaveBeenCalledWith('Could not create a fork for the edited message', 'error', 3000);
        expect(h.composer.SendMessageWithText).not.toHaveBeenCalled();
    });

    it('sends nothing when the fork could not be opened', async () => {
        const h = createHarness({ reloaded: false });
        await h.component.OnEditResendRequested(EDITED);
        expect(notify).toHaveBeenCalledWith('The fork was created but could not be opened', 'error', 3000);
        expect(h.composer.SendMessageWithText).not.toHaveBeenCalled();
    });

    it('reports a send the composer refused', async () => {
        const h = createHarness({ sent: false });
        await h.component.OnEditResendRequested(EDITED);
        expect(notify).toHaveBeenCalledWith('The fork was created but the message was not sent', 'error', 3000);
    });

    it('does nothing for a person who may not fork', async () => {
        const h = createHarness({ canFork: false });

        await h.component.OnEditResendRequested(EDITED);

        expect(create).not.toHaveBeenCalled();
        expect(h.composer.SendMessageWithText).not.toHaveBeenCalled();
    });

    it('ignores a second edit while one is starting a fork', async () => {
        const h = createHarness();
        h.open['forkStartInFlight'] = true;
        await h.component.OnEditResendRequested(EDITED);
        expect(create).not.toHaveBeenCalled();
    });

    it('reports a failed read of the message before the edited one and makes no fork', async () => {
        const h = createHarness();
        (h.open['resolveEditForkPoint'] as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('window read failed'));

        await h.component.OnEditResendRequested(EDITED);

        expect(create).not.toHaveBeenCalled();
        expect(h.composer.SendMessageWithText).not.toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith('Could not create a fork for the edited message', 'error', 3000);
        expect(h.open['forkStartInFlight']).toBe(false);
    });

    it('registers the new fork row before the view changes, so its scope resolves during the reload', async () => {
        const created = new Date('2026-10-07T10:00:00Z');
        const fork = {
            ID: 'FORK-NEW', ConversationID: 'CONV-1', ParentBranchID: null, ForkFromSequence: 1, Name: null,
            Kind: 'Edit' as const, SourceDetailID: 'DETAIL-2', UserID: 'USER-1', User: 'Ada', __mj_CreatedAt: created,
        };
        create.mockResolvedValue(fork as MJConversationBranchEntity);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const h = createHarness();
        let scopeDuringReload: ConversationScope | null = null;
        h.reload.mockImplementation(async () => { scopeDuringReload = h.component.ExportScope; return true; });

        await h.component.OnEditResendRequested(EDITED);

        expect(scopeDuringReload).toEqual({ ConversationID: 'CONV-1', BranchID: 'FORK-NEW', Branches: [{ ...fork }] });
        expect(warn).not.toHaveBeenCalled();
    });

    it('ends a voice session of the conversation when the new fork opens', async () => {
        const h = createHarness({ sessionFor: 'CONV-1' });
        create.mockImplementation(async () => { h.order.push('create'); return { ID: 'FORK-NEW' } as MJConversationBranchEntity; });
        await h.component.OnEditResendRequested(EDITED);
        expect(h.order).toEqual(['create', 'ended', 'reload']);
    });
});

describe('ConversationChatAreaComponent.resolveEditForkPoint', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    function harness(messages: Array<{ ID: string; Sequence: number; BranchID: string | null }>, hasMoreAbove: boolean, view: ConversationOpenView) {
        const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
        Object.assign(component as unknown as Record<string, unknown>, {
            CurrentUser: { ID: 'USER-1' },
            openView: view,
            messages,
            windowStore: { GetSnapshot: () => ({ Cursor: { HasMoreAbove: hasMoreAbove } }) },
        });
        return (m: { ID: string; ConversationID: string; Sequence: number }) =>
            ((component as unknown as { resolveEditForkPoint(x: object): Promise<unknown> }).resolveEditForkPoint(m));
    }

    it('forks at the loaded row before the message', async () => {
        const resolve = harness([{ ID: 'a', Sequence: 1, BranchID: null }, { ID: 'b', Sequence: 2, BranchID: null }, { ID: 'c', Sequence: 9, BranchID: 'T1' }], false, { Kind: 'Fork', BranchID: 'T1' });
        expect(await resolve({ ID: 'c', ConversationID: 'CONV-1', Sequence: 9 })).toEqual({ ParentBranchID: null, ForkFromSequence: 2 });
    });

    it('loads one older row on the open path when the message is the first loaded row', async () => {
        const window = vi.spyOn(ConversationEngine.Instance, 'LoadDetailWindow').mockResolvedValue({ Failed: false, Details: [{ Sequence: 7, BranchID: 'T1' }] } as never);
        const resolve = harness([{ ID: 'c', Sequence: 9, BranchID: 'T1' }], true, { Kind: 'Fork', BranchID: 'T1' });

        expect(await resolve({ ID: 'c', ConversationID: 'CONV-1', Sequence: 9 })).toEqual({ ParentBranchID: 'T1', ForkFromSequence: 7 });
        expect(window).toHaveBeenCalledWith(
            { ConversationID: 'CONV-1', BeforeSequence: 9, PageSize: 1, RawOverread: 1, BranchID: 'T1' },
            { ID: 'USER-1' }
        );
    });
});
