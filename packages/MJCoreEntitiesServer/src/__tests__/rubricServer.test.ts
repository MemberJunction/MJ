import { describe, expect, it } from 'vitest';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { RubricScoring } from '@memberjunction/rubrics-base';
import { PublishRubricVersion, RubricPublishError, ValidateRubricTree, CloneVersionNodes } from '../custom/rubrics/versionPublish.js';
import { RubricEvaluationError, SubmitEvaluation } from '../custom/rubrics/evaluationSubmit.js';
import { FrozenScaleChange } from '../custom/rubrics/scaleFreeze.js';

function version(extra: Partial<RubricVersionSnapshot> = {}): RubricVersionSnapshot {
    return {
        id: 'v',
        rubricId: 'r',
        notApplicablePolicy: 'ExcludeAndRedistribute',
        scoreDisplayMin: 0,
        scoreDisplayMax: 100,
        nodes: [{
            id: 'a',
            key: 'clarity',
            name: 'Clarity',
            nodeType: 'Criterion',
            scaleId: 'scale',
            weight: 1,
            isAdvisory: false,
            isGate: false,
            evidenceRequired: false,
            rationaleRequired: false,
            sequence: 0,
        }],
        scales: [{
            id: 'scale',
            scaleType: 'Levels',
            higherIsBetter: true,
            levels: [{ id: 'high', label: 'High', value: 1, normalizedValue: 1, sequence: 0 }],
        }],
        bands: [],
        ...extra,
    };
}

describe('rubric version publish', () => {
    it('refuses a criterion with no scale, a cycle, and a gate with no minimum', () => {
        const draft = version({
            nodes: [
                { id: 'g', key: 'g', name: 'G', nodeType: 'Group', weight: 1, isAdvisory: false, isGate: true, evidenceRequired: false, rationaleRequired: false, sequence: 0 },
                { id: 'a', key: 'clarity', name: 'Clarity', nodeType: 'Criterion', parentId: 'missing', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 1 },
                { id: 'b', key: 'clarity', name: 'Dup', nodeType: 'Criterion', scaleId: 'scale', parentId: 'b', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 2 },
                { id: 'c', key: 'missing-scale', name: 'Missing', nodeType: 'Criterion', scaleId: 'not-on-version', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 3 },
            ],
        });
        const errors = ValidateRubricTree(draft).errors.join(' ');
        expect(errors).toMatch(/no scale/);
        expect(errors).toMatch(/missing parent/);
        expect(errors).toMatch(/no minimum/);
        expect(errors).toMatch(/cycle/);
        expect(errors).toMatch(/Duplicate key/);
        expect(errors).toMatch(/not on this version/);
        expect(errors).toMatch(/empty group/);
    });

    it('rejects a criterion with children, an empty tree, an advisory parent, and bands that do not tile 0..1', () => {
        const leaf = version().nodes[0];
        const withChild = version({
            nodes: [
                { ...leaf, id: 'parent', key: 'parent' },
                { ...leaf, id: 'child', key: 'child', parentId: 'parent', isGate: true, gateMinimumScore: 0.8 },
            ],
        });
        expect(ValidateRubricTree(withChild).errors.join(' ')).toMatch(/child gate is ignored/);

        const advisory = version({
            nodes: [
                { id: 'advice', key: 'advice', name: 'Advice', nodeType: 'Group', weight: 1, isAdvisory: true, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0 },
                { ...leaf, parentId: 'advice' },
            ],
        });
        expect(ValidateRubricTree(advisory).errors.join(' ')).toMatch(/advisory group/);

        const onlyAdvice = version({
            nodes: [{ ...leaf, isAdvisory: true }],
        });
        expect(ValidateRubricTree(onlyAdvice).errors.join(' ')).toMatch(/non-advisory leaf/);

        const overlap = version({
            bands: [
                { id: 'low', label: 'Low', minScore: 0, maxScore: 0.6, displayTone: 'Warning', sequence: 0 },
                { id: 'high', label: 'High', minScore: 0.5, maxScore: 1, displayTone: 'Success', sequence: 1 },
            ],
        });
        expect(ValidateRubricTree(overlap).errors.join(' ')).toMatch(/overlap/);

        const gap = version({
            bands: [
                { id: 'low', label: 'Low', minScore: 0, maxScore: 0.4, displayTone: 'Warning', sequence: 0 },
                { id: 'high', label: 'High', minScore: 0.5, maxScore: 1, displayTone: 'Success', sequence: 1 },
            ],
        });
        expect(ValidateRubricTree(gap).errors.join(' ')).toMatch(/leave a gap/);

        const tiled = version({
            nodes: [
                { id: 'group', key: 'group', name: 'Group', nodeType: 'Group', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0 },
                { ...leaf, parentId: 'group' },
            ],
            bands: [
                { id: 'low', label: 'Low', minScore: 0, maxScore: 0.5, displayTone: 'Warning', sequence: 0 },
                { id: 'high', label: 'High', minScore: 0.5, maxScore: 1, displayTone: 'Success', sequence: 1 },
            ],
        });
        expect(ValidateRubricTree(tiled).errors).toEqual([]);
    });

    it('refuses an identical draft and publishes a weight change as major with hashes', async () => {
        const base = version();
        await expect(PublishRubricVersion(base, version())).rejects.toBeInstanceOf(RubricPublishError);
        const heavier = version({ nodes: [{ ...version().nodes[0], weight: 2 }] });
        const published = await PublishRubricVersion(base, heavier);
        expect(published.appliedBump).toBe('Major');
        expect(published.majorVersion).toBe(1);
        expect(published.scoringHash).toHaveLength(64);
        expect(published.contentHash).toHaveLength(64);
        expect(published.scoringHash).not.toBe(published.contentHash);
        expect(published.publishedAt).toBeInstanceOf(Date);
        const weight = published.changeDetails.Changes.find(change => change.Property === 'Weight');
        expect(published.changeDetails.BaseVersionID).toBe(base.id);
        expect(weight).toMatchObject({ From: 1, To: 2, Bump: 'Major', Path: 'clarity' });
    });

    it('clones keys and rewrites parent ids', () => {
        const nodes = CloneVersionNodes([
            { id: 'g', key: 'group', name: 'Group', nodeType: 'Group', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0 },
            { id: 'c', key: 'clarity', name: 'Clarity', parentId: 'g', nodeType: 'Criterion', scaleId: 'scale', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 1 },
        ]);
        expect(nodes.map(node => node.key)).toEqual(['group', 'clarity']);
        expect(nodes[1].parentId).toBe(nodes[0].id);
        expect(nodes[0].id).not.toBe('g');
    });
});

describe('rubric evaluation submit', () => {
    const draft = version({ passThreshold: 0.5 });

    it('refuses a draft version, a raw value on a levels scale, and a missing rationale', () => {
        expect(() => SubmitEvaluation({ version: draft, versionStatus: 'Draft', scores: [] })).toThrow(RubricEvaluationError);
        expect(() => SubmitEvaluation({
            version: draft,
            versionStatus: 'Published',
            scores: [{ criterionId: 'a', rawValue: 3 }],
        })).toThrow(/numeric/);
        const needsRationale = version({
            passThreshold: 0.5,
            nodes: [{ ...draft.nodes[0], rationaleRequired: true }],
        });
        expect(() => SubmitEvaluation({
            version: needsRationale,
            versionStatus: 'Published',
            scores: [{ criterionId: 'a', scaleLevelId: 'high' }],
        })).toThrow(/rationale/);
    });

    it('persists the RubricScoring result and no other math', () => {
        const scored = SubmitEvaluation({
            version: draft,
            versionStatus: 'Published',
            scores: [{ criterionId: 'a', scaleLevelId: 'high' }],
        });
        const direct = RubricScoring.compute({
            version: draft,
            answers: [{ criterionId: 'a', scaleLevelId: 'high' }],
        });
        expect(scored.evaluation.normalizedScore).toBe(direct.normalizedScore);
        expect(scored.evaluation.outcome).toBe(direct.outcome);
        expect(scored.evaluation.status).toBe('Submitted');
        expect(scored.evaluation.scoringEngineVersion).toBe('1.0');
        expect(scored.scores[0].normalizedScore).toBe(direct.nodes[0].normalizedScore);
        expect(scored.evaluation.submittedAt).toBeInstanceOf(Date);
    });

    it('allows Retired only when the superseded evaluation used that same version', () => {
        expect(() => SubmitEvaluation({ version: draft, versionStatus: 'Draft', scores: [] })).toThrow(/Published/);
        expect(() => SubmitEvaluation({ version: draft, versionStatus: 'Retired', scores: [] })).toThrow(/same version/);
        expect(() => SubmitEvaluation({
            version: draft,
            versionStatus: 'Retired',
            supersedesEvaluationId: 'old',
            scores: [{ criterionId: 'a', scaleLevelId: 'high' }],
        })).toThrow(/same version/);
        expect(() => SubmitEvaluation({
            version: draft,
            versionStatus: 'Retired',
            supersedesEvaluationId: 'old',
            priorVersionId: 'other-version',
            scores: [{ criterionId: 'a', scaleLevelId: 'high' }],
        })).toThrow(/same version/);
        const scored = SubmitEvaluation({
            version: draft,
            versionStatus: 'Retired',
            supersedesEvaluationId: 'old',
            priorVersionId: draft.id,
            scores: [{ criterionId: 'a', scaleLevelId: 'high' }],
        });
        expect(scored.evaluation.status).toBe('Submitted');
    });

    it('refuses to create an evaluation pinned to anything but a Published version', async () => {
        const { AssertPinnedVersionForCreate } = await import('../custom/rubrics/evaluationSubmit.js');
        expect(() => AssertPinnedVersionForCreate('Draft')).toThrow(/Published/);
        expect(() => AssertPinnedVersionForCreate('Retired')).toThrow(/Published/);
        expect(() => AssertPinnedVersionForCreate('Published')).not.toThrow();
    });
});

describe('supersede', () => {
    it('refuses a different subject and accepts a matching Submitted row', async () => {
        const { AssertCanSupersede } = await import('../custom/rubrics/evaluationSubmit.js');
        const current = { status: 'Submitted', subjectEntityId: 'e', subjectRecordId: 'r', contextEntityId: null, contextRecordId: null, rubricId: 'rubric' };
        expect(() => AssertCanSupersede({ ...current, subjectRecordId: 'other' }, current)).toThrow(/subject/);
        expect(() => AssertCanSupersede({ ...current, status: 'Draft' }, current)).toThrow(/Submitted/);
        expect(() => AssertCanSupersede(current, current)).not.toThrow();
    });
});

describe('scale freeze', () => {
    const shape = {
        scaleType: 'Levels',
        higherIsBetter: true,
        levels: [{ id: 'high', value: 1, normalizedValue: 1, label: 'High', description: 'wording' }],
    };

    it('allows any edit when no published version uses the scale, and refuses a level value when one does', () => {
        expect(FrozenScaleChange(false, shape, { ...shape, scaleType: 'Numeric', minValue: 0, maxValue: 1 })).toBeNull();
        expect(FrozenScaleChange(true, shape, {
            ...shape,
            levels: [{ ...shape.levels[0], normalizedValue: 0.4 }],
        })).toMatch(/level value/);
        expect(FrozenScaleChange(true, shape, {
            ...shape,
            levels: [{ ...shape.levels[0], description: 'clearer' }],
        })).toBeNull();
    });
});
