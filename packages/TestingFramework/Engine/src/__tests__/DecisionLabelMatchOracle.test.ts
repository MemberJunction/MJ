/**
 * @fileoverview `decision-label-match`: a Likelihood's probability against a point's label.
 */
import { describe, it, expect } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJTestEntity } from '@memberjunction/core-entities';
import { DecisionLabelMatchOracle, ReadLikelihood } from '../oracles/DecisionLabelMatchOracle';
import type { OracleInput } from '../types';
import type { DecisionEvalLabel, DecisionLabelMatchDetails } from '../decision-eval/types';

const TEST = { Name: 'point [cell]' } satisfies Pick<MJTestEntity, 'Name'>;
const USER = { ID: 'user-1' } satisfies Pick<UserInfo, 'ID'>;

function input(label: DecisionEvalLabel | 'bogus', probability: number | null): OracleInput {
    return {
        test: TEST as MJTestEntity,
        contextUser: USER as UserInfo,
        expectedOutput: { label, labelSource: 'construction' },
        actualOutput: {
            Answers: probability === null
                ? { route: { Kind: 'Choice', Value: 'x', Confidence: 0.9, Probabilities: { x: 0.9, y: 0.1 } } }
                : { continues: { Kind: 'Likelihood', Probability: probability } }
        }
    };
}

const oracle = new DecisionLabelMatchOracle();

describe('DecisionLabelMatchOracle', () => {
    it('is the decision-label-match type', () => {
        expect(oracle.type).toBe('decision-label-match');
    });

    it('passes a continue label at or above the threshold, with the details', async () => {
        const result = await oracle.evaluate(input('continue', 0.8), {});
        expect(result).toMatchObject({ oracleType: 'decision-label-match', passed: true, score: 1 });
        expect(result.advisory).toBeUndefined();
        const details: DecisionLabelMatchDetails = { probability: 0.8, label: 'continue', positive: 1, correct: true, brier: expect.closeTo(0.04, 12) };
        expect(result.details).toEqual(details);
    });

    it('fails a switch label at or above the threshold', async () => {
        const result = await oracle.evaluate(input('switch', 0.5), {});
        expect(result).toMatchObject({ passed: false, score: 0 });
        expect(result.details).toEqual({ probability: 0.5, label: 'switch', positive: 0, correct: false, brier: 0.25 });
    });

    it('passes a switch label below the threshold', async () => {
        const result = await oracle.evaluate(input('switch', 0.2), {});
        expect(result.passed).toBe(true);
        expect(result.details).toMatchObject({ positive: 0, correct: true, brier: expect.closeTo(0.04, 12) });
    });

    it('honours a configured threshold and question', async () => {
        expect((await oracle.evaluate(input('continue', 0.6), { threshold: 0.7 })).passed).toBe(false);
        expect((await oracle.evaluate(input('continue', 0.6), { question: 'route' })).message).toContain("No 'route' Likelihood");
    });

    it('returns an advisory, unscored result for an ambiguous label', async () => {
        const result = await oracle.evaluate(input('ambiguous', 0.9), {});
        expect(result).toMatchObject({ passed: true, advisory: true, score: 0 });
        expect(result.message).toContain('kept with the previous agent');
        expect(result.details).toEqual({ probability: 0.9, label: 'ambiguous', positive: null, correct: null, brier: null });
    });

    it('fails a scored label when the Likelihood is missing', async () => {
        const result = await oracle.evaluate(input('continue', null), {});
        expect(result).toMatchObject({ passed: false, score: 0 });
        expect(result.details).toEqual({ probability: null, label: 'continue', positive: 1, correct: false, brier: null });
    });

    it('fails on a bad label or a bad configuration rather than guessing', async () => {
        expect((await oracle.evaluate(input('bogus', 0.9), {})).message).toMatch(/^Expected outcome has no usable label: label/);
        expect((await oracle.evaluate(input('continue', 0.9), { threshold: 2 })).message).toMatch(/^Invalid configuration: threshold/);
    });

    it('ReadLikelihood reads only a Likelihood under the key', () => {
        expect(ReadLikelihood({ Answers: { continues: { Kind: 'Likelihood', Probability: 0.3 } } }, 'continues')).toBe(0.3);
        expect(ReadLikelihood({ Answers: { continues: { Kind: 'Choice', Value: 'a', Confidence: 1, Probabilities: { a: 1 } } } }, 'continues')).toBeNull();
        expect(ReadLikelihood('not an output', 'continues')).toBeNull();
        expect(ReadLikelihood(undefined, 'continues')).toBeNull();
    });
});
