import { describe, expect, it } from 'vitest';
import { RubricScoring, RubricValidationError } from '../RubricScoring.js';
import type { RubricAnswer, RubricNodeSnapshot, RubricScoreInput, RubricVersionSnapshot } from '../types.js';

function leaf(partial: Partial<RubricNodeSnapshot> & Pick<RubricNodeSnapshot, 'id' | 'key'>): RubricNodeSnapshot {
    return {
        name: partial.key,
        nodeType: 'Criterion',
        weight: 1,
        isAdvisory: false,
        isGate: false,
        evidenceRequired: false,
        rationaleRequired: false,
        sequence: 0,
        scaleId: 'scale',
        ...partial,
    };
}

function version(nodes: RubricNodeSnapshot[], extra: Partial<RubricVersionSnapshot> = {}): RubricVersionSnapshot {
    return {
        id: 'version',
        rubricId: 'rubric',
        notApplicablePolicy: 'ExcludeAndRedistribute',
        scoreDisplayMin: 0,
        scoreDisplayMax: 100,
        nodes,
        scales: [{
            id: 'scale',
            scaleType: 'Levels',
            higherIsBetter: true,
            levels: [
                { id: 'low', label: 'Low', value: 1, normalizedValue: 0.25, sequence: 0 },
                { id: 'high', label: 'High', value: 2, normalizedValue: 1, sequence: 1 },
            ],
        }, {
            id: 'numeric',
            scaleType: 'Numeric',
            minValue: 0,
            maxValue: 10,
            step: 1,
            higherIsBetter: true,
            levels: [],
        }],
        bands: [
            { id: 'low-band', label: 'Low', minScore: 0, maxScore: 0.5, displayTone: 'Warning', sequence: 0 },
            { id: 'top-band', label: 'Top', minScore: 0.5, maxScore: 1, displayTone: 'Success', sequence: 1 },
        ],
        ...extra,
    };
}

function score(nodes: RubricNodeSnapshot[], answers: RubricAnswer[], extra: Partial<RubricScoreInput> = {}) {
    return RubricScoring.compute({ answers, ...extra, version: extra.version ?? version(nodes) });
}

describe('RubricScoring', () => {
    it('scores a levels answer at the level NormalizedValue, on a 0..1 scale', () => {
        const result = score([leaf({ id: 'a', key: 'a' })], [{ criterionId: 'a', scaleLevelId: 'low' }], {
            version: version([leaf({ id: 'a', key: 'a' })], { passThreshold: 0.5 }),
        });
        expect(result.normalizedScore).toBe(0.25);
        expect(result.outcome).toBe('BelowThreshold');
        expect(result.passed).toBe(false);
        expect(result.scoringEngineVersion).toBe('1.0');
    });

    it('maps a numeric answer across the scale and inverts when lower is better', () => {
        const node = leaf({ id: 'a', key: 'a', scaleId: 'numeric' });
        const high = score([node], [{ criterionId: 'a', rawValue: 10 }]);
        expect(high.normalizedScore).toBe(1);
        const inverted = score([node], [{ criterionId: 'a', rawValue: 0 }], {
            version: version([node], {
                scales: [{
                    id: 'numeric', scaleType: 'Numeric', minValue: 0, maxValue: 10, step: 1, higherIsBetter: false, levels: [],
                }],
            }),
        });
        expect(inverted.normalizedScore).toBe(1);
    });

    it('refuses a numeric value outside the range or off step instead of clamping', () => {
        const node = leaf({ id: 'a', key: 'a', scaleId: 'numeric' });
        expect(() => score([node], [{ criterionId: 'a', rawValue: 11 }])).toThrow(RubricValidationError);
        expect(() => score([node], [{ criterionId: 'a', rawValue: 0.5 }])).toThrow(/step/);
    });

    it('redistributes weight when a node is not applicable under ExcludeAndRedistribute, and drops it from completeness', () => {
        const nodes = [leaf({ id: 'a', key: 'a' }), leaf({ id: 'b', key: 'b' })];
        const result = score(nodes, [
            { criterionId: 'a', isNotApplicable: true },
            { criterionId: 'b', scaleLevelId: 'high' },
        ]);
        expect(result.normalizedScore).toBe(1);
        expect(result.completeness).toBe(1);
        expect(result.nodes.find(node => node.key === 'a')?.effectiveWeight).toBeNull();
        expect(result.nodes.find(node => node.key === 'b')?.effectiveWeight).toBe(1);
    });

    it('scores CountAsZero as 0 and keeps the weight', () => {
        const nodes = [
            leaf({ id: 'a', key: 'a', notApplicablePolicy: 'CountAsZero' }),
            leaf({ id: 'b', key: 'b' }),
        ];
        const result = score(nodes, [
            { criterionId: 'a', isNotApplicable: true },
            { criterionId: 'b', scaleLevelId: 'high' },
        ]);
        expect(result.normalizedScore).toBe(0.5);
        expect(result.completeness).toBe(1);
    });

    it('classifies a rubric whose only leaf is N/A under FailEvaluation as NotApplicableFailure', () => {
        const nodes = [leaf({ id: 'a', key: 'a', name: 'Clarity', notApplicablePolicy: 'FailEvaluation' })];
        const result = score(nodes, [{ criterionId: 'a', isNotApplicable: true }]);
        expect(result.normalizedScore).toBeNull();
        expect(result.outcome).toBe('NotApplicableFailure');
        expect(result.passed).toBe(false);
    });

    it('raises NotApplicableFailure and still drops the node from the math', () => {
        const nodes = [
            leaf({ id: 'a', key: 'a', notApplicablePolicy: 'FailEvaluation' }),
            leaf({ id: 'b', key: 'b' }),
        ];
        const result = score(nodes, [
            { criterionId: 'a', isNotApplicable: true },
            { criterionId: 'b', scaleLevelId: 'high' },
        ], { version: version(nodes, { passThreshold: 0.5 }) });
        expect(result.normalizedScore).toBe(1);
        expect(result.outcome).toBe('NotApplicableFailure');
        expect(result.passed).toBe(false);
    });

    it('refuses NotAllowed and names the criterion', () => {
        const nodes = [leaf({ id: 'a', key: 'a', name: 'Clarity', notApplicablePolicy: 'NotAllowed' })];
        expect(() => score(nodes, [{ criterionId: 'a', isNotApplicable: true }])).toThrow(/Clarity/);
    });

    it('drops an unanswered node from the math and lowers completeness', () => {
        const nodes = [leaf({ id: 'a', key: 'a' }), leaf({ id: 'b', key: 'b' })];
        const result = score(nodes, [{ criterionId: 'b', scaleLevelId: 'high' }], {
            version: version(nodes, { minimumCompleteness: 0.8, passThreshold: 0.5 }),
        });
        expect(result.normalizedScore).toBe(1);
        expect(result.completeness).toBe(0.5);
        expect(result.outcome).toBe('Incomplete');
    });

    it('weights a WeightedMean by the declared weights', () => {
        const nodes = [leaf({ id: 'a', key: 'a', weight: 1 }), leaf({ id: 'b', key: 'b', weight: 3 })];
        const result = score(nodes, [
            { criterionId: 'a', scaleLevelId: 'low' },
            { criterionId: 'b', scaleLevelId: 'high' },
        ]);
        expect(result.normalizedScore).toBe(0.8125);
    });

    it('falls back to an equal-weight mean when every included weight is 0', () => {
        const nodes = [leaf({ id: 'a', key: 'a', weight: 0 }), leaf({ id: 'b', key: 'b', weight: 0 })];
        const result = score(nodes, [
            { criterionId: 'a', scaleLevelId: 'low' },
            { criterionId: 'b', scaleLevelId: 'high' },
        ]);
        expect(result.normalizedScore).toBe(0.625);
    });

    it('rolls a group up by Minimum and Maximum', () => {
        const group = leaf({ id: 'g', key: 'g', nodeType: 'Group', scaleId: null, rollupMethod: 'Minimum' });
        const children = [
            leaf({ id: 'a', key: 'a', parentId: 'g' }),
            leaf({ id: 'b', key: 'b', parentId: 'g' }),
        ];
        const minimum = score([group, ...children], [
            { criterionId: 'a', scaleLevelId: 'low' },
            { criterionId: 'b', scaleLevelId: 'high' },
        ]);
        expect(minimum.normalizedScore).toBe(0.25);
        const maximum = score(
            [{ ...group, rollupMethod: 'Maximum' }, ...children],
            [
                { criterionId: 'a', scaleLevelId: 'low' },
                { criterionId: 'b', scaleLevelId: 'high' },
            ],
        );
        expect(maximum.normalizedScore).toBe(1);
        expect(maximum.nodes.find(node => node.key === 'a')?.overallContribution).toBeNull();
    });

    it('fails an unanswered gate and does not fail a gate that was excluded as not applicable', () => {
        const nodes = [
            leaf({ id: 'gate', key: 'gate', isGate: true, gateMinimumScore: 0.5 }),
            leaf({ id: 'other', key: 'other' }),
        ];
        const silence = score(nodes, [{ criterionId: 'other', scaleLevelId: 'high' }], {
            version: version(nodes, { passThreshold: 0.5 }),
        });
        expect(silence.gateFailed).toBe(true);
        expect(silence.outcome).toBe('GateFailed');
        expect(silence.passed).toBe(false);

        const excluded = score(nodes, [
            { criterionId: 'gate', isNotApplicable: true },
            { criterionId: 'other', scaleLevelId: 'high' },
        ], { version: version(nodes, { passThreshold: 0.5 }) });
        expect(excluded.gateFailed).toBe(false);
        expect(excluded.outcome).toBe('Passed');
    });

    it('lets Incomplete beat GateFailed, and a missing threshold produce Scored', () => {
        const nodes = [
            leaf({ id: 'gate', key: 'gate', isGate: true, gateMinimumScore: 0.9 }),
            leaf({ id: 'other', key: 'other' }),
        ];
        const incomplete = score(nodes, [{ criterionId: 'other', scaleLevelId: 'low' }], {
            version: version(nodes, { minimumCompleteness: 1, passThreshold: 0.1 }),
        });
        expect(incomplete.gateFailed).toBe(true);
        expect(incomplete.outcome).toBe('Incomplete');

        const scored = score([leaf({ id: 'a', key: 'a' })], [{ criterionId: 'a', scaleLevelId: 'high' }]);
        expect(scored.outcome).toBe('Scored');
        expect(scored.passed).toBeNull();
    });

    it('ignores advisory nodes in the rollup, the gate, and completeness', () => {
        const nodes = [
            leaf({ id: 'advice', key: 'advice', isAdvisory: true, isGate: true, gateMinimumScore: 0.9, weight: 5 }),
            leaf({ id: 'real', key: 'real' }),
        ];
        const result = score(nodes, [
            { criterionId: 'advice', scaleLevelId: 'low' },
            { criterionId: 'real', scaleLevelId: 'high' },
        ], { version: version(nodes, { passThreshold: 0.5 }) });
        expect(result.normalizedScore).toBe(1);
        expect(result.completeness).toBe(1);
        expect(result.gateFailed).toBe(false);
        expect(result.outcome).toBe('Passed');
        expect(result.nodes.find(node => node.key === 'advice')?.normalizedScore).toBe(0.25);
    });

    it('puts a perfect score in the top band, whose max is closed at 1', () => {
        const result = score([leaf({ id: 'a', key: 'a' })], [{ criterionId: 'a', scaleLevelId: 'high' }]);
        expect(result.bandId).toBe('top-band');
    });

    it('rounds stored decimals to 6 places and makes leaf contributions sum to the overall score', () => {
        const nodes = [
            leaf({ id: 'a', key: 'a', weight: 1 }),
            leaf({ id: 'b', key: 'b', weight: 1 }),
            leaf({ id: 'c', key: 'c', weight: 1 }),
        ];
        const result = score(nodes, [
            { criterionId: 'a', scaleLevelId: 'high', confidence: 1 },
            { criterionId: 'b', scaleLevelId: 'low', confidence: 0 },
            { criterionId: 'c', scaleLevelId: 'high' },
        ]);
        const weights = result.nodes.map(node => node.effectiveWeight);
        expect(weights.every(weight => weight === 0.333333)).toBe(true);
        const sum = result.nodes.reduce((total, node) => total + (node.overallContribution ?? 0), 0);
        expect(Math.abs(sum - (result.normalizedScore ?? 0)) < 0.000002).toBe(true);
        expect(result.confidence).not.toBeNull();
    });

    it('rounds 0.1, 0.2, and 0.7 before threshold, gate, band, and completeness comparisons', () => {
        // 0.1 * 1 + 0.2 * 0 + 0.7 * 1 is 0.7999999999999999. Unrounded, that is
        // below a threshold of 0.8, outside a band that starts at 0.8, and a
        // failing gate. Six-place rounding makes it 0.8.
        const scaleId = 'boundary';
        const nodes: RubricNodeSnapshot[] = [
            {
                id: 'group',
                key: 'group',
                name: 'group',
                nodeType: 'Group',
                weight: 1,
                isAdvisory: false,
                isGate: true,
                gateMinimumScore: 0.8,
                rollupMethod: 'WeightedMean',
                evidenceRequired: false,
                rationaleRequired: false,
                sequence: 0,
            },
            leaf({ id: 'a', key: 'a', parentId: 'group', weight: 0.1, scaleId }),
            leaf({ id: 'b', key: 'b', parentId: 'group', weight: 0.2, scaleId }),
            leaf({ id: 'c', key: 'c', parentId: 'group', weight: 0.7, scaleId }),
        ];
        const boundary = version(nodes, {
            passThreshold: 0.8,
            minimumCompleteness: 0.8,
            scales: [{
                id: scaleId,
                scaleType: 'Levels',
                higherIsBetter: true,
                levels: [
                    { id: 'no', label: 'No', value: 0, normalizedValue: 0, sequence: 0 },
                    { id: 'yes', label: 'Yes', value: 1, normalizedValue: 1, sequence: 1 },
                ],
            }],
            bands: [
                { id: 'under', label: 'Under', minScore: 0, maxScore: 0.8, displayTone: 'Warning', sequence: 0 },
                { id: 'met', label: 'Met', minScore: 0.8, maxScore: 1, displayTone: 'Success', sequence: 1 },
            ],
        });
        const result = score(nodes, [
            { criterionId: 'a', scaleLevelId: 'yes' },
            { criterionId: 'b', scaleLevelId: 'no' },
            { criterionId: 'c', scaleLevelId: 'yes' },
        ], { version: boundary });
        expect(result.normalizedScore).toBe(0.8);
        expect(result.outcome).toBe('Passed');
        expect(result.passed).toBe(true);
        expect(result.gateFailed).toBe(false);
        expect(result.bandId).toBe('met');
        expect(result.completeness).toBe(1);
    });
});
