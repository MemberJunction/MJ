import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseLLM, ChatParams, ChatResult } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';

import { TableNormalizer, type TableNormalizationInput } from '../discovery/ColumnNormalizer.js';
import type { AIConfig } from '../types/config.js';

/**
 * The normalizer is one LLM call per table across the whole in-scope schema — the largest fan-out
 * in the organic-key pass — and it had none of the three bounds the rest of the package now has:
 *
 *   - NO call deadline. A provider that accepts the socket and stops sending never settles the
 *     promise, and this retry loop only runs once one settles. One stalled table parked a worker
 *     for the rest of the run; with concurrency 8, eight stalls parked the pass.
 *   - NO backoff. Retries fired immediately, three times per table, from every worker at once —
 *     the shape that turns one 429 into a burst of them.
 *   - NO token budget. `organicKeyDetection.tokenBudget` was declared in the config type and read
 *     nowhere, so the pass had no token, cost or call-count cap at all.
 */

function aiConfig(overrides: Partial<AIConfig> = {}): AIConfig {
  return {
    provider: 'gemini',
    model: 'gemini-flash',
    apiKey: 'k',
    ...overrides,
  } as AIConfig;
}

function table(name: string): TableNormalizationInput {
  return {
    schema: 'dbo',
    table: name,
    columns: [
      {
        schema: 'dbo',
        table: name,
        column: 'email',
        dataType: 'nvarchar',
        originalDescription: 'the email',
        sampleValues: ['a@b.com'],
        participatesInFK: false,
        isPrimaryKey: false,
      },
    ],
  };
}

/** A scripted driver: each entry is one ChatCompletion outcome, in order. */
type Step =
  | { kind: 'ok'; tokens?: number }
  | { kind: 'fail' }
  | { kind: 'throw' }
  | { kind: 'badJson' }
  | { kind: 'stall' };

class ScriptedLLM {
  public calls: ChatParams[] = [];
  constructor(private readonly steps: Step[]) {}
  async ChatCompletion(params: ChatParams): Promise<ChatResult> {
    this.calls.push(params);
    const step = this.steps[Math.min(this.calls.length - 1, this.steps.length - 1)];
    const usage = (tokens: number) => ({ totalTokens: tokens, promptTokens: tokens, completionTokens: 0 });
    switch (step.kind) {
      case 'stall':
        return new Promise<ChatResult>(() => {});
      case 'throw':
        throw new Error('fetch failed');
      case 'fail':
        return { success: false, errorMessage: '429 too many requests', data: { choices: [], usage: usage(0) } } as unknown as ChatResult;
      case 'badJson':
        return {
          success: true,
          data: { choices: [{ message: { content: 'not json at all' } }], usage: usage(1) },
        } as unknown as ChatResult;
      case 'ok':
      default:
        return {
          success: true,
          data: {
            choices: [{
              message: {
                content: JSON.stringify({
                  columns: [{
                    column: 'email',
                    conceptName: 'email_address',
                    normalizationStrategy: 'LowerCaseTrim',
                    normalizedDescription: 'an email address',
                    isUsefulOrganicKey: true,
                    confidence: 0.9,
                    reasoning: 'r',
                  }],
                }),
              },
            }],
            usage: usage(step.tokens ?? 100),
          },
        } as unknown as ChatResult;
    }
  }
}

/** Builds a normalizer whose driver is the script, without touching a real provider package. */
function normalizerWith(steps: Step[], config: AIConfig = aiConfig()): { n: TableNormalizer; llm: ScriptedLLM } {
  const llm = new ScriptedLLM(steps);
  const spy = vi
    .spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance')
    .mockReturnValue(llm as unknown as BaseLLM);
  try {
    return { n: new TableNormalizer(config), llm };
  } finally {
    spy.mockRestore();
  }
}

/**
 * Records every backoff sleep. `callTimeoutMs: 0` in these tests disables the deadline's own
 * timer, so a recorded delay can only be a retry wait — no wall-clock measurement, no flake.
 */
function recordSleeps(): { delays: number[]; restore: () => void } {
  const delays: number[] = [];
  const real = globalThis.setTimeout;
  const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
    delays.push(ms ?? 0);
    return real(fn, 0); // run immediately: the delay is what is under test, not the waiting
  }) as typeof globalThis.setTimeout);
  return { delays, restore: () => spy.mockRestore() };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the normalizer call is bounded', () => {
  it('a stalled provider becomes a reported error instead of parking the pass', async () => {
    const { n } = normalizerWith([{ kind: 'stall' }], aiConfig({ callTimeoutMs: 20, retry: { initialDelayMs: 1 } }));

    const r = await n.normalizeTable(table('Contacts'), 0);

    expect(r.errorMessage).toMatch(/call timeout/);
    expect(r.normalized).toHaveLength(0);
  }, 10_000);

  it('names the table in the timeout, so the log says which one stalled', async () => {
    const { n } = normalizerWith([{ kind: 'stall' }], aiConfig({ callTimeoutMs: 20, retry: { initialDelayMs: 1 } }));

    const r = await n.normalizeTable(table('Invoices'), 0);

    expect(r.errorMessage).toContain('dbo.Invoices');
  }, 10_000);

  it('hands the driver a cancellationToken — what makes the abort real rather than abandonment', async () => {
    const { n, llm } = normalizerWith([{ kind: 'ok' }], aiConfig({ callTimeoutMs: 5_000 }));

    await n.normalizeTable(table('Contacts'), 0);

    expect(llm.calls[0].cancellationToken).toBeDefined();
  });

  it('passes no token when the bound is disabled, restoring the exact previous behaviour', async () => {
    const { n, llm } = normalizerWith([{ kind: 'ok' }], aiConfig({ callTimeoutMs: 0 }));

    await n.normalizeTable(table('Contacts'), 0);

    expect(llm.calls[0].cancellationToken).toBeUndefined();
  });
});

describe('retries wait, and only when waiting can help', () => {
  it('backs off before retrying a TRANSPORT failure', async () => {
    const { delays, restore } = recordSleeps();
    try {
      const { n, llm } = normalizerWith(
        [{ kind: 'fail' }, { kind: 'ok' }],
        aiConfig({ callTimeoutMs: 0, retry: { initialDelayMs: 100, backoffMultiplier: 2, maxDelayMs: 1000 } })
      );

      const r = await n.normalizeTable(table('Contacts'), 2);

      expect(llm.calls).toHaveLength(2);
      expect(r.normalized).toHaveLength(1);
      expect(delays).toHaveLength(1);
      expect(delays[0]).toBeGreaterThanOrEqual(100); // base
      expect(delays[0]).toBeLessThanOrEqual(120);    // base + 20% jitter
    } finally {
      restore();
    }
  });

  it('grows the wait exponentially rather than hammering at a fixed rate', async () => {
    const { delays, restore } = recordSleeps();
    try {
      const { n } = normalizerWith(
        [{ kind: 'throw' }, { kind: 'fail' }, { kind: 'ok' }],
        aiConfig({ callTimeoutMs: 0, retry: { initialDelayMs: 100, backoffMultiplier: 2, maxDelayMs: 10_000 } })
      );

      await n.normalizeTable(table('Contacts'), 2);

      expect(delays).toHaveLength(2);
      expect(delays[1]).toBeGreaterThan(delays[0]);
      expect(delays[1]).toBeGreaterThanOrEqual(200);
    } finally {
      restore();
    }
  });

  it('does NOT wait after a malformed response — nothing upstream is recovering from bad JSON', async () => {
    const { delays, restore } = recordSleeps();
    try {
      const { n, llm } = normalizerWith(
        [{ kind: 'badJson' }, { kind: 'ok' }],
        aiConfig({ callTimeoutMs: 0, retry: { initialDelayMs: 100 } })
      );

      const r = await n.normalizeTable(table('Contacts'), 2);

      expect(llm.calls).toHaveLength(2);   // it still retries
      expect(r.normalized).toHaveLength(1);
      expect(delays).toHaveLength(0);      // but it does not sit out a rate-limit delay to do it
    } finally {
      restore();
    }
  });

  it('does not wait after the LAST attempt, which would only postpone the error', async () => {
    const { delays, restore } = recordSleeps();
    try {
      const { n } = normalizerWith([{ kind: 'fail' }], aiConfig({ callTimeoutMs: 0, retry: { initialDelayMs: 100 } }));

      await n.normalizeTable(table('Contacts'), 1); // two attempts, one gap

      expect(delays).toHaveLength(1);
    } finally {
      restore();
    }
  });
});

describe('the token budget is enforced, and a short run says so', () => {
  const TABLES = Array.from({ length: 10 }, (_, i) => table(`T${i}`));

  it('stops scheduling once the budget is reached', async () => {
    const { n, llm } = normalizerWith([{ kind: 'ok', tokens: 100 }], aiConfig({ callTimeoutMs: 0 }));

    const r = await n.normalizeAll(TABLES, { concurrency: 1, maxRetries: 0, tokenBudget: 250 });

    // Three calls take the total to 300, which is over; the fourth is never scheduled.
    expect(llm.calls).toHaveLength(3);
    expect(r.tokens.total).toBe(300);
  });

  it('reports the run as partial instead of returning a short result as a complete one', async () => {
    // The defect this prevents: normalizing 3 of 10 tables, finding fewer clusters, and reporting
    // that as a finding about the schema rather than as a budget outcome.
    const { n } = normalizerWith([{ kind: 'ok', tokens: 100 }], aiConfig({ callTimeoutMs: 0 }));

    const r = await n.normalizeAll(TABLES, { concurrency: 1, maxRetries: 0, tokenBudget: 250 });

    expect(r.budgetExhausted).toBe(true);
    expect(r.tablesSkippedForBudget).toBe(7);
  });

  it('runs everything when no budget is set — the previous behaviour, unchanged', async () => {
    const { n, llm } = normalizerWith([{ kind: 'ok', tokens: 100 }], aiConfig({ callTimeoutMs: 0 }));

    const r = await n.normalizeAll(TABLES, { concurrency: 2, maxRetries: 0 });

    expect(llm.calls).toHaveLength(10);
    expect(r.budgetExhausted).toBe(false);
    expect(r.tablesSkippedForBudget).toBe(0);
  });

  it('treats 0 and a nonsense budget as unlimited, never as "spend nothing"', async () => {
    // A budget that stopped before the first call would silently return zero organic keys for the
    // whole database and look like a schema with none.
    for (const tokenBudget of [0, -1, Number.NaN]) {
      const { n, llm } = normalizerWith([{ kind: 'ok', tokens: 100 }], aiConfig({ callTimeoutMs: 0 }));
      const r = await n.normalizeAll(TABLES, { concurrency: 1, maxRetries: 0, tokenBudget });
      expect(llm.calls).toHaveLength(10);
      expect(r.budgetExhausted).toBe(false);
    }
  });
});
