import { describe, expect, it } from 'vitest';
import {
    buildSharingCenterAgentContext,
    resolveSharingCenterTab,
    sharingCenterTabLabel,
} from './sharing-center-agent-context';

describe('sharing-center-agent-context', () => {
    it('builds concise context for the Inbox surface', () => {
        expect(buildSharingCenterAgentContext({
            ActiveTab: 'shared-with-me',
            IsRefreshing: false,
            SearchTerm: 'sales',
            DomainFilter: 'Dashboard Permissions',
            MyAccessCount: 12,
            ActivityEntryCount: 4,
            AvailableDomainNames: ['Dashboard Permissions', 'Query Permissions'],
        })).toEqual({
            ActiveTab: 'shared-with-me',
            ActiveTabLabel: 'Inbox',
            IsRefreshing: false,
            SearchTerm: 'sales',
            DomainFilter: 'Dashboard Permissions',
            HasSearchTerm: true,
            HasDomainFilter: true,
            MyAccessCount: 12,
            ActivityEntryCount: 4,
            AvailableDomains: ['Dashboard Permissions', 'Query Permissions'],
            AvailableDomainCount: 2,
            AvailableDomainsTruncated: false,
        });
    });

    it('resolves stable tab keys and the inbox deep-link alias', () => {
        expect(resolveSharingCenterTab('shared-by-me')).toBe('shared-by-me');
        expect(resolveSharingCenterTab('inbox')).toBe('shared-with-me');
        expect(resolveSharingCenterTab('activity')).toBe('activity');
        expect(resolveSharingCenterTab('access')).toBe('my-access');
        expect(resolveSharingCenterTab('requests')).toBeNull();
    });

    it('keeps human-readable labels aligned to the tab configuration', () => {
        expect(sharingCenterTabLabel('shared-by-me')).toBe('Shared by me');
        expect(sharingCenterTabLabel('my-access')).toBe('My Access');
    });
});
