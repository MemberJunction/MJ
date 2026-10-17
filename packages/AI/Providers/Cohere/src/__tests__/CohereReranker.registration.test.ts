import { describe, it, expect, vi } from 'vitest';

// Only the vendor SDK is mocked: the ClassFactory and the @RegisterClass decorators are real, which is
// what these tests check.
vi.mock('cohere-ai', () => ({
  CohereClient: class {
    rerank = vi.fn();
  }
}));

import { MJGlobal } from '@memberjunction/global';
import { BaseReranker } from '@memberjunction/ai';
import { CohereReranker } from '../models/CohereReranker';

describe('CohereReranker registration', () => {
  it.each(['CohereReranker', 'CohereLLM'])('resolves the %s driver class to CohereReranker through the ClassFactory', (driverClass) => {
    const created = MJGlobal.Instance.ClassFactory.CreateInstance<BaseReranker>(BaseReranker, driverClass, 'test-key', 'rerank-v3.5');

    expect(created).toBeInstanceOf(CohereReranker);
  });
});
