/**
 * @fileoverview A calibration applies only to the exact model it was fitted on: the MJ decision
 * model and the model the driver reports behind it.
 */
import { describe, it, expect } from 'vitest';
import { DescribeAnsweringModel, FindDecisionCalibration, type DecisionModelCalibration } from '../decision-calibration';

const TABLE: readonly DecisionModelCalibration<string>[] = [
    { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917', Calibration: 'jev-fit' },
    { ModelName: 'LLM Decision', ResolvedModel: 'GPT-OSS-120B', Calibration: 'llm-fit' }
];

describe('FindDecisionCalibration', () => {
    it('finds the calibration for the exact pair, trimming both names', () => {
        expect(FindDecisionCalibration(TABLE, { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917' })).toBe('jev-fit');
        expect(FindDecisionCalibration(TABLE, { ModelName: ' LLM Decision ', ResolvedModel: 'GPT-OSS-120B\n' })).toBe('llm-fit');
    });

    it('has none for the right decision model with a different model behind it', () => {
        expect(FindDecisionCalibration(TABLE, { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.14-20261101' })).toBeNull();
        expect(FindDecisionCalibration(TABLE, { ModelName: 'LLM Decision', ResolvedModel: 'GPT 5.5 Instant' })).toBeNull();
        // One pair's names crossed with the other's
        expect(FindDecisionCalibration(TABLE, { ModelName: 'Jev', ResolvedModel: 'GPT-OSS-120B' })).toBeNull();
    });

    it('has none when either name is missing or blank', () => {
        expect(FindDecisionCalibration(TABLE, { ModelName: 'Jev' })).toBeNull();
        expect(FindDecisionCalibration(TABLE, { ResolvedModel: 'typesafe/jev-1.13-20260917' })).toBeNull();
        expect(FindDecisionCalibration(TABLE, { ModelName: 'Jev', ResolvedModel: '  ' })).toBeNull();
        expect(FindDecisionCalibration(TABLE, { ModelName: null, ResolvedModel: null })).toBeNull();
    });

    it('is case-sensitive, so a near miss is uncalibrated rather than guessed', () => {
        expect(FindDecisionCalibration(TABLE, { ModelName: 'jev', ResolvedModel: 'typesafe/jev-1.13-20260917' })).toBeNull();
    });

    it('never reaches an Object.prototype member by name', () => {
        for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
            expect(FindDecisionCalibration(TABLE, { ModelName: name, ResolvedModel: name })).toBeNull();
        }
    });
});

describe('DescribeAnsweringModel', () => {
    it('names the decision model and the model behind it, or says what is missing', () => {
        expect(DescribeAnsweringModel({ ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917' })).toBe('Jev (typesafe/jev-1.13-20260917)');
        expect(DescribeAnsweringModel({ ModelName: 'Jev' })).toBe('Jev (resolved model not reported)');
        expect(DescribeAnsweringModel({})).toBe('an unnamed model (resolved model not reported)');
    });
});
