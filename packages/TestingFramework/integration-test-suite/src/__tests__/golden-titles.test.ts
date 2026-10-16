/**
 * The golden-title copy check: what keeps the gates' golden titles equal to the installed golden set.
 */
import { describe, it, expect } from 'vitest';
import type { GoldenCase } from '@memberjunction/testing-engine';
import { ALL_GOLDEN_TITLES, GOLDEN_TITLES, GoldenTitleCopy, type GoldenTitle } from '../checks/fp-gates/golden-titles';

/** The golden-set case an installation carries for one golden title. */
function installedCase(g: GoldenTitle): GoldenCase {
    return {
        ID: g.ID, Input: { CurrentJobTitle: g.Title }, Expected: { JobFunctions: [...g.Functions], SeniorityLevel: [...g.Seniority] },
        LabelSource: g.Required ? 'specification' : 'model-consensus',
        ...(g.Required ? { Required: true } : {}), ...(g.Abstain ? { ExpectAbstain: [...g.Abstain] } : {}),
    };
}

describe('GoldenTitleCopy.Differences', () => {
    const installed = (): GoldenCase[] => ALL_GOLDEN_TITLES.map(installedCase);

    it('is empty for the same set of 52 labelled titles and 6 required cases', () => {
        expect([GOLDEN_TITLES.length, ALL_GOLDEN_TITLES.length]).toEqual([52, 58]);
        expect(GoldenTitleCopy.Differences(ALL_GOLDEN_TITLES, installed())).toEqual([]);
    });

    it('reports a different count, a changed label and a case no longer required', () => {
        expect(GoldenTitleCopy.Differences(ALL_GOLDEN_TITLES, installed().slice(0, 57))).toEqual(['58 titles in the copy, 57 cases installed']);

        const relabelled = installed();
        relabelled[2] = { ...relabelled[2], Expected: { ...relabelled[2].Expected, SeniorityLevel: ['Director'] } };
        expect(GoldenTitleCopy.Differences(ALL_GOLDEN_TITLES, relabelled)).toEqual([
            "g03 'Creamery Manager': labels differ (copy Operations | Manager; installed Operations | Director)",
        ]);

        const optional = installed();
        optional[52] = { ...optional[52], Required: false };
        expect(GoldenTitleCopy.Differences(ALL_GOLDEN_TITLES, optional)).toHaveLength(1);
    });
});
