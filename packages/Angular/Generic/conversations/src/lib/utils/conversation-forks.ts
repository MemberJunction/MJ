import { IsForkingSettingOn, MAX_BRANCH_DEPTH, type ConversationBranchRow, type ForkKind, type ForkParticipant, type ForkSummary } from '@memberjunction/core-entities';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';

/** Main: the conversation's trunk, shared by everyone. */
export interface MainOpenView {
    readonly Kind: 'Main';
}

/** One fork, shown in the full view. */
export interface ForkOpenView {
    readonly Kind: 'Fork';
    readonly BranchID: string;
}

/**
 * A new fork that replaces a message (Fork from here): shown like a fork, created on the first send.
 * It starts at the row before the replaced message on its path (the anchor).
 */
export interface DraftForkOpenView {
    readonly Kind: 'DraftFork';
    /** The branch of the anchor; null is Main. */
    readonly ParentBranchID: string | null;
    /** The Sequence of the anchor; null when the replaced message is the first one (nothing is inherited). */
    readonly ForkFromSequence: number | null;
    /** The anchor; null when there is none. */
    readonly AnchorDetailID: string | null;
    /** The replaced message; the new fork's SourceDetailID, so its chip shows under that message. */
    readonly SourceDetailID: string;
    /** The author of the replaced message, read as the draft opens: the draft's window ends before that message. */
    readonly SourceAuthorName?: string | null;
}

/** What one person is looking at in a conversation. In memory only; opening a conversation shows Main. */
export type ConversationOpenView = MainOpenView | ForkOpenView | DraftForkOpenView;

/** The Main view. */
export const MAIN_OPEN_VIEW: MainOpenView = { Kind: 'Main' };

/**
 * True when two views show the same thing. Fork ids, and the replaced messages of two drafts, are
 * compared without regard to case.
 */
export function SameOpenView(a: ConversationOpenView, b: ConversationOpenView): boolean {
    if (a.Kind === 'Fork' && b.Kind === 'Fork') {
        return UUIDsEqual(a.BranchID, b.BranchID);
    }
    if (a.Kind === 'DraftFork' && b.Kind === 'DraftFork') {
        return UUIDsEqual(a.SourceDetailID, b.SourceDetailID);
    }
    return a.Kind === b.Kind;
}

/**
 * The branch whose path the view reads: null for Main, the fork for a fork. A draft reads its
 * parent's path.
 */
export function ReadBranchIdOf(view: ConversationOpenView): string | null {
    switch (view.Kind) {
        case 'Fork':
            return view.BranchID;
        case 'DraftFork':
            return view.ParentBranchID;
        default:
            return null;
    }
}

/**
 * True when a new row belongs on screen in the view: a Main row in Main, a row of the fork in that
 * fork. A draft has no rows of its own, so no new row belongs in it.
 */
export function IsRowInOpenView(view: ConversationOpenView, row: { BranchID?: string | null }): boolean {
    switch (view.Kind) {
        case 'Fork':
            return UUIDsEqual(row.BranchID ?? null, view.BranchID);
        case 'DraftFork':
            return false;
        default:
            return row.BranchID == null;
    }
}

/** The fields of a fork row the breadcrumb and the back button read. */
export type ForkChainRow = Pick<ConversationBranchRow, 'ID' | 'ParentBranchID'>;

/**
 * The fork one level up from a view; null is Main. A fork goes up to its ParentBranchID (Main when its
 * row is not in `rows`); a draft goes back to the fork it started from, its ParentBranchID.
 */
export function ParentForkIdOf(view: ConversationOpenView, rows: ReadonlyArray<ForkChainRow>): string | null {
    switch (view.Kind) {
        case 'Fork':
            return rows.find(r => UUIDsEqual(r.ID, view.BranchID))?.ParentBranchID ?? null;
        case 'DraftFork':
            return view.ParentBranchID;
        default:
            return null;
    }
}

/**
 * The fork ids of a fork's chain, from the fork under Main down to `branchId`, following ParentBranchID.
 * The chain stops at a fork whose row is not in `rows`, at a fork seen before, and at
 * {@link MAX_BRANCH_DEPTH} forks. Empty for null (Main).
 */
export function ForkChainOf(branchId: string | null, rows: ReadonlyArray<ForkChainRow>): string[] {
    const chain: string[] = [];
    const seen = new Set<string>();
    let id = branchId;
    while (id && !seen.has(NormalizeUUID(id)) && chain.length < MAX_BRANCH_DEPTH) {
        seen.add(NormalizeUUID(id));
        chain.unshift(id);
        const current = id;
        id = rows.find(r => UUIDsEqual(r.ID, current))?.ParentBranchID ?? null;
    }
    return chain;
}

/** One crumb of the fork view's breadcrumb. */
export interface ForkBreadcrumb {
    /** The fork the crumb opens; null opens Main. Null on the crumb of a draft. */
    readonly BranchID: string | null;
    readonly Label: string;
    /** True for the last crumb: the view on screen, which opens nothing. */
    readonly IsCurrent: boolean;
}

/** The label of the last crumb of a draft fork. */
export const DRAFT_FORK_TITLE = 'New fork';

/**
 * The breadcrumb of a fork or draft view: the conversation (opens Main), each ancestor fork from the
 * one under Main down, then the open fork (a draft: "New fork"). Empty for Main.
 */
export function BuildForkBreadcrumbs(
    view: ConversationOpenView,
    conversationName: string,
    rows: ReadonlyArray<ForkChainRow>,
    forkLabel: (branchId: string) => string
): ForkBreadcrumb[] {
    if (view.Kind === 'Main') {
        return [];
    }
    const ancestors = view.Kind === 'Fork' ? ForkChainOf(view.BranchID, rows).slice(0, -1) : ForkChainOf(view.ParentBranchID, rows);
    const crumbs: ForkBreadcrumb[] = [{ BranchID: null, Label: conversationName, IsCurrent: false }];
    for (const id of ancestors) {
        crumbs.push({ BranchID: id, Label: forkLabel(id), IsCurrent: false });
    }
    crumbs.push(view.Kind === 'Fork'
        ? { BranchID: view.BranchID, Label: forkLabel(view.BranchID), IsCurrent: true }
        : { BranchID: null, Label: DRAFT_FORK_TITLE, IsCurrent: true });
    return crumbs;
}

/** The label of the fork view's back button: "Back to <parent fork>", or "Back to Main" with no parent. */
export function BackLabelOf(parentLabel: string | null): string {
    return parentLabel ? `Back to ${parentLabel}` : 'Back to Main';
}

/** One avatar on a fork chip. */
export interface ForkChipAvatar {
    readonly Kind: 'User' | 'Agent';
    readonly ID: string;
    /** The participant's name, for the tooltip. */
    readonly Label: string;
    /** Up to two initials, shown when there is no image and no icon. */
    readonly Initials: string;
    readonly ImageURL: string | null;
    readonly IconClass: string | null;
}

/** What a chip under a message shows for one fork placed there. */
export interface ForkChip {
    readonly BranchID: string;
    readonly Kind: ForkKind;
    readonly DisplayName: string;
    readonly MessageLabel: string;
    readonly ActivityLabel: string;
    readonly Avatars: ReadonlyArray<ForkChipAvatar>;
}

/** The chips of a message with no fork placed under it. */
export const EMPTY_FORK_CHIPS: readonly ForkChip[] = [];

/** The Font Awesome icon of a fork kind. */
export function ForkKindIcon(kind: ForkKind): string {
    switch (kind) {
        case 'Edit':
            return 'fa-solid fa-pen';
        case 'Regenerate':
            return 'fa-solid fa-rotate-left';
        default:
            return 'fa-solid fa-code-branch';
    }
}

/** "1 message", or "N messages". */
export function ForkMessageLabel(count: number): string {
    return count === 1 ? '1 message' : `${count} messages`;
}

/** The initials of a name (first and last word), upper case; "?" for no name. */
export function ForkInitials(name: string | null | undefined): string {
    const words = (name ?? '').trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) {
        return '?';
    }
    const last = words.length > 1 ? words[words.length - 1][0] : '';
    return `${words[0][0]}${last}`.toUpperCase();
}

/**
 * The last activity of a fork relative to `now`: "just now" under a minute, "N min ago" under an
 * hour, "N h ago" under a day, "yesterday", "N days ago" under a week, else the short date.
 */
export function FormatForkActivity(at: Date, now: Date): string {
    const minutes = Math.floor((now.getTime() - at.getTime()) / 60000);
    if (minutes < 1) {
        return 'just now';
    }
    if (minutes < 60) {
        return `${minutes} min ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours} h ago`;
    }
    const days = Math.floor(hours / 24);
    if (days === 1) {
        return 'yesterday';
    }
    if (days < 7) {
        return `${days} days ago`;
    }
    return at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * The chips of each placement message: one chip per fork whose PlacementDetailID is that message,
 * in the order of `summaries`. Keys are normalized detail ids; a fork with no placement has no chip.
 */
export function BuildForkChipMap(
    summaries: ReadonlyArray<ForkSummary>,
    avatarFor: (participant: ForkParticipant) => ForkChipAvatar,
    now: Date
): ReadonlyMap<string, readonly ForkChip[]> {
    const map = new Map<string, ForkChip[]>();
    for (const summary of summaries) {
        if (!summary.PlacementDetailID) {
            continue;
        }
        const chip: ForkChip = {
            BranchID: summary.Branch.ID,
            Kind: summary.Kind,
            DisplayName: summary.DisplayName,
            MessageLabel: ForkMessageLabel(summary.MessageCount),
            ActivityLabel: FormatForkActivity(summary.LastActivityAt, now),
            Avatars: summary.Participants.map(avatarFor),
        };
        const key = NormalizeUUID(summary.PlacementDetailID);
        const list = map.get(key);
        if (list) {
            list.push(chip);
        } else {
            map.set(key, [chip]);
        }
    }
    return map;
}

/** The composer placeholder in Main. */
export const MAIN_COMPOSER_PLACEHOLDER = 'Type a message... (Ctrl+Enter to send)';

/** The composer placeholder in a fork or draft view. */
export const FORK_COMPOSER_PLACEHOLDER = 'Message this fork';

/** The loaded rows of a view, split by rail. */
export interface ForkRows<T> {
    /** Rows the view inherits: every loaded row that is not the fork's own; in a draft, the rows up to the anchor. */
    readonly Inherited: T[];
    /** The fork's own rows; in Main, every row. */
    readonly Own: T[];
}

/** Splits loaded rows for a view (see {@link ForkRows}). Keeps their order. */
export function SplitForkRows<T extends { BranchID?: string | null; Sequence: number }>(rows: readonly T[], view: ConversationOpenView): ForkRows<T> {
    if (view.Kind === 'Main') {
        return { Inherited: [], Own: [...rows] };
    }
    if (view.Kind === 'DraftFork') {
        const anchorSequence = view.ForkFromSequence;
        return { Inherited: anchorSequence == null ? [] : rows.filter(r => r.Sequence <= anchorSequence), Own: [] };
    }
    const inherited: T[] = [];
    const own: T[] = [];
    for (const r of rows) {
        (UUIDsEqual(r.BranchID ?? null, view.BranchID) ? own : inherited).push(r);
    }
    return { Inherited: inherited, Own: own };
}

/** How the message list draws a fork or draft view. */
export interface ForkViewLayout {
    /** Normalized ids of the inherited rows on screen; every other row is an own row. */
    readonly InheritedIDs: ReadonlySet<string>;
    /** The row the fork marker shows under: the last inherited row on screen; null when none is. */
    readonly MarkerDetailID: string | null;
    readonly MarkerText: string | null;
}

/** The layout of `displayRows` in a fork or draft view; null in Main. */
export function BuildForkViewLayout<T extends { ID: string; BranchID?: string | null; Sequence: number }>(
    displayRows: readonly T[],
    view: ConversationOpenView,
    markerText: string | null
): ForkViewLayout | null {
    if (view.Kind === 'Main') {
        return null;
    }
    const inherited = SplitForkRows(displayRows, view).Inherited;
    const last = inherited.length > 0 ? inherited[inherited.length - 1] : null;
    return {
        InheritedIDs: new Set(inherited.map(r => NormalizeUUID(r.ID))),
        MarkerDetailID: last ? last.ID : null,
        MarkerText: last ? markerText : null,
    };
}

/**
 * The fork marker: "<person> forked from <author>'s message · <time>" ("Someone" with no person; the
 * "from" part only with an author; the time only when known). A draft: "New fork from <author>'s
 * message". `AnchorAuthorName` is the author the "from" part names: the source message's author for a
 * fork with a source, else the anchor's.
 */
export function BuildForkMarkerText(
    input: { IsDraft: boolean; StarterName: string | null; AnchorAuthorName: string | null; StartedAt: Date | null },
    formatTime: (d: Date) => string
): string {
    const from = input.AnchorAuthorName ? ` from ${input.AnchorAuthorName}'s message` : '';
    if (input.IsDraft) {
        return `New fork${from}`;
    }
    const time = input.StartedAt ? ` · ${formatTime(input.StartedAt)}` : '';
    return `${input.StarterName ?? 'Someone'} forked${from}${time}`;
}

/** The composer hint of a fork or draft view. */
export function BuildForkComposerHint(anchorAt: Date | null, formatTime: (d: Date) => string): string {
    return anchorAt
        ? `Agents see the conversation up to ${formatTime(anchorAt)}, plus this fork`
        : 'Agents see only this fork';
}

/** The filters of the forks list: every fork, or the forks the person started or wrote in. */
export type ForkListFilter = 'All' | 'Mine';

/** One row of the forks list. */
export interface ForkListRow {
    readonly Summary: ForkSummary;
    /** Nesting depth under the row's parent in the list; 0 for a root. */
    readonly Depth: number;
    readonly Icon: string;
    /** "<author>: <last message>", or the last message alone; null with no message. */
    readonly PreviewText: string | null;
    /** "<origin> · N messages · <time>". */
    readonly MetaText: string;
}

/** How the fork started, in words: "Forked by Priya", "Edit of Maya's message", "Regenerated by Jordan". */
export function ForkOriginText(summary: ForkSummary): string {
    const starter = summary.StartedByName ?? 'someone';
    switch (summary.Kind) {
        case 'Edit':
            return `Edit of ${starter}'s message`;
        case 'Regenerate':
            return `Regenerated by ${starter}`;
        default:
            return `Forked by ${starter}`;
    }
}

/**
 * The rows of the forks list: roots (no parent, or a parent the filter left out) newest activity
 * first, each followed by its nested forks (one level deeper), also newest first. 'Mine' keeps the
 * forks the person started or wrote in.
 */
export function BuildForkListRows(summaries: ReadonlyArray<ForkSummary>, filter: ForkListFilter, userId: string, now: Date): ForkListRow[] {
    const kept = filter === 'All'
        ? [...summaries]
        : summaries.filter(s => UUIDsEqual(s.StartedByUserID, userId) || s.AuthorUserIDs.some(id => UUIDsEqual(id, userId)));
    const keptIds = new Set(kept.map(s => NormalizeUUID(s.Branch.ID)));
    const newestFirst = (a: ForkSummary, b: ForkSummary) => b.LastActivityAt.getTime() - a.LastActivityAt.getTime();
    const children = new Map<string, ForkSummary[]>();
    const roots: ForkSummary[] = [];
    for (const summary of kept) {
        const parent = summary.ParentBranchID ? NormalizeUUID(summary.ParentBranchID) : null;
        if (parent && keptIds.has(parent)) {
            const list = children.get(parent);
            if (list) {
                list.push(summary);
            } else {
                children.set(parent, [summary]);
            }
        } else {
            roots.push(summary);
        }
    }
    const rows: ForkListRow[] = [];
    const visit = (summary: ForkSummary, depth: number): void => {
        const origin = ForkOriginText(summary);
        rows.push({
            Summary: summary,
            Depth: depth,
            Icon: ForkKindIcon(summary.Kind),
            PreviewText: summary.LastMessagePreview
                ? (summary.LastMessageAuthorName ? `${summary.LastMessageAuthorName}: ${summary.LastMessagePreview}` : summary.LastMessagePreview)
                : null,
            MetaText: `${origin} · ${ForkMessageLabel(summary.MessageCount)} · ${FormatForkActivity(summary.LastActivityAt, now)}`,
        });
        for (const child of (children.get(NormalizeUUID(summary.Branch.ID)) ?? []).sort(newestFirst)) {
            visit(child, depth + 1);
        }
    };
    for (const root of roots.sort(newestFirst)) {
        visit(root, 0);
    }
    return rows;
}

/** The inputs of {@link CanForkFrom}. */
export interface CanForkInput {
    /** The person holds the `Conversations: Fork` authorization. */
    readonly HoldsAuthorization: boolean;
    /** The stored value of the person's forking setting; undefined when there is none. */
    readonly SettingValue: string | null | undefined;
    /** The person may write to the conversation. */
    readonly MayWrite: boolean;
}

/** True when the person may start forks: the authorization, a forking setting that is not off, and write access. */
export function CanForkFrom(input: CanForkInput): boolean {
    return input.HoldsAuthorization && IsForkingSettingOn(input.SettingValue) && input.MayWrite;
}

/** The latest turn of a view, which in-place Edit and Regenerate may change when the person's forking is off. */
export interface LatestTurn {
    /** The view's last own User row. */
    readonly UserDetailID: string;
    /** The last row after it when that row is an AI row (the answer); null when the turn has no answer. */
    readonly AnswerDetailID: string | null;
}

/** The fields {@link FindLatestTurn} reads from a row. */
export interface TurnRow {
    readonly ID: string;
    readonly Role: string | null;
    readonly Sequence: number;
    readonly BranchID?: string | null;
    readonly AgentSessionID?: string | null;
    readonly ReplacedAt?: Date | string | null;
}

/** True when `row` is one of the view's own rows: a Main row in Main, a row of the fork in a fork view. */
function isOwnRowOf(view: ConversationOpenView, row: { BranchID?: string | null }): boolean {
    return view.Kind === 'Fork' ? UUIDsEqual(row.BranchID ?? null, view.BranchID) : view.Kind === 'Main' && row.BranchID == null;
}

/**
 * The latest turn of a view: its last User row and, when the last row after it is an AI row, that row.
 * Replaced rows are skipped. Null in a draft, with no User row, when the last User row is inherited (not
 * one of the view's own rows), and when it belongs to a voice session.
 */
export function FindLatestTurn<T extends TurnRow>(rows: readonly T[], view: ConversationOpenView): LatestTurn | null {
    if (view.Kind === 'DraftFork') {
        return null;
    }
    const live = rows.filter(r => r.ReplacedAt == null).sort((a, b) => a.Sequence - b.Sequence);
    let user: T | undefined;
    for (let i = live.length - 1; i >= 0; i--) {
        if (live[i].Role === 'User') {
            user = live[i];
            break;
        }
    }
    if (!user || user.AgentSessionID || !isOwnRowOf(view, user)) {
        return null;
    }
    const last = live[live.length - 1];
    const isAnswer = last !== user && last.Role === 'AI' && !last.AgentSessionID && UUIDsEqual(last.BranchID ?? null, user.BranchID ?? null);
    return { UserDetailID: user.ID, AnswerDetailID: isAnswer ? last.ID : null };
}

/**
 * The rows after `userMessage` on its branch, in Sequence order, without replaced rows: for the latest
 * User row, the rows of its answer (the reply and any delegated or status rows).
 */
export function TurnRowsAfter<T extends { Sequence: number; BranchID?: string | null; ReplacedAt?: Date | string | null }>(
    rows: readonly T[],
    userMessage: { Sequence: number; BranchID?: string | null }
): T[] {
    return rows
        .filter(r => r.Sequence > userMessage.Sequence && r.ReplacedAt == null && UUIDsEqual(r.BranchID ?? null, userMessage.BranchID ?? null))
        .sort((a, b) => a.Sequence - b.Sequence);
}

/**
 * True when hiding `rows` (rows of branch `branchId`; null is Main) would change a fork: a fork of that
 * branch whose fork point is at or after the first of them (it inherits them), or a fork placed under one
 * of them (its SourceDetailID). False for no rows.
 */
export function ForkDependsOnRows(
    branchId: string | null,
    rows: ReadonlyArray<{ ID: string; Sequence: number }>,
    branches: ReadonlyArray<Pick<ConversationBranchRow, 'ParentBranchID' | 'ForkFromSequence' | 'SourceDetailID'>>
): boolean {
    if (rows.length === 0) {
        return false;
    }
    const first = Math.min(...rows.map(r => r.Sequence));
    return branches.some(b =>
        (b.ForkFromSequence != null && b.ForkFromSequence >= first && UUIDsEqual(b.ParentBranchID ?? null, branchId))
        || (b.SourceDetailID != null && rows.some(r => UUIDsEqual(r.ID, b.SourceDetailID))));
}
