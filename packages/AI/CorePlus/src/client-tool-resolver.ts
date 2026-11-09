/**
 * @fileoverview Unified, tier-agnostic client-tool resolver.
 *
 * This is the single source of truth for "what client tools does this agent have,
 * here, right now." It is a pure function over the tool tiers — no I/O, no engine,
 * no Angular — so it runs identically:
 *   - server-side, when {@link ../../Agents BaseAgent} builds the prompt tool section, and
 *   - client-side, when the realtime co-agent resolves a {@link AppContextSnapshot}
 *     `ContextTool` call with zero server round-trip (the browser already owns all tiers).
 *
 * Static-tier data is **injected** (never fetched here) so this module stays in the
 * client-safe `@memberjunction/ai-core-plus` package.
 *
 * There is deliberately no prompt *renderer* here. A markdown tool-section formatter once lived in
 * this module with the stated aim of giving async and realtime "one wording"; neither ever adopted
 * it (the async path words its own section, and realtime renders tools as compact signatures via
 * {@link FormatAppContextNote} on purpose — voice prompts are token-sensitive and a JSON-schema dump
 * per tool is not what a speaking model wants), so it was removed rather than left as a second,
 * tempting wording with no caller.
 *
 * @module @memberjunction/ai-core-plus
 */

import { ClientToolMetadata } from './agent-types';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * A source of statically-declared (metadata) tools for an agent — e.g. the
 * `MJ: AI Agent Client Tools` junction resolved by a server engine. Injected so the
 * resolver never imports the engine and stays client-safe.
 */
export interface IClientToolSource {
    /** Static metadata tools for an agent (already loaded by the caller). */
    GetStaticTools(agentId: string): ClientToolMetadata[];
}

/**
 * Inputs to {@link ResolveClientTools}. The caller supplies whichever tiers it has;
 * each is optional. Precedence is fixed (see {@link ResolveClientTools}).
 */
export interface ResolveClientToolsInput {
    /** Agent whose tools are being resolved (used only for the static source lookup). */
    agentId: string;
    /** Static tier — pass a source OR the pre-resolved array, whichever the caller has. */
    source?: IClientToolSource;
    staticTools?: ClientToolMetadata[];
    /** App tier — tools declared on `Application.AgentSettings.ClientTools`, resolved to metadata. */
    appTools?: ClientToolMetadata[];
    /** Dynamic tier — tools registered at runtime for the current session/surface. */
    sessionTools?: ClientToolMetadata[];
    /** Override tier — per-invocation tools (highest precedence). */
    overrideTools?: ClientToolMetadata[];
}

/**
 * Resolve the effective client-tool set, first-match-wins by tool `Name`, in
 * precedence order (highest first):
 *
 *   override → session (dynamic) → app → static (metadata)
 *
 * The app tier sits between dynamic and static: more specific than the agent's global
 * metadata set, less specific than what a live surface registers right now.
 *
 * Pure and deterministic — no I/O. Returns a deduped, precedence-ordered array.
 */
export function ResolveClientTools(input: ResolveClientToolsInput): ClientToolMetadata[] {
    const map = new Map<string, ClientToolMetadata>(); // first writer wins
    const add = (tools?: ClientToolMetadata[]): void => {
        if (!tools) {
            return;
        }
        for (const tool of tools) {
            if (tool && tool.Name && !map.has(tool.Name)) {
                map.set(tool.Name, tool);
            }
        }
    };

    add(input.overrideTools);
    add(input.sessionTools);
    add(input.appTools);
    add(input.staticTools ?? input.source?.GetStaticTools(input.agentId));

    return Array.from(map.values());
}

/**
 * The structural slice of an `MJ: AI Client Tool Definitions` row the mappers below read. Declared
 * structurally (rather than importing the entity) so this module stays a pure, client-safe function
 * library; `MJAIClientToolDefinitionEntity` satisfies it as-is.
 */
export interface ClientToolDefinitionLike {
    /** The definition's primary key. */
    ID: string;
    /** The tool name the model calls. */
    Name: string;
    /** What the tool does — what the model reads to decide when to use it. */
    Description: string;
    /** JSON text of the input JSON Schema, or `null` when none was authored. */
    InputSchemaJSON: string | null;
    /** JSON text of the output JSON Schema, or `null`. */
    OutputSchemaJSON: string | null;
    /** Grouping label, or `null`. */
    Category: string | null;
    /** Per-tool timeout override in ms, or `null`. */
    DefaultTimeoutMs: number | null;
}

/** Parses a stored schema column, returning `undefined` for blank or malformed text (never throws). */
function parseSchemaColumn(text: string | null): Record<string, unknown> | undefined {
    if (typeof text !== 'string' || text.trim().length === 0) {
        return undefined;
    }
    try {
        const parsed: unknown = JSON.parse(text);
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Maps a stored client-tool definition to the {@link ClientToolMetadata} the resolver and the
 * prompt/manifest renderers consume. Tolerant by design: a hand-edited, malformed schema column
 * yields an empty `InputSchema` (the tool is still callable, just unconstrained) instead of
 * throwing out of session start.
 *
 * @param definition The definition row (or anything structurally like it).
 */
export function ClientToolMetadataFromDefinition(definition: ClientToolDefinitionLike): ClientToolMetadata {
    return {
        Name: definition.Name,
        Description: definition.Description,
        InputSchema: parseSchemaColumn(definition.InputSchemaJSON) ?? {},
        OutputSchema: parseSchemaColumn(definition.OutputSchemaJSON),
        Category: definition.Category || undefined,
        DefaultTimeoutMs: definition.DefaultTimeoutMs || undefined,
    };
}

/** One entry of `Application.AgentSettings.ClientTools`: a reference to a catalog definition. */
export interface AppClientToolReference {
    /** References `MJ: AI Client Tool Definitions` by ID (preferred)… */
    ClientToolDefinitionID?: string | null;
    /** …or by Name. */
    Name?: string | null;
    /** App-level priority for first-match-wins resolution; LOWER number = higher priority (MJ convention). */
    Priority?: number | null;
}

/**
 * Resolves an app's `AgentSettings.ClientTools` references against the client-tool catalog into the
 * **app tier** of {@link ResolveClientTools}.
 *
 * Entries resolve by `ClientToolDefinitionID` (preferred) or `Name` (case-insensitive); an entry
 * naming nothing in the catalog is skipped and reported through `onUnresolved` — a stale reference
 * must not take the app's other tools down with it. Output is ordered by `Priority` ascending (an
 * absent priority sorts last), then by declaration order, so first-match-wins resolution honors the
 * author's intent.
 *
 * @param references The app's `ClientTools` entries.
 * @param definitions The catalog (e.g. `AIEngine.Instance.ClientToolDefinitions`).
 * @param onUnresolved Optional callback invoked once per entry that matched no definition.
 */
export function ResolveAppClientToolMetadata(
    references: ReadonlyArray<AppClientToolReference> | null | undefined,
    definitions: ReadonlyArray<ClientToolDefinitionLike>,
    onUnresolved?: (reference: AppClientToolReference) => void,
): ClientToolMetadata[] {
    const resolved: Array<{ Tool: ClientToolMetadata; Priority: number; Order: number }> = [];
    (references ?? []).forEach((reference, order) => {
        const definition = findDefinition(reference, definitions);
        if (!definition) {
            onUnresolved?.(reference);
            return;
        }
        resolved.push({
            Tool: ClientToolMetadataFromDefinition(definition),
            Priority: typeof reference.Priority === 'number' ? reference.Priority : Number.MAX_SAFE_INTEGER,
            Order: order,
        });
    });
    return resolved.sort((a, b) => a.Priority - b.Priority || a.Order - b.Order).map((r) => r.Tool);
}

/** Finds the catalog definition a reference points at (ID first, then Name). */
function findDefinition(
    reference: AppClientToolReference,
    definitions: ReadonlyArray<ClientToolDefinitionLike>,
): ClientToolDefinitionLike | undefined {
    if (reference.ClientToolDefinitionID) {
        const byId = definitions.find((d) => UUIDsEqual(d.ID, reference.ClientToolDefinitionID));
        if (byId) {
            return byId;
        }
    }
    const name = reference.Name?.trim().toLowerCase();
    return name ? definitions.find((d) => d.Name.trim().toLowerCase() === name) : undefined;
}
