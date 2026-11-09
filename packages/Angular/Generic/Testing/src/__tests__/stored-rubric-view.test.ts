import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RubricEvaluationId, RubricRunView, StoredRubricView } from '../lib/models/testing-rubrics';

describe('stored rubric result', () => {
    it('uses the saved completeness, gate, name, band, and evidence', () => {
        const oracle = [{ Name: 'rubric', Details: { RubricEvaluationID: 'eval-1', Completeness: null, GateFailed: 0, Criteria: [{ Key: 'cites-sources', NormalizedScore: 1 }] } }];
        expect(RubricEvaluationId(oracle)).toBe('eval-1');
        expect(RubricRunView(oracle)?.result.completeness).toBeNull();
        expect(RubricRunView([{ Name: 'rubric', Details: { GateFailed: 1, Criteria: [{ Key: 'clarity', Name: 'Clarity', NormalizedScore: 0.2, GateFailed: 1 }] } }])?.result.gateFailed).toBe(true);
        const view = StoredRubricView(
            { ID: 'eval-1', RubricVersionID: 'version-1', Completeness: null, GateFailed: 1, BandID: 'band-good', NormalizedScore: 0.4, Outcome: 'Failed' },
            [{ CriterionID: 'crit-1', NormalizedScore: 0.4, GateFailed: 1, Rationale: 'Thin.', Evidence: JSON.stringify([{ Type: 'Quote', Text: 'The figure shows 80.' }]) }],
            [{ ID: 'crit-1', Key: 'cites-sources', Name: 'Cites the sources', Weight: 1 }],
            [{ ID: 'band-good', Label: 'Good', MinScore: 0.5, MaxScore: 1, DisplayTone: 'Success', Sequence: 0 }],
        );
        expect(view.result.completeness).toBeNull();
        expect(view.result.gateFailed).toBe(true);
        expect(view.result.scoringEngineVersion).toBe('');
        expect(StoredRubricView(
            { ID: 'eval-2', ScoringEngineVersion: '2.0' },
            [],
            [],
        ).result.scoringEngineVersion).toBe('2.0');
        expect(view.result.bandId).toBe('band-good');
        expect(view.version.nodes[0].name).toBe('Cites the sources');
        expect(view.version.nodes[0].name).not.toBe('cites-sources');
        expect(view.answers[0].evidence).toBe('The figure shows 80.');
        expect(view.version.bands[0].label).toBe('Good');
        const result = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../rubrics/src/lib/rubric-result.component.html'), 'utf8');
        expect(result).toContain('Evidence');
        expect(result).toContain("Gate {{ Result.gateFailed ? 'not met' : 'met' }}");
        const screen = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/components/testing-rubric-result.component.ts'), 'utf8');
        expect(screen).toContain('RubricEvaluationId');
        expect(screen).toContain('MJ: Rubric Evaluations');
    });
});
