import { Injectable } from '@angular/core';
import { ConversationEngine, type ConversationBranchRow, type ConversationScope } from '@memberjunction/core-entities';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';

/** Branch rows registered for one conversation, with the object that registered them. */
interface RegisteredBranches {
    Owner: object;
    Branches: ReadonlyArray<ConversationBranchRow>;
}

/**
 * Builds the {@link ConversationScope} for client reads of a conversation. The branch rows come
 * from the chat area, which registers them each time it loads them; nothing here reads the
 * database. Holds one list of branch rows per conversation, with the owner that registered it.
 * Several chat areas can show one conversation, so only the owner of the rows can clear them.
 */
@Injectable({ providedIn: 'root' })
export class ConversationScopeService {
    private readonly branchesByConversation = new Map<string, RegisteredBranches>();

    /**
     * Registers the branch rows an owner loaded for a conversation. Replaces the earlier rows and
     * makes `owner` their owner. Keeps its own copy of the list.
     */
    public SetBranches(conversationId: string, branches: ReadonlyArray<ConversationBranchRow>, owner: object): void {
        this.branchesByConversation.set(NormalizeUUID(conversationId), { Owner: owner, Branches: [...branches] });
    }

    /**
     * Removes a conversation's branch rows when `owner` (compared by identity) registered them.
     * Rows registered by another owner stay.
     */
    public ClearBranches(conversationId: string, owner: object): void {
        const key = NormalizeUUID(conversationId);
        if (this.branchesByConversation.get(key)?.Owner === owner) {
            this.branchesByConversation.delete(key);
        }
    }

    /**
     * The scope for a conversation from its loaded CurrentBranchID and registered branch rows; the
     * trunk when CurrentBranchID is null or empty. Ids are compared without regard to case.
     * @throws when `currentBranchId` is not one of the rows registered for the conversation.
     */
    public ForConversation(conversationId: string, currentBranchId: string | null): ConversationScope {
        if (currentBranchId == null || currentBranchId.trim().length === 0) {
            return ConversationEngine.TrunkScope(conversationId);
        }
        const branches = this.branchesByConversation.get(NormalizeUUID(conversationId))?.Branches ?? [];
        const branch = branches.find(b => UUIDsEqual(b.ID, currentBranchId));
        if (!branch) {
            throw new Error(`Branch ${currentBranchId} is not registered for conversation ${conversationId}`);
        }
        return { ConversationID: conversationId, BranchID: branch.ID, Branches: branches };
    }

    /**
     * True when a row is on the conversation's current branch path: the current branch's own
     * rows and each ancestor's rows up to its fork point. When the rows of the current branch are
     * not registered, or its registered ancestor chain is broken, compares the row's branch with
     * the current branch instead (null is the trunk). Ids are compared without regard to case.
     * Never throws, so change detection can call it.
     */
    public IsOnCurrentPath(
        conversationId: string,
        currentBranchId: string | null,
        row: { BranchID: string | null; Sequence: number }
    ): boolean {
        try {
            const scope: ConversationScope = this.ForConversation(conversationId, currentBranchId);
            return ConversationEngine.IsInScope(scope, row);
        } catch {
            return UUIDsEqual(row.BranchID, currentBranchId);
        }
    }
}
