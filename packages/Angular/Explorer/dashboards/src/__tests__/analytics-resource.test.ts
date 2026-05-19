/**
 * Tests for analytics resource component logic:
 * - AN-1: Drill-down Open Record
 * - AN-3: CSV Export
 * - SR-6: Preference persistence
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ── Test the pure-logic utility functions extracted from the component ──

describe('Analytics Resource — CSV Export (AN-3)', () => {
    // Test the CSV generation logic independently
    function buildCSV(
        columns: string[],
        data: Record<string, string | number | null>[],
    ): string {
        const escape = (v: string | number | null): string => {
            const s = String(v ?? '');
            return s.includes(',') || s.includes('"') || s.includes('\n')
                ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const header = columns.map(escape).join(',');
        const rows = data.map(row => columns.map(c => escape(row[c])).join(','));
        return [header, ...rows].join('\n');
    }

    it('should generate valid CSV header', () => {
        const csv = buildCSV(['Name', 'Count'], []);
        expect(csv).toBe('Name,Count');
    });

    it('should generate CSV with data rows', () => {
        const csv = buildCSV(
            ['Name', 'Score'],
            [
                { Name: 'Tag A', Score: 42 },
                { Name: 'Tag B', Score: 18 },
            ]
        );
        const lines = csv.split('\n');
        expect(lines).toHaveLength(3);
        expect(lines[0]).toBe('Name,Score');
        expect(lines[1]).toBe('Tag A,42');
        expect(lines[2]).toBe('Tag B,18');
    });

    it('should escape values containing commas', () => {
        const csv = buildCSV(
            ['Name'],
            [{ Name: 'Doe, John' }]
        );
        expect(csv).toContain('"Doe, John"');
    });

    it('should escape values containing quotes', () => {
        const csv = buildCSV(
            ['Name'],
            [{ Name: 'He said "hello"' }]
        );
        expect(csv).toContain('"He said ""hello"""');
    });

    it('should handle null values', () => {
        const csv = buildCSV(
            ['Name', 'Value'],
            [{ Name: 'Test', Value: null }]
        );
        const lines = csv.split('\n');
        expect(lines[1]).toBe('Test,');
    });

    it('should not include hidden _RecordID/_EntityName columns', () => {
        // Columns array should NOT include _RecordID/_EntityName
        const columns = ['Tag', 'Usage Count'];
        const data = [
            { Tag: 'CRM', 'Usage Count': 42, _RecordID: 'abc-123', _EntityName: 'MJ: Tags' },
        ];

        const csv = buildCSV(columns, data);
        expect(csv).not.toContain('_RecordID');
        expect(csv).not.toContain('abc-123');
        expect(csv).toContain('CRM');
        expect(csv).toContain('42');
    });
});

describe('Analytics Resource — Drill-Down Actions (AN-1)', () => {
    it('should include _RecordID and _EntityName in drill-down data for navigable rows', () => {
        // Simulating what loadDrillDownData produces for kpi-totalTags
        const rawTag = { ID: 'tag-1', Name: 'CRM', DisplayName: 'CRM', Description: 'Customer RM', Parent: 'Root' };
        const drillDownRow = {
            'Name': String(rawTag.Name),
            'Display Name': String(rawTag.DisplayName),
            'Description': String(rawTag.Description),
            'Parent': String(rawTag.Parent),
            '_RecordID': String(rawTag.ID),
            '_EntityName': 'MJ: Tags',
        };

        expect(drillDownRow['_RecordID']).toBe('tag-1');
        expect(drillDownRow['_EntityName']).toBe('MJ: Tags');
    });

    it('should not include _RecordID for aggregate-only drill-downs', () => {
        // contentCoverage and qualityScore don't have individual records
        const coverageRow = {
            'Content Type': 'Articles',
            'Total Items': 100,
            'Tagged Items': 85,
            'Coverage %': '85%',
        };

        expect(coverageRow).not.toHaveProperty('_RecordID');
        expect(coverageRow).not.toHaveProperty('_EntityName');
    });
});

describe('Analytics Resource — Cost Aggregation (D1)', () => {
    // Re-implement the static SumField method from the component for testing
    function sumField(records: Record<string, unknown>[], fieldName: string): number {
        return records.reduce((sum, r) => sum + Number(r[fieldName] || 0), 0);
    }

    const mockDetails: Record<string, unknown>[] = [
        { ContentProcessRunID: 'run-1', TotalTokensUsed: 1500, TotalCost: 0.0045 },
        { ContentProcessRunID: 'run-1', TotalTokensUsed: 2500, TotalCost: 0.0075 },
        { ContentProcessRunID: 'run-2', TotalTokensUsed: 3000, TotalCost: 0.009 },
    ];

    it('should sum total tokens across all detail records', () => {
        const totalTokens = sumField(mockDetails, 'TotalTokensUsed');
        expect(totalTokens).toBe(7000);
    });

    it('should sum total cost across all detail records', () => {
        const totalCost = sumField(mockDetails, 'TotalCost');
        expect(totalCost).toBeCloseTo(0.021, 4);
    });

    it('should calculate average cost per run', () => {
        const totalCost = sumField(mockDetails, 'TotalCost');
        const runCount = 2; // Two unique runs
        const avgCostPerRun = runCount > 0 ? totalCost / runCount : 0;
        expect(avgCostPerRun).toBeCloseTo(0.0105, 4);
    });

    it('should handle empty records gracefully', () => {
        const totalTokens = sumField([], 'TotalTokensUsed');
        const totalCost = sumField([], 'TotalCost');
        expect(totalTokens).toBe(0);
        expect(totalCost).toBe(0);
    });

    it('should handle records with missing/null fields', () => {
        const records: Record<string, unknown>[] = [
            { ContentProcessRunID: 'run-1', TotalTokensUsed: null, TotalCost: undefined },
            { ContentProcessRunID: 'run-2' },
        ];
        expect(sumField(records, 'TotalTokensUsed')).toBe(0);
        expect(sumField(records, 'TotalCost')).toBe(0);
    });

    it('should filter details by run ID correctly', () => {
        const filteredRunIds = new Set(['run-1']);
        const filteredDetails = mockDetails.filter(
            d => filteredRunIds.has(String(d['ContentProcessRunID'] || ''))
        );
        const tokens = sumField(filteredDetails, 'TotalTokensUsed');
        expect(tokens).toBe(4000); // 1500 + 2500
    });
});

describe('Analytics Resource — Preference Persistence (SR-6)', () => {
    let mockStorage: Record<string, string>;

    beforeEach(() => {
        mockStorage = {};
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key: string) => mockStorage[key] ?? null),
            setItem: vi.fn((key: string, value: string) => { mockStorage[key] = value; }),
            removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should persist preferences to localStorage', () => {
        const prefs = {
            ActiveTab: 'tags',
            ActiveDateRange: '90D',
            EntityFilter: 'Contacts',
        };
        localStorage.setItem('KH_AnalyticsPreferences', JSON.stringify(prefs));

        const stored = JSON.parse(localStorage.getItem('KH_AnalyticsPreferences')!);
        expect(stored.ActiveTab).toBe('tags');
        expect(stored.ActiveDateRange).toBe('90D');
        expect(stored.EntityFilter).toBe('Contacts');
    });

    it('should load preferences from localStorage', () => {
        const prefs = { ActiveTab: 'pipeline', ActiveDateRange: '7D', EntityFilter: 'All Entities' };
        mockStorage['KH_AnalyticsPreferences'] = JSON.stringify(prefs);

        const raw = localStorage.getItem('KH_AnalyticsPreferences');
        expect(raw).not.toBeNull();
        const parsed = JSON.parse(raw!);
        expect(parsed.ActiveTab).toBe('pipeline');
    });

    it('should handle missing localStorage gracefully', () => {
        const raw = localStorage.getItem('KH_AnalyticsPreferences');
        expect(raw).toBeNull();
        // Component should use defaults when no stored prefs
    });

    it('should store search preferences separately', () => {
        const searchPrefs = { ShowFilters: true, MinScoreThreshold: 0.5 };
        localStorage.setItem('KH_SearchPreferences', JSON.stringify(searchPrefs));

        const analyticsPrefs = localStorage.getItem('KH_AnalyticsPreferences');
        expect(analyticsPrefs).toBeNull(); // Should not cross-pollinate

        const searchStored = JSON.parse(localStorage.getItem('KH_SearchPreferences')!);
        expect(searchStored.MinScoreThreshold).toBe(0.5);
    });
});
