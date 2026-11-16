import {
    BaseEntity,
    GetDataHooks,
    IMetadataProvider,
    LogError,
    Metadata,
    PostRunViewHook,
    RegisterDataHook,
    RunView,
    RunViewParams,
    RunViewResult,
    UserInfo,
    WellKnownUserSource
} from '@memberjunction/core';
import { EscapeSQLString, NormalizeUUID } from '@memberjunction/global';
import {
    AnchoredConversationCandidate,
    FilterAnchoredConversationsForUser,
    type MJConversationEntity
} from '@memberjunction/core-entities';

const INTERNAL_SECURITY_QUERY_PARAMS = new WeakSet<object>();

interface ConversationRowProjection {
    ID?: string;
    LinkedEntityID?: string | null;
    LinkedRecordID?: string | null;
    AnchorType?: MJConversationEntity['AnchorType'];
    AnchorKey?: string | null;
    AnchorMetadata?: string | null;
    AnchorMetadataObject?: MJConversationEntity['AnchorMetadataObject'];
}

interface ConversationDetailRowProjection {
    ID?: string;
    ConversationID?: string | null;
}

/**
 * Resolves the entity name targeted by `params` without additional I/O.
 */
function resolveTargetEntityName(params: RunViewParams): string {
    if (typeof params.EntityName === 'string' && params.EntityName.trim().length > 0) {
        return params.EntityName.trim();
    }
    const viewEntityName = params.ViewEntity?.Get('Entity');
    if (typeof viewEntityName === 'string' && viewEntityName.trim().length > 0) {
        return viewEntityName.trim();
    }
    return '';
}

function resolveProviderForUser(contextUser: UserInfo): IMetadataProvider | null {
    return (
        contextUser.OwningProvider ??
        Metadata.Provider ?? // global-provider-ok: fallback when UserInfo was constructed without an OwningProvider
        null
    );
}

function readRowField(row: unknown, fieldName: string): unknown {
    if (!row || typeof row !== 'object') {
        return undefined;
    }
    if (row instanceof BaseEntity) {
        return row.Get(fieldName);
    }
    return (row as Record<string, unknown>)[fieldName];
}

function hasOwnOrEntityField(row: unknown, fieldName: string): boolean {
    if (!row || typeof row !== 'object') {
        return false;
    }
    if (row instanceof BaseEntity) {
        return true;
    }
    return Object.prototype.hasOwnProperty.call(row, fieldName);
}

/**
 * Server-side `PostRunView` data hook enforcing Row-Level Security (RLS) and Field-Level Security (FLS)
 * on anchored conversations (`MJ: Conversations` where `AnchorType IS NOT NULL`) and their comment
 * messages (`MJ: Conversation Details`).
 *
 * Guarantees that even a raw `RunView` call over GraphQL, REST, or server code cannot return:
 * - Anchored conversation threads (`MJ: Conversations`) attached to a linked record that `contextUser`
 *   cannot read (entity permissions + RLS), or anchored/stamped with restricted fields (`AnchorKey` /
 *   `AnchorMetadata.restrictedFields`) that `contextUser` is denied Read access to (FLS).
 * - Comment messages (`MJ: Conversation Details`) belonging to any such anchored conversation thread.
 *
 * Never mutates `results.Results` in place (safe with frozen cache entries); returns a replacement
 * `RunViewResult` whenever rows are filtered out.
 */
function isConversationOrISADescendant(
    provider: IMetadataProvider | null,
    entityName: string
): boolean {
    if (
        entityName === 'MJ: Conversations' ||
        entityName === 'MJ: Comments' ||
        entityName === 'MJ: Field Suggestions'
    ) {
        return true;
    }
    if (!provider) {
        return false;
    }
    const entityInfo =
        (typeof provider.EntityByName === 'function'
            ? provider.EntityByName(entityName)
            : undefined) ?? provider.Entities?.find((e) => e.Name === entityName);
    let cur = entityInfo?.ParentEntityInfo ?? null;
    while (cur) {
        if (cur.Name === 'MJ: Conversations') {
            return true;
        }
        cur = cur.ParentEntityInfo;
    }
    return false;
}

export const AnchoredConversationPostRunViewHook: PostRunViewHook = async (
    params: RunViewParams,
    results: RunViewResult,
    contextUser: UserInfo | undefined
): Promise<RunViewResult> => {
    if (
        !results?.Success ||
        !Array.isArray(results.Results) ||
        results.Results.length === 0 ||
        !contextUser ||
        INTERNAL_SECURITY_QUERY_PARAMS.has(params)
    ) {
        return results;
    }

    const entityName = resolveTargetEntityName(params);
    if (!entityName) {
        return results;
    }

    const provider = resolveProviderForUser(contextUser);
    const isConvFamily = isConversationOrISADescendant(provider, entityName);
    if (!isConvFamily && entityName !== 'MJ: Conversation Details') {
        return results;
    }

    if (!provider || provider.ProviderType !== 'Database') {
        return results;
    }

    if (WellKnownUserSource.Instance.IsSystemUser(contextUser)) {
        return results;
    }

    try {
        if (isConvFamily) {
            return await filterConversationsRunViewResult(provider, contextUser, results);
        }
        return await filterConversationDetailsRunViewResult(provider, contextUser, results);
    } catch (error) {
        LogError(
            `AnchoredConversationPostRunViewHook failed on ${entityName}: ${
                error instanceof Error ? error.message : String(error)
            }`
        );
        return results;
    }
};

async function filterConversationsRunViewResult(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    results: RunViewResult
): Promise<RunViewResult> {
    const rows = results.Results as unknown[];

    // Check if any row is missing security columns due to a narrow `Fields` projection
    const missingMetadataIds: string[] = [];
    for (const row of rows) {
        const hasSecurityCols =
            hasOwnOrEntityField(row, 'AnchorType') &&
            hasOwnOrEntityField(row, 'LinkedEntityID') &&
            hasOwnOrEntityField(row, 'LinkedRecordID') &&
            hasOwnOrEntityField(row, 'AnchorKey') &&
            hasOwnOrEntityField(row, 'AnchorMetadata');
        if (!hasSecurityCols) {
            const id = String(readRowField(row, 'ID') ?? '').trim();
            if (id) {
                missingMetadataIds.push(id);
            }
        }
    }

    const hydratedById = new Map<string, ConversationRowProjection>();
    if (missingMetadataIds.length > 0) {
        const fetched = await fetchConversationsSecurityMetadataByIds(
            provider,
            contextUser,
            missingMetadataIds,
            false
        );
        for (const item of fetched) {
            if (item.ID) {
                hydratedById.set(NormalizeUUID(item.ID), item);
            }
        }
    }

    // Collect anchored candidates
    const anchoredCandidates: Array<AnchoredConversationCandidate & { __rowIndex: number }> = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowId = String(readRowField(row, 'ID') ?? '').trim();
        const hydrated = rowId ? hydratedById.get(NormalizeUUID(rowId)) : undefined;

        const anchorType = (
            hydrated ? hydrated.AnchorType : readRowField(row, 'AnchorType')
        ) as MJConversationEntity['AnchorType'];
        const linkedEntityId = (
            hydrated ? hydrated.LinkedEntityID : readRowField(row, 'LinkedEntityID')
        ) as string | null | undefined;
        const linkedRecordId = (
            hydrated ? hydrated.LinkedRecordID : readRowField(row, 'LinkedRecordID')
        ) as string | null | undefined;

        if (!anchorType && (!linkedEntityId || !linkedRecordId)) {
            continue;
        }
        // Only filter anchored comment threads (or conversations linked to a record that carry an anchor)
        if (!anchorType) {
            continue;
        }

        const anchorKey = (
            hydrated ? hydrated.AnchorKey : readRowField(row, 'AnchorKey')
        ) as string | null | undefined;
        const anchorMetadata = (
            hydrated ? hydrated.AnchorMetadata : readRowField(row, 'AnchorMetadata')
        ) as string | null | undefined;
        const anchorMetadataObject = (
            hydrated ? hydrated.AnchorMetadataObject : readRowField(row, 'AnchorMetadataObject')
        ) as MJConversationEntity['AnchorMetadataObject'];

        anchoredCandidates.push({
            __rowIndex: i,
            ID: rowId || undefined,
            LinkedEntityID: linkedEntityId ?? null,
            LinkedRecordID: linkedRecordId ?? null,
            AnchorType: anchorType,
            AnchorKey: anchorKey ?? null,
            AnchorMetadata: anchorMetadata ?? null,
            AnchorMetadataObject: anchorMetadataObject ?? null
        });
    }

    if (anchoredCandidates.length === 0) {
        return results;
    }

    const allowedAnchored = await FilterAnchoredConversationsForUser(
        provider,
        contextUser,
        anchoredCandidates
    );
    if (allowedAnchored.length === anchoredCandidates.length) {
        return results;
    }

    const allowedRowIndexes = new Set<number>(allowedAnchored.map((c) => c.__rowIndex));
    const anchoredRowIndexes = new Set<number>(anchoredCandidates.map((c) => c.__rowIndex));

    const filteredRows = rows.filter(
        (_row, index) => !anchoredRowIndexes.has(index) || allowedRowIndexes.has(index)
    );
    const removedCount = rows.length - filteredRows.length;

    return {
        ...results,
        Results: filteredRows,
        RowCount: filteredRows.length,
        TotalRowCount: Math.max(
            filteredRows.length,
            (results.TotalRowCount ?? results.RowCount ?? rows.length) - removedCount
        )
    };
}

async function filterConversationDetailsRunViewResult(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    results: RunViewResult
): Promise<RunViewResult> {
    const rows = results.Results as unknown[];

    const missingConvIdDetailIds: string[] = [];
    for (const row of rows) {
        if (!hasOwnOrEntityField(row, 'ConversationID')) {
            const detailId = String(readRowField(row, 'ID') ?? '').trim();
            if (detailId) {
                missingConvIdDetailIds.push(detailId);
            }
        }
    }

    const convIdByDetailId = new Map<string, string>();
    if (missingConvIdDetailIds.length > 0) {
        const fetchedDetails = await fetchDetailConversationIdsByIds(
            provider,
            contextUser,
            missingConvIdDetailIds
        );
        for (const d of fetchedDetails) {
            if (d.ID && d.ConversationID) {
                convIdByDetailId.set(NormalizeUUID(d.ID), d.ConversationID);
            }
        }
    }

    const conversationIdsByNorm = new Map<string, string>();
    const rowConvNormByIndex = new Map<number, string>();

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        let convId = String(readRowField(row, 'ConversationID') ?? '').trim();
        if (!convId) {
            const detailId = String(readRowField(row, 'ID') ?? '').trim();
            if (detailId) {
                convId = convIdByDetailId.get(NormalizeUUID(detailId)) ?? '';
            }
        }
        if (convId) {
            const norm = NormalizeUUID(convId);
            conversationIdsByNorm.set(norm, convId);
            rowConvNormByIndex.set(i, norm);
        }
    }

    if (conversationIdsByNorm.size === 0) {
        return results;
    }

    // Fetch only parent conversations that are anchored (`AnchorType IS NOT NULL`)
    const anchoredParents = await fetchConversationsSecurityMetadataByIds(
        provider,
        contextUser,
        [...conversationIdsByNorm.values()],
        true
    );
    if (anchoredParents.length === 0) {
        return results;
    }

    const allowedParents = await FilterAnchoredConversationsForUser(
        provider,
        contextUser,
        anchoredParents
    );
    if (allowedParents.length === anchoredParents.length) {
        return results;
    }

    const allowedNormIds = new Set<string>(
        allowedParents.map((c) => NormalizeUUID(String(c.ID ?? '')))
    );
    const deniedNormIds = new Set<string>();
    for (const parent of anchoredParents) {
        const norm = NormalizeUUID(String(parent.ID ?? ''));
        if (norm && !allowedNormIds.has(norm)) {
            deniedNormIds.add(norm);
        }
    }

    if (deniedNormIds.size === 0) {
        return results;
    }

    const filteredRows = rows.filter((_row, index) => {
        const convNorm = rowConvNormByIndex.get(index);
        return !convNorm || !deniedNormIds.has(convNorm);
    });
    const removedCount = rows.length - filteredRows.length;

    return {
        ...results,
        Results: filteredRows,
        RowCount: filteredRows.length,
        TotalRowCount: Math.max(
            filteredRows.length,
            (results.TotalRowCount ?? results.RowCount ?? rows.length) - removedCount
        )
    };
}

async function fetchConversationsSecurityMetadataByIds(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    conversationIds: readonly string[],
    anchoredOnly: boolean
): Promise<ConversationRowProjection[]> {
    const uniqueEscaped = Array.from(
        new Set(
            conversationIds
                .map((id) => id.trim())
                .filter((id) => id.length > 0)
                .map((id) => `'${EscapeSQLString(id)}'`)
        )
    );
    if (uniqueEscaped.length === 0) {
        return [];
    }

    const systemUser = (await WellKnownUserSource.Instance.GetSystemUser(provider)) ?? contextUser;
    const rv = RunView.FromMetadataProvider(provider);
    const filterClauses = [`ID IN (${uniqueEscaped.join(',')})`];
    if (anchoredOnly) {
        filterClauses.push(`AnchorType IS NOT NULL`);
    }

    const params: RunViewParams = {
        EntityName: 'MJ: Conversations',
        ExtraFilter: filterClauses.join(' AND '),
        Fields: ['ID', 'LinkedEntityID', 'LinkedRecordID', 'AnchorType', 'AnchorKey', 'AnchorMetadata'],
        ResultType: 'simple'
    };
    INTERNAL_SECURITY_QUERY_PARAMS.add(params);

    const res = await rv.RunView<ConversationRowProjection>(params, systemUser);
    if (!res?.Success || !Array.isArray(res.Results)) {
        return [];
    }
    return res.Results;
}

async function fetchDetailConversationIdsByIds(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    detailIds: readonly string[]
): Promise<ConversationDetailRowProjection[]> {
    const uniqueEscaped = Array.from(
        new Set(
            detailIds
                .map((id) => id.trim())
                .filter((id) => id.length > 0)
                .map((id) => `'${EscapeSQLString(id)}'`)
        )
    );
    if (uniqueEscaped.length === 0) {
        return [];
    }

    const systemUser = (await WellKnownUserSource.Instance.GetSystemUser(provider)) ?? contextUser;
    const rv = RunView.FromMetadataProvider(provider);
    const params: RunViewParams = {
        EntityName: 'MJ: Conversation Details',
        ExtraFilter: `ID IN (${uniqueEscaped.join(',')})`,
        Fields: ['ID', 'ConversationID'],
        ResultType: 'simple'
    };
    INTERNAL_SECURITY_QUERY_PARAMS.add(params);

    const res = await rv.RunView<ConversationDetailRowProjection>(params, systemUser);
    if (!res?.Success || !Array.isArray(res.Results)) {
        return [];
    }
    return res.Results;
}

/**
 * Ensures {@link AnchoredConversationPostRunViewHook} is registered in the global `PostRunView`
 * data hooks store. Safe to call multiple times (idempotent).
 */
export function EnsureAnchoredConversationReadHookRegistered(): void {
    const existing = GetDataHooks<PostRunViewHook>('PostRunView');
    if (!existing.includes(AnchoredConversationPostRunViewHook)) {
        RegisterDataHook('PostRunView', AnchoredConversationPostRunViewHook);
    }
}

// Auto-register when @memberjunction/core-entities-server is loaded
EnsureAnchoredConversationReadHookRegistered();
