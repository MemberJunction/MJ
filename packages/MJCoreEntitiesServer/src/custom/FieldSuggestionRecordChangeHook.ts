import {
    BaseEntity,
    EntityInfo,
    GetDataHooks,
    IMetadataProvider,
    LogError,
    Metadata,
    PostSaveHook,
    RegisterDataHook,
    RunView,
    UserInfo,
    WellKnownUserSource,
} from '@memberjunction/core';
import {
    COMMENT_TYPE_CODES,
    MJFieldSuggestionEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, MJGlobal, NormalizeUUID } from '@memberjunction/global';
import {
    BuildLinkedRecordIdCandidates,
    CollectISAFamilyEntityIds,
    CommentTypeDriver,
    FieldSuggestionCommentDriver,
    IsSuggestionAcceptInFlight,
    IsSuggestionSupersedeInFlight,
} from './ConversationAndCommentDrivers';

const CONVERSATION_FAMILY_ENTITY_NAMES = new Set<string>([
    'MJ: Conversations',
    'MJ: Conversation Details',
    'MJ: Conversation Types',
    'MJ: Comments',
    'MJ: Comment Types',
    'MJ: Field Suggestions',
]);

function doesISAFamilyAllowFieldSuggestions(entityInfo: EntityInfo | null | undefined): boolean {
    if (!entityInfo) {
        return false;
    }
    let root: EntityInfo = entityInfo;
    while (root.ParentEntityInfo) {
        root = root.ParentEntityInfo;
    }
    const check = (node: EntityInfo): boolean => {
        if (node.IsCommentTypeAllowed(COMMENT_TYPE_CODES.FIELD_SUGGESTION, 'Field Suggestion')) {
            return true;
        }
        for (const child of node.ChildEntities ?? []) {
            if (check(child)) {
                return true;
            }
        }
        return false;
    };
    return check(root);
}

function serializeEntityPrimaryKey(entity: BaseEntity): string | null {
    const pk = entity.PrimaryKey;
    if (!pk || !pk.HasValue) {
        return null;
    }
    if (pk.KeyValuePairs.length === 1) {
        const val = pk.KeyValuePairs[0].Value;
        return val !== null && val !== undefined ? String(val) : null;
    }
    return pk.ToConcatenatedString();
}

/**
 * Server-side `PostSave` data hook that observes field edits on entities opting into
 * `'FIELD_SUGGESTION'` (`Configuration.Comments.AllowedCommentTypes`) and automatically
 * marks any pending (`Outcome IS NULL`) `MJ: Field Suggestions` on modified fields as
 * `Outcome = 'Superseded'`, `IsResolved = true`, `ResolvedByUserID`, `ResolvedAt` via
 * {@link CommentTypeDriver.OnRecordChanged}.
 *
 * Fast-exits in O(1) with zero database queries for entities that have not enabled
 * `'FIELD_SUGGESTION'` or saves with no modified fields.
 */
export const FieldSuggestionPostSaveHook: PostSaveHook = async (
    entity: BaseEntity,
    contextUser: UserInfo | undefined,
    changedFieldNames: ReadonlyArray<string>,
    saveSubType: 'create' | 'update'
): Promise<void> => {
    if (saveSubType === 'create' || changedFieldNames.length === 0) {
        return;
    }

    const entityInfo = entity.EntityInfo;
    if (!entityInfo || CONVERSATION_FAMILY_ENTITY_NAMES.has(entityInfo.Name)) {
        return;
    }

    if (!doesISAFamilyAllowFieldSuggestions(entityInfo)) {
        return;
    }

    const fallbackProvider = contextUser?.OwningProvider ?? Metadata.Provider;
    const provider =
        (entity.ProviderToUse as unknown as IMetadataProvider | null) ?? fallbackProvider;
    if (!provider || provider.ProviderType !== 'Database') {
        return;
    }

    const rawRecordId = serializeEntityPrimaryKey(entity);
    if (!rawRecordId) {
        return;
    }

    try {
        const systemUser =
            (await WellKnownUserSource.Instance.GetSystemUser(provider)) ?? contextUser;
        if (!systemUser) {
            return;
        }

        const entityIds = CollectISAFamilyEntityIds(entityInfo, entityInfo.ID);
        const recordIdCandidates = BuildLinkedRecordIdCandidates(entityInfo, rawRecordId);
        if (entityIds.length === 0 || recordIdCandidates.length === 0) {
            return;
        }

        const changedLower = new Set(changedFieldNames.map((f) => f.trim().toLowerCase()).filter(Boolean));
        if (changedLower.size === 0) {
            return;
        }

        const entityInList = entityIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
        const recordInList = recordIdCandidates.map((r) => `'${EscapeSQLString(r)}'`).join(',');
        const fieldInList = Array.from(changedLower)
            .map((f) => `'${EscapeSQLString(f)}'`)
            .join(',');

        const rv = RunView.FromMetadataProvider(provider);
        const res = await rv.RunView<MJFieldSuggestionEntity>(
            {
                EntityName: 'MJ: Field Suggestions',
                ExtraFilter:
                    `LinkedEntityID IN (${entityInList})` +
                    ` AND LinkedRecordID IN (${recordInList})` +
                    ` AND AnchorType='Field'` +
                    ` AND AnchorKey IN (${fieldInList})` +
                    ` AND Outcome IS NULL`,
                ResultType: 'entity_object',
            },
            systemUser
        );
        if (!res.Success || !Array.isArray(res.Results) || res.Results.length === 0) {
            return;
        }

        const eligible = res.Results.filter((s) => {
            const normId = s.ID ? NormalizeUUID(s.ID) : '';
            if (!normId || IsSuggestionAcceptInFlight(normId) || IsSuggestionSupersedeInFlight(normId)) {
                return false;
            }
            const keyLower = (s.AnchorKey ?? '').trim().toLowerCase();
            return changedLower.has(keyLower);
        });
        if (eligible.length === 0) {
            return;
        }

        const driver =
            MJGlobal.Instance.ClassFactory.CreateInstance<CommentTypeDriver>(
                CommentTypeDriver,
                'FieldSuggestionCommentDriver'
            ) ?? new FieldSuggestionCommentDriver();

        await driver.OnRecordChanged({
            Provider: provider,
            ContextUser: contextUser ?? null,
            TargetEntity: entity,
            ChangedFieldNames: changedFieldNames,
            PendingSuggestions: eligible,
        });
    } catch (err) {
        LogError(
            `FieldSuggestionPostSaveHook failed on '${entityInfo.Name}': ${
                err instanceof Error ? err.message : String(err)
            }`
        );
    }
};

/**
 * Idempotently registers {@link FieldSuggestionPostSaveHook} in the global `PostSave` data hooks store.
 */
export function EnsureFieldSuggestionPostSaveHookRegistered(): void {
    const existing = GetDataHooks<PostSaveHook>('PostSave');
    if (!existing.includes(FieldSuggestionPostSaveHook)) {
        RegisterDataHook('PostSave', FieldSuggestionPostSaveHook);
    }
}

// Auto-register when @memberjunction/core-entities-server is loaded
EnsureFieldSuggestionPostSaveHookRegistered();
