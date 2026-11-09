import {
    BaseEntity,
    CompositeKey,
    EntityFieldInfo,
    EntityFieldTSType,
    EntityInfo,
    EntityPermissionType,
    EntitySubtypeDriverBase,
    IMetadataProvider,
    LogError,
    Metadata,
    RunView,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
    WellKnownUserSource,
} from '@memberjunction/core';
import {
    COMMENT_TYPE_CODES,
    MJCommentEntity,
    MJFieldSuggestionEntity,
    UserCanReadLinkedRecord,
} from '@memberjunction/core-entities';
import { EscapeSQLString, NormalizeUUID, RegisterClass, RequiresSubclass, UUIDsEqual } from '@memberjunction/global';

/**
 * Suggestion IDs currently mid-`OnAccept` target-record `Save()`, used by
 * `FieldSuggestionPostSaveHook` so accepting suggestion `S` does not mark `S` itself
 * as `'Superseded'` when `targetRecord.Save()` commits, while any *other* pending
 * suggestions for the same field still transition to `'Superseded'`.
 */
const IN_FLIGHT_ACCEPTED_SUGGESTION_IDS = new Set<string>();

/**
 * Suggestion IDs currently being marked `'Superseded'` to prevent re-entrant loops.
 */
const IN_FLIGHT_SUPERSEDING_SUGGESTION_IDS = new Set<string>();

export function IsSuggestionAcceptInFlight(suggestionId: string | null | undefined): boolean {
    if (!suggestionId) {
        return false;
    }
    return IN_FLIGHT_ACCEPTED_SUGGESTION_IDS.has(NormalizeUUID(suggestionId));
}

export function IsSuggestionSupersedeInFlight(suggestionId: string | null | undefined): boolean {
    if (!suggestionId) {
        return false;
    }
    return IN_FLIGHT_SUPERSEDING_SUGGESTION_IDS.has(NormalizeUUID(suggestionId));
}

/**
 * Context passed to {@link CommentTypeDriver.OnAccept} and {@link CommentTypeDriver.OnReject}.
 */
export interface CommentDispositionContext {
    Provider: IMetadataProvider;
    ContextUser: UserInfo | null;
    Comment: MJCommentEntity | null;
    ExtensionEntity: BaseEntity;
}

/**
 * Context passed to {@link CommentTypeDriver.OnRecordChanged} when a target record save
 * modifies one or more fields that may have pending comment-type extensions attached.
 */
export interface CommentRecordChangedContext {
    Provider: IMetadataProvider;
    ContextUser: UserInfo | null;
    TargetEntity: BaseEntity;
    ChangedFieldNames: ReadonlyArray<string>;
    PendingSuggestions: ReadonlyArray<MJFieldSuggestionEntity>;
}

/**
 * Base class for server-side behavior drivers attached to `MJ: Conversation Types.DriverClass`
 * via `MJ: Conversations.SubtypeSelector.Driver` (`BaseClass: "ConversationTypeDriver"`).
 */
@RequiresSubclass()
export abstract class ConversationTypeDriver extends EntitySubtypeDriverBase {}

/**
 * Base class for server-side behavior drivers attached to `MJ: Comment Types.DriverClass`
 * via `MJ: Comments.SubtypeSelector.Driver` (`BaseClass: "CommentTypeDriver"`).
 *
 * Extends {@link EntitySubtypeDriverBase} with typed lifecycle hooks for interactive
 * disposition (`OnAccept`, `OnReject`) and target-record mutations (`OnRecordChanged`).
 */
@RequiresSubclass()
export abstract class CommentTypeDriver extends EntitySubtypeDriverBase {
    public async OnAccept(_context: CommentDispositionContext): Promise<void> {
        // Default no-op for comment types that do not mutate target records on accept
    }

    public async OnReject(_context: CommentDispositionContext): Promise<void> {
        // Default no-op
    }

    public async OnRecordChanged(_context: CommentRecordChangedContext): Promise<void> {
        // Default no-op
    }
}

function resolveEntityInfoById(
    provider: IMetadataProvider | null | undefined,
    entityId: string | null | undefined
): EntityInfo | null {
    if (!provider || !entityId) {
        return null;
    }
    if (typeof provider.EntityByID === 'function') {
        const found = provider.EntityByID(entityId);
        if (found) {
            return found;
        }
    }
    return provider.Entities?.find((e) => UUIDsEqual(e.ID, entityId)) ?? null;
}

function buildCompositeKeyForLinkedRecord(
    entityInfo: EntityInfo,
    linkedRecordId: string
): CompositeKey | null {
    const raw = linkedRecordId.trim();
    if (!raw) {
        return null;
    }
    if (raw.includes('|')) {
        const ck = new CompositeKey();
        ck.LoadFromConcatenatedString(raw);
        if (ck.KeyValuePairs.length > 0 && ck.KeyValuePairs.every((kv) => kv.FieldName && kv.Value !== undefined)) {
            return ck;
        }
    }
    if (entityInfo.PrimaryKeys.length === 1) {
        const pkField = entityInfo.FirstPrimaryKey; // first-pk-ok: guarded by PrimaryKeys.length === 1
        const value: string | number =
            pkField.TSType === EntityFieldTSType.Number ? Number(raw) : raw;
        if (pkField.TSType === EntityFieldTSType.Number && !Number.isFinite(value)) {
            return null;
        }
        const ck = new CompositeKey();
        ck.KeyValuePairs = [{ FieldName: pkField.Name, Value: value }];
        return ck;
    }
    return null;
}

function coerceSuggestedValueForField(
    rawSuggestedValue: string | null,
    fieldInfo: EntityFieldInfo
): string | number | boolean | Date | null {
    if (rawSuggestedValue === null || rawSuggestedValue === undefined) {
        return null;
    }
    switch (fieldInfo.TSType) {
        case EntityFieldTSType.Boolean: {
            const normalized = rawSuggestedValue.trim().toLowerCase();
            if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
                return true;
            }
            if (normalized === 'false' || normalized === '0' || normalized === 'no') {
                return false;
            }
            throw new Error(
                `Invalid boolean SuggestedValue '${rawSuggestedValue}' for field '${fieldInfo.Name}'.`
            );
        }
        case EntityFieldTSType.Number: {
            const trimmed = rawSuggestedValue.trim();
            if (trimmed.length === 0) {
                return fieldInfo.AllowsNull ? null : NaN;
            }
            const parsed = Number(trimmed);
            if (!Number.isFinite(parsed)) {
                throw new Error(
                    `Invalid numeric SuggestedValue '${rawSuggestedValue}' for field '${fieldInfo.Name}'.`
                );
            }
            return parsed;
        }
        case EntityFieldTSType.Date: {
            const trimmed = rawSuggestedValue.trim();
            if (trimmed.length === 0 && fieldInfo.AllowsNull) {
                return null;
            }
            const parsed = new Date(trimmed);
            if (Number.isNaN(parsed.getTime())) {
                throw new Error(
                    `Invalid date SuggestedValue '${rawSuggestedValue}' for field '${fieldInfo.Name}'.`
                );
            }
            return parsed;
        }
        default:
            return rawSuggestedValue;
    }
}

function extractFieldSuggestionFromEntity(entity: BaseEntity): MJFieldSuggestionEntity | null {
    if (entity.EntityInfo?.Name === 'MJ: Field Suggestions') {
        return entity as MJFieldSuggestionEntity;
    }
    if (entity.ISAChild && entity.ISAChild.EntityInfo?.Name === 'MJ: Field Suggestions') {
        return entity.ISAChild as MJFieldSuggestionEntity;
    }
    return null;
}

/**
 * Built-in server driver for `MJ: Comment Types` code `'FIELD_SUGGESTION'`.
 *
 * Responsibilities:
 * 1. Validates that suggestions target a real field (`AnchorType === 'Field'`, valid `AnchorKey`)
 *    on an entity that has opted into `'FIELD_SUGGESTION'` via `Configuration.Comments.AllowedCommentTypes`.
 * 2. Enforces full entity `Update`, RLS, and FLS write permissions on `OnAccept` and `OnReject`.
 * 3. Applies `SuggestedValue` to the target record via a normal `targetRecord.Save()` as the
 *    accepting user on `OnAccept`, producing a standard `Record Changes` audit entry.
 * 4. Supersedes older pending suggestions when a newer pending suggestion is created for the same
 *    `(LinkedEntityID, LinkedRecordID, AnchorKey)` or when any save modifies the target field.
 */
@RegisterClass(CommentTypeDriver, 'FieldSuggestionCommentDriver')
export class FieldSuggestionCommentDriver extends CommentTypeDriver {
    public override Validate(
        entity: BaseEntity,
        result: ValidationResult,
        _contextUser: UserInfo | null
    ): void {
        const suggestion = extractFieldSuggestionFromEntity(entity);
        const anchorType = suggestion ? suggestion.AnchorType : (entity as MJCommentEntity).AnchorType;
        const anchorKey = (suggestion ? suggestion.AnchorKey : (entity as MJCommentEntity).AnchorKey)?.trim() ?? '';
        const linkedEntityId = suggestion ? suggestion.LinkedEntityID : (entity as MJCommentEntity).LinkedEntityID;

        if (anchorType !== 'Field') {
            result.Success = false;
            result.Errors.push(
                new ValidationErrorInfo(
                    'AnchorType',
                    "Field Suggestions must be anchored to a field (AnchorType = 'Field').",
                    anchorType,
                    ValidationErrorType.Failure
                )
            );
        }

        if (!anchorKey) {
            result.Success = false;
            result.Errors.push(
                new ValidationErrorInfo(
                    'AnchorKey',
                    'Field Suggestions require AnchorKey to specify the target EntityField.Name.',
                    anchorKey,
                    ValidationErrorType.Failure
                )
            );
        }

        const provider = (entity.ProviderToUse as unknown as IMetadataProvider | null) ?? Metadata.Provider;
        const targetEntityInfo = resolveEntityInfoById(provider, linkedEntityId);
        if (targetEntityInfo) {
            const isNew = suggestion ? !suggestion.IsSaved : !entity.IsSaved;
            if (
                isNew &&
                !targetEntityInfo.IsCommentTypeAllowed(
                    COMMENT_TYPE_CODES.FIELD_SUGGESTION,
                    'Field Suggestion'
                )
            ) {
                result.Success = false;
                result.Errors.push(
                    new ValidationErrorInfo(
                        'CommentTypeID',
                        `Field Suggestions are not enabled on entity '${targetEntityInfo.DisplayNameOrName}'. Add 'FIELD_SUGGESTION' to Configuration.Comments.AllowedCommentTypes to opt in.`,
                        COMMENT_TYPE_CODES.FIELD_SUGGESTION,
                        ValidationErrorType.Failure
                    )
                );
            }

            if (anchorKey) {
                const matchedField = targetEntityInfo.Fields.find(
                    (f) => f.Name.toLowerCase() === anchorKey.toLowerCase()
                );
                if (!matchedField) {
                    result.Success = false;
                    result.Errors.push(
                        new ValidationErrorInfo(
                            'AnchorKey',
                            `Field '${anchorKey}' does not exist on entity '${targetEntityInfo.DisplayNameOrName}'.`,
                            anchorKey,
                            ValidationErrorType.Failure
                        )
                    );
                }
            }
        }

        if (suggestion) {
            const conf = suggestion.Confidence;
            if (conf !== null && conf !== undefined && (conf < 0 || conf > 1)) {
                result.Success = false;
                result.Errors.push(
                    new ValidationErrorInfo(
                        'Confidence',
                        'Confidence must be between 0.0000 and 1.0000 when specified.',
                        conf,
                        ValidationErrorType.Failure
                    )
                );
            }
        }
    }

    public override async OnAccept(context: CommentDispositionContext): Promise<void> {
        const suggestion = context.ExtensionEntity as MJFieldSuggestionEntity;
        const provider = context.Provider;
        const user = context.ContextUser;
        if (!user) {
            throw new Error('Accepting a field suggestion requires an authenticated user context.');
        }

        const linkedEntityId = suggestion.LinkedEntityID;
        const linkedRecordId = suggestion.LinkedRecordID;
        const rawAnchorKey = suggestion.AnchorKey?.trim() ?? '';
        if (!linkedEntityId || !linkedRecordId || !rawAnchorKey) {
            throw new Error('Field suggestion is missing LinkedEntityID, LinkedRecordID, or AnchorKey.');
        }

        const targetEntityInfo = resolveEntityInfoById(provider, linkedEntityId);
        if (!targetEntityInfo) {
            throw new Error(`Target entity '${linkedEntityId}' was not found.`);
        }

        const isSystem = WellKnownUserSource.Instance.IsSystemUser(user);
        if (!targetEntityInfo.AllowUpdateAPI && !isSystem) {
            throw new Error(`Updates are disabled on entity '${targetEntityInfo.DisplayNameOrName}'.`);
        }
        if (!isSystem && !targetEntityInfo.CheckPermissions(user, EntityPermissionType.Update, false)) {
            throw new Error(
                `You do not have Update permission on '${targetEntityInfo.DisplayNameOrName}'.`
            );
        }

        const targetField = targetEntityInfo.Fields.find(
            (f) => f.Name.toLowerCase() === rawAnchorKey.toLowerCase()
        );
        if (!targetField) {
            throw new Error(
                `Target field '${rawAnchorKey}' does not exist on '${targetEntityInfo.DisplayNameOrName}'.`
            );
        }
        if (targetField.ReadOnly || !targetField.AllowUpdateAPI) {
            throw new Error(
                `Field '${targetField.DisplayNameOrName}' on '${targetEntityInfo.DisplayNameOrName}' is read-only and cannot be modified via a suggestion.`
            );
        }
        if (!isSystem && !targetEntityInfo.IsFieldUpdatableByUser(targetField.Name, user)) {
            throw new Error(
                `You do not have permission to update field '${targetField.DisplayNameOrName}'.`
            );
        }

        if (!isSystem && provider.ProviderType === 'Database') {
            const readAccess = await UserCanReadLinkedRecord(provider, user, linkedEntityId, linkedRecordId);
            if (!readAccess.Allowed) {
                throw new Error(readAccess.Reason ?? 'You do not have access to the target record.');
            }
        }

        const compositeKey = buildCompositeKeyForLinkedRecord(targetEntityInfo, linkedRecordId);
        if (!compositeKey) {
            throw new Error(
                `Unable to construct primary key from LinkedRecordID '${linkedRecordId}' for '${targetEntityInfo.Name}'.`
            );
        }

        const targetRecord = await provider.GetEntityObject<BaseEntity>(targetEntityInfo.Name, user);
        const loaded = await targetRecord.InnerLoad(compositeKey);
        if (!loaded) {
            throw new Error(
                `Target record '${linkedRecordId}' on '${targetEntityInfo.DisplayNameOrName}' could not be loaded or is not accessible.`
            );
        }

        const coercedValue = coerceSuggestedValueForField(suggestion.SuggestedValue, targetField);
        const recordField = targetRecord.GetFieldByName(targetField.Name);
        if (!recordField) {
            throw new Error(
                `Field '${targetField.Name}' was not found on loaded instance of '${targetEntityInfo.Name}'.`
            );
        }
        recordField.Value = coercedValue;

        const normSuggestionId = suggestion.ID ? NormalizeUUID(suggestion.ID) : '';
        if (normSuggestionId) {
            IN_FLIGHT_ACCEPTED_SUGGESTION_IDS.add(normSuggestionId);
        }
        try {
            const savedTarget = await targetRecord.Save();
            if (!savedTarget) {
                const detail =
                    targetRecord.LatestResult?.CompleteMessage ||
                    targetRecord.LatestResult?.Message ||
                    `Failed to save '${targetEntityInfo.DisplayNameOrName}' record while accepting field suggestion.`;
                throw new Error(detail);
            }
        } finally {
            if (normSuggestionId) {
                IN_FLIGHT_ACCEPTED_SUGGESTION_IDS.delete(normSuggestionId);
            }
        }

        suggestion.IsResolved = true;
        suggestion.ResolvedByUserID = user.ID;
        suggestion.ResolvedAt = new Date();
    }

    public override async OnReject(context: CommentDispositionContext): Promise<void> {
        const suggestion = context.ExtensionEntity as MJFieldSuggestionEntity;
        const provider = context.Provider;
        const user = context.ContextUser;
        if (!user) {
            throw new Error('Rejecting a field suggestion requires an authenticated user context.');
        }

        const linkedEntityId = suggestion.LinkedEntityID;
        const linkedRecordId = suggestion.LinkedRecordID;
        const rawAnchorKey = suggestion.AnchorKey?.trim() ?? '';
        const targetEntityInfo = resolveEntityInfoById(provider, linkedEntityId);

        const isSystem = WellKnownUserSource.Instance.IsSystemUser(user);
        if (targetEntityInfo && !isSystem) {
            if (!targetEntityInfo.AllowUpdateAPI) {
                throw new Error(`Updates are disabled on entity '${targetEntityInfo.DisplayNameOrName}'.`);
            }
            if (!targetEntityInfo.CheckPermissions(user, EntityPermissionType.Update, false)) {
                throw new Error(
                    `You do not have Update permission on '${targetEntityInfo.DisplayNameOrName}' to reject field suggestions.`
                );
            }
            if (rawAnchorKey) {
                const targetField = targetEntityInfo.Fields.find(
                    (f) => f.Name.toLowerCase() === rawAnchorKey.toLowerCase()
                );
                if (targetField && (targetField.ReadOnly || !targetField.AllowUpdateAPI)) {
                    throw new Error(
                        `Field '${targetField.DisplayNameOrName}' is read-only.`
                    );
                }
                if (!targetEntityInfo.IsFieldUpdatableByUser(rawAnchorKey, user)) {
                    throw new Error(
                        `You do not have permission to update field '${rawAnchorKey}' and cannot reject suggestions on it.`
                    );
                }
            }
            if (provider.ProviderType === 'Database' && linkedEntityId && linkedRecordId) {
                const readAccess = await UserCanReadLinkedRecord(
                    provider,
                    user,
                    linkedEntityId,
                    linkedRecordId
                );
                if (!readAccess.Allowed) {
                    throw new Error(readAccess.Reason ?? 'You do not have access to the target record.');
                }
            }
        }

        suggestion.IsResolved = true;
        suggestion.ResolvedByUserID = user.ID;
        suggestion.ResolvedAt = new Date();
    }

    public override async OnRecordChanged(context: CommentRecordChangedContext): Promise<void> {
        const { Provider, ContextUser, PendingSuggestions } = context;
        if (PendingSuggestions.length === 0) {
            return;
        }
        const actingUser =
            (await WellKnownUserSource.Instance.GetSystemUser(Provider)) ?? ContextUser ?? undefined;
        const resolvedByUserId = ContextUser?.ID ?? actingUser?.ID ?? null;
        const now = new Date();

        for (const pending of PendingSuggestions) {
            const normId = pending.ID ? NormalizeUUID(pending.ID) : '';
            if (
                !normId ||
                IsSuggestionAcceptInFlight(normId) ||
                IsSuggestionSupersedeInFlight(normId) ||
                pending.Outcome !== null
            ) {
                continue;
            }
            IN_FLIGHT_SUPERSEDING_SUGGESTION_IDS.add(normId);
            try {
                const entityToUpdate = await Provider.GetEntityObject<MJFieldSuggestionEntity>(
                    'MJ: Field Suggestions',
                    actingUser
                );
                const loaded = await entityToUpdate.Load(pending.ID);
                if (!loaded || entityToUpdate.Outcome !== null) {
                    continue;
                }
                entityToUpdate.Outcome = 'Superseded';
                entityToUpdate.IsResolved = true;
                entityToUpdate.ResolvedByUserID = resolvedByUserId;
                entityToUpdate.ResolvedAt = now;
                const saved = await entityToUpdate.Save();
                if (!saved) {
                    LogError(
                        `FieldSuggestionCommentDriver.OnRecordChanged failed to supersede suggestion ${pending.ID}: ${
                            entityToUpdate.LatestResult?.CompleteMessage ?? 'unknown error'
                        }`
                    );
                }
            } catch (err) {
                LogError(
                    `FieldSuggestionCommentDriver.OnRecordChanged error superseding ${pending.ID}: ${
                        err instanceof Error ? err.message : String(err)
                    }`
                );
            } finally {
                IN_FLIGHT_SUPERSEDING_SUGGESTION_IDS.delete(normId);
            }
        }
    }

    /**
     * Marks any older pending (`Outcome IS NULL`) `MJ: Field Suggestions` rows on the same
     * `(linkedEntityId, linkedRecordId, anchorKey)` (and any IS-A family entity IDs sharing that
     * record PK) as `'Superseded'` when a newer pending suggestion is created.
     */
    public async SupersedeOlderPendingSuggestions(
        provider: IMetadataProvider,
        newSuggestion: MJFieldSuggestionEntity,
        contextUser: UserInfo | null
    ): Promise<void> {
        const linkedEntityId = newSuggestion.LinkedEntityID;
        const linkedRecordId = newSuggestion.LinkedRecordID?.trim();
        const anchorKey = newSuggestion.AnchorKey?.trim();
        if (!linkedEntityId || !linkedRecordId || !anchorKey || !newSuggestion.ID) {
            return;
        }

        const systemUser =
            (await WellKnownUserSource.Instance.GetSystemUser(provider)) ?? contextUser ?? undefined;
        if (!systemUser) {
            return;
        }

        const targetEntityInfo = resolveEntityInfoById(provider, linkedEntityId);
        const entityIds = collectISAFamilyEntityIds(targetEntityInfo, linkedEntityId);
        const recordIdVariants = buildLinkedRecordIdCandidates(targetEntityInfo, linkedRecordId);

        const entityInList = entityIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
        const recordInList = recordIdVariants.map((rid) => `'${EscapeSQLString(rid)}'`).join(',');

        const rv = RunView.FromMetadataProvider(provider);
        const pendingRes = await rv.RunView<MJFieldSuggestionEntity>(
            {
                EntityName: 'MJ: Field Suggestions',
                ExtraFilter:
                    `LinkedEntityID IN (${entityInList})` +
                    ` AND LinkedRecordID IN (${recordInList})` +
                    ` AND AnchorType='Field'` +
                    ` AND AnchorKey='${EscapeSQLString(anchorKey)}'` +
                    ` AND Outcome IS NULL` +
                    ` AND ID<>'${EscapeSQLString(newSuggestion.ID)}'`,
                ResultType: 'entity_object',
            },
            systemUser
        );
        if (!pendingRes.Success || !Array.isArray(pendingRes.Results) || pendingRes.Results.length === 0) {
            return;
        }

        await this.OnRecordChanged({
            Provider: provider,
            ContextUser: contextUser,
            TargetEntity: newSuggestion,
            ChangedFieldNames: [anchorKey],
            PendingSuggestions: pendingRes.Results,
        });
    }
}

/**
 * Collects all `EntityInfo.ID` values across an IS-A hierarchy (`RootEntity` down through all
 * descendants) so a suggestion anchored to `Task` or `GitHubIssueTask` is matched regardless
 * of which level in the hierarchy is saved or queried.
 */
export function collectISAFamilyEntityIds(
    entityInfo: EntityInfo | null | undefined,
    fallbackEntityId?: string | null
): string[] {
    const seen = new Set<string>();
    const ordered: string[] = [];
    const addId = (id: string | null | undefined): void => {
        if (!id) return;
        const norm = NormalizeUUID(id);
        if (!seen.has(norm)) {
            seen.add(norm);
            ordered.push(id);
        }
    };

    if (!entityInfo) {
        addId(fallbackEntityId);
        return ordered;
    }

    let root: EntityInfo = entityInfo;
    while (root.ParentEntityInfo) {
        root = root.ParentEntityInfo;
    }

    const walk = (node: EntityInfo): void => {
        addId(node.ID);
        for (const child of node.ChildEntities ?? []) {
            walk(child);
        }
    };
    walk(root);
    addId(fallbackEntityId);
    return ordered;
}

/**
 * Produces both scalar (`'uuid'`) and `CompositeKey.ToConcatenatedString()` (`'ID|uuid'`)
 * forms for single-PK entities so `LinkedRecordID` lookups match whichever form was stored.
 */
export function buildLinkedRecordIdCandidates(
    entityInfo: EntityInfo | null | undefined,
    rawRecordId: string
): string[] {
    const trimmed = rawRecordId.trim();
    if (!trimmed) {
        return [];
    }
    const candidates = new Set<string>([trimmed]);
    if (entityInfo && entityInfo.PrimaryKeys.length === 1) {
        const pkName = entityInfo.FirstPrimaryKey.Name; // first-pk-ok: guarded by PrimaryKeys.length === 1
        const prefix = `${pkName}|`;
        if (trimmed.startsWith(prefix)) {
            const bare = trimmed.slice(prefix.length);
            if (bare) {
                candidates.add(bare);
            }
        } else if (!trimmed.includes('|')) {
            candidates.add(`${prefix}${trimmed}`);
        }
    }
    return Array.from(candidates);
}
