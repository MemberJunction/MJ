/**
 * Artifact read service. Loads a conversation artifact + its latest version
 * content, and classifies the content so the UI can pick a renderer.
 *
 * Artifact payloads live on MJ: Conversation Artifact Versions.Content. The
 * artifact's ArtifactType (display name) hints at the kind, but we also sniff
 * the content (JSON vs text) so rendering is robust.
 */

import { Metadata, RunView, type UserInfo } from '@memberjunction/core';
import type {
    MJConversationArtifactEntity,
    MJConversationArtifactVersionEntity,
} from '@memberjunction/core-entities';
import { parseChartSpec, type ChartSpec } from '@/components/charts/chart-spec';

/** The renderer the UI should use for an artifact's content, chosen by {@link classify}. */
export type ArtifactRenderKind = 'json-table' | 'json' | 'markdown' | 'code' | 'html' | 'chart' | 'text';

/** A fully-loaded artifact: metadata, latest-version content, and any parsed payload the chosen renderer needs. */
export type LoadedArtifact = {
    id: string;
    name: string;
    description: string | null;
    typeName: string;
    version: number;
    versionCount: number;
    /** Raw version content. */
    content: string;
    /** How the UI should render `content`. */
    kind: ArtifactRenderKind;
    /** When kind is json-table, parsed rows. */
    rows?: Record<string, unknown>[];
    /** When kind is json (object), parsed object. */
    json?: unknown;
    /** When kind is chart, the normalized chart spec. */
    chart?: ChartSpec;
    /** When kind is code, a best-effort source language hint for highlighting. */
    language?: string;
};

/** Classified content: the render kind plus any parsed payload the UI needs. */
type Classification = {
    kind: ArtifactRenderKind;
    rows?: Record<string, unknown>[];
    json?: unknown;
    chart?: ChartSpec;
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
            const chart = parseChartSpec(parsed);
            if (chart) return { kind: 'chart', chart, json: parsed };
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
 * Loads the `MJ: Conversation Artifacts` row via `GetEntityObject().Load()`, then
 * `RunView`s `MJ: Conversation Artifact Versions` (ordered `Version DESC`) to get
 * the newest content, and runs {@link classify} to pick a render kind + payload.
 *
 * @param artifactId  The `MJ: Conversation Artifacts` record id.
 * @param contextUser Optional acting user (server-side scoping); defaults to `Metadata.CurrentUser`.
 * @returns A {@link LoadedArtifact}, or `null` if the artifact can't be loaded.
 */
export async function loadArtifact(artifactId: string, contextUser?: UserInfo): Promise<LoadedArtifact | null> {
    const md = new Metadata();
    const currentUser = contextUser ?? md.CurrentUser;

    const artifact = await md.GetEntityObject<MJConversationArtifactEntity>('MJ: Conversation Artifacts', currentUser);
    const loaded = await artifact.Load(artifactId);
    if (!loaded) return null;

    const rv = new RunView();
    const versionsResult = await rv.RunView<MJConversationArtifactVersionEntity>(
        {
            EntityName: 'MJ: Conversation Artifact Versions',
            ExtraFilter: `ConversationArtifactID='${artifactId}'`,
            OrderBy: 'Version DESC',
            MaxRows: 50,
            ResultType: 'entity_object',
        },
        currentUser,
    );

    const versions = versionsResult.Success ? (versionsResult.Results ?? []) : [];
    const latest = versions[0];
    const content = latest?.Content ?? '';
    const { kind, rows, json, chart, language } = classify(artifact.ArtifactType ?? '', content);

    return {
        id: artifact.ID,
        name: artifact.Name,
        description: artifact.Description,
        typeName: artifact.ArtifactType ?? 'Artifact',
        version: latest?.Version ?? 1,
        versionCount: versions.length,
        content,
        kind,
        rows,
        json,
        chart,
        language,
    };
}

// ---------------------------------------------------------------------------
// Conversation artifact dock
// ---------------------------------------------------------------------------

/** Coarse artifact category used by the dock's filter chips. */
export type ArtifactTypeCategory = 'table' | 'chart' | 'document';

/** Lightweight artifact summary for the conversation artifact dock. */
export type ArtifactSummary = {
    id: string;
    name: string;
    description: string | null;
    typeName: string;
    /** Bucket for the Tables / Charts / Documents filter chips. */
    category: ArtifactTypeCategory;
    /** Short preview snippet (from description, else the content head). */
    preview: string;
    /** Attributed agent id (the agent whose message produced the version), if known. */
    agentId: string | null;
    /** Attributed agent display name, if known. */
    agentName: string | null;
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
 * Load the artifacts of a conversation as dock summaries — including a coarse
 * category, a preview snippet, and best-effort agent attribution.
 *
 * Attribution comes from the conversation detail (message) that references the
 * artifact (`ConversationDetail.ArtifactID` → `AgentID`); the preview/category
 * come from the artifact's latest version content.
 *
 * @param conversationId The conversation whose artifacts to load.
 * @param contextUser    Optional acting user (server-side scoping).
 */
export async function loadConversationArtifacts(conversationId: string, contextUser?: UserInfo): Promise<ArtifactSummary[]> {
    const md = new Metadata();
    const currentUser = contextUser ?? md.CurrentUser;
    const rv = new RunView();

    const artifactsResult = await rv.RunView<MJConversationArtifactEntity>(
        {
            EntityName: 'MJ: Conversation Artifacts',
            ExtraFilter: `ConversationID='${conversationId}'`,
            OrderBy: '__mj_UpdatedAt DESC',
            MaxRows: 200,
            ResultType: 'entity_object',
        },
        currentUser,
    );
    const artifacts = artifactsResult.Success ? (artifactsResult.Results ?? []) : [];
    if (artifacts.length === 0) return [];

    const contentByArtifact = await loadLatestContent(rv, artifacts.map((a) => a.ID), currentUser);
    const agentByArtifact = await loadAgentByArtifact(rv, conversationId, currentUser);
    const agentNameById = await loadAgentNames(rv, currentUser);

    return artifacts.map((artifact) => {
        const content = contentByArtifact.get(artifact.ID) ?? '';
        const agentId = agentByArtifact.get(artifact.ID) ?? null;
        const typeName = artifact.ArtifactType ?? 'Artifact';
        return {
            id: artifact.ID,
            name: artifact.Name,
            description: artifact.Description,
            typeName,
            category: categorize(typeName, content),
            preview: previewOf(artifact.Description, content),
            agentId,
            agentName: agentId ? (agentNameById.get(agentId) ?? null) : null,
        } satisfies ArtifactSummary;
    });
}

/** Load the latest version content for each artifact id. */
async function loadLatestContent(rv: RunView, artifactIds: string[], user: UserInfo | undefined): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (artifactIds.length === 0) return out;
    const result = await rv.RunView<MJConversationArtifactVersionEntity>(
        {
            EntityName: 'MJ: Conversation Artifact Versions',
            ExtraFilter: `ConversationArtifactID IN (${quotedIdList(artifactIds)})`,
            OrderBy: 'Version DESC',
            Fields: ['ConversationArtifactID', 'Content', 'Version'],
            MaxRows: 500,
            ResultType: 'simple',
        },
        user,
    );
    if (!result.Success) return out;
    for (const row of result.Results ?? []) {
        // Rows are Version DESC, so the first seen per artifact is the latest.
        if (!out.has(row.ConversationArtifactID)) out.set(row.ConversationArtifactID, row.Content ?? '');
    }
    return out;
}

/** Map artifact id → attributed agent id via the referencing message. */
async function loadAgentByArtifact(rv: RunView, conversationId: string, user: UserInfo | undefined): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const result = await rv.RunView<{ ArtifactID: string | null; AgentID: string | null }>(
        {
            EntityName: 'MJ: Conversation Details',
            ExtraFilter: `ConversationID='${conversationId}' AND ArtifactID IS NOT NULL`,
            Fields: ['ArtifactID', 'AgentID'],
            MaxRows: 500,
            ResultType: 'simple',
        },
        user,
    );
    if (result.Success) {
        for (const row of result.Results ?? []) {
            if (row.ArtifactID && row.AgentID && !out.has(row.ArtifactID)) out.set(row.ArtifactID, row.AgentID);
        }
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
