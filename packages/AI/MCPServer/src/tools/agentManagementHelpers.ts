/**
 * Pure helpers for the agent-management MCP tool group.
 *
 * This module is intentionally free of runtime dependencies (type-only imports
 * excepted) so its validation and matching logic can be unit-tested without
 * the full MemberJunction dependency chain.
 */
import type { AgentSpec } from '@memberjunction/ai-core-plus';

/**
 * Builder agents that are exposed as Execute_<Name>_Agent tools by default,
 * independent of any `agentTools` configuration entries. ActionSmith builds
 * new Actions (tools) and Codesmith writes/refactors code — together they let
 * an MCP client (Claude Code, Codex, etc.) not just configure agents but also
 * grow the action catalog those agents draw from.
 */
export const DEFAULT_BUILDER_AGENTS: readonly string[] = ['ActionSmith', 'Codesmith Agent'];

/**
 * Configuration for the agent-management tool group, sourced from
 * `mcpServerSettings.agentManagementTools` in mj.config.cjs.
 */
export interface AgentManagementToolsOptions {
    /** Master switch for the whole group. Defaults to enabled. */
    enabled?: boolean;
    /** Overrides {@link DEFAULT_BUILDER_AGENTS}. Pass [] to expose no builder agents. */
    builderAgents?: string[];
}

/**
 * Validates a raw spec object for Create_Agent. Returns an error message, or
 * null when the spec is acceptable to hand to AgentSpecSync.
 */
export function validateCreateSpec(spec: Partial<AgentSpec> | null | undefined): string | null {
    const baseError = validateSpecShape(spec);
    if (baseError) {
        return baseError;
    }
    if (spec!.ID && spec!.ID.trim() !== '') {
        return 'Create_Agent specs must not carry an ID — the server assigns one. Use Update_Agent to modify an existing agent.';
    }
    return null;
}

/**
 * Validates a raw spec object for Update_Agent. Returns an error message, or
 * null when the spec is acceptable to hand to AgentSpecSync.
 */
export function validateUpdateSpec(spec: Partial<AgentSpec> | null | undefined): string | null {
    const baseError = validateSpecShape(spec);
    if (baseError) {
        return baseError;
    }
    if (!spec!.ID || spec!.ID.trim() === '') {
        return 'Update_Agent specs must carry the ID of the agent to update. Use Get_Agent_Spec to fetch the current spec first.';
    }
    return null;
}

/**
 * Shared shape checks for create/update specs. AgentSpecSync full-replaces the
 * agent row on save, so Name is mandatory in both directions.
 */
function validateSpecShape(spec: Partial<AgentSpec> | null | undefined): string | null {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
        return 'spec must be a JSON object conforming to the AgentSpec shape (see Get_Agent_Spec output for an example)';
    }
    if (!spec.Name || typeof spec.Name !== 'string' || spec.Name.trim() === '') {
        return 'spec.Name is required and must be a non-empty string';
    }
    return null;
}

/**
 * Case-insensitive wildcard match used by the catalog tools.
 * Supports `*`, `prefix*`, `*suffix`, and `*contains*` patterns.
 */
export function matchesNamePattern(name: string | null | undefined, pattern: string): boolean {
    if (pattern === '*') {
        return true;
    }
    if (!name) {
        return false;
    }
    if (!pattern.includes('*')) {
        return name.toLowerCase() === pattern.toLowerCase();
    }
    const regexPattern = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\*/g, '.*');
    return new RegExp(`^${regexPattern}$`, 'i').test(name);
}
