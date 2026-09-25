import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import type { MJAIPromptEntityExtended, AIPromptParams } from '@memberjunction/ai-core-plus';
import { BaseModelRunner, ExecutionBound } from '../BaseModelRunner';
import { AIPromptRunner } from '../AIPromptRunner';
import { ParallelExecutionCoordinator } from '../ParallelExecutionCoordinator';
import type { IParallelExecutionCoordinator } from '../ParallelExecution';

class TestEmbeddingsRunner extends BaseModelRunner {
  public override get RequiredModelType(): string {
    return 'Embedding';
  }

  public invokeCreateExecutionBound(
    prompt: MJAIPromptEntityExtended,
    params: AIPromptParams,
    cancellationToken?: AbortSignal
  ): ExecutionBound {
    return this.createExecutionBound(prompt, params, cancellationToken);
  }
}

describe('BaseModelRunner', () => {
  it('AIPromptRunner is an instance of BaseModelRunner', () => {
    const runner = new AIPromptRunner();
    expect(runner).toBeInstanceOf(BaseModelRunner);
  });

  it('AIPromptRunner declares RequiredModelType as LLM', () => {
    const runner = new AIPromptRunner();
    expect(runner.RequiredModelType).toBe('LLM');
  });

  it('ParallelExecutionCoordinator resolved via ClassFactory is an instance of BaseModelRunner', () => {
    // Ensure ParallelExecutionCoordinator is imported and registered
    expect(ParallelExecutionCoordinator).toBeDefined();

    const coordinator = MJGlobal.Instance.ClassFactory.CreateInstance<IParallelExecutionCoordinator>(
      AIPromptRunner,
      'ParallelExecutionCoordinator'
    );
    expect(coordinator).toBeDefined();
    expect(coordinator).toBeInstanceOf(BaseModelRunner);
    expect(coordinator).toBeInstanceOf(AIPromptRunner);
    expect(coordinator).toBeInstanceOf(ParallelExecutionCoordinator);
  });

  it('minimal subclass extends BaseModelRunner directly and sets RequiredModelType', () => {
    const runner = new TestEmbeddingsRunner();
    expect(runner).toBeInstanceOf(BaseModelRunner);
    expect(runner.RequiredModelType).toBe('Embedding');
  });

  it('minimal subclass can invoke inherited createExecutionBound', () => {
    const runner = new TestEmbeddingsRunner();
    const mockPrompt = { Name: 'TestPrompt' } as unknown as MJAIPromptEntityExtended;
    const params: AIPromptParams = { timeoutMS: 5000 };

    const bound = runner.invokeCreateExecutionBound(mockPrompt, params);
    try {
      expect(bound).toBeDefined();
      expect(bound.TimeoutMS).toBe(5000);
      expect(bound.Signal).toBeDefined();
      expect(bound.TimedOut()).toBe(false);
    } finally {
      bound.Dispose();
    }
  });

  it('createExecutionBound returns undefined Signal and TimeoutMS when no timeout specified', () => {
    const runner = new TestEmbeddingsRunner();
    const mockPrompt = { Name: 'TestPrompt' } as unknown as MJAIPromptEntityExtended;
    const params: AIPromptParams = {};

    const bound = runner.invokeCreateExecutionBound(mockPrompt, params);
    try {
      expect(bound).toBeDefined();
      expect(bound.TimeoutMS).toBeUndefined();
      expect(bound.Signal).toBeUndefined();
      expect(bound.TimedOut()).toBe(false);
    } finally {
      bound.Dispose();
    }
  });
});
