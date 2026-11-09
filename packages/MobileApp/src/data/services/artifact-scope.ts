/**
 * Which conversation artifacts (`MJ: Conversation Artifacts`) and artifact versions
 * (`MJ: Conversation Artifact Versions`) one conversation scope shows.
 *
 * Neither entity carries a message column. The link runs the other way: a
 * `MJ: Conversation Details` row carries `ArtifactID` and `ArtifactVersionID`. An artifact or a
 * version is visible in a scope when a message in that scope links to it, or when no message on
 * any path links to it (one made outside a turn, such as by Component Studio).
 */

import type { RunViewParams, RunViewResult } from '@memberjunction/core';
import { ConversationEngine, type ConversationScope } from '@memberjunction/core-entities';
import { EscapeSQLString, NormalizeUUID } from '@memberjunction/global';

/** The link columns of one `MJ: Conversation Details` row. */
export type ArtifactLinkRow = {
    ArtifactID: string | null;
    ArtifactVersionID: string | null;
    AgentID?: string | null;
};

/** Artifact and version links of one conversation. All ids are normalized with `NormalizeUUID`. */
export type ArtifactLinks = {
    /** Artifact id → agent of the first message in scope that links it and has an agent (null when none has). */
    readonly InScopeArtifacts: ReadonlyMap<string, string | null>;
    /** Versions a message in scope links to. */
    readonly InScopeVersions: ReadonlySet<string>;
    /** Artifacts a message on any path links to. */
    readonly LinkedArtifacts: ReadonlySet<string>;
    /** Versions a message on any path links to. */
    readonly LinkedVersions: ReadonlySet<string>;
};

const LINKED = '([ArtifactID] IS NOT NULL OR [ArtifactVersionID] IS NOT NULL)';

/**
 * The two message-link reads, for a `RunViews` batch: the links in scope (with the agent that made
 * them), then the links on every path of the conversation. Neither read has a row cap, so a version
 * linked only from another path is never mistaken for an unlinked one.
 */
export function ArtifactLinkQueries(scope: ConversationScope): [RunViewParams, RunViewParams] {
    return [
        {
            EntityName: 'MJ: Conversation Details',
            ExtraFilter: `${ConversationEngine.ScopeFilter(scope)} AND ${LINKED}`,
            OrderBy: 'Sequence ASC',
            Fields: ['ArtifactID', 'ArtifactVersionID', 'AgentID'],
            ResultType: 'simple',
            IgnoreMaxRows: true,
        },
        {
            // conversation-scope: links on every path, so an artifact or version no message links to stays visible on every path
            EntityName: 'MJ: Conversation Details',
            ExtraFilter: `[ConversationID]='${EscapeSQLString(scope.ConversationID)}' AND ${LINKED}`,
            Fields: ['ArtifactID', 'ArtifactVersionID'],
            ResultType: 'simple',
            IgnoreMaxRows: true,
        },
    ];
}

/**
 * Builds the links from the results of {@link ArtifactLinkQueries}, in the same order.
 * @throws when either read failed, with the error of the read that failed
 */
export function BuildArtifactLinks(
    inScope: RunViewResult<ArtifactLinkRow>,
    anyPath: RunViewResult<ArtifactLinkRow>,
): ArtifactLinks {
    if (!inScope.Success || !anyPath.Success) {
        const failed = inScope.Success ? anyPath : inScope;
        throw new Error(`Failed to load artifact links: ${failed.ErrorMessage || 'unknown error'}`);
    }
    const inScopeArtifacts = new Map<string, string | null>();
    const inScopeVersions = new Set<string>();
    for (const row of inScope.Results ?? []) {
        const artifactId = NormalizeUUID(row.ArtifactID);
        if (artifactId && (inScopeArtifacts.get(artifactId) ?? null) === null) inScopeArtifacts.set(artifactId, row.AgentID ?? null);
        if (row.ArtifactVersionID) inScopeVersions.add(NormalizeUUID(row.ArtifactVersionID));
    }
    const linkedArtifacts = new Set<string>();
    const linkedVersions = new Set<string>();
    for (const row of anyPath.Results ?? []) {
        if (row.ArtifactID) linkedArtifacts.add(NormalizeUUID(row.ArtifactID));
        if (row.ArtifactVersionID) linkedVersions.add(NormalizeUUID(row.ArtifactVersionID));
    }
    return {
        InScopeArtifacts: inScopeArtifacts,
        InScopeVersions: inScopeVersions,
        LinkedArtifacts: linkedArtifacts,
        LinkedVersions: linkedVersions,
    };
}

/** True when a message in scope links to the artifact, or no message links to it. */
export function IsArtifactVisible(links: ArtifactLinks, artifactId: string): boolean {
    const id = NormalizeUUID(artifactId);
    return links.InScopeArtifacts.has(id) || !links.LinkedArtifacts.has(id);
}

/** True when a message in scope links to the version, or no message links to it. */
export function IsArtifactVersionVisible(links: ArtifactLinks, versionId: string): boolean {
    const id = NormalizeUUID(versionId);
    return links.InScopeVersions.has(id) || !links.LinkedVersions.has(id);
}

/** The agent of the first message in scope that links the artifact and has an agent, or null. */
export function ArtifactAgentInScope(links: ArtifactLinks, artifactId: string): string | null {
    return links.InScopeArtifacts.get(NormalizeUUID(artifactId)) ?? null;
}
