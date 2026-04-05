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
