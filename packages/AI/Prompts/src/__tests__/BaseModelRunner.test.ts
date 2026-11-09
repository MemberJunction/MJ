import { describe, it, expect, vi, afterEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import type { MJAIPromptEntityExtended, AIPromptParams } from '@memberjunction/ai-core-plus';
import { BaseModelRunner, ExecutionBound } from '../BaseModelRunner';
import { AIPromptRunner } from '../AIPromptRunner';
import { ParallelExecutionCoordinator } from '../ParallelExecutionCoordinator';
import type { IParallelExecutionCoordinator } from '../ParallelExecution';

class TestEmbeddingsRunner extends BaseModelRunner {
  public override get RequiredModelType(): string {
    // The real model type's name ('Embeddings'), taken from the engine rather than retyped.
    return AIEngine.Instance.EmbeddingModelTypeName;
  }

  public invokeLogError(message: string): void {
    this.logError(message);
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
    expect(runner.RequiredModelType).toBe('Embeddings');
  });

  it('minimal subclass can invoke inherited createExecutionBound', () => {
    const runner = new TestEmbeddingsRunner();
    const mockPrompt = { Name: 'TestPrompt' } as unknown as MJAIPromptEntityExtended;
    const params: AIPromptParams = { prompt: mockPrompt, timeoutMS: 5000 };

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
    const params: AIPromptParams = { prompt: mockPrompt };

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

  describe('default log category', () => {
    afterEach(() => vi.restoreAllMocks());

    const loggedLines = (spy: ReturnType<typeof vi.spyOn>): string =>
      spy.mock.calls.map((args: unknown[]) => args.map(String).join(' ')).join('\n');

    it('a runner that does not override DefaultLogCategory logs uncategorized errors under BaseModelRunner', () => {
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      new TestEmbeddingsRunner().invokeLogError('embedding call failed');

      expect(loggedLines(errorLog)).toContain('[BaseModelRunner] embedding call failed');
      expect(loggedLines(errorLog)).not.toContain('[AIPromptRunner]');
    });

    it('AIPromptRunner still logs uncategorized errors under AIPromptRunner', () => {
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const runner = new AIPromptRunner() as unknown as { logError: (error: string) => void };

      runner.logError('chat call failed');

      expect(loggedLines(errorLog)).toContain('[AIPromptRunner] chat call failed');
    });
  });
});
