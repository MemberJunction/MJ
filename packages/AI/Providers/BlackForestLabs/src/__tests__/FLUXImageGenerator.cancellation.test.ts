import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFetch = vi.hoisted(() => vi.fn());

vi.mock('@memberjunction/global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/global')>()),
  RegisterClass: () => (_target: unknown) => {},
}));

vi.stubGlobal('fetch', mockFetch);

import { FLUXImageGenerator } from '../index';

/** A JSON response, as `fetch` resolves one. */
function json(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

/** Routes the three BFL calls: submit, poll (always pending unless `ready`), and download. */
function routeBFL(ready: boolean): void {
  mockFetch.mockImplementation(async (url: string) => {
    if (url.includes('/get_result')) {
      return json(ready ? { id: 'task-1', status: 'Ready', result: { sample: 'https://cdn.bfl.ai/image.png' } } : { id: 'task-1', status: 'Pending' });
    }
    if (url.startsWith('https://cdn.bfl.ai/')) {
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }
    return json({ id: 'task-1' });
  });
}

/** The signal each fetch call was handed, in call order. */
function fetchSignals(): Array<AbortSignal | undefined> {
  return mockFetch.mock.calls.map(call => (call[1] as RequestInit | undefined)?.signal ?? undefined);
}

describe('FLUXImageGenerator cancellation', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hands the caller signal to the submit, poll and download fetches', async () => {
    routeBFL(true);
    const signal = new AbortController().signal;

    const result = await new FLUXImageGenerator('key').GenerateImage({ prompt: 'a cat', CancellationToken: signal });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(fetchSignals()).toEqual([signal, signal, signal]);
  });

  it('stops its poll loop as soon as the caller cancels, without waiting out the poll interval', async () => {
    vi.useFakeTimers();
    routeBFL(false);
    const caller = new AbortController();
    const generator = new FLUXImageGenerator('key');
    generator.SetPollingConfig({ pollInterval: 60_000, maxWaitTime: 600_000 });

    const pending = generator.GenerateImage({ prompt: 'a cat', CancellationToken: caller.signal });
    await vi.advanceTimersByTimeAsync(0);
    const fetchesBeforeCancel = mockFetch.mock.calls.length;
    caller.abort('user stopped it');
    const result = await pending;
    await vi.advanceTimersByTimeAsync(600_000);

    expect(fetchesBeforeCancel).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(false);
    expect(result.errorInfo?.errorType).toBe('Cancelled');
    expect(result.errorInfo?.canFailover).toBe(false);
  });

  it('reports a fetch aborted mid-flight as Cancelled, not as a provider error', async () => {
    const caller = new AbortController();
    mockFetch.mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('This operation was aborted', 'AbortError')));
    }));

    const pending = new FLUXImageGenerator('key').GenerateImage({ prompt: 'a cat', CancellationToken: caller.signal });
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    caller.abort('user stopped it');
    const result = await pending;

    expect(result.errorInfo?.errorType).toBe('Cancelled');
  });

  it('never opens a request when the caller already cancelled', async () => {
    const caller = new AbortController();
    caller.abort();

    const result = await new FLUXImageGenerator('key').EditImage({ prompt: 'a cat', image: Buffer.from('png'), CancellationToken: caller.signal });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.errorInfo?.errorType).toBe('Cancelled');
  });
});
