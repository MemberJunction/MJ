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

export type ArtifactRenderKind = 'json-table' | 'json' | 'markdown' | 'code' | 'text';

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
};

function classify(typeName: string, content: string): { kind: ArtifactRenderKind; rows?: Record<string, unknown>[]; json?: unknown } {
    const trimmed = content.trim();
    // Try JSON first
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const parsed: unknown = JSON.parse(trimmed);
            if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
                return { kind: 'json-table', rows: parsed as Record<string, unknown>[] };
            }
            return { kind: 'json', json: parsed };
        } catch {
            // not valid JSON, fall through
        }
    }
    const t = typeName.toLowerCase();
    if (t.includes('code') || t.includes('sql') || t.includes('script')) return { kind: 'code' };
    if (t.includes('markdown') || t.includes('report') || t.includes('document') || /[#*`]/.test(trimmed)) return { kind: 'markdown' };
    return { kind: 'text' };
}

/**
 * Load an artifact and its latest version content.
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
    const { kind, rows, json } = classify(artifact.ArtifactType ?? '', content);

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
    };
}
