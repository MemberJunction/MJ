/**
 * Unit tests for the Communication dashboard's pure agent-context helpers.
 *
 * Covers:
 *   - isValidCommunicationTab / communicationTabLabel — tolerant tab validation + labels.
 *   - capCommunicationList — bounded list capping.
 *   - resolveCommunicationItem — id-then-name-then-contains resolution (case-insensitive,
 *     UUID-case-tolerant).
 *   - buildCommunicationAgentContext — mode-scoped context shaping: always emits the
 *     active-tab fields, appends ONLY the active surface's deep slice, bounds lists with
 *     companion counts, reports selected id+name, and leaks no other surface's fields.
 *
 * These helpers are pure (no Angular / DI), so no TestBed is needed.
 * See communication-agent-context.ts for the implementation.
 *
 * 🔒 SAFETY: the helpers (and these tests) only shape READ-ONLY display state. No send /
 * compose / template-edit / provider-edit / test-send surface is represented here.
 */

import { describe, it, expect } from 'vitest';
import {
    COMMUNICATION_TABS,
    COMMUNICATION_LOG_STATUSES,
    COMMUNICATION_CONTEXT_LIST_CAP,
    isValidCommunicationTab,
    communicationTabLabel,
    capCommunicationList,
    resolveCommunicationItem,
    buildCommunicationAgentContext,
    CommunicationItemCandidate,
    CommunicationSurfaceContext,
    CommunicationMonitorContext,
    CommunicationLogsContext,
    CommunicationProvidersContext,
    CommunicationTemplatesContext,
    CommunicationRunsContext,
} from '../Communication/communication-agent-context';

describe('isValidCommunicationTab', () => {
    it('accepts each known tab', () => {
        for (const t of COMMUNICATION_TABS) {
            expect(isValidCommunicationTab(t)).toBe(true);
        }
    });

    it('rejects unknown / non-string input', () => {
        expect(isValidCommunicationTab('inbox')).toBe(false);
        expect(isValidCommunicationTab('')).toBe(false);
        expect(isValidCommunicationTab(undefined)).toBe(false);
        expect(isValidCommunicationTab(7)).toBe(false);
        expect(isValidCommunicationTab(null)).toBe(false);
    });
});

describe('communicationTabLabel', () => {
    it('maps known tabs to their human label', () => {
        expect(communicationTabLabel('monitor')).toBe('Monitor');
        expect(communicationTabLabel('logs')).toBe('Logs');
        expect(communicationTabLabel('providers')).toBe('Providers');
        expect(communicationTabLabel('templates')).toBe('Templates');
        expect(communicationTabLabel('runs')).toBe('Runs');
        expect(communicationTabLabel('settings')).toBe('Settings');
    });

    it('falls back for an unknown tab', () => {
        expect(communicationTabLabel('nope')).toBe('Communication Management');
    });
});

describe('capCommunicationList', () => {
    it('returns the list unchanged when under the cap', () => {
        const xs = ['a', 'b', 'c'];
        expect(capCommunicationList(xs)).toEqual(xs);
    });

    it('caps to COMMUNICATION_CONTEXT_LIST_CAP and never mutates the input', () => {
        const xs = Array.from({ length: COMMUNICATION_CONTEXT_LIST_CAP + 10 }, (_, i) => `n${i}`);
        const out = capCommunicationList(xs);
        expect(out.length).toBe(COMMUNICATION_CONTEXT_LIST_CAP);
        expect(xs.length).toBe(COMMUNICATION_CONTEXT_LIST_CAP + 10);
        expect(out[0]).toBe('n0');
    });
});

describe('resolveCommunicationItem', () => {
    const candidates: CommunicationItemCandidate[] = [
        { ID: 'AAAA1111-0000-0000-0000-000000000001', Name: 'SendGrid' },
        { ID: 'BBBB2222-0000-0000-0000-000000000002', Name: 'Twilio SMS' },
        { ID: 'CCCC3333-0000-0000-0000-000000000003', Name: 'Microsoft Graph' },
    ];

    it('matches by exact id, case-insensitively (UUID case tolerance)', () => {
        expect(resolveCommunicationItem('aaaa1111-0000-0000-0000-000000000001', candidates)?.Name).toBe('SendGrid');
        expect(resolveCommunicationItem('AAAA1111-0000-0000-0000-000000000001', candidates)?.Name).toBe('SendGrid');
    });

    it('matches by exact name, case-insensitively', () => {
        expect(resolveCommunicationItem('twilio sms', candidates)?.ID).toBe('BBBB2222-0000-0000-0000-000000000002');
    });

    it('falls back to a contains match on the name', () => {
        expect(resolveCommunicationItem('graph', candidates)?.Name).toBe('Microsoft Graph');
        expect(resolveCommunicationItem('twilio', candidates)?.Name).toBe('Twilio SMS');
    });

    it('prefers an exact id over a name-contains collision', () => {
        const xs: CommunicationItemCandidate[] = [
            { ID: 'twilio', Name: 'Some Provider' },
            { ID: 'X', Name: 'Twilio SMS' },
        ];
        expect(resolveCommunicationItem('twilio', xs)?.ID).toBe('twilio');
    });

    it('returns null on a miss or empty input', () => {
        expect(resolveCommunicationItem('mailchimp', candidates)).toBeNull();
        expect(resolveCommunicationItem('   ', candidates)).toBeNull();
        expect(resolveCommunicationItem('', candidates)).toBeNull();
    });
});

describe('buildCommunicationAgentContext — base fields', () => {
    it('always emits active-tab / refresh / visited fields', () => {
        const ctx = buildCommunicationAgentContext({
            ActiveTab: 'settings',
            ActiveTabLabel: 'Settings',
            VisitedTabs: ['monitor', 'settings'],
            IsRefreshing: true,
            Surface: { Surface: 'none' },
        });
        expect(ctx['ActiveTab']).toBe('settings');
        expect(ctx['ActiveTabLabel']).toBe('Settings');
        expect(ctx['VisitedTabs']).toEqual(['monitor', 'settings']);
        expect(ctx['IsRefreshing']).toBe(true);
        // No surface slice was supplied → no deep fields leak.
        expect(ctx['LogCount']).toBeUndefined();
        expect(ctx['ProviderCount']).toBeUndefined();
        expect(ctx['TotalSent']).toBeUndefined();
    });

    it('copies VisitedTabs (does not alias the input array)', () => {
        const visited = ['monitor'];
        const ctx = buildCommunicationAgentContext({
            ActiveTab: 'monitor',
            ActiveTabLabel: 'Monitor',
            VisitedTabs: visited,
            IsRefreshing: false,
            Surface: { Surface: 'none' },
        });
        expect(ctx['VisitedTabs']).toEqual(visited);
        expect(ctx['VisitedTabs']).not.toBe(visited);
    });
});

describe('buildCommunicationAgentContext — monitor surface', () => {
    const monitor: CommunicationMonitorContext = {
        Surface: 'monitor',
        TotalSent: 120,
        DeliveryRate: 98.5,
        Pending: 3,
        Failed: 2,
        ProviderHealthNames: ['SendGrid', 'Twilio'],
        ProviderHealthCount: 2,
        ChannelNames: ['Email', 'SMS'],
        RecentActivityNames: ['Email · SendGrid · Complete'],
    };

    it('emits the monitor KPIs + bounded panels', () => {
        const ctx = buildCommunicationAgentContext({
            ActiveTab: 'monitor',
            ActiveTabLabel: 'Monitor',
            VisitedTabs: ['monitor'],
            IsRefreshing: false,
            Surface: monitor,
        });
        expect(ctx['TotalSent']).toBe(120);
        expect(ctx['DeliveryRate']).toBe(98.5);
        expect(ctx['Pending']).toBe(3);
        expect(ctx['Failed']).toBe(2);
        expect(ctx['ProviderHealthCount']).toBe(2);
        expect(ctx['ProviderHealthNames']).toEqual(['SendGrid', 'Twilio']);
        expect(ctx['ChannelNames']).toEqual(['Email', 'SMS']);
        expect(ctx['RecentActivity']).toEqual(['Email · SendGrid · Complete']);
        // No logs/templates/providers/runs fields leak into the monitor slice.
        expect(ctx['LogCount']).toBeUndefined();
        expect(ctx['SelectedTemplateId']).toBeUndefined();
    });
});

describe('buildCommunicationAgentContext — logs surface', () => {
    const baseLogs: CommunicationLogsContext = {
        Surface: 'logs',
        LogCount: 200,
        FilteredLogCount: 12,
        StatusFilter: 'Failed',
        SearchText: 'twilio',
        VisibleLogSummaries: ['Twilio · SMS · Failed'],
        SelectedItemId: 'LOG-1',
        SelectedItemName: 'Twilio · SMS · Failed',
    };

    it('emits log counts, filters, selected id+name, and visible summaries', () => {
        const ctx = buildCommunicationAgentContext({
            ActiveTab: 'logs',
            ActiveTabLabel: 'Logs',
            VisitedTabs: ['logs'],
            IsRefreshing: false,
            Surface: baseLogs,
        });
        expect(ctx['LogCount']).toBe(200);
        expect(ctx['FilteredLogCount']).toBe(12);
        expect(ctx['LogStatusFilter']).toBe('Failed');
        expect(ctx['LogSearchText']).toBe('twilio');
        expect(ctx['SelectedLogId']).toBe('LOG-1');
        expect(ctx['SelectedLogName']).toBe('Twilio · SMS · Failed');
        expect(ctx['VisibleLogs']).toEqual(['Twilio · SMS · Failed']);
    });

    it('bounds the visible-log list and adds a companion count when truncated', () => {
        const many = Array.from({ length: COMMUNICATION_CONTEXT_LIST_CAP + 5 }, (_, i) => `log-${i}`);
        const ctx = buildCommunicationAgentContext({
            ActiveTab: 'logs',
            ActiveTabLabel: 'Logs',
            VisitedTabs: ['logs'],
            IsRefreshing: false,
            Surface: { ...baseLogs, VisibleLogSummaries: many },
        });
        expect((ctx['VisibleLogs'] as string[]).length).toBe(COMMUNICATION_CONTEXT_LIST_CAP);
        expect(ctx['VisibleLogCount']).toBe(COMMUNICATION_CONTEXT_LIST_CAP + 5);
    });

    it('uses every known status filter value', () => {
        for (const status of COMMUNICATION_LOG_STATUSES) {
            const ctx = buildCommunicationAgentContext({
                ActiveTab: 'logs',
                ActiveTabLabel: 'Logs',
                VisitedTabs: ['logs'],
                IsRefreshing: false,
                Surface: { ...baseLogs, StatusFilter: status },
            });
            expect(ctx['LogStatusFilter']).toBe(status);
        }
    });
});

describe('buildCommunicationAgentContext — providers surface', () => {
    it('emits provider counts, active count, bounded names, and selection', () => {
        const providers: CommunicationProvidersContext = {
            Surface: 'providers',
            ProviderCount: 4,
            ActiveProviderCount: 3,
            ProviderNames: ['SendGrid', 'Twilio', 'Gmail', 'MS Graph'],
            SelectedItemId: 'PROV-2',
            SelectedItemName: 'Twilio',
        };
        const ctx = buildCommunicationAgentContext({
            ActiveTab: 'providers',
            ActiveTabLabel: 'Providers',
            VisitedTabs: ['providers'],
            IsRefreshing: false,
            Surface: providers,
        });
        expect(ctx['ProviderCount']).toBe(4);
        expect(ctx['ActiveProviderCount']).toBe(3);
        expect(ctx['ProviderNames']).toEqual(['SendGrid', 'Twilio', 'Gmail', 'MS Graph']);
        expect(ctx['SelectedProviderId']).toBe('PROV-2');
        expect(ctx['SelectedProviderName']).toBe('Twilio');
    });
});

describe('buildCommunicationAgentContext — templates surface', () => {
    it('emits template counts, filters, categories, names, and selection', () => {
        const templates: CommunicationTemplatesContext = {
            Surface: 'templates',
            TemplateCount: 30,
            FilteredTemplateCount: 5,
            CategoryFilter: 'Onboarding',
            SearchText: 'welcome',
            AvailableCategories: ['Onboarding', 'Marketing'],
            VisibleTemplateNames: ['Welcome Email', 'Welcome SMS'],
            SelectedItemId: 'TPL-1',
            SelectedItemName: 'Welcome Email',
        };
        const ctx = buildCommunicationAgentContext({
            ActiveTab: 'templates',
            ActiveTabLabel: 'Templates',
            VisitedTabs: ['templates'],
            IsRefreshing: false,
            Surface: templates,
        });
        expect(ctx['TemplateCount']).toBe(30);
        expect(ctx['FilteredTemplateCount']).toBe(5);
        expect(ctx['TemplateCategoryFilter']).toBe('Onboarding');
        expect(ctx['TemplateSearchText']).toBe('welcome');
        expect(ctx['AvailableCategories']).toEqual(['Onboarding', 'Marketing']);
        expect(ctx['VisibleTemplates']).toEqual(['Welcome Email', 'Welcome SMS']);
        expect(ctx['SelectedTemplateId']).toBe('TPL-1');
        expect(ctx['SelectedTemplateName']).toBe('Welcome Email');
    });
});

describe('buildCommunicationAgentContext — runs surface', () => {
    it('emits run counts, success rate, summaries, and selection', () => {
        const runs: CommunicationRunsContext = {
            Surface: 'runs',
            RunCount: 10,
            ActiveRunCount: 1,
            CompletedRunCount: 8,
            SuccessRate: 90,
            VisibleRunSummaries: ['Run #abc12345 · Complete'],
            SelectedItemId: 'RUN-1',
            SelectedItemName: 'Run #abc12345',
        };
        const ctx = buildCommunicationAgentContext({
            ActiveTab: 'runs',
            ActiveTabLabel: 'Runs',
            VisitedTabs: ['runs'],
            IsRefreshing: false,
            Surface: runs,
        });
        expect(ctx['RunCount']).toBe(10);
        expect(ctx['ActiveRunCount']).toBe(1);
        expect(ctx['CompletedRunCount']).toBe(8);
        expect(ctx['RunSuccessRate']).toBe(90);
        expect(ctx['VisibleRuns']).toEqual(['Run #abc12345 · Complete']);
        expect(ctx['SelectedRunId']).toBe('RUN-1');
        expect(ctx['SelectedRunName']).toBe('Run #abc12345');
    });
});

describe('buildCommunicationAgentContext — mode isolation', () => {
    it("never leaks one surface's fields into another (logs ⇏ providers)", () => {
        const logsSurface: CommunicationSurfaceContext = {
            Surface: 'logs',
            LogCount: 5,
            FilteredLogCount: 5,
            StatusFilter: '',
            SearchText: '',
            VisibleLogSummaries: [],
            SelectedItemId: null,
            SelectedItemName: null,
        };
        const ctx = buildCommunicationAgentContext({
            ActiveTab: 'logs',
            ActiveTabLabel: 'Logs',
            VisitedTabs: ['logs', 'providers'],
            IsRefreshing: false,
            Surface: logsSurface,
        });
        // logs fields present...
        expect(ctx['LogCount']).toBe(5);
        // ...but no providers/templates/runs/monitor fields.
        expect(ctx['ProviderCount']).toBeUndefined();
        expect(ctx['TemplateCount']).toBeUndefined();
        expect(ctx['RunCount']).toBeUndefined();
        expect(ctx['TotalSent']).toBeUndefined();
    });
});
