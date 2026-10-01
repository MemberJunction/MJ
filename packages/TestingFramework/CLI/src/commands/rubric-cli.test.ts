import { describe, expect, it } from 'vitest';
import { formatCriterionReport, formatVersionDiff, parseRubricRef, resolveRubricRef, validateSnapshot } from './rubric-cli.js';

const rubrics = [{ id: 'rubric-1', name: 'Reply check' }];
const versions = [{ id: 'version-1', rubricId: 'rubric-1', major: 1, minor: 2, patch: 0 }];

describe('rubric CLI', () => {
    it('parses a name, a version label, and a version id', () => {
        expect(parseRubricRef('Reply check')).toEqual({ rubric: 'Reply check' });
        expect(resolveRubricRef(rubrics, versions, 'Reply check@1.2.0')).toEqual({ rubricId: 'rubric-1', versionId: 'version-1' });
        expect(resolveRubricRef(rubrics, versions, 'rubric-1@version-1')).toEqual({ rubricId: 'rubric-1', versionId: 'version-1' });
        expect(resolveRubricRef(rubrics, versions, 'Missing')).toEqual({ error: 'Rubric "Missing" was not found.' });
    });

    it('prints each criterion and the version diff classification', () => {
        const report = formatCriterionReport([{
            oracleType: 'rubric',
            details: { Criteria: [{ Key: 'facts', NormalizedScore: 1, Rationale: 'Cited.' }, { Key: 'tone', NormalizedScore: 0.5 }] },
        }]);
        expect(report).toBe('facts  1.000  Cited.\ntone  0.500');
        expect(formatVersionDiff({
            computedBump: 'Major',
            changes: [{ bump: 'Major', subject: 'facts', property: 'Weight' }],
        })).toBe('Major\nMajor  facts  Weight');
    });

    it('rejects a duplicate key, a gate without a minimum, and a missing scale', () => {
        const errors = validateSnapshot({
            nodes: [
                { key: 'facts', weight: 1, scaleId: 'missing' },
                { key: 'facts', weight: 1 },
                { key: 'gate', weight: 1, isGate: true },
            ],
            scales: [{ id: 'binary' }],
        });
        expect(errors).toEqual([
            'facts: scale missing is not on this version.',
            'Duplicate key facts.',
            'gate: a gate needs a minimum from 0 to 1.',
        ]);
    });
});
