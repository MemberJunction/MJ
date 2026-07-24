/** The read-only P2 surfaces exposed by the full Sharing Center application. */
export type SharingCenterDashboardTab = 'shared-with-me' | 'shared-by-me' | 'my-access' | 'activity';

export const SHARING_CENTER_DOMAIN_LIST_CAP = 25;

export interface SharingCenterAgentContextInput {
    ActiveTab: SharingCenterDashboardTab;
    IsRefreshing: boolean;
    SearchTerm: string;
    DomainFilter: string;
    MyAccessCount: number;
    ActivityEntryCount: number;
    AvailableDomainNames: string[];
}

/**
 * Build the concise, display-only Sharing Center context consumed by both the
 * asynchronous chat agent and realtime co-agent.
 */
export function buildSharingCenterAgentContext(
    input: SharingCenterAgentContextInput
): Record<string, string | boolean | number | string[]> {
    const availableDomains = input.AvailableDomainNames.slice(0, SHARING_CENTER_DOMAIN_LIST_CAP);
    return {
        ActiveTab: input.ActiveTab,
        ActiveTabLabel: sharingCenterTabLabel(input.ActiveTab),
        IsRefreshing: input.IsRefreshing,
        SearchTerm: input.SearchTerm,
        DomainFilter: input.DomainFilter,
        HasSearchTerm: input.SearchTerm.length > 0,
        HasDomainFilter: input.DomainFilter.length > 0,
        MyAccessCount: input.MyAccessCount,
        ActivityEntryCount: input.ActivityEntryCount,
        AvailableDomains: availableDomains,
        AvailableDomainCount: input.AvailableDomainNames.length,
        AvailableDomainsTruncated: input.AvailableDomainNames.length > availableDomains.length,
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
        case 'my-access':
        case 'access':
            return 'my-access';
        case 'activity':
            return 'activity';
        default:
            return null;
    }
}

export function sharingCenterTabLabel(tab: SharingCenterDashboardTab): string {
    switch (tab) {
        case 'shared-with-me':
            return 'Inbox';
        case 'shared-by-me':
            return 'Shared by me';
        case 'my-access':
            return 'My Access';
        case 'activity':
            return 'Activity';
    }
}
