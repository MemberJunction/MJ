import { describe, expect, it } from 'vitest';
import { inlineOracleFromVerdicts, scoreInline } from '../oracles/inline-rubric.js';

describe('inline rubric', () => {
    it('scores equal binary leaves and does not persist an evaluation id', () => {
        const scored = scoreInline(['Accurate', 'Sourced'], [
            { index: 0, met: true },
            { index: 1, met: false },
        ], { passThreshold: 0.7 });
        expect(scored.normalizedScore).toBe(0.5);
        expect(scored.outcome).toBe('BelowThreshold');
        const strict = scoreInline(['Accurate', 'Sourced'], [
            { index: 0, met: true },
            { index: 1, met: false },
        ], { strict: true, passThreshold: 0.7 });
        expect(strict.outcome).toBe('GateFailed');
        const report = inlineOracleFromVerdicts([
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
});
