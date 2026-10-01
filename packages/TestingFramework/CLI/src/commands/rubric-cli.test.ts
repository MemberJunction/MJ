import { describe, expect, it } from 'vitest';
import { RubricVersionDiff } from '@memberjunction/rubrics-base';
import { FormatCriterionReport, FormatVersionDiff, ParseRubricRef, ResolveRubricRef, SnapshotFromRows, ValidateSnapshot } from './rubric-cli.js';

const rubrics = [{ id: 'rubric-1', name: 'Reply check' }];
const versions = [{ id: 'version-1', rubricId: 'rubric-1', major: 1, minor: 2, patch: 0 }];

describe('rubric CLI', () => {
    it('parses a name, a version label, and a version id', () => {
        expect(ParseRubricRef('Reply check')).toEqual({ rubric: 'Reply check' });
        expect(ResolveRubricRef(rubrics, versions, 'Reply check@1.2.0')).toEqual({ rubricId: 'rubric-1', versionId: 'version-1' });
        expect(ResolveRubricRef(rubrics, versions, 'rubric-1@version-1')).toEqual({ rubricId: 'rubric-1', versionId: 'version-1' });
        expect(ResolveRubricRef(rubrics, versions, 'Missing')).toEqual({ error: 'Rubric "Missing" was not found.' });
    });

    it('prints each criterion and the version diff classification', () => {
        const report = FormatCriterionReport([{
            oracleType: 'rubric',
            details: { Criteria: [{ Key: 'facts', NormalizedScore: 1, Rationale: 'Cited.' }, { Key: 'tone', NormalizedScore: 0.5 }] },
        }]);
        expect(report).toBe('facts  1.000  Cited.\ntone  0.500');
        expect(FormatVersionDiff({
            computedBump: 'Major',
            changes: [{ bump: 'Major', subject: 'facts', property: 'Weight' }],
        })).toBe('Major\nMajor  facts  Weight');
    });

    it('rejects a duplicate key, a gate without a minimum, and a missing scale', () => {
        const errors = ValidateSnapshot({
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
            'facts: a criterion needs a scale.',
            'gate: a criterion needs a scale.',
            'gate: a gate needs a minimum from 0 to 1.',
        ]);
        expect(ValidateSnapshot({ nodes: [{ key: 'facts', weight: 1 }], scales: [] })).toEqual(['facts: a criterion needs a scale.']);
        expect(ValidateSnapshot({
            nodes: [{ id: 'child', key: 'facts', parentId: 'missing', weight: 1, scaleId: 'binary', nodeType: 'Criterion' }],
            scales: [{ id: 'binary' }],
        })).toContain('facts: parent is not in the file.');
        expect(ValidateSnapshot({
            nodes: [
                { id: 'a', key: 'group', parentId: 'b', nodeType: 'Group', weight: 1 },
                { id: 'b', key: 'facts', parentId: 'a', nodeType: 'Criterion', weight: 1, scaleId: 'binary' },
            ],
            scales: [{ id: 'binary' }],
        }).some(error => error.includes('descendant'))).toBe(true);
    });

    it('classifies a level change and a weight change as Major', () => {
        const version = { ID: 'v', RubricID: 'r', NotApplicablePolicy: 'NotAllowed', PassThreshold: 0.7, ScoreDisplayMin: 0, ScoreDisplayMax: 1 };
        const criterion = { ID: 'c', Key: 'facts', Name: 'Facts', NodeType: 'Criterion', ParentID: null, ScaleID: 'scale', Weight: 1, Sequence: 0 };
        const scale = { ID: 'scale', ScaleType: 'Levels', HigherIsBetter: true };
        const level = { ID: 'met', ScaleID: 'scale', Label: 'Met', Value: 1, NormalizedValue: 1, Sequence: 1 };
        const base = SnapshotFromRows(version, [criterion], [scale], [level], []);
        const heavier = SnapshotFromRows(version, [{ ...criterion, Weight: 2 }], [scale], [level], []);
        const shifted = SnapshotFromRows(version, [criterion], [scale], [{ ...level, NormalizedValue: 0.5 }], []);
        expect(FormatVersionDiff(RubricVersionDiff.diff(base, heavier)).startsWith('Major')).toBe(true);
        expect(FormatVersionDiff(RubricVersionDiff.diff(base, shifted)).startsWith('Major')).toBe(true);
    });
});
