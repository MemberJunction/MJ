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

/**
 * Serialize an {@link AppContextSnapshot} (or a partial delta) to the compact text form
 * sent to a realtime model via `SendContextNote`. Kept terse — the model reads this as
 * background context, not a turn-starting event. Returns '' when there is nothing salient.
 *
 * Only includes sections that are present, so a delta snapshot (e.g. just `View` +
 * `Capabilities`) produces a focused note rather than a full re-statement.
 */
export function FormatAppContextNote(snapshot: Partial<AppContextSnapshot>): string {
    const parts: string[] = [];

    if (snapshot.App?.Name) {
        const nav = snapshot.ActiveNavItem?.Name ? ` › ${snapshot.ActiveNavItem.Name}` : '';
        parts.push(`location: ${snapshot.App.Name}${nav}`);
    } else if (snapshot.ActiveNavItem?.Name) {
        parts.push(`location: ${snapshot.ActiveNavItem.Name}`);
    }

    const view = snapshot.View;
    if (view) {
        if (view.VisibleEntities && view.VisibleEntities.length > 0) {
            parts.push(`viewing: ${view.VisibleEntities.join(', ')}`);
        }
        if (view.Selection && view.Selection.RecordIDs && view.Selection.RecordIDs.length > 0) {
            const ent = view.Selection.EntityName ? `${view.Selection.EntityName} ` : '';
            parts.push(`selected: ${ent}${view.Selection.RecordIDs.length} record(s)`);
        }
        if (view.FreeText) {
            parts.push(view.FreeText);
        }
    }

    const caps = snapshot.Capabilities;
    if (caps) {
        if (caps.Tools && caps.Tools.length > 0) {
            parts.push(`available tools: ${caps.Tools.map(t => t.Name).join(', ')}`);
        }
        if (caps.Agents && caps.Agents.length > 0) {
            parts.push(`available agents: ${caps.Agents.map(a => a.Name).join(', ')}`);
        }
    }

    if (parts.length === 0) {
        return '';
    }
    return `[app-context] ${parts.join(' | ')}`;
}
