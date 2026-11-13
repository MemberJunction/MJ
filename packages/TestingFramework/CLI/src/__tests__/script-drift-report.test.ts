import { describe, it, expect } from 'vitest';
import { FormatScriptDriftReport, ScriptDriftReportEntry } from '../utils/script-drift-report';

const NEW_SCRIPT: ScriptDriftReportEntry = {
    TestName: 'T001 - Login Smoke',
    Drift: { AddedSteps: 4, RemovedSteps: 0, Changes: [], MeaningfulDrift: 0, Summary: 'new script — 4 step(s), no promoted script to compare against' },
};

const CHANGED: ScriptDriftReportEntry = {
    TestName: 'T042 - Filter | Grid',
    Drift: {
        AddedSteps: 0,
        RemovedSteps: 1,
        Changes: Array.from({ length: 10 }, (_, i) => ({ index: i, kind: 'selector-drift' as const, detail: `#a${i} → #b${i}` })),
        MeaningfulDrift: 1,
        Summary: '10 selector change(s), 1 step(s) removed',
    },
};

describe('FormatScriptDriftReport', () => {
    it('writes JSON with one entry per pending script', () => {
        const parsed = JSON.parse(FormatScriptDriftReport([NEW_SCRIPT, CHANGED], 'json'));
        expect(parsed.PendingCount).toBe(2);
        expect(parsed.Tests[0]).toEqual({
            TestName: 'T001 - Login Smoke',
            MeaningfulDrift: 0,
            AddedSteps: 4,
            RemovedSteps: 0,
            Summary: NEW_SCRIPT.Drift.Summary,
            Changes: [],
        });
        expect(parsed.Tests[1].Changes).toHaveLength(10);
        expect(parsed.Tests[1].Changes[0]).toEqual({ Step: 1, Kind: 'selector-drift', Detail: '#a0 → #b0' });
    });

    it('writes a markdown table with an escaped pipe and at most 8 step changes per test', () => {
        const md = FormatScriptDriftReport([NEW_SCRIPT, CHANGED], 'markdown');
        expect(md).toContain('### Pending replay scripts (2)');
        expect(md).toContain('| Test | Meaningful drift | Summary |');
        expect(md).toContain('| T042 - Filter \\| Grid | 1 | 10 selector change(s), 1 step(s) removed |');
        expect(md).toContain('- Step 8: selector-drift — #a7 → #b7');
        expect(md).not.toContain('Step 9:');
        expect(md).toContain('- … and 2 more');
    });

    it('says so when nothing is pending', () => {
        expect(FormatScriptDriftReport([], 'markdown')).toContain('No pending replay scripts.');
        expect(JSON.parse(FormatScriptDriftReport([], 'json'))).toEqual({ PendingCount: 0, Tests: [] });
    });

    it('keeps the console listing', () => {
        const text = FormatScriptDriftReport([CHANGED], 'console');
        expect(text).toContain('Pending replay scripts (1)');
        expect(text).toContain('T042 - Filter | Grid');
        expect(text).toContain('step 1: selector-drift — #a0 → #b0');
        expect(text).toContain('… and 2 more');
    });
});
