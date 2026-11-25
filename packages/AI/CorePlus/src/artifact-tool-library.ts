/**
 * Base class and contract types for artifact type-specific tool libraries.
 * Each artifact type can register a subclass that provides
 * tools for agents to explore artifacts of that type.
 *
 * Tool libraries are instantiated by the ArtifactToolManager when
 * an agent run includes input artifacts of the corresponding type.
 *
 * `get_full` is provided as a default tool by this base class — it returns
 * the raw artifact content (utf-8 string passthrough, or base64 for Buffer).
 * Subclasses inherit it for free; they can override `getFull()` (and optionally
 * `getFullToolDefinition()`) when "the full content" needs domain-specific
 * transformation (e.g. PDF extracts text instead of returning binary bytes).
 *
 * These types live in ai-core-plus so they can be referenced from
 * both server and client code paths (e.g. future in-browser inference).
 */

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

/**
 * JSON-compatible recursive value type for artifact tool inputs, schemas, and payloads.
 */
export type ArtifactJsonValue =
    | string
    | number
    | boolean
    | null
    | ArtifactJsonValue[]
    | { [key: string]: ArtifactJsonValue | undefined };

/**
 * Strongly typed dictionary of JSON-compatible arguments or schema fields for artifact tools.
 */
export type ArtifactToolArgs = Record<string, ArtifactJsonValue | undefined>;

/**
 * Optional execution context supplied by host callers (e.g. `ArtifactToolManager` or
 * `GovernedArtifactService`) when invoking an artifact tool library on the server.
 * Enables live data materialization (`RefreshLiveTables`, `EvaluateMjCustomFunctions`,
 * `DocumentLiveBlockEngine`) under strict user permissions without breaking 3-arg subclasses.
 */
export interface ArtifactToolExecutionContext {
    /** Authenticated human user on whose behalf the tool is executing (enforces RLS/FLS/Query perms). */
    contextUser?: UserInfo;
    /** Trusted ID of the acting user populated by host callers (never supplied by untrusted tool input). */
    actorUserId?: string;
    /** Trusted ID of the artifact's owner populated by host callers for owner-only lock operations. */
    ownerUserId?: string;
    /** Trusted edit-permission flag populated by host callers indicating whether the actor may mutate this artifact. */
    isEditor?: boolean;
    /** Request-scoped metadata provider (preferred over falling back to global `Metadata.Provider`). */
    provider?: IMetadataProvider;
    /** Underlying `MJ: Artifacts` UUID (used for `=MJ.IMPORTRANGE` resolution and audit). */
    artifactId?: string;
    /** Active `MJ: AI Agent Runs` UUID when invoked inside an agent run. */
    agentRunId?: string;
    /** Display name of the agent invoking the tool. */
    agentName?: string;
    /** Resolves a session-scoped alpha short-ID (e.g. `"D"`) or UUID string to its real `MJ: Artifacts` UUID. */
    resolveArtifactId?: (idOrAlpha: string) => string | undefined;
    /** Resolves a session-scoped alpha short-ID (e.g. `"E"`) or UUID string to its real `MJ: Artifact Versions` UUID. */
    resolveVersionId?: (idOrAlpha: string) => string | undefined;
}

export interface ArtifactToolDefinition {
    name: string;
    description: string;
    inputSchema: ArtifactToolArgs;
}

export interface ArtifactToolResult {
    success: boolean;
    data: ArtifactJsonValue | object | undefined;
    errorMessage?: string;
}

export abstract class BaseArtifactToolLibrary {
    /**
     * Returns the full tool list for this library — the base `get_full` plus
     * whatever subclass-specific tools the subclass declares. Final: subclasses
     * should override `getSubclassToolList()` rather than this method.
     */
    public GetToolList(): ArtifactToolDefinition[] {
        return [this.getFullToolDefinition(), ...this.getSubclassToolList()];
    }

    /**
     * Dispatches a tool invocation. Handles `get_full` directly; delegates
     * everything else to the subclass. Final: subclasses should override
     * `invokeSubclassTool()` rather than this method.
     */
    public async InvokeTool(
        toolName: string,
        input: ArtifactToolArgs,
        artifactContent: string | Buffer,
        context?: ArtifactToolExecutionContext
    ): Promise<ArtifactToolResult> {
        if (toolName === 'get_full') {
            return this.getFull(artifactContent);
        }
        return this.invokeSubclassTool(toolName, input, artifactContent, context);
    }

    /**
     * Subclass-specific tools (everything other than `get_full`).
     *
     * Default returns an empty list so external consumers (e.g. Skip-Brain)
     * whose subclasses still override the public `GetToolList()` directly
     * continue to compile without changes — their override of `GetToolList()`
     * replaces this whole chain. New subclasses should prefer overriding
     * this method so they pick up the base-class `get_full` for free.
     */
    protected getSubclassToolList(): ArtifactToolDefinition[] {
        return [];
    }

    /**
     * Subclass tool dispatcher — invoked for every tool except `get_full`.
     *
     * Default returns an "unknown tool" error. Same backwards-compat note as
     * `getSubclassToolList()`: external subclasses that override the public
     * `InvokeTool()` directly continue to work unchanged.
     */
    protected async invokeSubclassTool(
        toolName: string,
        _input: ArtifactToolArgs,
        _artifactContent: string | Buffer,
        _context?: ArtifactToolExecutionContext
    ): Promise<ArtifactToolResult> {
        return {
            success: false,
            data: null,
            errorMessage: `Tool "${toolName}" is not defined by this artifact tool library.`,
        };
    }

    /**
     * Returns the `get_full` tool definition. Override only to change the
     * description (e.g. PDF documents that the tool returns extracted text).
     */
    protected getFullToolDefinition(): ArtifactToolDefinition {
        return {
            name: 'get_full',
            description:
                'Returns the full artifact content. Text is returned utf-8 verbatim; binary content is base64-encoded. Use this when partial-access tools (search, slice, etc.) are not sufficient.',
            inputSchema: { type: 'object', properties: {}, required: [] },
        };
    }

    /**
     * Default `get_full` implementation. Override to transform raw bytes into a
     * domain-meaningful representation (e.g. extracted text from a PDF).
     */
    protected async getFull(artifactContent: string | Buffer): Promise<ArtifactToolResult> {
        if (typeof artifactContent === 'string') {
            return {
                success: true,
                data: {
                    content: artifactContent,
                    encoding: 'utf8',
                    sizeBytes: Buffer.byteLength(artifactContent, 'utf8'),
                },
            };
        }
        return {
            success: true,
            data: {
                content: artifactContent.toString('base64'),
                encoding: 'base64',
                sizeBytes: artifactContent.length,
            },
        };
    }
}

const EMBEDDED_ARTIFACT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMBEDDED_ARTIFACT_ALPHA_SHORT_ID_RE = /^(?:artifact\s+)?[A-Za-z]{1,2}$/i;

export type ResolveEmbeddedArtifactResult =
    | { ok: true; artifactId: string; errorMessage?: never }
    | { ok: false; artifactId?: never; errorMessage: string };

export type ResolveEmbeddedVersionResult =
    | { ok: true; versionId: string; errorMessage?: never }
    | { ok: false; versionId?: never; errorMessage: string };

interface EmbeddedUuidLookupOutcome {
    resolvedId?: string;
    errorMessage?: string;
}

function resolveEmbeddedUuidReference(
    rawId: string,
    fieldName: 'artifactId' | 'versionId',
    entityLabel: 'MJ: Artifacts' | 'MJ: Artifact Versions',
    resolver?: (idOrAlpha: string) => string | undefined
): EmbeddedUuidLookupOutcome {
    const trimmed = (rawId ?? '').trim();
    if (!trimmed) {
        return { errorMessage: `${fieldName} must be a non-empty string.` };
    }

    if (resolver) {
        const resolved = resolver(trimmed);
        if (resolved && EMBEDDED_ARTIFACT_UUID_RE.test(resolved.trim())) {
            return { resolvedId: resolved.trim() };
        }
        if (EMBEDDED_ARTIFACT_UUID_RE.test(trimmed)) {
            return { resolvedId: trimmed };
        }
        return {
            errorMessage: `Unable to resolve ${fieldName} '${trimmed}' to a valid ${entityLabel} UUID. Pass a full ${entityLabel} UUID or a valid short ID from the current session.`,
        };
    }

    if (EMBEDDED_ARTIFACT_ALPHA_SHORT_ID_RE.test(trimmed)) {
        return {
            errorMessage: `Short ${fieldName} '${trimmed}' could not be resolved to an ${entityLabel} UUID without an active artifact session.`,
        };
    }

    if (EMBEDDED_ARTIFACT_UUID_RE.test(trimmed)) {
        return { resolvedId: trimmed };
    }

    return {
        errorMessage: `Invalid ${fieldName} '${trimmed}': expected a valid ${entityLabel} UUID.`,
    };
}

/**
 * Resolves a session-scoped alpha short-ID (e.g. `"D"`) or full UUID provided to an
 * embed tool into a canonical `MJ: Artifacts` UUID, rejecting unresolvable short IDs
 * before they can be persisted into artifact content.
 */
export function ResolveEmbeddedArtifactId(
    rawId: string,
    context?: ArtifactToolExecutionContext
): ResolveEmbeddedArtifactResult {
    const outcome = resolveEmbeddedUuidReference(rawId, 'artifactId', 'MJ: Artifacts', context?.resolveArtifactId);
    if (!outcome.resolvedId) {
        return { ok: false, errorMessage: outcome.errorMessage ?? 'Unable to resolve artifactId.' };
    }
    return { ok: true, artifactId: outcome.resolvedId };
}

/**
 * Resolves a session-scoped alpha short-ID (e.g. `"E"`) or full UUID provided to an
 * embed tool into a canonical `MJ: Artifact Versions` UUID, rejecting unresolvable short
 * IDs before they can be persisted into artifact content.
 */
export function ResolveEmbeddedVersionId(
    rawId: string,
    context?: ArtifactToolExecutionContext
): ResolveEmbeddedVersionResult {
    const outcome = resolveEmbeddedUuidReference(rawId, 'versionId', 'MJ: Artifact Versions', context?.resolveVersionId);
    if (!outcome.resolvedId) {
        return { ok: false, errorMessage: outcome.errorMessage ?? 'Unable to resolve versionId.' };
    }
    return { ok: true, versionId: outcome.resolvedId };
}
