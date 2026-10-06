/**
 * Artifact read service. Loads a conversation artifact + its latest version
 * content, and classifies the content so the UI can pick a renderer.
 *
 * Artifact payloads live on MJ: Conversation Artifact Versions.Content. The
 * artifact's ArtifactType (display name) hints at the kind, but we also sniff
 * the content (JSON vs text) so rendering is robust.
 */

import { Metadata, RunView, type UserInfo } from '@memberjunction/core';
import {
    ConversationEngine,
    type MJConversationArtifactEntity,
    type MJConversationArtifactVersionEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import type { ComponentSpec } from '@memberjunction/react-runtime';
import { ParseChartSpec, type ChartSpec } from '@/components/charts/chart-spec';
import { ToInteractiveSpec } from '@/data/services/interactive-components';
import {
    ArtifactAgentInScope,
    ArtifactLinkQueries,
    BuildArtifactLinks,
    IsArtifactVersionVisible,
    IsArtifactVisible,
    type ArtifactLinks,
} from '@/data/services/artifact-scope';

/** The renderer the UI should use for an artifact's content, chosen by {@link classify}. */
export type ArtifactRenderKind = 'json-table' | 'json' | 'markdown' | 'code' | 'html' | 'chart' | 'interactive' | 'text';

/** A fully-loaded artifact: metadata, latest-version content, and any parsed payload the chosen renderer needs. */
export type LoadedArtifact = {
    id: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    description: string | null;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    TypeName: string;
    Version: number;
    VersionCount: number;
    /** Raw version content. */
    content: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /**
     * The version's MIME type, when the record carries one.
     *
     * Always null for `MJ: Conversation Artifact Versions`, which has no such column — the type
     * name is its only classifier. Kept on the shape because a registered renderer matches on
     * EITHER, and the newer `MJ: Artifact Versions` model does record a MIME type.
     */
    ContentType: string | null;
    /** How the UI should render `content`. */
    kind: ArtifactRenderKind;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** When kind is json-table, parsed rows. */
    Rows?: Record<string, unknown>[];
    /** When kind is json (object), parsed object. */
    Json?: unknown;
    /** When kind is chart, the normalized chart spec. */
    chart?: ChartSpec;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
    /** When kind is interactive, the parsed react-runtime component spec. */
    Spec?: ComponentSpec;
    /** When kind is code, a best-effort source language hint for highlighting. */
    Language?: string;
};

/** Classified content: the render kind plus any parsed payload the UI needs. */
type Classification = {
    kind: ArtifactRenderKind;
    rows?: Record<string, unknown>[];
    json?: unknown;
    chart?: ChartSpec;
    spec?: ComponentSpec;
    language?: string;
};

/** True when the trimmed content looks like an HTML document/fragment. */
function looksLikeHtml(trimmed: string): boolean {
    if (!trimmed.startsWith('<') || trimmed.startsWith('<?xml')) return false;
    // Require at least one recognizable HTML block/inline tag.
    return /<(!doctype html|html|body|div|p|h[1-6]|ul|ol|table|section|article|span|a|strong|em|br|hr)\b/i.test(trimmed);
}

/** Derive a source-language hint from an artifact type name (for code blocks). */
function languageFromTypeName(typeName: string): string | undefined {
    const t = typeName.toLowerCase();
    if (t.includes('typescript')) return 'typescript';
    if (t.includes('javascript')) return 'javascript';
    if (t.includes('python')) return 'python';
    if (t.includes('sql')) return 'sql';
    if (t.includes('yaml')) return 'yaml';
    if (t.includes('css')) return 'css';
    return undefined;
}

/**
 * Classify raw artifact content into a render kind + any parsed payload.
 * Order: chart/json (structured JSON) → HTML → code → markdown → text.
 */
function classify(typeName: string, content: string): Classification {
    const trimmed = content.trim();
    const t = typeName.toLowerCase();

    // Structured JSON first (charts, record tables, generic objects).
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const parsed: unknown = JSON.parse(trimmed);
            const chart = ParseChartSpec(parsed);
            if (chart) return { kind: 'chart', chart, json: parsed };
            // Interactive react-runtime component specs carry both a `name` and a
            // `code` body — charts (chartType/data) and plain data JSON never do,
            // so this branch can't reclassify them.
            const spec = ToInteractiveSpec(parsed, typeName);
            if (spec) return { kind: 'interactive', spec };
            if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
                return { kind: 'json-table', rows: parsed as Record<string, unknown>[] };
            }
            return { kind: 'json', json: parsed };
        } catch {
            // not valid JSON, fall through
        }
    }

    if (t.includes('html') || looksLikeHtml(trimmed)) return { kind: 'html' };
    if (t.includes('chart')) return { kind: 'chart' };
    if (t.includes('code') || t.includes('sql') || t.includes('script')) {
        return { kind: 'code', language: languageFromTypeName(typeName) };
    }
    if (t.includes('markdown') || t.includes('report') || t.includes('document') || /[#*`]/.test(trimmed)) return { kind: 'markdown' };
    return { kind: 'text' };
}

/**
 * Load an artifact and its latest version content, classified for rendering.
 *
 * Loads the `MJ: Conversation Artifacts` row via `GetEntityObject().Load()`, then reads its
 * versions visible on the current path of the conversation it belongs to (see
 * {@link loadVisibleVersions}), and runs {@link classify} on the newest one to pick a render kind
 * + payload.
 *
 * @param artifactId  The `MJ: Conversation Artifacts` record id.
 * @param contextUser Optional acting user (server-side scoping); defaults to `Metadata.CurrentUser`.
 * @returns A {@link LoadedArtifact}, or `null` if the artifact can't be loaded.
 * @throws When the scope of the artifact's conversation or its message links cannot be read.
 */
export async function LoadArtifact(artifactId: string, contextUser?: UserInfo): Promise<LoadedArtifact | null> {
    const md = new Metadata();  // global-provider-ok: single-provider mobile client (one MJAPI connection via useMJ()); no per-provider threading
    const currentUser = contextUser ?? md.CurrentUser;

    const artifact = await md.GetEntityObject<MJConversationArtifactEntity>('MJ: Conversation Artifacts', currentUser);
    const loaded = await artifact.Load(artifactId);
    if (!loaded) return null;

    const versions = await loadVisibleVersions(artifact, currentUser);
    const latest = versions[0];
    const content = latest?.Content ?? '';
    const { kind, rows, json, chart, spec, language } = classify(artifact.ArtifactType ?? '', content);

    return {
        id: artifact.ID,
        name: artifact.Name,
        description: artifact.Description,
        TypeName: artifact.ArtifactType ?? 'Artifact',
        // Always null for this entity: `MJ: Conversation Artifact Versions` has no content-type
        // column — the type name is the only classifier it carries. Kept on the shape because a
        // registered renderer matches on EITHER, and the newer `MJ: Artifact Versions` model does
        // record a MIME type.
        ContentType: null,
        Version: latest?.Version ?? 1,
        VersionCount: versions.length,
        content,
        kind,
        Rows: rows,
        Json: json,
        chart,
        Spec: spec,
        Language: language,
    };
}

/**
 * The artifact's versions visible on the current path of the conversation it belongs to, newest
 * first: the versions a message on that path links to, plus those no message links to.
 *
 * @throws When the conversation's scope or the message links cannot be read.
 */
async function loadVisibleVersions(
    artifact: MJConversationArtifactEntity,
    user: UserInfo,
): Promise<MJConversationArtifactVersionEntity[]> {
    const scope = await ConversationEngine.LoadCurrentScope(artifact.ConversationID, user);
    const [versionsResult, inScopeLinks, anyPathLinks] = await new RunView().RunViews(
        [
            {
                EntityName: 'MJ: Conversation Artifact Versions',
                ExtraFilter: `ConversationArtifactID='${EscapeSQLString(artifact.ID)}'`,
                OrderBy: 'Version DESC',
                MaxRows: 50,
                ResultType: 'entity_object',
            },
            ...ArtifactLinkQueries(scope),
        ],
        user,
    );
    const links = BuildArtifactLinks(inScopeLinks, anyPathLinks);
    const versions: MJConversationArtifactVersionEntity[] = versionsResult.Success ? (versionsResult.Results ?? []) : [];
    return versions.filter((v) => IsArtifactVersionVisible(links, v.ID));
}

// ---------------------------------------------------------------------------
// Conversation artifact dock
// ---------------------------------------------------------------------------

/** Coarse artifact category used by the dock's filter chips. */
export type ArtifactTypeCategory = 'table' | 'chart' | 'document';

/** Lightweight artifact summary for the conversation artifact dock. */
export type ArtifactSummary = {
    id: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    description: string | null;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    TypeName: string;
    /** Bucket for the Tables / Charts / Documents filter chips. */
    Category: ArtifactTypeCategory;
    /** Short preview snippet (from description, else the content head). */
    Preview: string;
    /** Attributed agent id (the agent whose message produced the version), if known. */
    AgentId: string | null;
    /** Attributed agent display name, if known. */
    AgentName: string | null;
};

/** Bucket an artifact into a dock category using its type + latest content. */
function categorize(typeName: string, content: string): ArtifactTypeCategory {
    const kind = classify(typeName, content).kind;
    if (kind === 'chart') return 'chart';
    if (kind === 'json-table') return 'table';
    const t = typeName.toLowerCase();
    if (t.includes('chart') || t.includes('graph')) return 'chart';
    if (t.includes('table') || t.includes('grid') || t.includes('data')) return 'table';
    return 'document';
}

/** Build a one-line preview from a description or the head of the content. */
function previewOf(description: string | null, content: string): string {
    const source = (description && description.trim()) || content.trim();
    const firstLine = source.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';
    return firstLine.length > 120 ? `${firstLine.slice(0, 119)}…` : firstLine;
}

/** SQL-quote a list of ids for an `IN (...)` clause. */
function quotedIdList(ids: string[]): string {
    return ids.map((id) => `'${id}'`).join(',');
}

/**
 * Load the artifacts of a conversation visible on its current path as dock summaries — including a
 * coarse category, a preview snippet, and best-effort agent attribution.
 *
 * An artifact is visible when a message on the path links to it (`ConversationDetail.ArtifactID`),
 * or when no message links to it. Attribution comes from the first message on the path that links
 * the artifact and has an agent; the preview/category come from the newest version visible on the
 * path.
 *
 * @param conversationId The conversation whose artifacts to load.
 * @param contextUser    Optional acting user (server-side scoping).
 * @throws When the conversation's scope or the message links cannot be read.
 */
export async function LoadConversationArtifacts(conversationId: string, contextUser?: UserInfo): Promise<ArtifactSummary[]> {
    const md = new Metadata();  // global-provider-ok: single-provider mobile client (one MJAPI connection via useMJ()); no per-provider threading
    const currentUser = contextUser ?? md.CurrentUser;
    const rv = new RunView();

    const scope = await ConversationEngine.LoadCurrentScope(conversationId, currentUser);
    const [artifactsResult, inScopeLinks, anyPathLinks] = await rv.RunViews(
        [
            {
                // Every artifact row of the conversation; the message links decide which are visible.
                EntityName: 'MJ: Conversation Artifacts',
                ExtraFilter: `ConversationID='${EscapeSQLString(conversationId)}'`,
                OrderBy: '__mj_UpdatedAt DESC',
                MaxRows: 200,
                ResultType: 'entity_object',
            },
            ...ArtifactLinkQueries(scope),
        ],
        currentUser,
    );
    const links = BuildArtifactLinks(inScopeLinks, anyPathLinks);
    const rows: MJConversationArtifactEntity[] = artifactsResult.Success ? (artifactsResult.Results ?? []) : [];
    const artifacts = rows.filter((a) => IsArtifactVisible(links, a.ID));
    if (artifacts.length === 0) return [];

    const contentByArtifact = await loadLatestContent(rv, artifacts.map((a) => a.ID), links, currentUser);
    const agentNameById = await loadAgentNames(rv, currentUser);

    return artifacts.map((artifact) => {
        const content = contentByArtifact.get(artifact.ID) ?? '';
        const agentId = ArtifactAgentInScope(links, artifact.ID);
        const typeName = artifact.ArtifactType ?? 'Artifact';
        return {
            id: artifact.ID,
            name: artifact.Name,
            description: artifact.Description,
            TypeName: typeName,
            Category: categorize(typeName, content),
            Preview: previewOf(artifact.Description, content),
            AgentId: agentId,
            AgentName: agentId ? (agentNameById.get(agentId) ?? null) : null,
        } satisfies ArtifactSummary;
    });
}

/** Load the content of each artifact's newest version visible in scope. */
async function loadLatestContent(
    rv: RunView,
    artifactIds: string[],
    links: ArtifactLinks,
    user: UserInfo | undefined,
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (artifactIds.length === 0) return out;
    const result = await rv.RunView<MJConversationArtifactVersionEntity>(
        {
            EntityName: 'MJ: Conversation Artifact Versions',
            ExtraFilter: `ConversationArtifactID IN (${quotedIdList(artifactIds)})`,
            OrderBy: 'Version DESC',
            Fields: ['ID', 'ConversationArtifactID', 'Content', 'Version'],
            MaxRows: 500,
            ResultType: 'simple',
        },
        user,
    );
    if (!result.Success) return out;
    for (const row of result.Results ?? []) {
        // Rows are Version DESC, so the first visible one per artifact is the newest in scope.
        if (!IsArtifactVersionVisible(links, row.ID)) continue;
        if (!out.has(row.ConversationArtifactID)) out.set(row.ConversationArtifactID, row.Content ?? '');
    }
    return out;
}

/** Map agent id → display name. */
async function loadAgentNames(rv: RunView, user: UserInfo | undefined): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const result = await rv.RunView<{ ID: string; Name: string }>(
        { EntityName: 'MJ: AI Agents', Fields: ['ID', 'Name'], MaxRows: 500, ResultType: 'simple' },
        user,
    );
    if (result.Success) {
        for (const row of result.Results ?? []) out.set(row.ID, row.Name);
    }
    return out;
}
