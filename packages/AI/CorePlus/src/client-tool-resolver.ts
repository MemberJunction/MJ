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
 * @module @memberjunction/ai-core-plus
 */

import { ClientToolMetadata } from './agent-types';

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
 * Render a resolved tool set as the markdown section injected into an agent's system
 * prompt (async) or realtime framing. Single wording so async and realtime read
 * identically. Returns '' when there are no tools.
 */
export function FormatClientToolsForPrompt(tools: ClientToolMetadata[]): string {
    if (!tools || tools.length === 0) {
        return '';
    }

    const lines: string[] = ['## Available Client Tools', ''];
    lines.push(
        'You can invoke these client-side tools. Each runs in the user\'s app and returns a result you can use.',
        '',
    );

    // Group by Category for readability; uncategorized tools go last under "General".
    const byCategory = new Map<string, ClientToolMetadata[]>();
    for (const tool of tools) {
        const cat = tool.Category && tool.Category.trim().length > 0 ? tool.Category : 'General';
        const bucket = byCategory.get(cat) ?? [];
        bucket.push(tool);
        byCategory.set(cat, bucket);
    }

    for (const [category, group] of byCategory) {
        lines.push(`### ${category}`);
        for (const tool of group) {
            lines.push(`- **${tool.Name}** — ${tool.Description}`);
            lines.push(`  - Input schema: \`${JSON.stringify(tool.InputSchema)}\``);
            if (tool.OutputSchema) {
                lines.push(`  - Output schema: \`${JSON.stringify(tool.OutputSchema)}\``);
            }
        }
        lines.push('');
    }

    return lines.join('\n').trimEnd();
}
