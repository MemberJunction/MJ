import { CompositeKey, EntityFieldInfo, EntityFieldTSType, EntityInfo, IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import type {
    MJConversationEntity,
    MJConversationEntity_IConversationAnchorMetadata
} from '../generated/entity_subclasses';

/**
 * Union of allowed `AnchorType` values on `MJ: Conversations`, derived directly
 * from the CodeGen-generated entity property so CHECK constraint changes flow through automatically.
 */
export type ConversationAnchorType = NonNullable<MJConversationEntity['AnchorType']>;

/**
 * Strongly-typed JSON payload for `MJ: Conversations.AnchorMetadata` (`AnchorMetadataObject`),
 * derived from the CodeGen-generated interface.
 */
export type ConversationAnchorMetadata = MJConversationEntity_IConversationAnchorMetadata;

/**
 * Result of checking whether a user may read the record to which a conversation is anchored.
 */
export interface LinkedRecordReadDecision {
    /** Whether the user is allowed to read the linked record. */
    Allowed: boolean;
    /** Human-readable denial reason when `Allowed === false`, or `null` when allowed. */
    Reason: string | null;
    /** Resolved `EntityInfo` for `linkedEntityId`, or `null` if the entity was not found. */
    EntityInfo: EntityInfo | null;
}

/**
 * Minimal structural shape required to evaluate RLS and FLS visibility on an anchored conversation.
 * Satisfied by full `MJConversationEntity` instances as well as `ResultType: 'simple'` projection rows.
 */
export interface AnchoredConversationCandidate {
    ID?: string;
    LinkedEntityID?: string | null;
    LinkedRecordID?: string | null;
    AnchorType?: MJConversationEntity['AnchorType'];
    AnchorKey?: string | null;
    AnchorMetadata?: string | null;
    AnchorMetadataObject?: MJConversationEntity_IConversationAnchorMetadata | null;
}

/**
 * Safely parses `AnchorMetadata` from either an already-parsed object or a raw JSON string.
 * Returns `null` when empty or malformed.
 */
export function ParseConversationAnchorMetadata(
    raw: MJConversationEntity_IConversationAnchorMetadata | string | null | undefined
): MJConversationEntity_IConversationAnchorMetadata | null {
    if (!raw) {
        return null;
    }
    if (typeof raw === 'object') {
        return raw;
    }
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) {
            return null;
        }
        try {
            const parsed: unknown = JSON.parse(trimmed);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as MJConversationEntity_IConversationAnchorMetadata;
            }
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * Deterministic Field-Level Security (FLS) gate for anchored conversations.
 *
 * Returns `true` when the conversation must be hidden from `user` because:
 * 1. `entityInfo.FieldLevelSecurityApplies` is `true`, AND
 * 2. Either:
 *    - `anchorType === 'Field'` and `anchorKey` is in `entityInfo.GetDeniedReadFields(user)`, OR
 *    - `anchorMetadata.fieldName` is in `entityInfo.GetDeniedReadFields(user)`, OR
 *    - Any field listed in `anchorMetadata.restrictedFields` is in `entityInfo.GetDeniedReadFields(user)`.
 *
 * Runs in O(1) memory with zero database or LLM calls on the read path.
 */
export function IsConversationHiddenByFieldSecurity(
    entityInfo: EntityInfo | null | undefined,
    user: UserInfo | null | undefined,
    anchorType: MJConversationEntity['AnchorType'],
    anchorKey: string | null | undefined,
    anchorMetadata: MJConversationEntity_IConversationAnchorMetadata | string | null | undefined
): boolean {
    if (!entityInfo || !user) {
        return false;
    }
    // fls-guard: filter anchored conversations referencing restricted fields
    if (!entityInfo.FieldLevelSecurityApplies) {
        return false;
    }
    const denied = entityInfo.GetDeniedReadFields(user);
    if (denied.size === 0) {
        return false;
    }

    if (anchorType === 'Field' && anchorKey) {
        const normalizedKey = anchorKey.trim().toLowerCase();
        if (normalizedKey.length > 0 && denied.has(normalizedKey)) {
            return true;
        }
    }

    const metadata = ParseConversationAnchorMetadata(anchorMetadata);
    if (!metadata) {
        return false;
    }

    if (typeof metadata.fieldName === 'string' && metadata.fieldName.trim().length > 0) {
        if (denied.has(metadata.fieldName.trim().toLowerCase())) {
            return true;
        }
    }

    if (Array.isArray(metadata.restrictedFields)) {
        for (const fieldName of metadata.restrictedFields) {
            if (typeof fieldName === 'string' && fieldName.trim().length > 0) {
                if (denied.has(fieldName.trim().toLowerCase())) {
                    return true;
                }
            }
        }
    }

    return false;
}

/**
 * Builds a SQL `WHERE` filter expression matching `linkedRecordId` against `entityInfo`'s primary key(s).
 * Supports both plain scalar PK strings (`'81D4BC3D-...'` or `'42'`) and `CompositeKey.ToURLSegment()`
 * formatted strings (`'ID|81D4BC3D-...'` or `'Key1|Val1||Key2|Val2'`).
 */
export function BuildLinkedRecordPrimaryKeyFilter(
    entityInfo: EntityInfo,
    linkedRecordId: string
): string | null {
    const raw = (linkedRecordId ?? '').trim();
    if (!raw || entityInfo.PrimaryKeys.length === 0) {
        return null;
    }

    const pkFieldsByLower = new Map<string, EntityFieldInfo>();
    for (const pk of entityInfo.PrimaryKeys) {
        pkFieldsByLower.set(pk.Name.toLowerCase(), pk);
    }

    // Check if the string is in CompositeKey URL segment format (e.g., "ID|123" or "A|1||B|2")
    if (raw.includes('|')) {
        const ck = CompositeKey.FromURLSegment(entityInfo, raw);
        if (ck.KeyValuePairs.length > 0) {
            const clauses: string[] = [];
            for (const kv of ck.KeyValuePairs) {
                const field = pkFieldsByLower.get((kv.FieldName ?? '').trim().toLowerCase());
                if (!field) {
                    return null;
                }
                const clause = formatSinglePrimaryKeyClause(field, String(kv.Value ?? ''));
                if (!clause) {
                    return null;
                }
                clauses.push(clause);
            }
            if (clauses.length === entityInfo.PrimaryKeys.length) {
                return clauses.join(' AND ');
            }
        }
    }

    // Single primary key plain value
    if (entityInfo.PrimaryKeys.length === 1) {
        return formatSinglePrimaryKeyClause(entityInfo.FirstPrimaryKey, raw); // first-pk-ok: guarded by entityInfo.PrimaryKeys.length === 1
    }

    return null;
}

function formatSinglePrimaryKeyClause(field: EntityFieldInfo, rawValue: string): string | null {
    const trimmed = rawValue.trim();
    if (!trimmed) {
        return null;
    }
    if (field.TSType === EntityFieldTSType.Number) {
        const num = Number(trimmed);
        if (!Number.isFinite(num)) {
            return null;
        }
        return `[${field.Name}]=${num}`;
    }
    return `[${field.Name}]=N'${EscapeSQLString(trimmed)}'`;
}

/**
 * Verifies whether `user` can read the record identified by `(linkedEntityId, linkedRecordId)`.
 *
 * Checks:
 * 1. The target entity exists in `provider.Entities`.
 * 2. `user` holds entity-level `CanRead` permission on the target entity (`EntityInfo.GetUserPermisions(user)`).
 * 3. On the server (`provider.ProviderType === 'Database'`), executes a 1-row `RunView` scoped to `user`
 *    so any Row-Level Security (`MJ: Entity Row Filters`) predicate is enforced at the database level.
 */
export async function UserCanReadLinkedRecord(
    provider: IMetadataProvider,
    user: UserInfo | null | undefined,
    linkedEntityId: string | null | undefined,
    linkedRecordId: string | null | undefined
): Promise<LinkedRecordReadDecision> {
    if (!linkedEntityId || !linkedRecordId) {
        return { Allowed: false, Reason: 'Linked entity and record ID are required.', EntityInfo: null };
    }
    if (!user) {
        return { Allowed: false, Reason: 'User context is required.', EntityInfo: null };
    }

    const entityInfo = provider?.Entities?.find((e) => UUIDsEqual(e.ID, linkedEntityId)) ?? null;
    if (!entityInfo) {
        return { Allowed: false, Reason: 'Linked entity was not found.', EntityInfo: null };
    }

    const perms = entityInfo.GetUserPermisions(user);
    if (!perms?.CanRead) {
        return {
            Allowed: false,
            Reason: `You do not have permission to read ${entityInfo.DisplayNameOrName} records.`,
            EntityInfo: entityInfo
        };
    }

    if (provider?.ProviderType !== 'Database') {
        return { Allowed: true, Reason: null, EntityInfo: entityInfo };
    }

    const pkFilter = BuildLinkedRecordPrimaryKeyFilter(entityInfo, linkedRecordId);
    if (!pkFilter) {
        return {
            Allowed: false,
            Reason: 'Invalid linked record identifier.',
            EntityInfo: entityInfo
        };
    }

    try {
        const rv = RunView.FromMetadataProvider(provider);
        const pkFieldNames = entityInfo.PrimaryKeys.map((pk) => pk.Name);
        const result = await rv.RunView<Record<string, unknown>>(
            {
                EntityName: entityInfo.Name,
                ExtraFilter: pkFilter,
                Fields: pkFieldNames,
                MaxRows: 1,
                ResultType: 'simple'
            },
            user
        );
        if (!result.Success) {
            LogError(`UserCanReadLinkedRecord: RunView failed on ${entityInfo.Name}: ${result.ErrorMessage}`);
            return {
                Allowed: false,
                Reason: 'Unable to verify access to the linked record.',
                EntityInfo: entityInfo
            };
        }
        if ((result.Results?.length ?? 0) === 0) {
            return {
                Allowed: false,
                Reason: 'You do not have access to the linked record.',
                EntityInfo: entityInfo
            };
        }
        return { Allowed: true, Reason: null, EntityInfo: entityInfo };
    } catch (error) {
        LogError(
            `UserCanReadLinkedRecord: unexpected error on ${entityInfo.Name} (${linkedRecordId}): ${
                error instanceof Error ? error.message : String(error)
            }`
        );
        return {
            Allowed: false,
            Reason: 'Unable to verify access to the linked record.',
            EntityInfo: entityInfo
        };
    }
}

/**
 * Filters a list of anchored conversations (or simple rows) for `user`, removing any thread where:
 * - `user` is denied read access to the linked record via entity permissions or Row-Level Security (RLS), OR
 * - `user` is denied read access to the anchored field or any field in `AnchorMetadata.restrictedFields` (FLS).
 *
 * Deduplicates `(LinkedEntityID, LinkedRecordID)` checks so N comment threads on the same record
 * require at most one RLS check.
 */
export async function FilterAnchoredConversationsForUser<T extends AnchoredConversationCandidate>(
    provider: IMetadataProvider,
    user: UserInfo | null | undefined,
    conversations: readonly T[]
): Promise<T[]> {
    if (!user || conversations.length === 0) {
        return [];
    }

    const rlsCache = new Map<string, Promise<LinkedRecordReadDecision>>();
    const checkRecordAccess = (entityId: string, recordId: string): Promise<LinkedRecordReadDecision> => {
        const cacheKey = `${entityId.trim().toLowerCase()}::${recordId.trim()}`;
        let pending = rlsCache.get(cacheKey);
        if (!pending) {
            pending = UserCanReadLinkedRecord(provider, user, entityId, recordId);
            rlsCache.set(cacheKey, pending);
        }
        return pending;
    };

    const visible: T[] = [];
    for (const conv of conversations) {
        const linkedEntityId = conv.LinkedEntityID;
        const linkedRecordId = conv.LinkedRecordID;
        if (!linkedEntityId || !linkedRecordId) {
            visible.push(conv);
            continue;
        }

        const recordAccess = await checkRecordAccess(linkedEntityId, linkedRecordId);
        if (!recordAccess.Allowed || !recordAccess.EntityInfo) {
            continue;
        }

        const metadata = conv.AnchorMetadataObject ?? conv.AnchorMetadata ?? null;
        if (
            IsConversationHiddenByFieldSecurity(
                recordAccess.EntityInfo,
                user,
                conv.AnchorType ?? null,
                conv.AnchorKey ?? null,
                metadata
            )
        ) {
            continue;
        }

        visible.push(conv);
    }

    return visible;
}

/**
 * Deterministic Stage 1 detector for FLS-governed fields referenced by a comment.
 *
 * Runs only when `entityInfo.FieldLevelSecurityApplies` is `true`. Checks:
 * 1. Whether `anchorType === 'Field'` and `anchorKey` names an FLS-governed field (`f.HasFieldPermissions`).
 * 2. Whether `messageText` mentions an FLS-governed field's code `Name` (exact or camelCase-split words)
 *    or `DisplayName` (case-insensitive word-boundary match).
 * 3. Whether `recordValues` is provided and `messageText` contains the linked record's actual non-trivial
 *    value (or formatted number) for an FLS-governed field (for example, commenting `"$185,000 is too high"`
 *    at the Record level when the restricted `Salary` field on that record has value `185000`).
 *
 * Returns the deduplicated array of canonical `EntityFieldInfo.Name` strings for matched FLS fields.
 */
export function DetectReferencedRestrictedFieldsDeterministic(
    entityInfo: EntityInfo | null | undefined,
    messageText: string | null | undefined,
    anchorType: MJConversationEntity['AnchorType'],
    anchorKey: string | null | undefined,
    recordValues?: Readonly<Record<string, unknown>> | null
): string[] {
    if (!entityInfo || !entityInfo.FieldLevelSecurityApplies) {
        return [];
    }

    const restrictedFields = entityInfo.Fields.filter((f) => f.HasFieldPermissions);
    if (restrictedFields.length === 0) {
        return [];
    }

    const matched = new Set<string>();

    // 1. Direct field anchor on an FLS-governed field
    if (anchorType === 'Field' && anchorKey) {
        const targetLower = anchorKey.trim().toLowerCase();
        const directField = restrictedFields.find((f) => f.Name.toLowerCase() === targetLower);
        if (directField) {
            matched.add(directField.Name);
        }
    }

    const text = (messageText ?? '').trim();
    if (!text) {
        return [...matched];
    }
    const textLower = text.toLowerCase();

    for (const field of restrictedFields) {
        if (matched.has(field.Name)) {
            continue;
        }

        // 2. Match field Name, camelCase-spaced Name, or DisplayName on word boundaries
        const candidateLabels = buildFieldCandidatePhrases(field);
        if (candidateLabels.some((phrase) => containsWholePhrase(textLower, phrase))) {
            matched.add(field.Name);
            continue;
        }

        // 3. Match actual restricted field value from the record when non-trivial
        if (recordValues && Object.prototype.hasOwnProperty.call(recordValues, field.Name)) {
            const rawVal = recordValues[field.Name];
            const valueCandidates = buildRestrictedValueCandidates(rawVal);
            if (valueCandidates.some((valLower) => textLower.includes(valLower))) {
                matched.add(field.Name);
            }
        }
    }

    return [...matched];
}

function buildFieldCandidatePhrases(field: EntityFieldInfo): string[] {
    const phrases = new Set<string>();
    const rawName = field.Name.trim();
    if (rawName.length >= 3) {
        phrases.add(rawName.toLowerCase());
        const spaced = rawName
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
            .replace(/_/g, ' ')
            .trim()
            .toLowerCase();
        if (spaced.length >= 3) {
            phrases.add(spaced);
        }
    }
    const displayName = (field.DisplayName ?? '').trim().toLowerCase();
    if (displayName.length >= 3) {
        phrases.add(displayName);
    }
    return [...phrases];
}

function containsWholePhrase(haystackLower: string, phraseLower: string): boolean {
    const escaped = phraseLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i');
    return regex.test(haystackLower);
}

function buildRestrictedValueCandidates(rawVal: unknown): string[] {
    if (rawVal === null || rawVal === undefined || typeof rawVal === 'boolean') {
        return [];
    }
    if (typeof rawVal === 'number') {
        if (!Number.isFinite(rawVal) || Math.abs(rawVal) < 100) {
            return [];
        }
        const plain = String(rawVal).toLowerCase();
        const formatted = rawVal.toLocaleString('en-US').toLowerCase();
        return formatted !== plain ? [plain, formatted] : [plain];
    }
    if (typeof rawVal === 'string') {
        const trimmed = rawVal.trim().toLowerCase();
        if (trimmed.length < 4 || trimmed === 'true' || trimmed === 'false' || trimmed === 'null') {
            return [];
        }
        return [trimmed];
    }
    return [];
}

/**
 * Merges newly-detected restricted field names into an existing `IConversationAnchorMetadata` object,
 * returning the updated metadata object and a boolean indicating whether any new field was added.
 */
export function MergeRestrictedFieldsIntoAnchorMetadata(
    existing: MJConversationEntity_IConversationAnchorMetadata | null | undefined,
    newlyDetectedFieldNames: readonly string[]
): { Metadata: MJConversationEntity_IConversationAnchorMetadata; Changed: boolean } {
    const base: MJConversationEntity_IConversationAnchorMetadata = existing ? { ...existing } : {};
    const currentList = Array.isArray(base.restrictedFields) ? [...base.restrictedFields] : [];
    const seenLower = new Set(currentList.map((f) => f.trim().toLowerCase()));

    let changed = false;
    for (const fieldName of newlyDetectedFieldNames) {
        const trimmed = fieldName.trim();
        if (!trimmed) {
            continue;
        }
        const lower = trimmed.toLowerCase();
        if (!seenLower.has(lower)) {
            seenLower.add(lower);
            currentList.push(trimmed);
            changed = true;
        }
    }

    if (currentList.length > 0) {
        base.restrictedFields = currentList;
    }

    return { Metadata: base, Changed: changed };
}
