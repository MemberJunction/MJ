import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { ConversationEngine, type ConversationBranchRow, type MJConversationBranchEntity, type MJConversationDetailEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import { MAIN_OPEN_VIEW, type ConversationOpenView } from '../lib/utils/conversation-forks';

/**
 * In-place mode (forking off): Regenerate on the latest answer and "Save and resend" on the latest user
 * message hide the answer rows of the turn (ReplacedAt and HiddenToUser set, one save at a time), take
 * them off the screen, then rerun the agent for the user message on its branch.
 */

type Row = MJConversationDetailEntity & { Save: ReturnType<typeof vi.fn> };

function row(id: string, sequence: number, role: 'User' | 'AI', log: string[], opts: { branchId?: string | null; status?: 'Complete' | 'In-Progress'; saved?: boolean } = {}): Row {
    const r = {
        ID: id, ConversationID: 'CONV-1', Sequence: sequence, Role: role, BranchID: opts.branchId ?? null,
        Status: opts.status ?? 'Complete', HiddenToUser: false, ReplacedAt: null, AgentSessionID: null,
        LatestResult: { CompleteMessage: 'denied' },
        Save: vi.fn(async () => { log.push(`save:${id}`); return opts.saved ?? true; }),
    };
    return r as unknown as Row;
}

function createHarness(opts: { messages: (log: string[]) => Row[]; canFork?: boolean; view?: ConversationOpenView; rerun?: boolean } ) {
    const log: string[] = [];
    const messages = opts.messages(log);
    const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
    const open = component as unknown as Record<string, unknown>;
    const composer = { ReadOnly: false, IsSending: false, RerunAgentForMessage: vi.fn(async (m: Row, b: string | null) => { log.push(`rerun:${m.ID}:${b}`); return opts.rerun ?? true; }) };
    const removeDetail = vi.fn((id: string) => log.push(`remove:${id}`));
    const reload = vi.fn(async () => true);
    Object.assign(open, {
        _conversationId: 'CONV-1',
        CurrentUser: { ID: 'USER-1' },
        ReadOnly: false,
        Conversation: null,
        openView: opts.view ?? MAIN_OPEN_VIEW,
        windowView: opts.view ?? MAIN_OPEN_VIEW,
        viewChangeInFlight: false,
        forkStartInFlight: false,
        inPlaceRerunInFlight: false,
        messages,
        branches: [] as ConversationBranchRow[],
        branchRowsConversationId: 'CONV-1',
        windowStore: { RemoveDetail: removeDetail },
        isActiveConversation: (id: string | null | undefined) => id === 'CONV-1',
        getActiveMessageInputComponent: () => composer,
        reloadWindowForView: reload,
        RefreshForkSummaries: vi.fn(async () => undefined),
        RealtimeSession: { IsActiveFor: vi.fn(() => false), EndRealtimeSession: vi.fn(async () => undefined) },
        cdr: { detectChanges: vi.fn(), markForCheck: vi.fn() },
    });
    Object.defineProperty(component, 'CanFork', { get: () => opts.canFork ?? false, configurable: true });
    return { component, open, composer, removeDetail, reload, log, messages };
}

/** Main: U1 → A1, then U2 → S2 (status) and A2 (reply). */
function mainRows(log: string[], extra: { a2Saved?: boolean; a2Status?: 'Complete' | 'In-Progress' } = {}): Row[] {
    return [
        row('U1', 1, 'User', log), row('A1', 2, 'AI', log), row('U2', 3, 'User', log),
        row('S2', 4, 'AI', log), row('A2', 5, 'AI', log, { saved: extra.a2Saved, status: extra.a2Status }),
    ];
}

describe('ConversationChatAreaComponent in-place mode', () => {
    let notify: ReturnType<typeof vi.fn>;
    let branches: MockInstance<typeof ConversationEngine.LoadBranchesFresh>;

    beforeEach(() => {
        notify = vi.fn();
        vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: notify } as unknown as MJNotificationService);
        branches = vi.spyOn(ConversationEngine, 'LoadBranchesFresh').mockResolvedValue([]);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('offers the latest turn only while forking is off, as the same object until its inputs change', () => {
        const h = createHarness({ messages: mainRows });
        const turn = h.component.InPlaceTurn;
        expect(turn).toEqual({ UserDetailID: 'U2', AnswerDetailID: 'A2' });
        expect(h.component.InPlaceTurn).toBe(turn);
        expect(createHarness({ messages: mainRows, canFork: true }).component.InPlaceTurn).toBeNull();
    });

    it('offers no turn when a fork depends on its answer', () => {
        const h = createHarness({ messages: mainRows });
        h.open['branches'] = [{ ID: 'F', ConversationID: 'CONV-1', ParentBranchID: null, ForkFromSequence: 5 }];
        expect(h.component.InPlaceTurn).toBeNull();
    });

    it('Regenerate hides the answer rows one by one, takes them off the screen, then reruns the user message', async () => {
        const h = createHarness({ messages: mainRows });

        await h.component.OnRegenerateRequested(h.messages[4]);

        expect(h.log).toEqual(['save:S2', 'save:A2', 'remove:S2', 'remove:A2', 'rerun:U2:null']);
        for (const r of [h.messages[3], h.messages[4]]) {
            expect(r.HiddenToUser).toBe(true);
            expect(r.ReplacedAt).toBeInstanceOf(Date);
        }
        expect((h.open['messages'] as Row[]).map(m => m.ID)).toEqual(['U1', 'A1', 'U2']);
        expect(h.composer.RerunAgentForMessage).toHaveBeenCalledWith(h.messages[2], null);
        expect(notify).not.toHaveBeenCalled();
    });

    it("reruns on the fork's branch in a fork view", async () => {
        const view: ConversationOpenView = { Kind: 'Fork', BranchID: 'F1' };
        const h = createHarness({ view, messages: log => [row('U1', 1, 'User', log), row('FU', 10, 'User', log, { branchId: 'F1' }), row('FA', 11, 'AI', log, { branchId: 'F1' })] });

        await h.component.OnRegenerateRequested(h.messages[2]);

        expect(h.log).toEqual(['save:FA', 'remove:FA', 'rerun:FU:F1']);
    });

    it('does nothing for an answer that is not the latest one', async () => {
        const h = createHarness({ messages: mainRows });
        await h.component.OnRegenerateRequested(h.messages[1]);
        expect(h.log).toEqual([]);
    });

    it('keeps the fork flow while the person may fork', async () => {
        const create = vi.spyOn(ConversationEngine.Instance, 'CreateFork').mockResolvedValue({ ID: 'FORK-NEW' } as MJConversationBranchEntity);
        const h = createHarness({ messages: mainRows, canFork: true });
        await h.component.OnRegenerateRequested(h.messages[4]);
        expect(create).toHaveBeenCalledOnce();
        expect(h.log.filter(e => e.startsWith('save:'))).toEqual([]);
    });

    it('refuses, changing nothing, when a fork made meanwhile depends on the answer', async () => {
        branches.mockResolvedValue([{ ID: 'F', ConversationID: 'CONV-1', ParentBranchID: null, ForkFromSequence: 4 }]);
        const h = createHarness({ messages: mainRows });
        await h.component.OnRegenerateRequested(h.messages[4]);
        expect(h.log).toEqual([]);
        expect(notify).toHaveBeenCalledWith('A fork depends on this answer, so it cannot be replaced', 'error', 3000);
    });

    it('changes nothing when the forks cannot be read', async () => {
        branches.mockRejectedValue(new Error('down'));
        const h = createHarness({ messages: mainRows });
        await h.component.OnRegenerateRequested(h.messages[4]);
        expect(h.log).toEqual([]);
        expect(notify).toHaveBeenCalledWith('Could not check the forks of this conversation; nothing was changed', 'error', 3000);
    });

    it('waits for a reply that is still running', async () => {
        const h = createHarness({ messages: log => mainRows(log, { a2Status: 'In-Progress' }) });
        await h.component.OnResendInPlaceRequested(h.messages[2]);
        expect(h.log).toEqual([]);
        expect(notify).toHaveBeenCalledWith('Wait for the current reply to finish', 'error', 3000);
    });

    it('stops at a failed save: restores that row, reloads the window and does not rerun', async () => {
        const h = createHarness({ messages: log => mainRows(log, { a2Saved: false }) });
        await h.component.OnRegenerateRequested(h.messages[4]);
        expect(h.log).toEqual(['save:S2', 'save:A2', 'remove:S2']);
        expect(h.messages[4].HiddenToUser).toBe(false);
        expect(h.messages[4].ReplacedAt).toBeNull();
        expect(h.reload).toHaveBeenCalledOnce();
        expect(notify).toHaveBeenCalledWith('Could not replace the answer', 'error', 3000);
    });

    it('reports a rerun the composer refused', async () => {
        const h = createHarness({ messages: mainRows, rerun: false });
        await h.component.OnRegenerateRequested(h.messages[4]);
        expect(notify).toHaveBeenCalledWith('The reply was not regenerated', 'error', 3000);
    });

    it('Save and resend reruns the turn of the latest user message, and nothing for an earlier one', async () => {
        const h = createHarness({ messages: mainRows });
        await h.component.OnResendInPlaceRequested(h.messages[0]);
        expect(h.log).toEqual([]);
        await h.component.OnResendInPlaceRequested(h.messages[2]);
        expect(h.log).toEqual(['save:S2', 'save:A2', 'remove:S2', 'remove:A2', 'rerun:U2:null']);
    });
});
