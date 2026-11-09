import {
    BaseEntity,
    BaseEntityResult,
    EntityDeleteOptions,
    EntitySaveOptions,
    IMetadataProvider,
    LogError,
    Metadata,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
    WellKnownUserSource,
} from '@memberjunction/core';
import {
    BUILT_IN_COMMENT_TYPE_IDS,
    BUILT_IN_CONVERSATION_TYPE_IDS,
    COMMENT_TYPE_CODES,
    CONVERSATION_TYPE_CODES,
    ConversationEngine,
    MJCommentEntity,
} from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';

/**
 * Server-side `MJ: Comments` entity subclass.
 *
 * Ensures every saved `Comment` stamps `Conversation.TypeID` to `'COMMENT'` and defaults
 * `CommentTypeID` to plain `'COMMENT'` when omitted, and enforces both:
 * 1. `CommentType.AllowedAnchorTypes` (JSON array of permitted `AnchorType` values when populated).
 * 2. `EntityInfo.IsCommentTypeAllowed(commentType.Code, commentType.Name)` on the linked entity
 *    when creating a new comment.
 */
@RegisterClass(BaseEntity, 'MJ: Comments')
export class MJCommentEntityServer extends MJCommentEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.validateCommentTypeConstraints(result);
        return result;
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (!this.TypeID || (!this.IsSaved && UUIDsEqual(this.TypeID, BUILT_IN_CONVERSATION_TYPE_IDS.CHAT))) {
            this.TypeID =
                ConversationEngine.Instance.ResolveConversationTypeID(CONVERSATION_TYPE_CODES.COMMENT) ??
                BUILT_IN_CONVERSATION_TYPE_IDS.COMMENT;
        }
        if (!this.CommentTypeID) {
            this.CommentTypeID =
                ConversationEngine.Instance.ResolveCommentTypeID(COMMENT_TYPE_CODES.COMMENT) ??
                BUILT_IN_COMMENT_TYPE_IDS.COMMENT;
        }

        const validation = new ValidationResult();
        validation.Success = true;
        this.validateCommentTypeConstraints(validation);
        if (!validation.Success) {
            const message = validation.Errors.map((e) => e.Message).join('; ');
            this.recordSaveDenied(message, validation.Errors);
            return false;
        }

        return super.Save(options);
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        if (!options?.ReplayOnly) {
            const provider =
                (this.ProviderToUse as unknown as IMetadataProvider | null) ?? Metadata.Provider;
            const contextUser = this.ContextCurrentUser ?? provider?.CurrentUser ?? null;
            const isSystemOrOwner =
                WellKnownUserSource.Instance.IsSystemUser(contextUser) || contextUser?.Type === 'Owner';
            const isAuthor = Boolean(contextUser && this.UserID && UUIDsEqual(contextUser.ID, this.UserID));
            if (!isSystemOrOwner && this.UserID && !isAuthor) {
                const entry = new BaseEntityResult();
                entry.Success = false;
                entry.Type = 'delete';
                entry.Message = 'Only the comment author or a system administrator may delete a comment.';
                entry.StartedAt = new Date();
                entry.EndedAt = new Date();
                this.RegisterResultHistoryEntry(entry);
                return false;
            }
        }
        return super.Delete(options);
    }

    private validateCommentTypeConstraints(result: ValidationResult): void {
        const commentTypeId = this.CommentTypeID;
        if (!commentTypeId) {
            return;
        }

        const commentType = ConversationEngine.Instance.CommentTypeByID(commentTypeId);
        const code =
            commentType?.Code ??
            (UUIDsEqual(commentTypeId, BUILT_IN_COMMENT_TYPE_IDS.FIELD_SUGGESTION)
                ? COMMENT_TYPE_CODES.FIELD_SUGGESTION
                : UUIDsEqual(commentTypeId, BUILT_IN_COMMENT_TYPE_IDS.COMMENT)
                  ? COMMENT_TYPE_CODES.COMMENT
                  : null);
        const name = commentType?.Name ?? null;

        // 1. Enforce AllowedAnchorTypes JSON array when declared on CommentType (or built-in FIELD_SUGGESTION)
        const rawAllowedAnchors =
            commentType?.AllowedAnchorTypes ??
            (code === COMMENT_TYPE_CODES.FIELD_SUGGESTION ? '["Field"]' : null);
        if (rawAllowedAnchors) {
            type ParsedJsonValue = string | number | boolean | null | ParsedJsonValue[] | { [key: string]: ParsedJsonValue };
            let parsed: ParsedJsonValue;
            try {
                parsed = JSON.parse(rawAllowedAnchors) as ParsedJsonValue;
            } catch (err) {
                const errText = err instanceof Error ? err.message : String(err);
                LogError(
                    `MJCommentEntityServer: malformed AllowedAnchorTypes JSON on CommentType '${
                        name ?? code ?? commentTypeId
                    }': ${errText}`
                );
                result.Success = false;
                result.Errors.push(
                    new ValidationErrorInfo(
                        'AnchorType',
                        `Comment type '${
                            name ?? code ?? commentTypeId
                        }' has malformed AllowedAnchorTypes configuration and cannot be saved until corrected.`,
                        rawAllowedAnchors,
                        ValidationErrorType.Failure
                    )
                );
                return;
            }

            if (!Array.isArray(parsed) || !parsed.every((v): v is string => typeof v === 'string')) {
                LogError(
                    `MJCommentEntityServer: AllowedAnchorTypes on CommentType '${
                        name ?? code ?? commentTypeId
                    }' must be a JSON array of strings.`
                );
                result.Success = false;
                result.Errors.push(
                    new ValidationErrorInfo(
                        'AnchorType',
                        `Comment type '${
                            name ?? code ?? commentTypeId
                        }' AllowedAnchorTypes must be a JSON array of strings.`,
                        rawAllowedAnchors,
                        ValidationErrorType.Failure
                    )
                );
                return;
            }

            if (parsed.length > 0) {
                const allowedLower = new Set(
                    parsed.map((v) => v.trim().toLowerCase())
                );
                const actualAnchor = (this.AnchorType ?? '').trim().toLowerCase();
                if (!actualAnchor || !allowedLower.has(actualAnchor)) {
                    result.Success = false;
                    result.Errors.push(
                        new ValidationErrorInfo(
                            'AnchorType',
                            `Comment type '${name ?? code ?? commentTypeId}' requires AnchorType in [${parsed.join(', ')}], got '${this.AnchorType ?? 'null'}'.`,
                            this.AnchorType,
                            ValidationErrorType.Failure
                        )
                    );
                }
            }
        }

        // 2. Enforce Entity.Configuration.Comments.AllowedCommentTypes on create
        if (!this.IsSaved && this.LinkedEntityID && code) {
            const provider = this.ProviderToUse as unknown as IMetadataProvider | null;
            const entityInfo =
                (typeof provider?.EntityByID === 'function'
                    ? provider.EntityByID(this.LinkedEntityID)
                    : undefined) ??
                provider?.Entities?.find((e) => UUIDsEqual(e.ID, this.LinkedEntityID)) ??
                null;
            if (entityInfo && !entityInfo.IsCommentTypeAllowed(code, name)) {
                result.Success = false;
                result.Errors.push(
                    new ValidationErrorInfo(
                        'CommentTypeID',
                        `Comment type '${name ?? code}' is not allowed on entity '${entityInfo.DisplayNameOrName}'.`,
                        commentTypeId,
                        ValidationErrorType.Failure
                    )
                );
            }
        }
    }

    private recordSaveDenied(message: string, errors: ValidationErrorInfo[] = []): void {
        const entry = new BaseEntityResult();
        entry.Success = false;
        entry.Type = this.IsSaved ? 'update' : 'create';
        entry.Message = message;
        entry.Errors = errors;
        entry.StartedAt = new Date();
        entry.EndedAt = new Date();
        this.RegisterResultHistoryEntry(entry);
    }
}
