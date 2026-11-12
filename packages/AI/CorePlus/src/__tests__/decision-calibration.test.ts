/**
 * @fileoverview A calibration applies only to the exact model it was fitted on: the MJ decision
 * model and the model the driver reports behind it.
 */
import { describe, it, expect } from 'vitest';
import type { DecisionCalibrationEntry } from '@memberjunction/ai';
import {
    CalibrateDecisionProbability,
    DescribeAnsweringModel,
    FindDecisionCalibration,
    type DecisionCalibrationKey,
    type DecisionCalibrationSource
} from '../decision-calibration';

const ROUTING: DecisionCalibrationKey = { Use: 'conversation-routing', Question: 'continues' };

const ENTRIES: Record<string, DecisionCalibrationEntry[]> = {
    'Jev': [
        { Use: 'conversation-routing', Question: 'continues', ResolvedModel: 'typesafe/jev-1.13-20260917', A: 1.7757, B: -3.3506 },
        { Use: 'agent-discovery', Question: 'agent', ResolvedModel: 'typesafe/jev-1.13-20260917', A: 0.4412, B: 0.4571 },
    ],
    'LLM Decision': [
        { Use: 'conversation-routing', Question: 'continues', ResolvedModel: 'GPT-OSS-120B', A: 1.6508, B: -2.911 },
    ],
};

/** A source keyed by model name, as `AIEngineBase.GetDecisionCalibrations` answers. */
const SOURCE: DecisionCalibrationSource = {
    GetDecisionCalibrations: (modelName: string) => Object.hasOwn(ENTRIES, modelName) ? ENTRIES[modelName] : [],
};

describe('FindDecisionCalibration', () => {
    it('finds the fit for the use, the question and the exact resolved model, trimming both names', () => {
        expect(FindDecisionCalibration(SOURCE, ROUTING, { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917' })).toEqual({ A: 1.7757, B: -3.3506 });
        expect(FindDecisionCalibration(SOURCE, ROUTING, { ModelName: ' LLM Decision ', ResolvedModel: 'GPT-OSS-120B\n' })).toEqual({ A: 1.6508, B: -2.911 });
    });

    it('keeps each use and question apart', () => {
        const jev = { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917' };
        expect(FindDecisionCalibration(SOURCE, { Use: 'agent-discovery', Question: 'agent' }, jev)).toEqual({ A: 0.4412, B: 0.4571 });
        expect(FindDecisionCalibration(SOURCE, { Use: 'agent-discovery', Question: 'anyApplies' }, jev)).toBeNull();
        expect(FindDecisionCalibration(SOURCE, { Use: 'memory-note-gate', Question: 'continues' }, jev)).toBeNull();
    });

    it('has none for the right decision model with a different model behind it', () => {
        expect(FindDecisionCalibration(SOURCE, ROUTING, { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.14-20261101' })).toBeNull();
        expect(FindDecisionCalibration(SOURCE, ROUTING, { ModelName: 'LLM Decision', ResolvedModel: 'GPT 5.5 Instant' })).toBeNull();
        // One pair's names crossed with the other's
        expect(FindDecisionCalibration(SOURCE, ROUTING, { ModelName: 'Jev', ResolvedModel: 'GPT-OSS-120B' })).toBeNull();
    });

    it('has none when either name is missing or blank, or there is no source', () => {
        expect(FindDecisionCalibration(SOURCE, ROUTING, { ModelName: 'Jev' })).toBeNull();
        expect(FindDecisionCalibration(SOURCE, ROUTING, { ResolvedModel: 'typesafe/jev-1.13-20260917' })).toBeNull();
        expect(FindDecisionCalibration(SOURCE, ROUTING, { ModelName: 'Jev', ResolvedModel: '  ' })).toBeNull();
        expect(FindDecisionCalibration(SOURCE, ROUTING, { ModelName: null, ResolvedModel: null })).toBeNull();
        expect(FindDecisionCalibration(null, ROUTING, { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917' })).toBeNull();
    });

    it('matches the resolved model exactly, so a near miss is uncalibrated rather than guessed', () => {
        expect(FindDecisionCalibration(SOURCE, ROUTING, { ModelName: 'Jev', ResolvedModel: 'TypeSafe/jev-1.13-20260917' })).toBeNull();
    });

    it('ignores an entry whose A or B is not a finite number', () => {
        const broken: DecisionCalibrationSource = {
            GetDecisionCalibrations: () => [
                { Use: 'conversation-routing', Question: 'continues', ResolvedModel: 'm', A: Number.NaN, B: 0 },
                { Use: 'conversation-routing', Question: 'continues', ResolvedModel: 'm', A: 1, B: Number.POSITIVE_INFINITY },
            ],
        };
        expect(FindDecisionCalibration(broken, ROUTING, { ModelName: 'X', ResolvedModel: 'm' })).toBeNull();
    });

    it('never reaches an Object.prototype member by name', () => {
        for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
            expect(FindDecisionCalibration(SOURCE, ROUTING, { ModelName: name, ResolvedModel: name })).toBeNull();
        }
    });
});

describe('CalibrateDecisionProbability', () => {
    it('applies the fit, or returns null without one', () => {
        const jev = { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917' };
        expect(CalibrateDecisionProbability(SOURCE, ROUTING, 0.5, jev)).toBeCloseTo(1 / (1 + Math.exp(3.3506)), 10);
        expect(CalibrateDecisionProbability(SOURCE, ROUTING, 0.5, { ModelName: 'Jev', ResolvedModel: 'other' })).toBeNull();
    });
});

describe('DescribeAnsweringModel', () => {
    it('names the decision model and the model behind it, or says what is missing', () => {
        expect(DescribeAnsweringModel({ ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917' })).toBe('Jev (typesafe/jev-1.13-20260917)');
        expect(DescribeAnsweringModel({ ModelName: 'Jev' })).toBe('Jev (resolved model not reported)');
        expect(DescribeAnsweringModel({})).toBe('an unnamed model (resolved model not reported)');
    });
});
