import { ConversationEngine, type BranchAlternative, type ConversationBranchRow } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

/** What the `< i / n >` control on a message shows. */
export interface BranchSwitcherState {
    Alternatives: BranchAlternative[];
    CurrentIndex: number;
}

/** A click on the switcher: show `BranchID` (null = trunk) instead of the path through `DetailID`. */
export interface BranchSwitchRequest {
    DetailID: string;
    BranchID: string | null;
}

type PathRow = { ID: string; Sequence: number; BranchID?: string | null };
type Predecessor = { Sequence: number; BranchID: string | null };

/**
 * The row before `detailId` on the loaded path. Null when the row is the first message;
 * undefined when it is the first LOADED row but older rows exist, so the predecessor is unknown.
 */
export function FindPredecessorOnPath(rows: ReadonlyArray<PathRow>, detailId: string, hasMoreAbove: boolean): Predecessor | null | undefined {
    const sorted = [...rows].sort((a, b) => a.Sequence - b.Sequence);
    const index = sorted.findIndex(r => UUIDsEqual(r.ID, detailId));
    if (index < 0) {
        return undefined;
    }
    if (index === 0) {
        return hasMoreAbove ? undefined : null;
    }
    const prev = sorted[index - 1];
    return { Sequence: prev.Sequence, BranchID: prev.BranchID ?? null };
}

/**
 * Switcher state for every row of a loaded window that sits right after a fork point.
 * Rows with a single alternative get no entry.
 */
export function BuildBranchSwitcherMap(
    rows: ReadonlyArray<PathRow>,
    currentBranchId: string | null,
    branches: ReadonlyArray<ConversationBranchRow>,
    hasMoreAbove: boolean
): Map<string, BranchSwitcherState> {
    const map = new Map<string, BranchSwitcherState>();
    if (branches.length === 0) {
        return map;
    }
    const chain = ConversationEngine.BuildBranchChain(branches, currentBranchId);
    const sorted = [...rows].sort((a, b) => a.Sequence - b.Sequence);
    sorted.forEach((row, index) => {
        if (index === 0 && hasMoreAbove) {
            return;
        }
        const prev = index === 0 ? null : sorted[index - 1];
        const forkSequence = prev ? prev.Sequence : null;
        const parentBranchId = prev ? (prev.BranchID ?? null) : null;
        const alternatives = ConversationEngine.GetAlternativesAt(forkSequence, parentBranchId, branches);
        if (alternatives.length < 2) {
            return;
        }
        const active = ConversationEngine.ActiveAlternativeAt(forkSequence, parentBranchId, chain);
        const currentIndex = Math.max(0, alternatives.findIndex(a => (a.BranchID == null && active == null) || (a.BranchID != null && active != null && UUIDsEqual(a.BranchID, active))));
        map.set(row.ID, { Alternatives: alternatives, CurrentIndex: currentIndex });
    });
    return map;
}

/** True when deleting the row would remove a message some branch still shares. */
export function IsForkPointOrEarlier(sequence: number, branches: ReadonlyArray<ConversationBranchRow>): boolean {
    return branches.some(b => b.ForkFromSequence != null && b.ForkFromSequence >= sequence);
}
