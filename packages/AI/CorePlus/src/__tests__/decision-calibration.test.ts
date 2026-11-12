/**
 * @fileoverview How the model that answered a decision is described. The calibration lookup itself
 * is `AIEngineBase.FindDecisionCalibration`, tested in `@memberjunction/ai-engine-base`.
 */
import { describe, it, expect } from 'vitest';
import { DescribeAnsweringModel } from '../decision-calibration';

describe('DescribeAnsweringModel', () => {
    it('names the decision model and the model behind it, or says what is missing', () => {
        expect(DescribeAnsweringModel({ ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917' })).toBe('Jev (typesafe/jev-1.13-20260917)');
        expect(DescribeAnsweringModel({ ModelName: 'Jev' })).toBe('Jev (resolved model not reported)');
        expect(DescribeAnsweringModel({})).toBe('an unnamed model (resolved model not reported)');
    });
});
