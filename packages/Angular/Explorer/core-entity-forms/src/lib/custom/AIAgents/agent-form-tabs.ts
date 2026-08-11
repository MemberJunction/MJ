/**
 * @fileoverview Which tabs the AI Agents form shows, and which one opens.
 *
 * **Why this is a pure function rather than three getters on a 3,000-line component.** The decisions
 * here are small but each one has a failure mode that renders as a broken form rather than as an
 * error: a stored tab that no longer exists hides every pane at once, and a hardcoded default sends
 * every Flow agent back to Details — re-burying the diagram this whole change exists to surface.
 * Neither is catchable by the compiler, and neither is reachable in a unit test while the logic lives
 * inside a component with a dozen injected services.
 *
 * @module @memberjunction/ng-core-entity-forms
 */
import type { TabConfig } from '@memberjunction/ng-ui-components';

/** Just enough of the agent type to decide the tab strip — so tests need no entity instance. */
export type AgentFormTabContext = {
    /** The agent type's name, e.g. `'Flow'`. Null when the type has not loaded (or has none). */
    AgentTypeName: string | null;
    /**
     * The type's custom form section key. Its presence — not the type's name — is what says
     * "this type ships a designer", so a future agent type gets the designer tab for free.
     */
    UIFormSectionKey: string | null;
    /** False for an unsaved record: there is no designer to load and nothing yet invokes it. */
    HasRecordID: boolean;
};

export type AgentFormTabPlan = {
    Tabs: TabConfig[];
    /** The tab to show. Never a key absent from {@link AgentFormTabPlan.Tabs}. */
    ActiveKey: string;
};

export const AGENT_TAB_DESIGNER = 'designer';
export const AGENT_TAB_DETAILS = 'details';
export const AGENT_TAB_INVOCATIONS = 'invocations';

/**
 * Builds the tab strip and resolves which tab is active.
 *
 * `storedTab` is the user's persisted choice, or null for "never chosen". Null falls through to the
 * first tab, which is how a Flow agent opens on its diagram while a Loop agent opens on Details —
 * without either being hardcoded.
 */
export function BuildAgentFormTabs(context: AgentFormTabContext, storedTab: string | null): AgentFormTabPlan {
    const tabs: TabConfig[] = [];

    if (HasDesignerTab(context)) {
        tabs.push({
            key: AGENT_TAB_DESIGNER,
            label: DesignerTabLabel(context),
            // Flow gets the diagram glyph; any other type that ships a designer gets the generic one
            // rather than a Flow-specific icon that would misdescribe it.
            icon: context.AgentTypeName === 'Flow' ? 'fa-solid fa-diagram-project' : 'fa-solid fa-puzzle-piece',
        });
    }

    tabs.push({ key: AGENT_TAB_DETAILS, label: 'Details', icon: 'fa-solid fa-sliders' });

    if (context.HasRecordID) {
        tabs.push({ key: AGENT_TAB_INVOCATIONS, label: 'Invocations', icon: 'fa-solid fa-tower-broadcast' });
    }

    return { Tabs: tabs, ActiveKey: ResolveActiveTab(tabs, storedTab) };
}

/** True when this agent's type contributes a designer pane. */
export function HasDesignerTab(context: AgentFormTabContext): boolean {
    return context.HasRecordID && !!context.UIFormSectionKey;
}

/**
 * What the designer pane is called.
 *
 * Flow is labelled "Flow" rather than "Flow Agent Configuration": on a record whose header already
 * says what it is, the tab only has to name the view.
 */
export function DesignerTabLabel(context: AgentFormTabContext): string {
    return context.AgentTypeName?.trim() || 'Designer';
}

/**
 * Picks the active tab, guaranteeing it exists.
 *
 * Covers both "never chosen" and "chose a tab this agent no longer has" — the type changed, or the
 * record is unsaved so Invocations is gone. Either way, falling through to the first tab is what
 * stops every pane being hidden at once, which is a blank form with no error to explain it.
 */
export function ResolveActiveTab(tabs: readonly TabConfig[], storedTab: string | null): string {
    if (storedTab && tabs.some((t) => t.key === storedTab)) return storedTab;
    return tabs[0]?.key ?? AGENT_TAB_DETAILS;
}
