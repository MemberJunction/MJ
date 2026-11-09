import {
    BaseEntity,
    BaseEntityResult,
    EntitySaveOptions,
    IMetadataProvider,
    Metadata,
    ValidationResult,
} from '@memberjunction/core';
import {
    BUILT_IN_COMMENT_TYPE_IDS,
    BUILT_IN_CONVERSATION_TYPE_IDS,
    COMMENT_TYPE_CODES,
    CONVERSATION_TYPE_CODES,
    ConversationEngine,
    MJCommentEntity,
    MJFieldSuggestionEntity,
} from '@memberjunction/core-entities';
import { MJGlobal, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    CommentTypeDriver,
    FieldSuggestionCommentDriver,
} from './ConversationAndCommentDrivers';

/**
 * Server-side `MJ: Field Suggestions` entity subclass.
 *
 * Coordinates the 2-level IS-A chain (`FieldSuggestion -> Comment -> Conversation`) with
 * {@link CommentTypeDriver} (`FieldSuggestionCommentDriver`):
 * - Stamps `TypeID = COMMENT`, `CommentTypeID = FIELD_SUGGESTION`, and `AnchorType = 'Field'`
 *   on new records when omitted.
 * - Routes `Outcome` transitions (`null -> 'Accepted'`, `null -> 'Rejected'`, `null -> 'Superseded'`)
 *   through the configured `CommentTypeDriver` BEFORE `super.Save(options)` so mutations to
 *   inherited `Conversation` fields (`IsResolved`, `ResolvedByUserID`, `ResolvedAt`) flush in
 *   the same atomic IS-A chain transaction, and any target-record permission/validation failure
 *   aborts cleanly before persisting `Outcome`.
 * - Supersedes older pending suggestions on the same `(LinkedEntityID, LinkedRecordID, AnchorKey)`
 *   after a new pending suggestion commits.
 */
@RegisterClass(BaseEntity, 'MJ: Field Suggestions')
export class MJFieldSuggestionEntityServer extends MJFieldSuggestionEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        const driver = this.resolveCommentTypeDriverSync();
        if (driver?.Validate) {
            const maybePromise = driver.Validate(this, result, this.ContextCurrentUser ?? null);
            if (maybePromise instanceof Promise) {
                maybePromise.catch(() => undefined);
            }
        }
        return result;
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const wasNew = !this.IsSaved;

        if (!this.TypeID) {
            this.TypeID =
                ConversationEngine.Instance.ResolveConversationTypeID(CONVERSATION_TYPE_CODES.COMMENT) ??
                BUILT_IN_CONVERSATION_TYPE_IDS.COMMENT;
        }
        const fieldSuggestionTypeId =
            ConversationEngine.Instance.ResolveCommentTypeID(COMMENT_TYPE_CODES.FIELD_SUGGESTION) ??
            BUILT_IN_COMMENT_TYPE_IDS.FIELD_SUGGESTION;
        if (!this.CommentTypeID || UUIDsEqual(this.CommentTypeID, BUILT_IN_COMMENT_TYPE_IDS.COMMENT)) {
            this.CommentTypeID = fieldSuggestionTypeId;
        }
        if (!this.AnchorType) {
            this.AnchorType = 'Field';
        }
        this.normalizeAnchorKeyToCanonicalFieldName();

        const provider =
            (this.ProviderToUse as unknown as IMetadataProvider | null) ?? Metadata.Provider;
        const contextUser = this.ContextCurrentUser ?? provider?.CurrentUser ?? null;
        const driver = await this.resolveCommentTypeDriver();

        // Inspect Outcome transition before super.Save() so OnAccept / OnReject can validate
        // permissions, apply target-record writes, and stamp IsResolved/ResolvedByUserID/ResolvedAt
        // onto the parent Conversation before the IS-A chain writes.
        const outcomeField = this.GetFieldByName('Outcome');
        const prevOutcome = (wasNew ? null : outcomeField?.OldValue ?? null) as MJFieldSuggestionEntity['Outcome'];
        const nextOutcome = this.Outcome;

        if (!wasNew && prevOutcome !== null && prevOutcome !== nextOutcome) {
            this.recordSaveDenied(
                `Field suggestion Outcome is already '${prevOutcome}' and cannot be changed to '${nextOutcome ?? 'null'}'.`
            );
            return false;
        }

        if (prevOutcome !== nextOutcome && nextOutcome !== null && !options?.ReplayOnly) {
            const commentParent =
                this.ISAParent && this.ISAParent.EntityInfo?.Name === 'MJ: Comments'
                    ? (this.ISAParent as MJCommentEntity)
                    : null;
            try {
                if (nextOutcome === 'Accepted') {
                    await driver.OnAccept({
                        Provider: provider,
                        ContextUser: contextUser,
                        Comment: commentParent,
                        ExtensionEntity: this,
                    });
                } else if (nextOutcome === 'Rejected') {
                    await driver.OnReject({
                        Provider: provider,
                        ContextUser: contextUser,
                        Comment: commentParent,
                        ExtensionEntity: this,
                    });
                } else if (nextOutcome === 'Superseded') {
                    this.IsResolved = true;
                    if (!this.ResolvedByUserID && contextUser?.ID) {
                        this.ResolvedByUserID = contextUser.ID;
                    }
                    if (!this.ResolvedAt) {
                        this.ResolvedAt = new Date();
                    }
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                this.recordSaveDenied(message);
                return false;
            }
        }

        const saved = await super.Save(options);
        if (!saved) {
            return false;
        }

        if (wasNew && this.Outcome === null && !options?.ReplayOnly && driver instanceof FieldSuggestionCommentDriver) {
            await driver.SupersedeOlderPendingSuggestions(provider, this, contextUser);
        }

        return true;
    }

    private normalizeAnchorKeyToCanonicalFieldName(): void {
        const rawKey = this.AnchorKey?.trim();
        if (!rawKey || !this.LinkedEntityID) {
            return;
        }
        const provider =
            (this.ProviderToUse as unknown as IMetadataProvider | null) ?? Metadata.Provider;
        const targetEntityInfo =
            (typeof provider?.EntityByID === 'function'
                ? provider.EntityByID(this.LinkedEntityID)
                : undefined) ??
            provider?.Entities?.find((e) => UUIDsEqual(e.ID, this.LinkedEntityID)) ??
            null;
        if (!targetEntityInfo) {
            return;
        }
        const matched = targetEntityInfo.Fields.find(
            (f) => f.Name.toLowerCase() === rawKey.toLowerCase()
        );
        if (matched && matched.Name !== this.AnchorKey) {
            this.AnchorKey = matched.Name;
        }
    }

    private resolveCommentTypeDriverSync(): CommentTypeDriver {
        const commentType = this.CommentTypeID
            ? ConversationEngine.Instance.CommentTypeByID(this.CommentTypeID)
            : undefined;
        const driverClassName = commentType?.DriverClass?.trim() || 'FieldSuggestionCommentDriver';
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<CommentTypeDriver>(
            CommentTypeDriver,
            driverClassName
        );
        return instance ?? new FieldSuggestionCommentDriver();
    }

    private async resolveCommentTypeDriver(): Promise<CommentTypeDriver> {
        if (this.ISAParent && typeof this.ISAParent.ResolveSubtypeDriver === 'function') {
            const parentDriver = await this.ISAParent.ResolveSubtypeDriver();
            if (parentDriver instanceof CommentTypeDriver) {
                return parentDriver;
            }
        }
        return this.resolveCommentTypeDriverSync();
    }

    private recordSaveDenied(message: string): void {
        const entry = new BaseEntityResult();
        entry.Success = false;
        entry.Type = this.IsSaved ? 'update' : 'create';
        entry.Message = message;
        entry.StartedAt = new Date();
        entry.EndedAt = new Date();
        this.RegisterResultHistoryEntry(entry);
    }
}
