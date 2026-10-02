import { describe, expect, it } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseEngine } from '@memberjunction/core';
import { RUBRIC_CACHE_ENTITIES, RubricEngineBase } from '@memberjunction/rubrics-base';
import { BaseRubricEvaluator } from '../RubricEvaluator.js';
import { DeterministicRubricEvaluator } from '../DeterministicRubricEvaluator.js';
import '../LLMRubricEvaluator.js';
import '../AgentRubricEvaluator.js';
import '../HumanRubricEvaluator.js';
import { RubricContentRegistry, ShapeContent } from '../content.js';
import { RubricEngine } from '../RubricEngine.js';

describe('rubric registration', () => {
    it('creates the deterministic evaluator from the class factory', () => {
        const created = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRubricEvaluator>(BaseRubricEvaluator, 'Deterministic');
        expect(created).toBeInstanceOf(DeterministicRubricEvaluator);
        expect(created?.EvaluatorName).toBe('Deterministic');
        for (const key of ['LLM', 'Agent', 'Human']) {
            expect(MJGlobal.Instance.ClassFactory.CreateInstance(BaseRubricEvaluator, key)).toBeTruthy();
        }
    });

    it('lets a registered content provider replace the built-in mapper', () => {
        RubricContentRegistry.Instance.Register('MJ: Notes', () => ({ text: 'from the registry' }));
        expect(ShapeContent('MJ: Notes', { Body: 'ignored' }).text).toBe('from the registry');
        expect(ShapeContent('MJ: Test Runs', { ActualOutputData: 'shipped' }).data?.actualOutput).toBe('shipped');
    });

    it('is a BaseEngine singleton and a BaseSingleton engine', () => {
        expect(RubricEngineBase.Instance).toBeInstanceOf(BaseEngine);
        expect(RubricEngine.Instance).toBeInstanceOf(RubricEngine);
        expect([...RUBRIC_CACHE_ENTITIES]).toContain('MJ: Rubric Criteria');
        expect([...RUBRIC_CACHE_ENTITIES]).toContain('MJ: AI Agent Rubrics');
    });
});
