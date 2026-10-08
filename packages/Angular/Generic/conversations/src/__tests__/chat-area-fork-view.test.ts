import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import type { MJConversationDetailEntity, ForkSummary } from '@memberjunction/core-entities';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MAIN_COMPOSER_PLACEHOLDER, MAIN_OPEN_VIEW, FORK_COMPOSER_PLACEHOLDER, type ConversationOpenView } from '../lib/utils/conversation-forks';

function row(id: string, branchId: string | null, sequence: number, extra: Record<string, unknown> = {}): MJConversationDetailEntity {
    return { ID: id, BranchID: branchId, Sequence: sequence, ConversationID: 'CONV-1', __mj_CreatedAt: new Date(Date.UTC(2026, 9, 6, 14, sequence)), ...extra } as unknown as MJConversationDetailEntity;
}

const MESSAGES = [row('D1', null, 1), row('D2', null, 2, { AgentID: 'A1', Agent: 'Sage' }), row('D3', null, 3, { Role: 'User', UserID: 'U-MAYA', User: 'Maya Chen' }), row('A', 'T1', 10), row('B', 'T1', 11)];
const T1_SUMMARY = {
    Branch: { ID: 'T1', ConversationID: 'CONV-1', ParentBranchID: null, ForkFromSequence: 3, __mj_CreatedAt: '2026-10-06T14:20:00.000Z' },
    Kind: 'Fork', DisplayName: 'Annual plans only', StartedByName: 'Jordan Ellis', AnchorAuthorName: 'Sage', AnchorAt: new Date(Date.UTC(2026, 9, 6, 14, 3)),
} as unknown as ForkSummary;

function createChatArea(view: ConversationOpenView, opts: { summaries?: ForkSummary[]; hasMoreAbove?: boolean; messages?: MJConversationDetailEntity[]; branches?: unknown[] } = {}) {
    const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
    Object.assign(component as unknown as Record<string, unknown>, {
        _conversationId: 'CONV-1',
        openView: view,
        windowView: view,
        messages: opts.messages ?? MESSAGES,
        cdr: { detectChanges: vi.fn() },
        ForkSummaries: opts.summaries ?? [],
        branches: opts.branches ?? [],
        windowStore: { HasMoreAbove: opts.hasMoreAbove ?? true },
    });
    return component;
}

describe('ConversationChatAreaComponent fork view', () => {
    const FORK: ConversationOpenView = { Kind: 'Fork', BranchID: 'T1' };
    const DRAFT: ConversationOpenView = { Kind: 'DraftFork', ParentBranchID: null, ForkFromSequence: 2, AnchorDetailID: 'D2', SourceDetailID: 'D3' };

    it('shows every row in Main', () => {
        const c = createChatArea(MAIN_OPEN_VIEW);
        expect(c.DisplayMessages).toBe(MESSAGES);
        expect(c.ForkLayout).toBeNull();
    });

    it('shows every inherited row, then the own rows of a fork, the same array until something changes', () => {
        const c = createChatArea(FORK);
        expect(c.DisplayMessages.map(m => m.ID)).toEqual(['D1', 'D2', 'D3', 'A', 'B']);
        expect(c.DisplayMessages).toBe(c.DisplayMessages);
        expect(c.ForkLayout?.InheritedIDs).toEqual(new Set(['d1', 'd2', 'd3']));
        expect(c.ForkLayout?.MarkerDetailID).toBe('D3');
    });

    it('shows every inherited row of a long path, with no collapse', () => {
        const inherited = Array.from({ length: 40 }, (_, i) => row(`M${i + 1}`, null, i + 1));
        const c = createChatArea(FORK, { messages: [...inherited, row('A', 'T1', 50)] });
        expect(c.DisplayMessages).toHaveLength(41);
        expect(c.DisplayMessages[0].ID).toBe('M1');
        expect(c.ForkLayout?.InheritedIDs.size).toBe(40);
        expect(c.ForkLayout?.MarkerDetailID).toBe('M40');
    });

    it('shows a draft as its inherited rows up to the anchor, without the replaced message, and names its author', () => {
        const c = createChatArea(DRAFT);
        expect(c.DisplayMessages.map(m => m.ID)).toEqual(['D1', 'D2']);
        expect(c.OpenViewTitle).toBe('New fork');
        expect(c.ForkLayout?.MarkerDetailID).toBe('D2');
        expect(c.ForkLayout?.MarkerText).toBe("New fork from Maya Chen's message");
    });

    it('shows no inherited row and no marker in a draft that replaces the first message', () => {
        const c = createChatArea({ Kind: 'DraftFork', ParentBranchID: null, ForkFromSequence: null, AnchorDetailID: null, SourceDetailID: 'D1' });
        expect(c.DisplayMessages).toEqual([]);
        expect(c.ForkLayout?.MarkerText).toBeNull();
        expect(c.ComposerHint).toBe('Agents see only this fork');
    });

    it('pages older rows in every view while the store has rows above', () => {
        for (const view of [MAIN_OPEN_VIEW, FORK, DRAFT]) {
            expect(createChatArea(view).ListHasMoreAbove).toBe(true);
            expect(createChatArea(view, { hasMoreAbove: false }).ListHasMoreAbove).toBe(false);
        }
    });

    it('marks no fork point until the anchor row is loaded, then marks it once older rows arrive', async () => {
        const own = [row('A', 'T1', 10), row('B', 'T1', 11)];
        const c = createChatArea(FORK, { messages: own, summaries: [T1_SUMMARY] });
        const loadOlder = vi.fn(async () => undefined);
        const user = { ID: 'USER-1' };
        Object.assign(c as unknown as Record<string, unknown>, {
            CurrentUser: user,
            isActiveConversation: () => true,
            windowStore: { HasMoreAbove: true, LoadOlder: loadOlder },
            refreshAfterPaging: vi.fn(async () => {
                Object.assign(c as unknown as Record<string, unknown>, { messages: [MESSAGES[2], ...own] });
            }),
        });

        expect(c.DisplayMessages.map(m => m.ID)).toEqual(['A', 'B']);
        expect(c.ForkLayout?.InheritedIDs.size).toBe(0);
        expect(c.ForkLayout?.MarkerDetailID).toBeNull();

        await c.OnOlderMessagesRequested();

        expect(loadOlder).toHaveBeenCalledWith(user);
        expect(c.DisplayMessages.map(m => m.ID)).toEqual(['D3', 'A', 'B']);
        expect(c.ForkLayout?.InheritedIDs).toEqual(new Set(['d3']));
        expect(c.ForkLayout?.MarkerDetailID).toBe('D3');
        expect(c.ForkLayout?.MarkerText?.startsWith("Jordan Ellis forked from Sage's message")).toBe(true);
    });

    describe('window load', () => {
        function withStore(view: ConversationOpenView) {
            const c = createChatArea(view);
            const store = { LoadLatest: vi.fn(async () => undefined), Reset: vi.fn() };
            const user = { ID: 'USER-1' };
            Object.assign(c as unknown as Record<string, unknown>, { windowStore: store, CurrentUser: user });
            const load = () => (c as unknown as { loadWindowForOpenView(id: string): Promise<void> }).loadWindowForOpenView('CONV-1');
            return { store, user, load };
        }

        it('loads the newest page in Main', async () => {
            const h = withStore(MAIN_OPEN_VIEW);
            await h.load();
            expect(h.store.LoadLatest).toHaveBeenCalledWith('CONV-1', h.user, null);
        });

        it("loads the newest page of a fork's path, as in Main", async () => {
            const h = withStore(FORK);
            await h.load();
            expect(h.store.LoadLatest).toHaveBeenCalledWith('CONV-1', h.user, 'T1');
        });

        it("loads a draft's parent path with its first page ending at the anchor", async () => {
            const h = withStore({ ...DRAFT, ParentBranchID: 'T1' } as ConversationOpenView);
            await h.load();
            expect(h.store.LoadLatest).toHaveBeenCalledWith('CONV-1', h.user, 'T1', 2);
        });

        it('loads nothing for a draft that replaces the first message', async () => {
            const h = withStore({ Kind: 'DraftFork', ParentBranchID: null, ForkFromSequence: null, AnchorDetailID: null, SourceDetailID: 'D1' });
            await h.load();
            expect(h.store.Reset).toHaveBeenCalledWith('CONV-1', null);
            expect(h.store.LoadLatest).not.toHaveBeenCalled();
        });
    });

    it('names the open fork and draws its marker from the fork summary', () => {
        const c = createChatArea(FORK, { summaries: [T1_SUMMARY] });
        expect(c.OpenViewTitle).toBe('Annual plans only');
        expect(c.OpenViewKind).toBe('Fork');
        expect(c.OpenViewIcon).toBe('fa-solid fa-code-branch');
        expect(c.ForkLayout?.MarkerDetailID).toBe('D3');
        expect(c.ForkLayout?.MarkerText?.startsWith("Jordan Ellis forked from Sage's message · ")).toBe(true);
        expect(createChatArea(FORK).OpenViewTitle).toBe('Fork');
    });

    it("names the replaced message's author in the marker of a fork with a source message", () => {
        const sourced = { ...T1_SUMMARY, Branch: { ...T1_SUMMARY.Branch, SourceDetailID: 'D9' }, SourceAuthorName: 'Maya Chen' } as ForkSummary;
        expect(createChatArea(FORK, { summaries: [sourced] }).ForkLayout?.MarkerText?.startsWith("Jordan Ellis forked from Maya Chen's message · ")).toBe(true);

        const unread = { ...sourced, SourceAuthorName: null } as ForkSummary;
        const loaded = [...MESSAGES, row('D9', null, 4, { Role: 'User', UserID: 'U-PRIYA', User: 'Priya Natarajan' })];
        expect(createChatArea(FORK, { summaries: [unread], messages: loaded }).ForkLayout?.MarkerText?.startsWith("Jordan Ellis forked from Priya Natarajan's message · ")).toBe(true);
        expect(createChatArea(FORK, { summaries: [unread] }).ForkLayout?.MarkerText?.startsWith('Jordan Ellis forked · ')).toBe(true);
    });

    it("names the replaced message's author from the fork row and the loaded rows before the summaries load", () => {
        const branches = [{ ID: 'T1', ConversationID: 'CONV-1', ParentBranchID: null, ForkFromSequence: 3, SourceDetailID: 'D2' }];
        expect(createChatArea(FORK, { branches }).ForkLayout?.MarkerText).toBe("Someone forked from Sage's message");
        expect(createChatArea(FORK).ForkLayout?.MarkerText).toBe("Someone forked from Maya Chen's message");
    });

    it('sets the composer placeholder and hint for the open view', () => {
        const fork = createChatArea(FORK, { summaries: [T1_SUMMARY] });
        expect(fork.ComposerPlaceholderFor('CONV-1')).toBe(FORK_COMPOSER_PLACEHOLDER);
        expect(fork.ComposerPlaceholderFor('CONV-2')).toBe(MAIN_COMPOSER_PLACEHOLDER);
        expect(fork.ComposerHint?.startsWith('Agents see the conversation up to ')).toBe(true);
        expect(fork.ComposerHint?.endsWith(', plus this fork')).toBe(true);
        expect(createChatArea(MAIN_OPEN_VIEW).ComposerHint).toBeNull();
        expect(createChatArea(MAIN_OPEN_VIEW).ComposerPlaceholderFor('CONV-1')).toBe(MAIN_COMPOSER_PLACEHOLDER);
    });

    it('keeps the displayed array and puts a streamed entity in place of its row', () => {
        const c = createChatArea(FORK, { messages: [...MESSAGES] });
        Object.assign(c as unknown as Record<string, unknown>, {
            isActiveConversation: () => true,
            windowStore: { HasMoreAbove: true, ApplyLocalDetail: vi.fn() },
            messageListComponent: { RefreshRenderedMessage: () => true },
            followTranscript: vi.fn(),
        });
        const shown = c.DisplayMessages;
        const streamed = row('B', 'T1', 11, { Status: 'In-Progress' });

        c.OnMessageStreamed(streamed);

        expect(c.DisplayMessages).toBe(shown);
        expect(shown.map(m => m.ID)).toEqual(['D1', 'D2', 'D3', 'A', 'B']);
        expect(shown[4]).toBe(streamed);
    });

    it('draws the "Analyzing your request" row as a row of the open fork', async () => {
        const c = createChatArea(FORK);
        const temp: Record<string, unknown> = { LoadFromData: (data: Record<string, unknown>) => Object.assign(temp, data) };
        Object.assign(c as unknown as Record<string, unknown>, {
            isActiveConversation: () => true,
            Provider: { GetEntityObject: async () => temp },
            followTranscript: vi.fn(),
            cdr: { detectChanges: vi.fn() },
        });

        await c.OnIntentCheckStarted({ conversationId: 'CONV-1' });

        expect(temp['BranchID']).toBe('T1');
        expect(c.DisplayMessages[c.DisplayMessages.length - 1]).toBe(temp);
        expect(c.ForkLayout?.MarkerDetailID).toBe('D3');
    });

    it("hides the open fork's own chip in its full view and keeps the chips of other forks", () => {
        const placed = (id: string) => ({
            Branch: { ID: id, ConversationID: 'CONV-1', ParentBranchID: null, ForkFromSequence: 3 }, Kind: 'Fork', DisplayName: `name ${id}`,
            MessageCount: 1, Participants: [], LastActivityAt: new Date(), PlacementDetailID: 'D3',
        }) as unknown as ForkSummary;
        const summaries = [placed('t1'), placed('T2')];

        const fork = createChatArea(FORK, { summaries });
        expect(fork.ForkChipMap.get('d3')?.map(chip => chip.BranchID)).toEqual(['T2']);
        expect(createChatArea(MAIN_OPEN_VIEW, { summaries }).ForkChipMap.get('d3')?.map(chip => chip.BranchID)).toEqual(['t1', 'T2']);
        expect(createChatArea(DRAFT, { summaries }).ForkChipMap.get('d3')?.map(chip => chip.BranchID)).toEqual(['t1', 'T2']);

        Object.assign(fork as unknown as Record<string, unknown>, { openView: MAIN_OPEN_VIEW, windowView: MAIN_OPEN_VIEW });
        expect(fork.ForkChipMap.get('d3')?.map(chip => chip.BranchID)).toEqual(['t1', 'T2']);
    });

    describe('while the window of a new view loads', () => {
        const MAIN_ROWS = [row('D1', null, 1), row('D2', null, 2, { AgentID: 'A1', Agent: 'Sage' }), row('D3', null, 3, { Role: 'User', UserID: 'U-MAYA', User: 'Maya Chen' }), row('D4', null, 4), row('D5', null, 5)];

        /** A chat area whose view reload waits for `release`, then applies `nextRows` as the new window. */
        function withPendingReload(view: ConversationOpenView, rows: MJConversationDetailEntity[], nextRows: MJConversationDetailEntity[]) {
            const c = createChatArea(view, { messages: rows });
            let release: () => void = () => undefined;
            const gate = new Promise<void>(resolve => { release = resolve; });
            const open = c as unknown as Record<string, unknown> & { applyWindowSnapshot(): void };
            Object.assign(open, {
                viewChangeInFlight: false,
                isActiveConversation: () => true,
                RealtimeSession: { IsActiveFor: () => false },
                cdr: { detectChanges: vi.fn() },
                UserAvatarMap: new Map(),
                updateAttachmentSupport: vi.fn(),
                windowStore: { HasMoreAbove: true, GetSnapshot: () => ({ Details: nextRows, UserAvatars: new Map(), Cursor: { HasMoreAbove: false } }) },
                reloadWindowForView: vi.fn(async () => {
                    await gate;
                    open.applyWindowSnapshot();
                    return true;
                }),
            });
            return { c, release };
        }

        it('keeps drawing the loaded rows for the view they belong to, then draws the new window', async () => {
            const { c, release } = withPendingReload(MAIN_OPEN_VIEW, MAIN_ROWS, MESSAGES);
            const opening = c.OpenFork('T1');
            await Promise.resolve();

            expect(c.OpenView.Kind).toBe('Fork');
            expect(c.DisplayMessages).toBe(MAIN_ROWS);
            expect(c.ForkLayout).toBeNull();
            expect(c.ComposerHint).toBeNull();

            release();
            await opening;
            expect(c.DisplayMessages.map(m => m.ID)).toEqual(['D1', 'D2', 'D3', 'A', 'B']);
            expect(c.ForkLayout?.MarkerDetailID).toBe('D3');
        });

        it('shows every inherited row of the next fork when its window lands', async () => {
            const { c, release } = withPendingReload(FORK, MESSAGES, [row('D1', null, 1), row('D2', null, 2), row('D3', null, 3), row('C', 'T2', 12)]);
            const opening = c.OpenFork('T2');
            release();
            await opening;
            expect(c.DisplayMessages.map(m => m.ID)).toEqual(['D1', 'D2', 'D3', 'C']);
        });

        it("loads a draft's path up to the row before the replaced message, and names that message's author", async () => {
            const { c, release } = withPendingReload(MAIN_OPEN_VIEW, MAIN_ROWS.slice(1), MAIN_ROWS.slice(0, 2));
            const reload = (c as unknown as { reloadWindowForView: ReturnType<typeof vi.fn> }).reloadWindowForView;
            const opening = c.OpenDraftFork(MAIN_ROWS[2]);
            release();
            expect(await opening).toBe(true);

            expect(reload).toHaveBeenCalledTimes(1);
            expect(c.OpenView).toEqual({ Kind: 'DraftFork', ParentBranchID: null, ForkFromSequence: 2, AnchorDetailID: 'D2', SourceDetailID: 'D3', SourceAuthorName: 'Maya Chen' });
            expect(c.DisplayMessages.map(m => m.ID)).toEqual(['D1', 'D2']);
            expect(c.ForkLayout?.MarkerDetailID).toBe('D2');
            expect(c.ForkLayout?.MarkerText).toBe("New fork from Maya Chen's message");
            expect(c.ListHasMoreAbove).toBe(true);
        });

        it("finds a draft's anchor in the loaded path when the anchor was not loaded as the draft opened", async () => {
            const draft: ConversationOpenView = { Kind: 'DraftFork', ParentBranchID: null, ForkFromSequence: 2, AnchorDetailID: null, SourceDetailID: 'D3' };
            const c = createChatArea(draft, { messages: MAIN_ROWS });
            expect(c.ComposerHint?.startsWith('Agents see the conversation up to ')).toBe(true);
        });
    });

    describe('jumps in a fork view', () => {
        function withList(c: ConversationChatAreaComponent, visibleIds: () => string[]) {
            const scrolled: string[] = [];
            Object.assign(c as unknown as Record<string, unknown>, {
                cdr: { detectChanges: vi.fn() },
                beaconMessage: vi.fn(),
                messageListComponent: {
                    ScrollToMessage: (id: string) => {
                        scrolled.push(id);
                        return visibleIds().includes(id);
                    },
                    ScrollToDateTarget: () => (visibleIds().includes('D1') ? 'reached' : 'oldest'),
                },
            });
            return scrolled;
        }

        it('scrolls straight to a loaded inherited pin', async () => {
            const c = createChatArea(FORK);
            const scrolled = withList(c, () => c.DisplayMessages.map(m => m.ID));

            await c.OnJumpToMessage('D1');

            expect(scrolled).toEqual(['D1']);
        });

        it('says so when a loaded pin still cannot be scrolled to', async () => {
            const notify = vi.fn();
            const instance = vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: notify } as unknown as MJNotificationService);
            const c = createChatArea(FORK);
            withList(c, () => []);
            Object.assign(c as unknown as Record<string, unknown>, {
                windowStore: { HasMoreAbove: true, PinnedDetails: [MESSAGES[0]] },
                loadUntilSequenceIsWindowed: vi.fn(async () => true),
                refreshAfterPaging: vi.fn(async () => undefined),
            });

            await c.OnJumpToMessage('D1');

            expect(notify).toHaveBeenCalledWith('Could not find that message in this conversation', 'info', 3000);
            instance.mockRestore();
        });

        it('lands a date jump on an inherited row without paging', async () => {
            const c = createChatArea(FORK);
            withList(c, () => c.DisplayMessages.map(m => m.ID));
            const notify = vi.fn();
            const instance = vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: notify } as unknown as MJNotificationService);
            const loadOlder = vi.fn(async () => undefined);
            Object.assign(c as unknown as Record<string, unknown>, {
                windowStore: { HasMoreAbove: false, LoadOlder: loadOlder, GetSnapshot: () => ({ Details: MESSAGES, Cursor: { HasMoreAbove: false } }) },
            });

            await c.OnDateJumpRequested('last-month');

            expect(loadOlder).not.toHaveBeenCalled();
            expect(notify).not.toHaveBeenCalled();
            instance.mockRestore();
        });
    });

    it('splits the loaded rows and writes the hint once until the inputs change', () => {
        const c = createChatArea(FORK, { summaries: [T1_SUMMARY] });
        const open = c as unknown as { displayCache: { Split: unknown } | null; layoutCache: { Hint: string | null } | null };
        const anchor = vi.spyOn(c as unknown as { anchorRowOf(view: ConversationOpenView): unknown }, 'anchorRowOf');

        const hint = c.ComposerHint;
        const split = open.displayCache?.Split;
        expect(c.ListHasMoreAbove).toBe(true);
        expect(c.ComposerHint).toBe(hint);
        expect(open.displayCache?.Split).toBe(split);
        expect(open.layoutCache?.Hint).toBe(hint);
        expect(anchor).not.toHaveBeenCalled();
    });

    it("reads the anchor row's time only when the fork summary has none", () => {
        const c = createChatArea(FORK, { summaries: [{ ...T1_SUMMARY, AnchorAt: null } as ForkSummary] });
        const anchor = vi.spyOn(c as unknown as { anchorRowOf(view: ConversationOpenView): unknown }, 'anchorRowOf');

        expect(c.ComposerHint?.startsWith('Agents see the conversation up to ')).toBe(true);
        expect(anchor).toHaveBeenCalledTimes(1);
    });
});
