import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CohortDisagreement, CriterionFailureRates, CriterionIdentity, DisagreementFromScores, RubricPickerOptions, RubricScoreTrend, RubricRunView, ScoreTrend } from '../lib/models/testing-rubrics';

describe('testing rubric UI', () => {
    it('does not keep camelCase aliases of the picker and trend helpers', () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/models/testing-rubrics.ts'), 'utf8');
        expect(source).not.toContain('export function criterionIdentity');
        expect(source).not.toContain('export function scoreTrend');
        expect(source).not.toContain('export function criterionFailureRates');
        expect(source).not.toContain('export function rubricPickerOptions');
    });

    it('orders the review queue by the largest human–AI gap', () => {
        const queue = DisagreementFromScores({
            evaluations: [
                { id: 'human-facts', subjectId: 'run', versionId: 'v1', evaluatorType: 'Human', status: 'Submitted' },
                { id: 'ai-facts', subjectId: 'run', versionId: 'v1', evaluatorType: 'AIPrompt', status: 'Submitted' },
                { id: 'human-tone', subjectId: 'run', versionId: 'v1', evaluatorType: 'Human', status: 'Submitted' },
                { id: 'ai-tone', subjectId: 'run', versionId: 'v1', evaluatorType: 'AIPrompt', status: 'Submitted' },
                { id: 'ai-open', subjectId: 'run', versionId: 'v1', evaluatorType: 'AIPrompt', status: 'Submitted' },
            ],
            scores: [
                { evaluationId: 'human-facts', key: 'facts', name: 'Facts', normalizedScore: 0.4 },
                { evaluationId: 'ai-facts', key: 'facts', name: 'Facts', normalizedScore: 1 },
                { evaluationId: 'human-tone', key: 'tone', name: 'Tone', normalizedScore: 0.9 },
                { evaluationId: 'ai-tone', key: 'tone', name: 'Tone', normalizedScore: 0.8 },
                { evaluationId: 'ai-open', key: 'open', name: 'Open', normalizedScore: 1 },
            ],
        });
        expect(queue.map(row => row.key)).toEqual(['run|v1|facts', 'run|v1|tone']);
        expect(queue[0].gap).toBeCloseTo(0.6);
        const facts = CriterionIdentity({ CriterionKey: 'facts', Criterion: 'Facts' });
        expect(CriterionIdentity({ CriterionID: 'c-facts', Criterion: 'Facts' }).key).toBe('');
        const twoSubjects = DisagreementFromScores({
            evaluations: [
                { id: 'a-human', subjectId: 'run-a', versionId: 'v1', evaluatorType: 'Human', status: 'Submitted' },
                { id: 'a-ai', subjectId: 'run-a', versionId: 'v1', evaluatorType: 'AIPrompt', status: 'Submitted' },
                { id: 'b-human', subjectId: 'run-b', versionId: 'v1', evaluatorType: 'Human', status: 'Submitted' },
                { id: 'b-ai', subjectId: 'run-b', versionId: 'v1', evaluatorType: 'AIPrompt', status: 'Submitted' },
            ],
            scores: [
                { evaluationId: 'a-human', ...facts, normalizedScore: 0.2 },
                { evaluationId: 'a-ai', ...facts, normalizedScore: 1 },
                { evaluationId: 'b-human', ...facts, normalizedScore: 0.9 },
                { evaluationId: 'b-ai', ...facts, normalizedScore: 0.8 },
            ],
        });
        expect(twoSubjects.map(row => row.key)).toEqual(['run-a|v1|facts', 'run-b|v1|facts']);
        expect(twoSubjects.every(row => row.name === 'Facts')).toBe(true);
        expect(CriterionIdentity({}).key).toBe('');
        const cohort = CohortDisagreement([
            { CriterionKey: 'facts', Criterion: 'Facts', CriterionCohortHumanMeanScore: 0.4, CriterionCohortAIMeanScore: 1, SubjectRecordID: 'run-1', RubricVersionID: 'v1', NormalizedScore: 0 },
            { CriterionKey: 'facts', Criterion: 'Facts', CriterionCohortHumanMeanScore: 0.4, CriterionCohortAIMeanScore: 1, SubjectRecordID: 'run-1', RubricVersionID: 'v1', NormalizedScore: 1 },
        ]);
        expect(cohort).toEqual([{ key: 'facts', name: 'Facts', humanMean: 0.4, aiMean: 1, gap: 0.6, runId: 'run-1' }]);
        const criterionIdOnly = { CriterionID: 'c-facts', NormalizedScore: 0.1, CriterionCohortHumanMeanScore: 0.4, CriterionCohortAIMeanScore: 1, SubjectRecordID: 'run-1' };
        expect(CohortDisagreement([criterionIdOnly])).toEqual([]);
        const majors = CohortDisagreement([
            { CriterionKey: 'facts', Criterion: 'Facts', CriterionCohortHumanMeanScore: 0.2, CriterionCohortAIMeanScore: 0.9, SubjectRecordID: 'run-1', RubricID: 'rubric', RubricMajorVersion: 1 },
            { CriterionKey: 'facts', Criterion: 'Facts', CriterionCohortHumanMeanScore: 0.5, CriterionCohortAIMeanScore: 0.5, SubjectRecordID: 'run-1', RubricID: 'rubric', RubricMajorVersion: 2 },
        ]);
        expect(majors.map(row => row.runId)).toEqual(['run-1', 'run-1']);
        expect(majors.map(row => row.gap)).toEqual([0.7, 0]);
        expect(RubricScoreTrend([
            { at: '2026-02-01', score: 0.5, runId: 'run-b' },
            { at: '2026-01-01', score: 1, runId: 'run-a' },
            { at: '2026-03-01', score: null, runId: 'run-c' },
        ])).toEqual([
            { at: '2026-01-01', score: 1, runId: 'run-a' },
            { at: '2026-02-01', score: 0.5, runId: 'run-b' },
        ]);
    });

    it('trends one suite and reports per-criterion failure rates', () => {
        const trend = ScoreTrend([
            { at: '2026-02-01', score: 0.5, scopeId: 'suite' },
            { at: '2026-01-01', score: 1, scopeId: 'suite' },
            { at: '2026-03-01', score: null, scopeId: 'suite' },
            { at: '2026-01-01', score: 0, scopeId: 'other' },
        ], 'suite');
        expect(trend.map(point => point.score)).toEqual([1, 0.5]);
        const rates = CriterionFailureRates([
            { key: 'facts', normalizedScore: 0.4, passThreshold: 0.7 },
            { key: 'facts', normalizedScore: 0.9, passThreshold: 0.7 },
            { key: 'tone', normalizedScore: 1, passThreshold: 0.7 },
            { key: 'tone', normalizedScore: null },
            { key: 'gate', normalizedScore: 0.9, gateFailed: true, passThreshold: 0.7 },
        ]);
        expect(rates).toEqual([
            { key: 'gate', rate: 1, count: 1 },
            { key: 'facts', rate: 0.5, count: 2 },
            { key: 'tone', rate: 0, count: 1 },
        ]);
    });

    it('offers active rubrics by name and builds a run result with rationale and evidence', () => {
        expect(RubricPickerOptions([
            { ID: 'b', Name: 'Beta', Status: 'Active' },
            { ID: 'a', Name: 'Alpha', Status: 'Disabled' },
            { ID: 'c', Name: 'Caret', Status: 'Active' },
        ]).map(row => row.name)).toEqual(['Beta', 'Caret']);
        const view = RubricRunView([{
            oracleType: 'rubric',
            details: { Outcome: 'Passed', Criteria: [{ Key: 'facts', Name: 'Facts', NormalizedScore: 1, Rationale: 'Cited.', Evidence: 'Page 2.' }] },
        }]);
        expect(view?.result.outcome).toBe('Passed');
        expect(view?.answers[0]).toMatchObject({ rationale: 'Cited.', evidence: 'Page 2.' });
        const weighted = [
            { Key: 'heavy', Name: 'Heavy', NormalizedScore: 1, Weight: 2, Rationale: 'Yes.' },
            { Key: 'light', Name: 'Light', NormalizedScore: 0, Weight: 1, Evidence: 'No.' },
        ];
        expect(RubricRunView([{ oracleType: 'rubric', details: { Criteria: weighted } }])?.result.normalizedScore).toBeNull();
        expect(RubricRunView([{ oracleType: 'rubric', details: { NormalizedScore: 2 / 3, Criteria: weighted } }])?.result.normalizedScore).toBeCloseTo(2 / 3);
    });
});
