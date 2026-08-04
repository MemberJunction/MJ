/**
 * @fileoverview App context snapshot types for AI agent awareness.
 *
 * These types define what the AI agent knows about the user's current
 * application context. The snapshot is injected into the system prompt
 * so the LLM can make informed decisions without burning a tool call.
 *
 * @module @memberjunction/ai-core-plus
 */

import { ClientToolMetadata } from './agent-types';

/**
 * Summary of a navigation item within an application.
 * Used for both the active nav item (full detail) and inactive items (name + description only).
 */
export interface NavItemSummary {
    /** Display label (e.g., "Conversations", "Duplicate Detection") */
    Name: string;
    /** Optional description of what this nav item provides */
    Description?: string;
}

/**
 * A delegation target the co-agent may invoke from the current surface — surfaced
 * in the live capability manifest (names + descriptions only). Loop vs flow is
 * informational; delegation is transparent to the co-agent either way.
 */
export interface AppContextAgentRef {
    /** Agent ID. */
    AgentID: string;
    /** Friendly name shown to the model / used in disclosure ("Skip", "Query Builder"). */
    Name: string;
    /** What this agent does — helps the model decide when to delegate. */
    Description?: string | null;
    /** loop | flow — informational only. */
    Kind?: 'loop' | 'flow' | null;
}

/**
 * Snapshot of the user's current application context.
 * Injected into agent system prompts via the `{{ appContext }}` template variable.
 *
 * Designed to be lean — gives the LLM enough to act intelligently without
 * bloating the prompt. Full details are available via client tools if needed.
 */
export interface AppContextSnapshot {
    /** The application the user is currently viewing */
    App: {
        /** Application name (e.g., "Data Explorer", "Chat") */
        Name: string;
        /** Application description */
        Description: string;
    };

    /** The nav item / tab the user is currently on */
    ActiveNavItem: NavItemSummary & {
        /** Resource type (e.g., "Custom", "Dashboards", "Records") */
        ResourceType?: string;
    };

    /** Other nav items available in the current app (name + description only) */
    OtherNavItems: NavItemSummary[];

    /**
     * The OTHER applications the user can open from here (name + description). Distinct from
     * {@link OtherNavItems} (which are sections WITHIN the current app). This is the list of valid
     * `AppName` values for a `NavigateToApp` call — without it the co-agent can't know what to
     * navigate to and ends up passing an undefined/guessed app name.
     */
    NavigableApps?: NavItemSummary[];

    /** Basic user context */
    User: {
        /** User display name */
        Name: string;
        /** User's assigned roles */
        Roles: string[];
    };

    /**
     * Additional context reported by the active view/component.
     * Contains whatever state the current view wants the agent to know about —
     * active tab, filter state, pipeline status, selected items, etc.
     * Updated dynamically as the user interacts with the view.
     */
    AdditionalContext?: Record<string, unknown>;

    /**
     * What the user currently sees / has selected on the active surface.
     * Additive (async consumers ignore it); populated by surfaces that opt in and
     * streamed to the realtime co-agent over the ClientContextChannel.
     */
    View?: {
        /** Entity names currently visible on screen. */
        VisibleEntities?: string[];
        /** The user's current selection, if any. */
        Selection?: { EntityName?: string; RecordIDs?: string[] } | null;
        /** Free-text the surface wants the agent to know ("editing form X, field Y"). */
        FreeText?: string | null;
    };

    /**
     * The live capability manifest — names + descriptions only (the catalog, not handlers).
     * Tells the co-agent which client tools and delegation targets are valid *right now* on
     * this surface, without re-declaring provider tool schemas mid-session.
     */
    Capabilities?: {
        /** Currently-valid client tools (resolved by the unified client-tool resolver). */
        Tools?: ClientToolMetadata[];
        /** Currently-valid `invoke_agent` delegation targets. */
        Agents?: AppContextAgentRef[];
    };
}

/**
 * Inputs accepted by {@link BuildAppContextSnapshot}. Looser shape than
 * `AppContextSnapshot` so callers can omit pieces they don't have — the
 * builder fills in safe defaults.
 *
 * `App.Name` is the only truly required field; without it, the consumer
 * (the agent's prompt template) won't render an app-context section.
 */
export interface AppContextSnapshotInputs {
    App: { Name: string; Description?: string };
    ActiveNavItem?: { Name: string; Description?: string; ResourceType?: string };
    OtherNavItems?: ReadonlyArray<{ Name: string; Description?: string }>;
    NavigableApps?: ReadonlyArray<{ Name: string; Description?: string }>;
    User?: { Name?: string; Roles?: ReadonlyArray<string> };
    AdditionalContext?: Record<string, unknown>;
    View?: AppContextSnapshot['View'];
    Capabilities?: AppContextSnapshot['Capabilities'];
}

/**
 * Assemble an `AppContextSnapshot` from loose inputs.
 *
 * **The canonical place to build the snapshot shape consumed by the agent
 * runtime** (`buildAppContextSection` in `base-agent.ts` reads exactly this
 * shape). Any host embedding `<mj-conversation-chat-area>` outside the
 * MJ Explorer floating chat overlay should produce its `[appContext]`
 * value via this helper so the agent's prompt sees consistent data.
 *
 * Today MJExplorer's app shell builds the snapshot inline; this helper
 * centralizes the construction so:
 *   - Embedded chats in custom (non-Explorer) apps build a correct snapshot
 *     without copy-pasting the shape from Explorer.
 *   - Future schema changes to `AppContextSnapshot` happen in one place
 *     instead of every embedder.
 *
 * Defaults applied:
 *   - `App.Description`     → ''
 *   - `ActiveNavItem`       → `{ Name: '(none)' }` if omitted
 *   - `OtherNavItems`       → []
 *   - `User.Name`           → ''
 *   - `User.Roles`          → []
 *   - `AdditionalContext`   → omitted from the result when undefined
 */
export function BuildAppContextSnapshot(inputs: AppContextSnapshotInputs): AppContextSnapshot {
    const snap: AppContextSnapshot = {
        App: {
            Name: inputs.App.Name,
            Description: inputs.App.Description ?? '',
        },
        ActiveNavItem: inputs.ActiveNavItem
            ? {
                Name: inputs.ActiveNavItem.Name,
                Description: inputs.ActiveNavItem.Description,
                ResourceType: inputs.ActiveNavItem.ResourceType,
            }
            : { Name: '(none)' },
        OtherNavItems: (inputs.OtherNavItems ?? []).map(n => ({
            Name: n.Name,
            Description: n.Description,
        })),
        User: {
            Name: inputs.User?.Name ?? '',
            Roles: [...(inputs.User?.Roles ?? [])],
        },
    };
    if (inputs.NavigableApps && inputs.NavigableApps.length > 0) {
        snap.NavigableApps = inputs.NavigableApps.map(a => ({ Name: a.Name, Description: a.Description }));
    }
    if (inputs.AdditionalContext) {
        snap.AdditionalContext = inputs.AdditionalContext;
    }
    if (inputs.View) {
        snap.View = inputs.View;
    }
    if (inputs.Capabilities) {
        snap.Capabilities = inputs.Capabilities;
    }
    return snap;
}

/** Render a single AdditionalContext value compactly; returns null for empty/null so we omit it. */
function formatContextValue(value: unknown, depth = 0): string | null {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'string') {
        const t = value.trim();
        if (!t) {
            return null;
        }
        return t.length > 160 ? `${t.slice(0, 157)}…` : t;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return null;
        }
        const shown = value.slice(0, 10).map(v => formatContextValue(v, depth + 1)).filter((v): v is string => v != null);
        if (shown.length === 0) {
            return null;
        }
        const more = value.length > 10 ? `, +${value.length - 10} more` : '';
        return `[${shown.join(', ')}${more}]`;
    }
    if (typeof value === 'object' && depth < 2) {
        const entries = Object.entries(value as Record<string, unknown>)
            .map(([k, v]) => {
                const fv = formatContextValue(v, depth + 1);
                return fv == null ? null : `${k}=${fv}`;
            })
            .filter((e): e is string => e != null);
        return entries.length > 0 ? `{${entries.slice(0, 12).join(', ')}}` : null;
    }
    return null;
}

/** Render the per-surface AdditionalContext (the rich state the active surface published) as indented "key: value" lines. */
function formatAdditionalContext(ctx: Record<string, unknown>): string[] {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(ctx)) {
        const formatted = formatContextValue(value);
        if (formatted != null) {
            lines.push(`  ${key}: ${formatted}`);
        }
    }
    return lines;
}

/** Summarize a tool's callable signature from its InputSchema — `Name(param, optional?) — description`. */
function formatToolSignature(tool: ClientToolMetadata): string {
    const schema = tool.InputSchema as { properties?: Record<string, unknown>; required?: string[] } | undefined;
    const props = schema?.properties ? Object.keys(schema.properties) : [];
    const required = new Set(schema?.required ?? []);
    const params = props.map(p => (required.has(p) ? p : `${p}?`)).join(', ');
    const desc = tool.Description ? ` — ${tool.Description}` : '';
    return `${tool.Name}(${params})${desc}`;
}

/**
 * Serialize an {@link AppContextSnapshot} (or a partial delta) to the text form sent to a realtime
 * model via `SendContextNote`. The model reads this as live background context — it is the co-agent's
 * source of truth for *where the user is, what they see, and what it can do right now*, so it is
 * intentionally detailed (location + on-screen state + the surface's published state + the navigable
 * apps/sections + the callable tool signatures + delegation targets). Returns '' when nothing salient.
 *
 * Only includes sections that are present, so a delta snapshot (e.g. just `View` + `Capabilities`)
 * produces a focused note rather than a full re-statement.
 */
export function FormatAppContextNote(snapshot: Partial<AppContextSnapshot>): string {
    const lines: string[] = [];

    // WHERE the user is
    if (snapshot.App?.Name) {
        const nav = snapshot.ActiveNavItem?.Name ? ` › ${snapshot.ActiveNavItem.Name}` : '';
        const rt = snapshot.ActiveNavItem?.ResourceType ? ` (${snapshot.ActiveNavItem.ResourceType})` : '';
        lines.push(`location: ${snapshot.App.Name}${nav}${rt}`);
    } else if (snapshot.ActiveNavItem?.Name) {
        lines.push(`location: ${snapshot.ActiveNavItem.Name}`);
    }

    // WHAT the user sees (structured View)
    const view = snapshot.View;
    if (view) {
        if (view.VisibleEntities && view.VisibleEntities.length > 0) {
            lines.push(`viewing: ${view.VisibleEntities.join(', ')}`);
        }
        if (view.Selection && view.Selection.RecordIDs && view.Selection.RecordIDs.length > 0) {
            const ent = view.Selection.EntityName ? `${view.Selection.EntityName} ` : '';
            lines.push(`selected: ${ent}${view.Selection.RecordIDs.length} record(s)`);
        }
        if (view.FreeText) {
            lines.push(view.FreeText);
        }
    }

    // The rich state the active surface published (counts, filters, selected items, available views/queries/etc.)
    if (snapshot.AdditionalContext) {
        const ctxLines = formatAdditionalContext(snapshot.AdditionalContext);
        if (ctxLines.length > 0) {
            lines.push('current screen state:');
            lines.push(...ctxLines);
        }
    }

    // WHERE the user can go — sections within this app + other apps (the valid NavigateToApp targets)
    if (snapshot.OtherNavItems && snapshot.OtherNavItems.length > 0) {
        lines.push(`sections in this app (NavigateToApp NavItemName): ${snapshot.OtherNavItems.map(n => n.Name).join(', ')}`);
    }
    if (snapshot.NavigableApps && snapshot.NavigableApps.length > 0) {
        lines.push(`apps you can open (NavigateToApp AppName): ${snapshot.NavigableApps.map(a => a.Name).join(', ')}`);
    }

    // WHAT the co-agent can do — tool signatures + delegation targets
    const caps = snapshot.Capabilities;
    if (caps) {
        if (caps.Tools && caps.Tools.length > 0) {
            lines.push('actions you can run right now (call via ContextTool):');
            for (const tool of caps.Tools) {
                lines.push(`  - ${formatToolSignature(tool)}`);
            }
        }
        if (caps.Agents && caps.Agents.length > 0) {
            lines.push('specialists you can delegate to (invoke-target-agent):');
            for (const a of caps.Agents) {
                lines.push(`  - ${a.Name}${a.Description ? ` — ${a.Description}` : ''}`);
            }
        }
    }

    if (lines.length === 0) {
        return '';
    }
    return `[app-context]\n${lines.join('\n')}`;
}
