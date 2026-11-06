/**
 * @fileoverview The **owner-keyed registry of app client tools** a host registers with a realtime
 * session (the tools the `ContextTool` proxy can run in the browser).
 *
 * The first version of this registry had one operation: *replace everything*. That is a trap the
 * moment a host has two sources of tools. Explorer has two — a set of always-available globals
 * (navigate, open a record, set the theme) and the tools of whichever surface the user is looking
 * at — and registering the surface's tools replaced the globals unless the caller remembered to
 * merge them back, and left the *previous* surface's tools registered if it forgot to clear them
 * (the stale-tools-after-app-switch bug).
 *
 * The fix is ownership. Each source registers under an **owner key** and a registration replaces
 * **only that owner's set**:
 *
 * ```
 * Register('explorer.global',  [NavigateToApp, NavigateToRecord, …])   // once
 * Register('explorer.surface', [SetFilter, …])                          // on every surface change
 * Register('explorer.surface', [])                                      // surface gone → ONLY its tools go
 * ```
 *
 * When two owners register a tool with the same name, the **later-registered owner wins** (an
 * owner keeps its slot when it re-registers, so precedence does not flip every time a surface
 * refreshes) — the more specific source is registered after the more general one.
 *
 * @module @memberjunction/realtime-runtime
 */

import type { ClientToolMetadata } from '@memberjunction/ai-core-plus';

/** Runs a client tool in the browser and returns its result (may be sync or async). */
export type RealtimeAppClientToolHandler = (params: Record<string, unknown>) => Promise<unknown> | unknown;

/**
 * One tool a host registers. Only `Name` and `Handler` are required; the optional metadata makes the
 * tool describable (in "available tools" error messages and the resolved capability set) without the
 * host publishing a separate manifest.
 */
export interface AppClientToolRegistration {
    /** The tool name the model calls (matched case-insensitively). */
    Name: string;
    /** Executes the tool. */
    Handler: RealtimeAppClientToolHandler;
    /** What the tool does, for the model. */
    Description?: string;
    /** JSON Schema of the tool's parameters. */
    InputSchema?: Record<string, unknown>;
    /** Grouping label. */
    Category?: string;
}

/** The owner key used by the single-argument `RegisterAppClientTools(tools)` form. */
export const DEFAULT_APP_TOOL_OWNER = 'default';

/** Owner-keyed registry; see the module documentation. */
export class AppClientToolRegistry {
    /** Owner → (lower-cased tool name → registration). Map insertion order = owner precedence (later wins). */
    private readonly owners = new Map<string, Map<string, AppClientToolRegistration>>();

    /**
     * Replaces the tool set of ONE owner; every other owner's tools are untouched. Invalid entries
     * (no name, no handler) are skipped. An empty list clears the owner's tools (it keeps its place in the
     * precedence order; {@link Unregister} gives the place up too).
     *
     * @param owner A stable key naming the source (`'explorer.surface'`). Blank → {@link DEFAULT_APP_TOOL_OWNER}.
     * @param tools The owner's complete current set.
     */
    public Register(owner: string, tools: ReadonlyArray<AppClientToolRegistration>): void {
        const key = normalizeOwner(owner);
        const set = new Map<string, AppClientToolRegistration>();
        for (const tool of tools) {
            if (tool?.Name?.trim() && typeof tool.Handler === 'function') {
                set.set(tool.Name.trim().toLowerCase(), tool);
            }
        }
        // Map#set on an existing key keeps its insertion slot, so an owner that re-registers (even with
        // an empty set) keeps its place in the precedence order; only Unregister() gives the slot up.
        this.owners.set(key, set);
    }

    /** Removes one owner's tools (no-op when it has none). */
    public Unregister(owner: string): void {
        this.owners.delete(normalizeOwner(owner));
    }

    /** Removes every owner's tools. */
    public Clear(): void {
        this.owners.clear();
    }

    /** Finds a tool by name (case-insensitive); on a collision the later-registered owner wins. */
    public Find(name: string): AppClientToolRegistration | undefined {
        const wanted = (name ?? '').trim().toLowerCase();
        let found: AppClientToolRegistration | undefined;
        for (const set of this.owners.values()) {
            found = set.get(wanted) ?? found;
        }
        return found;
    }

    /** The distinct registered tool names, in registration form. */
    public Names(): string[] {
        const names = new Map<string, string>();
        for (const set of this.owners.values()) {
            for (const [lower, tool] of set) {
                names.set(lower, tool.Name);
            }
        }
        return [...names.values()];
    }

    /**
     * The registered tools as {@link ClientToolMetadata} — the *session tier* of `ResolveClientTools`.
     * Ordered later-owner-first, so the resolver's first-match-wins agrees with {@link Find}.
     */
    public ToMetadata(): ClientToolMetadata[] {
        const ordered = [...this.owners.values()].reverse();
        return ordered.flatMap((set) =>
            [...set.values()].map((tool) => ({
                Name: tool.Name,
                Description: tool.Description ?? '',
                InputSchema: tool.InputSchema ?? {},
                Category: tool.Category,
            })),
        );
    }
}

/** Normalizes an owner key; blank falls back to the default owner. */
function normalizeOwner(owner: string): string {
    return owner?.trim() ? owner.trim() : DEFAULT_APP_TOOL_OWNER;
}
