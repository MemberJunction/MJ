import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRerank = vi.hoisted(() => vi.fn());

vi.mock('cohere-ai', () => ({
  CohereClient: class MockCohereClient {
    v2 = { rerank: mockRerank };
    constructor(_opts: Record<string, unknown>) {}
  },
}));

import { CohereReranker } from '../models/CohereReranker';

/** A request the SDK holds open until its abort signal fires, then rejects as an aborted fetch does. */
function rerankThatWaitsForAbort(_request: Record<string, unknown>, options?: { abortSignal?: AbortSignal }): Promise<never> {
  return new Promise<never>((_, reject) => {
    options?.abortSignal?.addEventListener('abort', () => {
      const error = new Error('The user aborted a request.');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });
}

describe('CohereReranker cancellation', () => {
  const documents = [{ id: 'd1', text: 'some text' }];

  beforeEach(() => {
    mockRerank.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('hands the caller signal to the SDK as its abortSignal', async () => {
    mockRerank.mockResolvedValueOnce({ results: [] });
    const controller = new AbortController();

    await new CohereReranker('key').Rerank({ query: 'q', documents, CancellationToken: controller.signal });

    expect(mockRerank).toHaveBeenCalledWith(expect.any(Object), { abortSignal: controller.signal });
  });

  it('reports a request aborted mid-flight as Cancelled, which is never failed over', async () => {
    mockRerank.mockImplementationOnce(rerankThatWaitsForAbort);
    const controller = new AbortController();

    const pending = new CohereReranker('key').Rerank({ query: 'q', documents, CancellationToken: controller.signal });
    await vi.waitFor(() => expect(mockRerank).toHaveBeenCalledTimes(1));
    controller.abort('user stopped it');
    const response = await pending;

    expect(response.success).toBe(false);
    expect(response.errorInfo?.errorType).toBe('Cancelled');
    expect(response.errorInfo?.canFailover).toBe(false);
  });

  it('never opens a request when the caller already cancelled', async () => {
    const controller = new AbortController();
    controller.abort('user stopped it');

    const response = await new CohereReranker('key').Rerank({ query: 'q', documents, CancellationToken: controller.signal });

    expect(mockRerank).not.toHaveBeenCalled();
    expect(response.errorInfo?.errorType).toBe('Cancelled');
  });
});
