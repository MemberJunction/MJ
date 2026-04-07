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
