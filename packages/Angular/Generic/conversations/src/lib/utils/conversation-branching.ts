import { type ConversationBranchRow } from '@memberjunction/core-entities';

/** True when deleting the row would remove a message some branch still shares. */
export function IsForkPointOrEarlier(sequence: number, branches: ReadonlyArray<ConversationBranchRow>): boolean {
    return branches.some(b => b.ForkFromSequence != null && b.ForkFromSequence >= sequence);
}
