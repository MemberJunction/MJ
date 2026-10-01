import { describe, expect, it } from 'vitest';
import type { RubricNodeSnapshot, RubricScaleSnapshot, RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { AddCriterion, AddNode, AnchorsForLevel, AnswerLevel, BandFor, CanSubmit, CatalogRow, ChosenPublishBump, ScoringShortcutApplies, ComparisonMatrix, DisplayScore, DraftProblems, IncompleteAnswers, MoveNode, MoveProblem, NodeFields, NodeFromRow, PlanBandSave, PlanNodeSave, PreviewScore, publishPreview, SampleMatchesTree, ScaleFromRow, SetAnchor, SetGate, SetScale, SetWeight, VersionRows, WeightShares } from './model.js';

const scale: RubricScaleSnapshot = {
    id: 'scale',
    scaleType: 'Levels',
    higherIsBetter: true,
    levels: [{ id: 'high', label: 'High', value: 1, normalizedValue: 1, sequence: 0 }],
};

function leaf(id: string, weight: number, extra: Partial<RubricNodeSnapshot> = {}): RubricNodeSnapshot {
    return {
        id, key: id, name: id, nodeType: 'Criterion', scaleId: 'scale', weight,
        isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0,
        ...extra,
    };
}

function version(nodes: RubricNodeSnapshot[]): RubricVersionSnapshot {
    return {
        id: 'version', rubricId: 'rubric', notApplicablePolicy: 'ExcludeAndRedistribute',
        scoreDisplayMin: 0, scoreDisplayMax: 100, nodes, scales: [scale], bands: [{ id: 'band', label: 'High', minScore: 0.5, maxScore: 1, displayTone: 'Success', sequence: 0 }],
    };
}

describe('catalog row', () => {
    it('names the published version, the previewed draft, and the category', () => {
        const row = CatalogRow({
            id: 'rubric',
            name: 'Screenshot rubric',
            description: 'A shot',
            categoryName: 'Agent evaluation',
            scaleNames: { scale: 'Screenshot Likert' },
            versions: [
                {
                    id: 'published', rubricId: 'rubric', status: 'Published', majorVersion: 1, minorVersion: 0, patchVersion: 0,
                    criteria: [{ id: 'p', key: 'accuracy', name: 'Accuracy', nodeType: 'Criterion', weight: 1, scaleId: 'scale', isGate: true }],
                },
                {
                    id: 'draft', rubricId: 'rubric', status: 'Draft', majorVersion: null, minorVersion: null, patchVersion: null,
                    criteria: [{ id: 'd', key: 'accuracy', name: 'Accuracy', nodeType: 'Criterion', weight: 2, scaleId: 'scale', isGate: true }],
                },
            ],
        });
        expect(row.publishedLabel).toBe('1.0.0');
        expect(row.draftLabel).toBe('2.0.0 draft, Major');
        expect(row.categoryName).toBe('Agent evaluation');
        expect(row.criteriaCount).toBe(1);
        expect(row.scaleName).toBe('Screenshot Likert');
        expect(JSON.stringify(row)).not.toContain('null');
    });
});

describe('rubric author', () => {
    it('shows live shares and ignores an advisory sibling', () => {
        const shares = WeightShares([leaf('a', 1), leaf('b', 3), leaf('note', 5, { isAdvisory: true })]);
        expect(shares.get('a')).toBe(25);
        expect(shares.get('b')).toBe(75);
        expect(shares.get('note')).toBe(0);
    });

    it('refuses a duplicate key, a missing scale, and a gate with no minimum', () => {
        const problems = DraftProblems([
            leaf('a', 1),
            leaf('b', 1, { key: 'a' }),
            leaf('c', 1, { scaleId: null }),
            leaf('d', 1, { isGate: true }),
        ], [scale]);
        expect(problems.join(' ')).toMatch(/Duplicate key a/);
        expect(problems.join(' ')).toMatch(/c needs a scale/);
        expect(problems.join(' ')).toMatch(/d is a gate with no minimum/);
    });

    it('adds a criterion with a unique key and previews the sample score', () => {
        const nodes = AddCriterion([], 'Clarity', 'scale');
        expect(nodes).toHaveLength(1);
        expect(nodes[0].key).toBe('clarity');
        const weighted = SetWeight(nodes, nodes[0].id, 2);
        expect(weighted[0].weight).toBe(2);
        const tree = version(weighted);
        const scored = PreviewScore(tree, [{ criterionId: nodes[0].id, scaleLevelId: 'high' }]);
        expect(scored.normalizedScore).toBe(1);
        expect(scored.outcome).toBe('Scored');
    });

    it('builds a parent and a gated child with a scale and an anchor', () => {
        let nodes = AddNode([], 'Quality', 'Group', null);
        const parent = nodes[0];
        nodes = AddCriterion(nodes, 'Clarity', null);
        const child = nodes[1];
        nodes = MoveNode(nodes, child.id, parent.id);
        nodes = SetScale(nodes, child.id, 'scale');
        nodes = SetAnchor(nodes, child.id, 'high', 'Clear enough to act on');
        nodes = SetGate(nodes, child.id, true, 0.6);
        const built = nodes.find(node => node.id === child.id);
        expect(built?.parentId).toBe(parent.id);
        expect(built?.sequence).toBe(0);
        expect(DraftProblems(nodes, [scale])).toEqual([]);
    });

    it('does not parent a group under its own child', () => {
        let nodes = AddNode([], 'Quality', 'Group', null);
        const parent = nodes[0];
        nodes = AddNode(nodes, 'Clarity', 'Criterion', 'scale', parent.id);
        const child = nodes[1];
        const kept = MoveNode(nodes, parent.id, child.id);
        expect(kept.find(node => node.id === parent.id)?.parentId ?? null).toBeNull();
        expect(MoveProblem(nodes, parent.id, child.id)).toMatch(/quality/);
        const cycled = kept.map(node => node.id === parent.id ? { ...node, parentId: child.id } : node);
        expect(DraftProblems(cycled, [scale]).join(' ')).toMatch(/quality/);
    });
});

describe('answer form', () => {
    it('blocks submit until a required rationale is present, and N/A clears the level', () => {
        const nodes = [leaf('a', 1, { rationaleRequired: true, evidenceRequired: true })];
        expect(CanSubmit(nodes, [])).toBe(false);
        const chosen = AnswerLevel([], 'a', 'high', false);
        expect(IncompleteAnswers(nodes, chosen).join(' ')).toMatch(/rationale/);
        const ready = [{ ...chosen[0], rationale: 'Because', evidence: 'The quote' }];
        expect(CanSubmit(nodes, ready)).toBe(true);
        const skipped = AnswerLevel(ready, 'a', 'high', true);
        expect(skipped[0].scaleLevelId).toBeNull();
        expect(skipped[0].isNotApplicable).toBe(true);
        expect(CanSubmit(nodes, skipped)).toBe(true);
    });

    it('refuses not applicable when the policy is NotAllowed, and ignores an unanswered advisory leaf', () => {
        const mandatory = leaf('must', 1, { notApplicablePolicy: 'NotAllowed' });
        const note = leaf('note', 1, { isAdvisory: true });
        const kept = AnswerLevel([{ criterionId: 'must', scaleLevelId: 'high' }], 'must', null, true, 'NotAllowed');
        expect(kept).toEqual([{ criterionId: 'must', scaleLevelId: 'high' }]);
        expect(AnchorsForLevel({ ...mandatory, guidance: 'Check the figure.', anchors: [{ scaleLevelId: 'high', descriptor: 'The figure matches.' }] }, 'high').map(anchor => anchor.descriptor)).toEqual(['The figure matches.']);
        expect(CanSubmit([mandatory], [{ criterionId: 'must', isNotApplicable: true }], 'ExcludeAndRedistribute')).toBe(false);
        expect(CanSubmit([note], [])).toBe(true);
    });
});

describe('publish, diff, and comparison', () => {
    function snap(weight: number, instructions: string | null): RubricVersionSnapshot {
        return {
            id: 'v', rubricId: 'r', majorVersion: 1, minorVersion: 0, patchVersion: 0,
            notApplicablePolicy: 'ExcludeAndRedistribute', scoreDisplayMin: 0, scoreDisplayMax: 100,
            instructions, nodes: [leaf('clarity', weight)], scales: [scale], bands: [],
        };
    }

    it('shows a major weight change and will not apply a lower request', () => {
        const preview = publishPreview(snap(1, null), snap(2, null), 'Patch');
        expect(preview.computedBump).toBe('Major');
        expect(preview.appliedBump).toBe('Major');
        expect(preview.nextVersion).toBe('2.0.0');
        expect(preview.changes.some(change => change.subject === 'clarity' && change.property === 'Weight')).toBe(true);
        expect(preview.higherBumps).toEqual([]);
    });

    it('offers a higher bump for a wording change and lines the keys up', () => {
        const base = snap(1, null);
        const draft = snap(1, 'Clearer instructions');
        const preview = publishPreview(base, draft, 'Major');
        expect(preview.computedBump).toBe('Patch');
        expect(preview.appliedBump).toBe('Major');
        expect(preview.higherBumps).toEqual(['Minor', 'Major']);
        const rows = VersionRows(base, { ...draft, nodes: [...draft.nodes, leaf('sourcing', 1)] });
        expect(rows.find(row => row.key === 'sourcing')?.left).toBeNull();
        expect(rows.find(row => row.key === 'clarity')?.right).toBe('clarity');
        const wording = VersionRows(base, draft).find(row => row.key === 'version');
        expect(wording?.marks.join(' ')).toMatch(/Instructions/);
        const widened = VersionRows(base, { ...draft, bands: [{ id: 'band', label: 'High', minScore: 0.5, maxScore: 1, displayTone: 'Success', sequence: 0 }] });
        expect(widened.find(row => row.key === 'High')?.marks.join(' ')).toMatch(/added|MinScore|range/i);
    });

    it('shows Initial for a first publish', () => {
        const preview = publishPreview(null, snap(1, null));
        expect(preview.computedBump).toBeNull();
        expect(preview.appliedBump).toBe('Initial');
        expect(ChosenPublishBump(null)).toBeNull();
        expect(ChosenPublishBump('Initial')).toBeNull();
        expect(ChosenPublishBump('Major')).toBe('Major');
        expect(ScoringShortcutApplies('input')).toBe(false);
        expect(ScoringShortcutApplies('TEXTAREA')).toBe(false);
        expect(ScoringShortcutApplies('select')).toBe(false);
        expect(ScoringShortcutApplies('fieldset')).toBe(true);
        expect(preview.nextVersion).toBe('1.0.0');
        expect(preview.identical).toBe(false);
    });

    it('marks disagreement and keeps self and withdrawn out of the human and AI means', () => {
        const matrix = ComparisonMatrix(['clarity', 'evidence'], [
            { id: 'human', name: 'Ada', evaluatorType: 'Human', status: 'Submitted', scores: [{ key: 'clarity', normalizedScore: 1 }, { key: 'evidence', normalizedScore: 0 }] },
            { id: 'ai', name: 'Judge', evaluatorType: 'AI', status: 'Submitted', scores: [{ key: 'clarity', normalizedScore: 1 }, { key: 'evidence', normalizedScore: 1 }] },
            { id: 'self', name: 'Vendor', evaluatorType: 'Self', status: 'Submitted', scores: [{ key: 'clarity', normalizedScore: 0 }, { key: 'evidence', normalizedScore: 0 }] },
            { id: 'gone', name: 'Withdrawn', evaluatorType: 'Human', status: 'Withdrawn', scores: [{ key: 'clarity', normalizedScore: 0 }, { key: 'evidence', normalizedScore: 0 }] },
        ]);
        const evidence = matrix.rows.find(row => row.key === 'evidence');
        expect(evidence?.cells.find(cell => cell.columnId === 'human')?.disagree).toBe(true);
        expect(evidence?.cells.find(cell => cell.columnId === 'self')?.disagree).toBe(false);
        expect(matrix.rows.find(row => row.key === 'clarity')?.cells.every(cell => !cell.disagree)).toBe(true);
        expect(matrix.humanMean).toBe(0.5);
        expect(matrix.aiMean).toBe(1);
        expect(matrix.selfScore).toBe(0);
    });
});

describe('explorer row mapping', () => {
    it('reads a criterion row and writes the same fields back', () => {
        const node = NodeFromRow({
            ID: 'c1', Key: 'clarity', Name: 'Clarity', ParentID: 'group', NodeType: 'Criterion',
            ScaleID: 'scale', Weight: 2, IsGate: 1, GateMinimumScore: 0.6, Sequence: 1,
        });
        expect(node.parentId).toBe('group');
        expect(node.isGate).toBe(true);
        expect(NodeFields(node)).toMatchObject({ Key: 'clarity', ParentID: 'group', Weight: 2, IsGate: true, GateMinimumScore: 0.6 });
    });

    it('saves a new criterion under its client id and deletes a removed child first', () => {
        const plan = PlanNodeSave(
            [{ id: 'parent', parentId: null }, { id: 'old-child', parentId: 'parent' }],
            [{ id: 'parent', key: 'quality', name: 'Quality', parentId: null, nodeType: 'Group', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0 }, { id: 'client-child', key: 'clarity', name: 'Clarity', parentId: 'parent', nodeType: 'Criterion', scaleId: 'scale', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0 }],
        );
        expect(plan.upserts.find(row => row.id === 'client-child')).toMatchObject({ isNew: true, fields: { ID: 'client-child', ParentID: 'parent' } });
        expect(plan.removedIds).toEqual(['old-child']);
    });

    it('keeps a numeric scale and its levels', () => {
        const scale = ScaleFromRow(
            { ID: 'scale', ScaleType: 'Numeric', HigherIsBetter: 0, MinValue: 0, MaxValue: 10, Step: 1 },
            [{ ID: 'level', Label: 'High', Value: 10, NormalizedValue: 1, Sequence: 0 }],
        );
        expect(scale.scaleType).toBe('Numeric');
        expect(scale.higherIsBetter).toBe(false);
        expect(scale.levels[0].label).toBe('High');
        const bands = PlanBandSave(['old'], [{ id: 'client-band', label: 'High', minScore: 0.5, maxScore: 1, displayTone: 'Success', sequence: 0 }]);
        expect(bands.upserts[0].fields.ID).toBe('client-band');
        expect(bands.removedIds).toEqual(['old']);
    });
});

describe('read-only result', () => {
    it('maps the score onto the display range and names the band', () => {
        expect(DisplayScore(0.75, 0, 100)).toBe(75);
        expect(DisplayScore(null, 0, 100)).toBeNull();
        expect(BandFor(0.8, version([]).bands)?.label).toBe('High');
        expect(BandFor(0.2, version([]).bands)).toBeNull();
        const bands = [
            { id: 'low', label: 'Low', minScore: 0, maxScore: 0.5, displayTone: 'Neutral', sequence: 0 },
            { id: 'high', label: 'Upper', minScore: 0.5, maxScore: 1, displayTone: 'Success', sequence: 1 },
        ];
        expect(BandFor(0.5, bands)?.label).toBe('Upper');
        expect(BandFor(1, bands)?.label).toBe('Upper');
    });
});

describe('sampleMatchesTree', () => {
    it('is false when the sample still points at another version of the tree', () => {
        const published = [leaf('published-accuracy', 1)];
        const draftAnswers = [{ criterionId: 'draft-accuracy' }];
        expect(SampleMatchesTree(published, draftAnswers)).toBe(false);
        expect(SampleMatchesTree(published, [{ criterionId: 'published-accuracy' }])).toBe(true);
        expect(SampleMatchesTree(published, [])).toBe(false);
    });
});
