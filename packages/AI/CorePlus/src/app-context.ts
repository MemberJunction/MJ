/**
 * @fileoverview App context snapshot types for AI agent awareness.
 *
 * These types define what the AI agent knows about the user's current
 * application context. The snapshot is injected into the system prompt
 * so the LLM can make informed decisions without burning a tool call.
 *
 * @module @memberjunction/ai-core-plus
 */

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
    return snap;
}
