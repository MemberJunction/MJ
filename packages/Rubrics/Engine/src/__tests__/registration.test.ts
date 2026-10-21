import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseEngine } from '@memberjunction/core';
import { RUBRIC_CACHE_ENTITIES, RubricEngineBase } from '@memberjunction/rubrics-base';
import { BaseRubricEvaluator } from '../RubricEvaluator.js';
import { DeterministicRubricEvaluator } from '../DeterministicRubricEvaluator.js';
import '../LLMRubricEvaluator.js';
import '../AgentRubricEvaluator.js';
import '../DecisionRubricEvaluator.js';
import '../HumanRubricEvaluator.js';
import { RubricContentRegistry, ShapeContent } from '../content.js';
import { RubricEngine } from '../RubricEngine.js';

describe('rubric registration', () => {
    it('creates the deterministic evaluator from the class factory', () => {
        const created = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRubricEvaluator>(BaseRubricEvaluator, 'Deterministic');
        expect(created).toBeInstanceOf(DeterministicRubricEvaluator);
        expect(created?.EvaluatorName).toBe('Deterministic');
        for (const key of ['LLM', 'Decision', 'Agent', 'Human']) {
            expect(MJGlobal.Instance.ClassFactory.CreateInstance(BaseRubricEvaluator, key)).toBeTruthy();
        }
    });

    it('lets a registered content provider replace the built-in mapper', () => {
        RubricContentRegistry.Instance.Register('MJ: Notes', () => ({ text: 'from the registry' }));
        expect(ShapeContent('MJ: Notes', { Body: 'ignored' }).text).toBe('from the registry');
        expect(ShapeContent('MJ: Test Runs', { ActualOutputData: 'shipped' }).data?.actualOutput).toBe('shipped');
    });

    it('does not depend on the agents package', () => {
        const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
        const rubrics = JSON.parse(readFileSync(join(root, 'Rubrics/Engine/package.json'), 'utf8')) as { dependencies: Record<string, string> };
        expect(rubrics.dependencies['@memberjunction/ai-agents']).toBeUndefined();
        const agents = readFileSync(join(root, 'AI/Agents/src/index.ts'), 'utf8');
        expect(agents).toContain("import './rubric-evaluation-agent-runner.js'");
        const runner = readFileSync(join(root, 'AI/Agents/src/rubric-evaluation-agent-runner.ts'), 'utf8');
        expect(runner).toContain('RegisterRubricAgentRunner');
    });

    it('is a BaseEngine singleton and a BaseSingleton engine', () => {
        expect(RubricEngineBase.Instance).toBeInstanceOf(BaseEngine);
        expect(RubricEngine.Instance).toBeInstanceOf(RubricEngine);
        expect([...RUBRIC_CACHE_ENTITIES]).toContain('MJ: Rubric Criteria');
        expect([...RUBRIC_CACHE_ENTITIES]).toContain('MJ: AI Agent Rubrics');
    });
});
