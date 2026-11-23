import {
    BaseEntity,
    GetDataHooks,
    IMetadataProvider,
    LogError,
    Metadata,
    PostRunViewHook,
    PreRunViewHook,
    RegisterDataHook,
    RegisterPostRunViewProtectedEntity,
    RunView,
    RunViewParams,
    RunViewResult,
    UserInfo,
    WellKnownUserSource
} from '@memberjunction/core';
import {
    BUILT_IN_CONVERSATION_TYPE_IDS,
    CONVERSATIONS_RESOURCE_TYPE_ID,
    FilterAnchoredConversationsForUser,
    IsInheritingFolderAccess,
    MJProjectEntity,
    MJResourcePermissionEntity,
    ResourcePermissionEngine,
    type MJConversationEntity
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { EscapeSQLString, GetGlobalObjectStore, IsValidUUID, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { ResolveTargetEntityNameAsync } from './ArtifactSecurityHookHelpers';

/** `MJ: Resource Types.ID` for `MJ: Projects` (conversation folders). */
const PROJECTS_RESOURCE_TYPE_ID = '88D0DF27-AF8F-43AC-9EC4-2AC314F49355';
const GLOBAL_KEY_INTERNAL_PARAMS = '__MJ_INTERNAL_CONVERSATION_SECURITY_PARAMS__';
const GLOBAL_KEY_ORIGINAL_FIELDS = '__MJ_ORIGINAL_CONVERSATION_FIELDS_BY_PARAMS__';
const IN_CLAUSE_CHUNK = 100;

/**
 * Security-relevant projection of a `MJ: Conversations` (or IS-A child) row.
 * Notice `ParentID` is evaluated strictly to prevent implicit folder inheritance on
 * structural child conversations and is NEVER traversed upward or downward as a grant.
 */
export interface ConversationSecurityRow {
    ID?: string;
    UserID?: string | null;
    ParentID?: string | null;
    RootParentID?: string | null;
    Parent?: string | null;
    ProjectID?: string | null;
    AdditionalData?: string | null;
    AnchorType?: MJConversationEntity['AnchorType'] | null;
    LinkedEntityID?: string | null;
    LinkedRecordID?: string | null;
    AnchorKey?: string | null;
    AnchorMetadata?: string | null;
    AnchorMetadataObject?: MJConversationEntity['AnchorMetadataObject'] | null;
    TypeID?: string | null;
    ExternalID?: string | null;
}

const REQUIRED_SECURITY_FIELDS: readonly string[] = [
    'ID',
    'UserID',
    'ParentID',
    'RootParentID',
    'ProjectID',
    'AdditionalData',
    'AnchorType',
    'LinkedEntityID',
    'LinkedRecordID',
    'AnchorKey',
    'AnchorMetadata',
    'TypeID',
    'ExternalID',
];

export const CONVERSATION_READ_PROTECTED_ENTITIES: readonly string[] = [
    'MJ: Conversations',
    'MJ: Comments',
    'MJ: Field Suggestions',
    'MJ: Agent Channels',
];

function getInternalParamsSet(): WeakSet<object> {
    const store = GetGlobalObjectStore();
    if (store) {
        const existing = store[GLOBAL_KEY_INTERNAL_PARAMS];
        if (existing instanceof WeakSet) {
            return existing;
        }
        const created = new WeakSet<object>();
        store[GLOBAL_KEY_INTERNAL_PARAMS] = created;
        return created;
    }
    return new WeakSet<object>();
}

function getOriginalFieldsMap(): WeakMap<RunViewParams, string[]> {
    const store = GetGlobalObjectStore();
    if (store) {
        const existing = store[GLOBAL_KEY_ORIGINAL_FIELDS];
        if (existing instanceof WeakMap) {
            return existing as WeakMap<RunViewParams, string[]>;
        }
        const created = new WeakMap<RunViewParams, string[]>();
        store[GLOBAL_KEY_ORIGINAL_FIELDS] = created;
        return created;
    }
    return new WeakMap<RunViewParams, string[]>();
}

/** Marks an internal lookup `RunViewParams` so security hooks do not recurse into themselves. */
export function MarkInternalConversationSecurityQuery(params: object): void {
    getInternalParamsSet().add(params);
}

function resolveProvider(contextUser: UserInfo | undefined, explicitProvider?: IMetadataProvider): IMetadataProvider | null {
    return (
        explicitProvider ??
        contextUser?.OwningProvider ??
        Metadata.Provider ?? // global-provider-ok: fallback when caller omitted provider
        null
    );
}

function isConversationFamilyEntity(provider: IMetadataProvider | null, entityName: string): boolean {
    const normalized = entityName.trim().toLowerCase();
    if (CONVERSATION_READ_PROTECTED_ENTITIES.some((n) => n.toLowerCase() === normalized)) {
        return true;
    }
    if (!provider) {
        return false;
    }
    const entityInfo =
        (typeof provider.EntityByName === 'function' ? provider.EntityByName(entityName.trim()) : undefined) ??
        provider.Entities?.find((e) => e.Name.trim().toLowerCase() === normalized);
    let cursor = entityInfo?.ParentEntityInfo ?? null;
    while (cursor) {
        if (cursor.Name.trim().toLowerCase() === 'mj: conversations') {
            return true;
        }
        cursor = cursor.ParentEntityInfo;
    }
    return false;
}

function resolveTargetEntityNameSync(params: RunViewParams): string {
    if (typeof params.EntityName === 'string' && params.EntityName.trim().length > 0) {
        return params.EntityName.trim();
    }
    const viewEntity = params.ViewEntity;
    if (viewEntity && 'Entity' in viewEntity && typeof viewEntity.Entity === 'string' && viewEntity.Entity.trim().length > 0) {
        return viewEntity.Entity.trim();
    }
    return '';
}

function isPermissionWindowActive(perm: MJResourcePermissionEntity, now: Date): boolean {
    if (perm.Status !== 'Approved') {
        return false;
    }
    if (perm.StartSharingAt && new Date(perm.StartSharingAt) > now) {
        return false;
    }
    if (perm.EndSharingAt && new Date(perm.EndSharingAt) <= now) {
        return false;
    }
    return true;
}

function userMatchesGrantTarget(perm: MJResourcePermissionEntity, user: UserInfo): boolean {
    if (perm.Type === 'User') {
        return Boolean(perm.UserID && UUIDsEqual(perm.UserID, user.ID));
    }
    if (perm.Type === 'Role') {
        return Boolean(
            perm.RoleID &&
            (user.UserRoles ?? []).some((ur) => UUIDsEqual(ur.RoleID, perm.RoleID!))
        );
    }
    return false;
}

interface BatchReadContext {
    SharedConversationIDs: Set<string>;
    SharedFolderIDs: Set<string>;
    AgentChannelIDs: Set<string>;
    PublicFolderIDs: Set<string>;
}

async function buildBatchReadContext(
    provider: IMetadataProvider,
    user: UserInfo,
    rows: readonly ConversationSecurityRow[]
): Promise<BatchReadContext> {
    const now = new Date();
    const sharedConversationIDs = new Set<string>();
    const sharedFolderIDs = new Set<string>();
    const engine = ResourcePermissionEngine.GetProviderInstance<ResourcePermissionEngine>(
        provider,
        ResourcePermissionEngine
    ) as ResourcePermissionEngine;
    await engine.Config(false, user);

    const convPerms = engine.Permissions.filter(
        (p) =>
            UUIDsEqual(p.ResourceTypeID, CONVERSATIONS_RESOURCE_TYPE_ID) &&
            isPermissionWindowActive(p, now) &&
            userMatchesGrantTarget(p, user)
    );
    for (const perm of convPerms) {
        if (perm.ResourceRecordID) {
            sharedConversationIDs.add(NormalizeUUID(perm.ResourceRecordID));
        }
    }

    const folderPerms = engine.Permissions.filter(
        (p) =>
            UUIDsEqual(p.ResourceTypeID, PROJECTS_RESOURCE_TYPE_ID) &&
            isPermissionWindowActive(p, now) &&
            userMatchesGrantTarget(p, user)
    );
    for (const perm of folderPerms) {
        if (perm.ResourceRecordID) {
            sharedFolderIDs.add(NormalizeUUID(perm.ResourceRecordID));
        }
    }

    const channelCandidateIDs = rows
        .filter((r) => r.TypeID && UUIDsEqual(r.TypeID, BUILT_IN_CONVERSATION_TYPE_IDS.AGENT_CHANNEL) && r.ID)
        .map((r) => r.ID!);
    const agentChannelIDs = await fetchEnrolledChannelIds(provider, user, channelCandidateIDs);

    const candidateFolderIDs = rows
        .filter((r) => !r.ParentID && r.ProjectID && IsInheritingFolderAccess(r))
        .map((r) => r.ProjectID!)
        .filter((pid) => !sharedFolderIDs.has(NormalizeUUID(pid)));
    const publicFolderIDs = await fetchPublicOrOwnedFolderIds(provider, user, candidateFolderIDs);

    return {
        SharedConversationIDs: sharedConversationIDs,
        SharedFolderIDs: sharedFolderIDs,
        AgentChannelIDs: agentChannelIDs,
        PublicFolderIDs: publicFolderIDs,
    };
}

async function fetchEnrolledChannelIds(
    provider: IMetadataProvider,
    user: UserInfo,
    channelIds: readonly string[]
): Promise<Set<string>> {
    const out = new Set<string>();
    const unique = [...new Set(channelIds.filter((id) => IsValidUUID(id)).map((id) => id.trim()))];
    if (unique.length === 0) {
        return out;
    }
    const rv = RunView.FromMetadataProvider(provider);
    const systemUser = (await WellKnownUserSource.Instance.GetSystemUser(provider)) ?? UserCache.Instance.GetSystemUser() ?? user;
    const inList = unique.map((id) => `'${EscapeSQLString(id)}'`).join(',');
    const queryParams: RunViewParams = {
        EntityName: 'MJ: Agent Channel Participants',
        ExtraFilter: `AgentChannelID IN (${inList}) AND UserID='${EscapeSQLString(user.ID)}'`,
        Fields: ['AgentChannelID'],
        ResultType: 'simple',
    };
    MarkInternalConversationSecurityQuery(queryParams);
    const res = await rv.RunView<{ AgentChannelID?: string }>(queryParams, systemUser);
    if (res.Success && Array.isArray(res.Results)) {
        for (const r of res.Results) {
            if (r.AgentChannelID) {
                out.add(NormalizeUUID(r.AgentChannelID));
            }
        }
    }
    return out;
}

async function fetchPublicOrOwnedFolderIds(
    provider: IMetadataProvider,
    user: UserInfo,
    folderIds: readonly string[]
): Promise<Set<string>> {
    const out = new Set<string>();
    const unique = [...new Set(folderIds.filter((id) => IsValidUUID(id)).map((id) => id.trim()))];
    if (unique.length === 0) {
        return out;
    }
    const rv = RunView.FromMetadataProvider(provider);
    const systemUser = (await WellKnownUserSource.Instance.GetSystemUser(provider)) ?? UserCache.Instance.GetSystemUser() ?? user;
    const inList = unique.map((id) => `'${EscapeSQLString(id)}'`).join(',');
    const queryParams: RunViewParams = {
        EntityName: 'MJ: Projects',
        ExtraFilter: `ID IN (${inList})`,
        Fields: ['ID', 'OwnerUserID'],
        ResultType: 'simple',
    };
    MarkInternalConversationSecurityQuery(queryParams);
    const res = await rv.RunView<Pick<MJProjectEntity, 'ID' | 'OwnerUserID'>>(queryParams, systemUser);
    if (res.Success && Array.isArray(res.Results)) {
        for (const proj of res.Results) {
            if (proj.ID && (!proj.OwnerUserID || UUIDsEqual(proj.OwnerUserID, user.ID))) {
                out.add(NormalizeUUID(proj.ID));
            }
        }
    }
    return out;
}

/**
 * Evaluates whether `user` may read a single conversation row `row`.
 *
 * CRITICAL AUTHORIZATION INVARIANT:
 * - `row.ParentID` is strictly structural and NEVER grants access to child, parent, or sibling conversations.
 * - Sharing a parent conversation NEVER exposes unshared child side conversations.
 * - Sharing a child side conversation NEVER exposes its parent or sibling conversations.
 */
export async function UserCanReadConversation(
    provider: IMetadataProvider,
    user: UserInfo,
    row: ConversationSecurityRow,
    batchContext?: BatchReadContext
): Promise<boolean> {
    if (!row.ID) {
        return false;
    }
    if (row.UserID && UUIDsEqual(row.UserID, user.ID)) {
        return true;
    }
    if (row.AnchorType && row.LinkedEntityID && row.LinkedRecordID) {
        const allowed = await FilterAnchoredConversationsForUser(provider, user, [
            {
                ID: row.ID,
                LinkedEntityID: row.LinkedEntityID,
                LinkedRecordID: row.LinkedRecordID,
                AnchorType: row.AnchorType,
                AnchorKey: row.AnchorKey ?? null,
                AnchorMetadata: row.AnchorMetadata ?? null,
                AnchorMetadataObject: row.AnchorMetadataObject ?? null,
            },
        ]);
        return allowed.length > 0;
    }
    const ctx = batchContext ?? (await buildBatchReadContext(provider, user, [row]));
    if (row.TypeID && UUIDsEqual(row.TypeID, BUILT_IN_CONVERSATION_TYPE_IDS.AGENT_CHANNEL)) {
        return ctx.AgentChannelIDs.has(NormalizeUUID(row.ID));
    }
    if (ctx.SharedConversationIDs.has(NormalizeUUID(row.ID))) {
        return true;
    }
    // Folder inheritance only applies to top-level conversations, never ParentID side threads
    if (!row.ParentID && row.ProjectID && IsInheritingFolderAccess(row)) {
        const normProj = NormalizeUUID(row.ProjectID);
        if (ctx.SharedFolderIDs.has(normProj) || ctx.PublicFolderIDs.has(normProj)) {
            return true;
        }
    }
    // Anonymous widget sessions isolate via DB ExternalID RLS on non-ParentID root sessions
    if (user.IsMagicLinkAnonymous && row.ExternalID && !row.ParentID) {
        return true;
    }
    return false;
}

function toConversationSecurityRow(row: unknown): ConversationSecurityRow | null {
    if (!row || typeof row !== 'object') {
        return null;
    }
    if (row instanceof BaseEntity) {
        const typed = row as MJConversationEntity;
        return {
            ID: typed.ID,
            UserID: typed.UserID,
            ParentID: typed.ParentID,
            ProjectID: typed.ProjectID,
            AdditionalData: typed.AdditionalData,
            AnchorType: typed.AnchorType,
            LinkedEntityID: typed.LinkedEntityID,
            LinkedRecordID: typed.LinkedRecordID,
            AnchorKey: typed.AnchorKey,
            AnchorMetadata: typed.AnchorMetadata,
            AnchorMetadataObject: typed.AnchorMetadataObject,
            TypeID: typed.TypeID,
            ExternalID: typed.ExternalID,
        };
    }
    return row as ConversationSecurityRow;
}

function hasRequiredSecurityFields(row: unknown): boolean {
    if (!row || typeof row !== 'object') {
        return false;
    }
    if (row instanceof BaseEntity) {
        return true;
    }
    return REQUIRED_SECURITY_FIELDS.every((field) => Object.prototype.hasOwnProperty.call(row, field));
}

function stripSyntheticFields(row: unknown, originalFields: string[] | undefined): unknown {
    if (!originalFields || !row || typeof row !== 'object' || row instanceof BaseEntity) {
        return row;
    }
    const allowed = new Set(originalFields.map((f) => f.trim().toLowerCase()));
    const copy: Partial<ConversationSecurityRow> = {};
    const source = row as ConversationSecurityRow;
    const keys = Object.keys(source) as Array<keyof ConversationSecurityRow>;
    for (const key of keys) {
        if (allowed.has(String(key).toLowerCase())) {
            const val = source[key];
            if (val !== undefined) {
                (copy as object & Record<keyof ConversationSecurityRow, unknown>)[key] = val;
            }
        }
    }
    return copy;
}

async function hydrateConversationRows(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    ids: readonly string[]
): Promise<Map<string, ConversationSecurityRow>> {
    const out = new Map<string, ConversationSecurityRow>();
    const unique = [...new Set(ids.filter((id) => IsValidUUID(id)).map((id) => id.trim()))];
    if (unique.length === 0) {
        return out;
    }
    const systemUser =
        (await WellKnownUserSource.Instance.GetSystemUser(provider)) ??
        UserCache.Instance.GetSystemUser() ??
        contextUser;
    const rv = RunView.FromMetadataProvider(provider);
    for (let i = 0; i < unique.length; i += IN_CLAUSE_CHUNK) {
        const chunk = unique.slice(i, i + IN_CLAUSE_CHUNK);
        const inList = chunk.map((id) => `'${EscapeSQLString(id)}'`).join(',');
        const queryParams: RunViewParams = {
            EntityName: 'MJ: Conversations',
            ExtraFilter: `ID IN (${inList})`,
            Fields: [...REQUIRED_SECURITY_FIELDS],
            ResultType: 'simple',
        };
        MarkInternalConversationSecurityQuery(queryParams);
        const res = await rv.RunView<ConversationSecurityRow>(queryParams, systemUser);
        if (res.Success && Array.isArray(res.Results)) {
            for (const item of res.Results) {
                if (item.ID) {
                    out.set(NormalizeUUID(item.ID), item);
                }
            }
        }
    }
    return out;
}

/**
 * `PreRunView` hook that records narrow caller field selections and adds security columns
 * needed to evaluate `ParentID`-strict per-conversation read authorization in `PostRunView`.
 */
export const ConversationPreRunViewHook: PreRunViewHook = async (
    params: RunViewParams,
    contextUser?: UserInfo,
    provider?: IMetadataProvider
): Promise<RunViewParams> => {
    if (!contextUser || getInternalParamsSet().has(params)) {
        return params;
    }
    const resolvedProvider = resolveProvider(contextUser, provider);
    if (!resolvedProvider || resolvedProvider.ProviderType !== 'Database') {
        return params;
    }
    if (WellKnownUserSource.Instance.IsSystemUser(contextUser)) {
        return params;
    }
    const entityName =
        (await ResolveTargetEntityNameAsync(params, resolvedProvider, contextUser)) ??
        resolveTargetEntityNameSync(params);
    if (!entityName || !isConversationFamilyEntity(resolvedProvider, entityName)) {
        return params;
    }
    if (Array.isArray(params.Fields) && params.Fields.length > 0) {
        const existingLower = new Set(params.Fields.map((f) => f.trim().toLowerCase()));
        const missing = REQUIRED_SECURITY_FIELDS.filter((f) => !existingLower.has(f.toLowerCase()));
        if (missing.length > 0) {
            const originalFields = [...params.Fields];
            const updated: RunViewParams = {
                ...params,
                Fields: [...params.Fields, ...missing],
            };
            getOriginalFieldsMap().set(updated, originalFields);
            return updated;
        }
    }
    return params;
};

/**
 * `PostRunView` hook enforcing strict per-conversation authorization on `MJ: Conversations`
 * (and IS-A children). Ensures `ParentID` NEVER implicitly grants access across tree queries
 * or `RunView` reads.
 */
export const ConversationPostRunViewHook: PostRunViewHook = async (
    params: RunViewParams,
    results: RunViewResult,
    contextUser: UserInfo | undefined,
    provider?: IMetadataProvider
): Promise<RunViewResult> => {
    if (!results?.Success || !contextUser || getInternalParamsSet().has(params)) {
        return results;
    }
    const resolvedProvider = resolveProvider(contextUser, provider);
    if (!resolvedProvider || resolvedProvider.ProviderType !== 'Database') {
        return results;
    }
    if (WellKnownUserSource.Instance.IsSystemUser(contextUser)) {
        return results;
    }
    const entityName =
        (await ResolveTargetEntityNameAsync(params, resolvedProvider, contextUser)) ??
        resolveTargetEntityNameSync(params);
    if (!entityName || !isConversationFamilyEntity(resolvedProvider, entityName)) {
        return results;
    }
    if (!Array.isArray(results.Results) || results.Results.length === 0) {
        return results;
    }

    try {
        return await filterReadableConversations(params, results, resolvedProvider, contextUser);
    } catch (error) {
        LogError(
            `ConversationPostRunViewHook failed on ${entityName}: ${
                error instanceof Error ? error.message : String(error)
            }`
        );
        return {
            ...results,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0,
        };
    }
};

async function filterReadableConversations(
    params: RunViewParams,
    results: RunViewResult,
    provider: IMetadataProvider,
    contextUser: UserInfo
): Promise<RunViewResult> {
    const rawRows: unknown[] = Array.isArray(results.Results) ? results.Results : [];
    const missingIds: string[] = [];
    for (const row of rawRows) {
        if (!hasRequiredSecurityFields(row)) {
            const parsed = toConversationSecurityRow(row);
            if (parsed?.ID) {
                missingIds.push(parsed.ID);
            }
        }
    }

    const hydrated = missingIds.length > 0 ? await hydrateConversationRows(provider, contextUser, missingIds) : new Map<string, ConversationSecurityRow>();
    const candidates: ConversationSecurityRow[] = [];
    for (const row of rawRows) {
        const parsed = toConversationSecurityRow(row);
        if (!parsed?.ID) {
            continue;
        }
        const meta = hydrated.get(NormalizeUUID(parsed.ID)) ?? parsed;
        candidates.push(meta);
    }

    const batchContext = await buildBatchReadContext(provider, contextUser, candidates);
    const originalFields = getOriginalFieldsMap().get(params);
    const candidateById = new Map<string, ConversationSecurityRow>();
    for (const c of candidates) {
        if (c.ID) {
            candidateById.set(NormalizeUUID(c.ID), c);
        }
    }

    const readablePairs: Array<{ row: unknown; candidate: ConversationSecurityRow }> = [];
    const readableIds = new Set<string>();
    for (const row of rawRows) {
        const parsed = toConversationSecurityRow(row);
        if (!parsed?.ID) {
            continue;
        }
        const candidate = hydrated.get(NormalizeUUID(parsed.ID)) ?? parsed;
        if (await UserCanReadConversation(provider, contextUser, candidate, batchContext)) {
            readableIds.add(NormalizeUUID(candidate.ID!));
            readablePairs.push({ row, candidate });
        }
    }

    const ancestorIdsToVerify = collectReferencedAncestorIds(readablePairs, readableIds);
    const readableAncestors = await resolveReadableAncestorIds(
        provider,
        contextUser,
        ancestorIdsToVerify,
        candidateById,
        readableIds
    );

    let anyRedacted = false;
    const keptRows: unknown[] = [];
    for (const { row, candidate } of readablePairs) {
        const { Row: redactedRow, Redacted } = redactUnreadableParentFields(row, candidate, readableAncestors);
        if (Redacted) {
            anyRedacted = true;
        }
        keptRows.push(stripSyntheticFields(redactedRow, originalFields));
    }

    const removedCount = rawRows.length - keptRows.length;
    if (removedCount === 0 && !originalFields && !anyRedacted) {
        return results;
    }
    return {
        ...results,
        Results: keptRows,
        RowCount: keptRows.length,
        TotalRowCount: Math.max(
            keptRows.length,
            (results.TotalRowCount ?? results.RowCount ?? rawRows.length) - removedCount
        ),
    };
}

function collectReferencedAncestorIds(
    readablePairs: ReadonlyArray<{ row: unknown; candidate: ConversationSecurityRow }>,
    alreadyReadableIds: ReadonlySet<string>
): string[] {
    const ids: string[] = [];
    const seen = new Set<string>();
    const pushIfNeeded = (rawId: string | null | undefined, selfId: string | undefined): void => {
        if (!rawId || !IsValidUUID(rawId)) {
            return;
        }
        const norm = NormalizeUUID(rawId);
        if (selfId && NormalizeUUID(selfId) === norm) {
            return;
        }
        if (alreadyReadableIds.has(norm) || seen.has(norm)) {
            return;
        }
        seen.add(norm);
        ids.push(rawId.trim());
    };
    for (const { row, candidate } of readablePairs) {
        const raw = toConversationSecurityRow(row);
        pushIfNeeded(candidate.ParentID, candidate.ID);
        pushIfNeeded(candidate.RootParentID ?? raw?.RootParentID, candidate.ID);
    }
    return ids;
}

async function resolveReadableAncestorIds(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    ancestorIds: readonly string[],
    candidateById: ReadonlyMap<string, ConversationSecurityRow>,
    alreadyReadableIds: ReadonlySet<string>
): Promise<Set<string>> {
    const readable = new Set<string>(alreadyReadableIds);
    if (ancestorIds.length === 0) {
        return readable;
    }
    const missingIds = ancestorIds.filter((id) => !candidateById.has(NormalizeUUID(id)));
    const hydratedAncestors =
        missingIds.length > 0 ? await hydrateConversationRows(provider, contextUser, missingIds) : new Map<string, ConversationSecurityRow>();

    const rowsToEvaluate: ConversationSecurityRow[] = [];
    for (const id of ancestorIds) {
        const norm = NormalizeUUID(id);
        const meta = candidateById.get(norm) ?? hydratedAncestors.get(norm);
        if (meta) {
            rowsToEvaluate.push(meta);
        }
    }
    if (rowsToEvaluate.length === 0) {
        return readable;
    }
    const ancestorBatchContext = await buildBatchReadContext(provider, contextUser, rowsToEvaluate);
    for (const ancestor of rowsToEvaluate) {
        if (ancestor.ID && (await UserCanReadConversation(provider, contextUser, ancestor, ancestorBatchContext))) {
            readable.add(NormalizeUUID(ancestor.ID));
        }
    }
    return readable;
}

function redactUnreadableParentFields(
    row: unknown,
    candidate: ConversationSecurityRow,
    readableAncestors: ReadonlySet<string>
): { Row: unknown; Redacted: boolean } {
    const raw = toConversationSecurityRow(row);
    const parentId = candidate.ParentID;
    const rootParentId = candidate.RootParentID ?? raw?.RootParentID ?? null;
    const parentUnreadable = Boolean(parentId && (!IsValidUUID(parentId) || !readableAncestors.has(NormalizeUUID(parentId))));
    const rootUnreadable = Boolean(
        rootParentId &&
            (!candidate.ID || !UUIDsEqual(rootParentId, candidate.ID)) &&
            (!IsValidUUID(rootParentId) || !readableAncestors.has(NormalizeUUID(rootParentId)))
    );

    if (!parentUnreadable && !rootUnreadable) {
        return { Row: row, Redacted: false };
    }

    if (row instanceof BaseEntity) {
        let changed = false;
        if (parentUnreadable) {
            const parentField = row.GetFieldByName('Parent');
            if (parentField && parentField.Value !== null) {
                parentField.Value = null;
                changed = true;
            }
        }
        if (rootUnreadable) {
            const rootField = row.GetFieldByName('RootParentID');
            if (rootField && rootField.Value !== null) {
                rootField.Value = null;
                changed = true;
            }
        }
        return { Row: row, Redacted: changed };
    }

    if (row && typeof row === 'object') {
        const copy: ConversationSecurityRow = { ...(row as ConversationSecurityRow) };
        let changed = false;
        if (parentUnreadable && Object.prototype.hasOwnProperty.call(copy, 'Parent') && copy.Parent !== null) {
            copy.Parent = null;
            changed = true;
        }
        if (rootUnreadable && Object.prototype.hasOwnProperty.call(copy, 'RootParentID') && copy.RootParentID !== null) {
            copy.RootParentID = null;
            changed = true;
        }
        return { Row: copy, Redacted: changed };
    }

    return { Row: row, Redacted: false };
}

/**
 * Registers `ConversationPreRunViewHook`, `ConversationPostRunViewHook`, and marks
 * `MJ: Conversations` family entities as `PostRunView`-protected. Idempotent.
 */
export function EnsureConversationReadSecurityHooksRegistered(): void {
    const existingPre = GetDataHooks<PreRunViewHook>('PreRunView');
    if (!existingPre.includes(ConversationPreRunViewHook)) {
        RegisterDataHook('PreRunView', ConversationPreRunViewHook);
    }
    const existingPost = GetDataHooks<PostRunViewHook>('PostRunView');
    if (!existingPost.includes(ConversationPostRunViewHook)) {
        RegisterDataHook('PostRunView', ConversationPostRunViewHook);
    }
    for (const entityName of CONVERSATION_READ_PROTECTED_ENTITIES) {
        RegisterPostRunViewProtectedEntity(entityName);
    }
}

EnsureConversationReadSecurityHooksRegistered();
