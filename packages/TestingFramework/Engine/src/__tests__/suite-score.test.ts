import { describe, expect, it } from 'vitest';
import { TestEngine } from '../engine/TestEngine.js';
import { MeanExecutedScore } from '../utils/result-formatter.js';
import type { TestRunResult } from '../types.js';

describe('suite score', () => {
    it('averages executed scores and leaves skips out', () => {
        expect(MeanExecutedScore([
            { status: 'Passed', score: 1 },
            { status: 'Failed', score: 0.5 },
            { status: 'Skipped', score: 0 },
        ])).toBe(0.75);
        expect(MeanExecutedScore([{ status: 'Skipped', score: 0 }])).toBe(0);
        expect(MeanExecutedScore([])).toBe(0);
    });

    it('persists that mean on the suite run', async () => {
        const suiteRun = {
            Score: null as number | null,
            async Save() { return true; },
        };
        const results = [
            { status: 'Passed', score: 1, totalCost: 0 },
            { status: 'Skipped', score: 0, totalCost: 0 },
        ] as TestRunResult[];
        await (TestEngine.Instance as unknown as {
            updateSuiteRun(run: typeof suiteRun, rows: TestRunResult[], started: number): Promise<void>;
        }).updateSuiteRun(suiteRun, results, Date.now());
        expect(suiteRun.Score).toBe(1);
    });
});
