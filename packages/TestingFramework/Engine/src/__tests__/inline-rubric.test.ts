import { describe, expect, it } from 'vitest';
import { InlineOracleFromVerdicts, InlineOracleResult, ScoreInline } from '../oracles/inline-rubric.js';

describe('inline rubric', () => {
    it('scores equal binary leaves and does not persist an evaluation id', () => {
        const scored = ScoreInline(['Accurate', 'Sourced'], [
            { index: 0, met: true },
            { index: 1, met: false },
        ], { passThreshold: 0.7 });
        expect(scored.normalizedScore).toBe(0.5);
        expect(scored.outcome).toBe('BelowThreshold');
        const strict = ScoreInline(['Accurate', 'Sourced'], [
            { index: 0, met: true },
            { index: 1, met: false },
        ], { strict: true, passThreshold: 0.7 });
        expect(strict.outcome).toBe('GateFailed');
        const report = InlineOracleFromVerdicts([
            { criterion: 'Accurate', met: true, evidence: 'The figure matches.' },
            { criterion: 'Sourced', met: true, evidence: 'Cited.' },
        ]);
        expect(report.oracleType).toBe('llm-judge');
        expect(report.passed).toBe(true);
        expect(report.details).not.toHaveProperty('RubricEvaluationID');
        const details = report.details as { inline: boolean; Criteria: { Name: string; Rationale?: string }[] };
        expect(details.inline).toBe(true);
        expect(details.Criteria[0]).toMatchObject({ Name: 'Accurate', Rationale: 'The figure matches.' });
    });

    it('weights a met leaf of 2 against an unmet leaf of 1 as two thirds, and drops weight 0', () => {
        const weighted = ScoreInline(
            [{ text: 'Light', weight: 1 }, { text: 'Heavy', weight: 2 }],
            [{ index: 0, met: false }, { index: 1, met: true }],
            { passThreshold: 0.7 },
        );
        expect(weighted.normalizedScore).toBeCloseTo(2 / 3, 6);
        const silent = ScoreInline(
            [{ text: 'Heavy', weight: 2 }, { text: 'Silent', weight: 0 }],
            [{ index: 0, met: true }, { index: 1, met: false }],
            { passThreshold: 0.7 },
        );
        expect(silent.normalizedScore).toBe(1);
    });

    it('leaves an omitted leaf unanswered and does not pass', () => {
        const omitted = ScoreInline(['First', 'Second'], [{ index: 0, met: true }], { passThreshold: 0.7 });
        expect(omitted.normalizedScore).toBe(1);
        expect(omitted.completeness).toBe(0.5);
        expect(omitted.outcome).toBe('Incomplete');
        expect(omitted.nodes[1].normalizedScore).toBeNull();
        const five = ['A', 'B', 'C', 'D', 'E'];
        const partial = ScoreInline(five, [{ index: 0, met: true }], {});
        expect(partial.completeness).toBe(0.2);
        expect(partial.outcome).toBe('Incomplete');
        expect(InlineOracleResult(five, partial).passed).toBe(false);
    });
});
