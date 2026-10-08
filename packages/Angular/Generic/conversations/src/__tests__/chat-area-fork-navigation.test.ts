import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { ConversationEngine, type ConversationBranchRow, type ForkSummary, type MJConversationBranchEntity, type MJConversationDetailEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';

const naming = vi.hoisted(() => ({ GenerateAndApplyForkName: vi.fn() }));
vi.mock('../lib/services/conversation-naming', async importOriginal => ({
    ...(await importOriginal<typeof import('../lib/services/conversation-naming')>()),
    GenerateAndApplyForkName: naming.GenerateAndApplyForkName,
}));

import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import { MAIN_OPEN_VIEW, type ConversationOpenView } from '../lib/utils/conversation-forks';

/** Main → A → B. A is named, B is an unnamed Edit fork. */
const ROW_A: ConversationBranchRow = { ID: 'A', ConversationID: 'CONV-1', ParentBranchID: null, ForkFromSequence: 2, Name: 'Pricing ideas', Kind: 'Fork' };
const ROW_B: ConversationBranchRow = { ID: 'B', ConversationID: 'CONV-1', ParentBranchID: 'A', ForkFromSequence: 12, Name: null, Kind: 'Edit' };
const SUMMARY_B = { Branch: ROW_B, Kind: 'Edit', DisplayName: 'Edited version' } as unknown as ForkSummary;
const FORK_A: ConversationOpenView = { Kind: 'Fork', BranchID: 'A' };
const FORK_B: ConversationOpenView = { Kind: 'Fork', BranchID: 'B' };
const DRAFT_UNDER_A: ConversationOpenView = { Kind: 'DraftFork', ParentBranchID: 'A', ForkFromSequence: 12, AnchorDetailID: 'D-12', SourceDetailID: 'D-13' };

/** A fork row stub for the rename save: Load reads `stored`, Save keeps what it was given. */
function forkEntity(stored: string | null, saves = true) {
    const fork = {
        Name: null as string | null,
        LatestResult: { CompleteMessage: 'denied' },
        Load: vi.fn(async () => { fork.Name = stored; return true; }),
        Save: vi.fn(async () => saves),
    };
    return fork;
}

function createHarness(opts: { view?: ConversationOpenView; branches?: ConversationBranchRow[]; summaries?: ForkSummary[]; readOnly?: boolean; fork?: ReturnType<typeof forkEntity>; autoName?: boolean } = {}) {
    const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
    const open = component as unknown as Record<string, unknown>;
    const reload = vi.fn(async () => true);
    const refresh = vi.fn(async () => undefined);
    const fork = opts.fork ?? forkEntity(null);
    Object.assign(open, {
        _conversationId: 'CONV-1',
        Conversation: { ID: 'CONV-1', Name: 'Launch plan' },
        engine: { GetSharedByInfo: () => null },
        CurrentUser: { ID: 'USER-1' },
        ReadOnly: opts.readOnly ?? false,
        openView: opts.view ?? MAIN_OPEN_VIEW,
        windowView: opts.view ?? MAIN_OPEN_VIEW,
        viewChangeInFlight: false,
        forkStartInFlight: false,
        isActiveConversation: (id: string | null | undefined) => id === 'CONV-1',
        reloadWindowForView: reload,
        RefreshForkSummaries: refresh,
        RealtimeSession: { IsActiveFor: () => false },
        branches: opts.branches ?? [ROW_A, ROW_B],
        ForkSummaries: opts.summaries ?? [SUMMARY_B],
        cdr: { detectChanges: vi.fn(), markForCheck: vi.fn() },
        Provider: { GetEntityObject: vi.fn(async () => fork as unknown as MJConversationBranchEntity) },
    });
    if (opts.autoName !== undefined) {
        open['AutoNameConversation'] = opts.autoName;
    }
    return { component, open, reload, refresh, fork };
}

describe('ConversationChatAreaComponent fork navigation, rename and naming', () => {
    let notify: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        notify = vi.fn();
        vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: notify } as unknown as MJNotificationService);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        naming.GenerateAndApplyForkName.mockReset();
        naming.GenerateAndApplyForkName.mockResolvedValue('Annual Plans Only');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('breadcrumb', () => {
        it('shows the conversation and every fork of the chain: Launch plan › Pricing ideas › Edited version', () => {
            const h = createHarness({ view: FORK_B });

            expect(h.component.ForkBreadcrumbs).toEqual([
                { BranchID: null, Label: 'Launch plan', IsCurrent: false },
                { BranchID: 'A', Label: 'Pricing ideas', IsCurrent: false },
                { BranchID: 'B', Label: 'Edited version', IsCurrent: true },
            ]);
            expect(h.component.ForkBreadcrumbs).toBe(h.component.ForkBreadcrumbs);
            expect(h.component.OpenViewTitle).toBe('Edited version');
        });

        it('ends a draft under A with "New fork"', () => {
            const h = createHarness({ view: DRAFT_UNDER_A });
            expect(h.component.ForkBreadcrumbs.map(c => [c.Label, c.IsCurrent])).toEqual([['Launch plan', false], ['Pricing ideas', false], ['New fork', true]]);
        });

        it('reads the chain from the fork summaries before the fork rows load, and is empty in Main', () => {
            const h = createHarness({ view: FORK_B, branches: [], summaries: [SUMMARY_B] });
            expect(h.component.ForkBreadcrumbs.map(c => c.BranchID)).toEqual([null, 'A', 'B']);
            expect(h.component.ForkBreadcrumbs[1].Label).toBe('Fork');
            expect(createHarness().component.ForkBreadcrumbs).toEqual([]);
        });

        it('opens the fork or Main of a crumb, and nothing for the last crumb', async () => {
            const h = createHarness({ view: FORK_B });
            const [conversation, forkA, current] = h.component.ForkBreadcrumbs;

            expect(await h.component.OpenCrumb(current)).toBe(false);
            expect(h.component.OpenView).toEqual(FORK_B);

            expect(await h.component.OpenCrumb(forkA)).toBe(true);
            expect(h.component.OpenView).toEqual(FORK_A);

            expect(await h.component.OpenCrumb(conversation)).toBe(true);
            expect(h.component.OpenView).toEqual(MAIN_OPEN_VIEW);
        });
    });

    describe('back button', () => {
        it('goes up to the parent fork, named in its label', async () => {
            const h = createHarness({ view: FORK_B });

            expect(h.component.BackLabel).toBe('Back to Pricing ideas');
            expect(await h.component.GoBack()).toBe(true);
            expect(h.component.OpenView).toEqual(FORK_A);
        });

        it('goes back to Main from a fork under Main', async () => {
            const h = createHarness({ view: FORK_A });

            expect(h.component.BackLabel).toBe('Back to Main');
            expect(await h.component.GoBack()).toBe(true);
            expect(h.component.OpenView).toEqual(MAIN_OPEN_VIEW);
        });

        it('takes a draft back to the fork it started from, else Main', async () => {
            const h = createHarness({ view: DRAFT_UNDER_A });
            expect(h.component.BackLabel).toBe('Back to Pricing ideas');
            await h.component.GoBack();
            expect(h.component.OpenView).toEqual(FORK_A);

            const fromMain = createHarness({ view: { ...DRAFT_UNDER_A, ParentBranchID: null } as ConversationOpenView });
            expect(fromMain.component.BackLabel).toBe('Back to Main');
            await fromMain.component.GoBack();
            expect(fromMain.component.OpenView).toEqual(MAIN_OPEN_VIEW);
        });
    });

    describe('rename', () => {
        it('opens the name field with the current name, and is not offered in a draft or a read-only conversation', () => {
            const h = createHarness({ view: FORK_A });
            expect(h.component.CanRenameFork).toBe(true);
            h.component.StartForkRename();
            expect(h.component.IsRenamingFork).toBe(true);
            expect(h.component.ForkRenameText).toBe('Pricing ideas');

            const draft = createHarness({ view: DRAFT_UNDER_A });
            expect(draft.component.CanRenameFork).toBe(false);
            draft.component.StartForkRename();
            expect(draft.component.IsRenamingFork).toBeFalsy();

            expect(createHarness({ view: FORK_A, readOnly: true }).component.CanRenameFork).toBe(false);
        });

        it('saves the trimmed name through the branch entity, then refreshes the fork summaries', async () => {
            const h = createHarness({ view: FORK_A, fork: forkEntity('Pricing ideas') });
            h.component.StartForkRename();
            h.component.ForkRenameText = '  Annual pricing  ';

            expect(await h.component.SaveForkRename()).toBe(true);

            expect(h.fork.Load).toHaveBeenCalledWith('A');
            expect(h.fork.Name).toBe('Annual pricing');
            expect(h.fork.Save).toHaveBeenCalledOnce();
            expect(h.refresh).toHaveBeenCalledOnce();
            expect(h.component.IsRenamingFork).toBe(false);
            expect(notify).not.toHaveBeenCalled();
        });

        it('clears the name for an empty field, so the default label shows again', async () => {
            const h = createHarness({ view: FORK_A, fork: forkEntity('Pricing ideas') });
            h.component.StartForkRename();
            h.component.ForkRenameText = '   ';

            expect(await h.component.SaveForkRename()).toBe(true);

            expect(h.fork.Name).toBeNull();
            expect(h.fork.Save).toHaveBeenCalledOnce();
        });

        it('saves nothing for an unchanged name, including the default label of an unnamed fork', async () => {
            const named = createHarness({ view: FORK_A });
            named.component.StartForkRename();
            expect(await named.component.SaveForkRename()).toBe(true);

            const unnamed = createHarness({ view: FORK_B });
            unnamed.component.StartForkRename();
            expect(unnamed.component.ForkRenameText).toBe('Edited version');
            expect(await unnamed.component.SaveForkRename()).toBe(true);

            expect(named.fork.Save).not.toHaveBeenCalled();
            expect(unnamed.fork.Save).not.toHaveBeenCalled();
        });

        it('cancels on Escape without saving, and a later blur saves nothing', async () => {
            const h = createHarness({ view: FORK_A });
            h.component.StartForkRename();
            h.component.ForkRenameText = 'Something else';

            h.component.CancelForkRename();
            expect(h.component.IsRenamingFork).toBe(false);
            expect(await h.component.SaveForkRename()).toBe(false);

            expect((h.open['Provider'] as { GetEntityObject: ReturnType<typeof vi.fn> }).GetEntityObject).not.toHaveBeenCalled();
        });

        it('shows "Could not rename the fork" when the save fails or throws', async () => {
            const failed = createHarness({ view: FORK_A, fork: forkEntity('Pricing ideas', false) });
            failed.component.StartForkRename();
            failed.component.ForkRenameText = 'New name';
            expect(await failed.component.SaveForkRename()).toBe(false);
            expect(notify).toHaveBeenCalledWith('Could not rename the fork', 'error', 3000);
            expect(failed.refresh).not.toHaveBeenCalled();

            notify.mockClear();
            const thrown = createHarness({ view: FORK_A });
            (thrown.open['Provider'] as { GetEntityObject: ReturnType<typeof vi.fn> }).GetEntityObject.mockRejectedValue(new Error('offline'));
            thrown.component.StartForkRename();
            thrown.component.ForkRenameText = 'New name';
            expect(await thrown.component.SaveForkRename()).toBe(false);
            expect(notify).toHaveBeenCalledWith('Could not rename the fork', 'error', 3000);
        });

        it('closes the name field when the view changes', async () => {
            const h = createHarness({ view: FORK_A });
            h.component.StartForkRename();
            await h.component.BackToMain();
            expect(h.component.IsRenamingFork).toBe(false);
        });
    });

    describe('AI name', () => {
        let create: MockInstance<ConversationEngine['CreateFork']>;

        beforeEach(() => {
            create = vi.spyOn(ConversationEngine.Instance, 'CreateFork').mockResolvedValue({ ID: 'FORK-NEW', ConversationID: 'CONV-1' } as MJConversationBranchEntity);
        });

        /** Lets the background naming chain finish. */
        const settle = () => new Promise(resolve => setTimeout(resolve, 0));

        it("names a draft's fork from the first message sent into it, once, then refreshes the summaries", async () => {
            const h = createHarness({ view: DRAFT_UNDER_A });
            const resolve = h.open['resolveComposerBranch'] as () => Promise<string | null | undefined>;
            expect(await resolve.call(h.component)).toBe('FORK-NEW');
            h.refresh.mockClear();
            const nameFirst = h.open['nameForkFromFirstSend'] as (m: MJConversationDetailEntity) => void;
            const sent = { ID: 'D-20', ConversationID: 'CONV-1', BranchID: 'FORK-NEW', Role: 'User', Message: 'Only @{"id":"A1","name":"Sage"} annual plans' } as MJConversationDetailEntity;

            nameFirst.call(h.component, { ...sent, Role: 'AI' } as MJConversationDetailEntity);
            nameFirst.call(h.component, sent);
            nameFirst.call(h.component, sent);
            await settle();

            expect(create).toHaveBeenCalledOnce();
            expect(naming.GenerateAndApplyForkName).toHaveBeenCalledOnce();
            expect(naming.GenerateAndApplyForkName.mock.calls[0][0]).toMatchObject({ ForkId: 'FORK-NEW', MessageText: 'Only @Sage annual plans' });
            expect(h.refresh).toHaveBeenCalledOnce();
        });

        it('names an Edit fork from the edited text after it is sent', async () => {
            const h = createHarness();
            const input = { SendMessageWithText: vi.fn(async () => true) };
            Object.assign(h.open, {
                composerReadyForResend: () => input,
                editForkPointOrNotify: async () => ({ ParentBranchID: null, ForkFromSequence: 2 }),
            });
            Object.defineProperty(h.component, 'CanFork', { get: () => true, configurable: true });

            await h.component.OnEditResendRequested({ Message: { ID: 'D-3', ConversationID: 'CONV-1' } as MJConversationDetailEntity, NewText: 'Make it quarterly' });
            await settle();

            expect(create.mock.calls[0][0].Kind).toBe('Edit');
            expect(naming.GenerateAndApplyForkName).toHaveBeenCalledOnce();
            expect(naming.GenerateAndApplyForkName.mock.calls[0][0]).toMatchObject({ ForkId: 'FORK-NEW', MessageText: 'Make it quarterly' });
        });

        it('does not name a Regenerate fork', async () => {
            const h = createHarness();
            const user = { ID: 'D-3', ConversationID: 'CONV-1', BranchID: null, Sequence: 3, Role: 'User' } as MJConversationDetailEntity;
            const answer = { ID: 'D-4', ConversationID: 'CONV-1', BranchID: null, Sequence: 4, Role: 'AI' } as MJConversationDetailEntity;
            Object.assign(h.open, {
                messages: [user, answer],
                composerReadyForResend: () => ({ RerunAgentForMessage: vi.fn(async () => true) }),
                findUserMessageBefore: () => user,
            });
            Object.defineProperty(h.component, 'CanFork', { get: () => true, configurable: true });

            await h.component.OnRegenerateRequested(answer);
            await settle();

            expect(create.mock.calls[0][0].Kind).toBe('Regenerate');
            expect(naming.GenerateAndApplyForkName).not.toHaveBeenCalled();
        });

        it('names nothing when AutoNameConversation is off, and refreshes nothing when no name was saved', async () => {
            const off = createHarness({ autoName: false });
            const nameOff = off.open['nameForkInBackground'] as (c: string, f: string, m: string) => void;
            nameOff.call(off.component, 'CONV-1', 'FORK-NEW', 'hello');
            expect(naming.GenerateAndApplyForkName).not.toHaveBeenCalled();

            naming.GenerateAndApplyForkName.mockResolvedValue(null);
            const kept = createHarness();
            const nameKept = kept.open['nameForkInBackground'] as (c: string, f: string, m: string) => void;
            nameKept.call(kept.component, 'CONV-1', 'FORK-NEW', 'hello');
            await settle();
            expect(naming.GenerateAndApplyForkName).toHaveBeenCalledOnce();
            expect(kept.refresh).not.toHaveBeenCalled();
        });
    });
});
