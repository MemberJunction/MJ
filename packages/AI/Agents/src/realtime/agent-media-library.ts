/**
 * @fileoverview Resolves an agent's curated **media kit** — a `MJ: Collections` of `MJ: Artifacts`
 * bound to the agent (or supplied as a per-session override) — into a compact, model-readable
 * manifest the realtime agent reasons over to decide what to show on the Media channel.
 *
 * Design: a Collection IS the kit; each `MJ: Collection Artifacts` membership row carries the
 * per-kit `Sequence` (priority), `ContextDescription` (agent "when to show it") and `Preload`
 * (eager hint). The artifact's current version supplies the actual media (`FileID` -> `MJ: Files`,
 * `MimeType`, display name). We add NO new top-level entity — the agent reuses the existing
 * `Media_ShowMedia({ fileId, mediaType, displayName })` client tool to surface a chosen item, which
 * streams through the authenticated `/media` route. Nothing here duplicates `MJ: Files`.
 *
 * Pure helpers ({@link mediaTypeFromMimeType}, {@link formatAgentMediaManifest}) are exported for
 * unit testing; the DB-touching resolvers accept an explicit `provider` + `contextUser` so they are
 * multi-provider safe and mockable.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { IMetadataProvider, RunView, UserInfo, LogError } from '@memberjunction/core';
import { IsValidUUID } from '@memberjunction/global';
import { MJCollectionArtifactEntity, MJArtifactVersionEntity, MJAIAgentEntity } from '@memberjunction/core-entities';

/** The media kinds the realtime Media channel can render (mirrors the client `Media_ShowMedia` enum). */
export type AgentMediaKind = 'image' | 'video' | 'audio' | 'pdf' | 'web';

/** One resolved, model-readable media item in an agent's kit (ordered by its membership `Sequence`). */
export interface AgentMediaManifestItem {
    /** The `MJ: Collection Artifacts` membership id (stable per kit). */
    ResourceID: string;
    /** The `MJ: Files` id to show — streamed securely via the `/media` route by `Media_ShowMedia`. */
    FileID: string;
    /** The media kind derived from the artifact version's MIME type. */
    MediaType: AgentMediaKind;
    /** Short label for the item's tab (the artifact version's name). */
    DisplayName: string;
    /** Agent-facing "what this is / when to show it" (membership override, else the version description). */
    ContextDescription: string | null;
    /** When true, the agent is told to show this at session start rather than waiting for relevance. */
    Preload: boolean;
}

/**
 * Maps an artifact version's MIME type to a Media-channel kind. Returns `null` for types the Media
 * surface can't render as media (so the caller drops the item from the kit).
 */
export function mediaTypeFromMimeType(mimeType: string | null | undefined): AgentMediaKind | null {
    const mime = (mimeType ?? '').trim().toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime === 'application/pdf') return 'pdf';
    if (mime === 'text/html' || mime === 'application/xhtml+xml') return 'web';
    return null;
}

/**
 * Resolves the Collection id that is the agent's media kit for this session:
 * `override > AIAgent.DefaultMediaCollectionID > null`.
 */
export async function resolveAgentMediaCollectionID(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    agentID: string,
    overrideCollectionID?: string | null,
): Promise<string | null> {
    if (overrideCollectionID) {
        // The override may come from a calling app / per-session input, so validate it as a UUID before it
        // ever reaches a filter. A malformed override is ignored (logged) and resolution falls back to the
        // agent default — never a broken or injected query.
        const trimmed = overrideCollectionID.trim();
        if (IsValidUUID(trimmed)) {
            return trimmed;
        }
        LogError(
            `[agent-media-library] Ignoring malformed overrideCollectionID '${overrideCollectionID}' — ` +
                'falling back to the agent default media kit.',
        );
    }
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<MJAIAgentEntity>(
        { EntityName: 'AI Agents', ExtraFilter: `ID='${agentID}'`, ResultType: 'entity_object' },
        contextUser,
    );
    if (!result.Success || result.Results.length === 0) {
        return null;
    }
    return result.Results[0].DefaultMediaCollectionID ?? null;
}

/**
 * Loads a Collection's artifacts (ordered by membership `Sequence`) and resolves each to a media
 * manifest item, dropping memberships whose current version has no `FileID` or a non-media MIME type.
 */
export async function resolveAgentMediaManifest(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    collectionID: string,
): Promise<AgentMediaManifestItem[]> {
    const rv = RunView.FromMetadataProvider(provider);
    const memberships = await rv.RunView<MJCollectionArtifactEntity>(
        {
            EntityName: 'MJ: Collection Artifacts',
            ExtraFilter: `CollectionID='${collectionID}'`,
            OrderBy: 'Sequence ASC',
            ResultType: 'entity_object',
        },
        contextUser,
    );
    if (!memberships.Success || memberships.Results.length === 0) {
        return [];
    }

    const versionsByID = await loadArtifactVersions(rv, contextUser, memberships.Results.map((m) => m.ArtifactVersionID));
    const items: AgentMediaManifestItem[] = [];
    for (const membership of memberships.Results) {
        const item = toManifestItem(membership, versionsByID.get(membership.ArtifactVersionID));
        if (item) {
            items.push(item);
        }
    }
    return items;
}

/** Loads the artifact versions referenced by a kit's memberships, keyed by id. */
async function loadArtifactVersions(
    rv: RunView,
    contextUser: UserInfo,
    versionIDs: string[],
): Promise<Map<string, MJArtifactVersionEntity>> {
    const byID = new Map<string, MJArtifactVersionEntity>();
    const uniqueIDs = [...new Set(versionIDs.filter((id) => !!id))];
    if (uniqueIDs.length === 0) {
        return byID;
    }
    const inList = uniqueIDs.map((id) => `'${id}'`).join(',');
    const result = await rv.RunView<MJArtifactVersionEntity>(
        { EntityName: 'MJ: Artifact Versions', ExtraFilter: `ID IN (${inList})`, ResultType: 'entity_object' },
        contextUser,
    );
    if (result.Success) {
        for (const version of result.Results) {
            byID.set(version.ID, version);
        }
    }
    return byID;
}

/** Resolves one membership + its artifact version to a manifest item, or `null` if not showable. */
function toManifestItem(
    membership: MJCollectionArtifactEntity,
    version: MJArtifactVersionEntity | undefined,
): AgentMediaManifestItem | null {
    if (!version || !version.FileID) {
        return null; // text-only / unresolved versions can't be shown as media
    }
    const mediaType = mediaTypeFromMimeType(version.MimeType);
    if (!mediaType) {
        return null; // non-media MIME type — drop from the kit
    }
    return {
        ResourceID: membership.ID,
        FileID: version.FileID,
        MediaType: mediaType,
        DisplayName: version.Name?.trim() || 'Media',
        ContextDescription: membership.ContextDescription?.trim() || version.Description?.trim() || null,
        Preload: !!membership.Preload,
    };
}

/**
 * Formats a media manifest into a single background context note for the realtime agent. Lists each
 * item with its `fileId`, media type, display name and when-to-show guidance, and instructs the agent
 * to surface items with the existing `Media_ShowMedia` tool. Returns `null` for an empty manifest.
 */
export function formatAgentMediaManifest(items: AgentMediaManifestItem[]): string | null {
    if (items.length === 0) {
        return null;
    }
    const lines = items.map((item, index) => {
        const when = item.ContextDescription ? ` — ${item.ContextDescription}` : '';
        const preload = item.Preload ? ' [PRELOAD: show at the start of the call]' : '';
        return `${index + 1}. "${item.DisplayName}" (${item.MediaType})${when} fileId: ${item.FileID}${preload}`;
    });
    return (
        '[media-library] You have a curated media kit you can show on the shared Media surface during this call. ' +
        'To show an item, call Media_ShowMedia with its fileId, mediaType and displayName. Show an item only when ' +
        'it is relevant (or now, if it is marked PRELOAD). Do NOT read this list aloud. Available items, in priority order:\n' +
        lines.join('\n')
    );
}

/**
 * End-to-end: resolves the agent's media kit (override > agent default) and returns the formatted
 * agent context note, or `null` when there is no kit / no showable items. Best-effort: logs and
 * returns `null` on any failure so it can never break session start.
 */
export async function buildAgentMediaContextNote(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    agentID: string,
    overrideCollectionID?: string | null,
): Promise<string | null> {
    try {
        const collectionID = await resolveAgentMediaCollectionID(provider, contextUser, agentID, overrideCollectionID);
        if (!collectionID) {
            return null;
        }
        const items = await resolveAgentMediaManifest(provider, contextUser, collectionID);
        return formatAgentMediaManifest(items);
    } catch (error) {
        LogError(`[agent-media-library] Failed to build media manifest for agent ${agentID}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}
