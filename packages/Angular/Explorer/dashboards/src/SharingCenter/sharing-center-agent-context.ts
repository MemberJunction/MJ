/** The two MVP surfaces exposed by the full Sharing Center application. */
export type SharingCenterDashboardTab = 'shared-with-me' | 'shared-by-me';

export interface SharingCenterAgentContextInput {
    ActiveTab: SharingCenterDashboardTab;
    IsRefreshing: boolean;
}

/**
 * Build the concise, display-only Sharing Center context consumed by both the
 * asynchronous chat agent and realtime co-agent.
 */
export function buildSharingCenterAgentContext(input: SharingCenterAgentContextInput): Record<string, string | boolean> {
    return {
        ActiveTab: input.ActiveTab,
        ActiveTabLabel: sharingCenterTabLabel(input.ActiveTab),
        IsRefreshing: input.IsRefreshing,
    };
}

/** Resolve only the stable query-param and client-tool tab keys. */
export function resolveSharingCenterTab(value: string | undefined): SharingCenterDashboardTab | null {
    switch (value) {
        case 'shared-with-me':
        case 'inbox':
            return 'shared-with-me';
        case 'shared-by-me':
            return 'shared-by-me';
        default:
            return null;
    }
}

export function sharingCenterTabLabel(tab: SharingCenterDashboardTab): string {
    return tab === 'shared-with-me' ? 'Inbox' : 'Shared by me';
}
