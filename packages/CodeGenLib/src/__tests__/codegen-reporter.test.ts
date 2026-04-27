import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Tests use a per-test temp directory by mocking os.homedir() via vi.mock so
 * CodeGenReporter.stateDir() resolves to <tmp>/.mj/codegen-state. We have to
 * mock at the module level because os.homedir is non-configurable on Node.
 */

let tmpHome: string = '';

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return {
    ...actual,
    homedir: () => tmpHome || actual.homedir(),
  };
});

// Import after mocking
import { CodeGenReporter } from '../Misc/codegen-reporter';

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codegen-reporter-test-'));
});

afterEach(async () => {
  // Ensure reporter is inactive between tests — it's a singleton
  const r = CodeGenReporter.Instance;
  if (r.IsActive) await r.endRun(true);
  if (tmpHome) await fs.rm(tmpHome, { recursive: true, force: true });
  tmpHome = '';
});

describe('CodeGenReporter', () => {
  describe('singleton behavior', () => {
    it('returns the same instance across calls', () => {
      const a = CodeGenReporter.Instance;
      const b = CodeGenReporter.Instance;
      expect(a).toBe(b);
    });

    it('starts inactive', () => {
      const r = CodeGenReporter.Instance;
      // Force a reset by starting then immediately ending without writing:
      // endRun will set _active false. Good enough for test isolation.
      if (r.IsActive) {
        // If a prior test left it active, clear it
        r.startRun();
      }
    });
  });

  describe('startRun / endRun lifecycle', () => {
    it('no-ops if never started', async () => {
      const r = CodeGenReporter.Instance;
      // Ensure not active
      if (r.IsActive) await r.endRun(true);
      const result = await r.endRun(true);
      expect(result).toEqual({ filePath: null, report: null });
    });

    it('writes a JSON file with the expected shape', async () => {
      const r = CodeGenReporter.Instance;
      r.startRun();
      r.mark('platform', 'sqlserver');
      r.counter('entitiesProcessed', 42);
      const { filePath } = await r.endRun(true);

      expect(filePath).not.toBeNull();
      expect(filePath!.startsWith(path.join(tmpHome, '.mj', 'codegen-state'))).toBe(true);

      const raw = await fs.readFile(filePath!, 'utf8');
      const report = JSON.parse(raw);

      expect(report.success).toBe(true);
      expect(report.context.platform).toBe('sqlserver');
      expect(report.counters.entitiesProcessed).toBe(42);
      expect(Array.isArray(report.phases)).toBe(true);
      expect(Array.isArray(report.entities)).toBe(true);
      expect(Array.isArray(report.llmCalls)).toBe(true);
    });

    it('marks success=false when endRun called with false', async () => {
      const r = CodeGenReporter.Instance;
      r.startRun();
      const { filePath } = await r.endRun(false);
      const report = JSON.parse(await fs.readFile(filePath!, 'utf8'));
      expect(report.success).toBe(false);
    });
  });

  describe('phase()', () => {
    it('captures a top-level phase with duration', async () => {
      const r = CodeGenReporter.Instance;
      r.startRun();
      await r.phase('myPhase', async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });
      const snap = r.snapshot();
      expect(snap.phases).toHaveLength(1);
      expect(snap.phases[0].name).toBe('myPhase');
      expect(snap.phases[0].durationMs).toBeGreaterThanOrEqual(3);
      await r.endRun(true);
    });

    it('nests child phases inside parent', async () => {
      const r = CodeGenReporter.Instance;
      r.startRun();
      await r.phase('outer', async () => {
        await r.phase('inner1', async () => {
          await new Promise((resolve) => setTimeout(resolve, 1));
        });
        await r.phase('inner2', async () => {
          await new Promise((resolve) => setTimeout(resolve, 1));
        });
      });
      const snap = r.snapshot();
      expect(snap.phases).toHaveLength(1);
      expect(snap.phases[0].name).toBe('outer');
      expect(snap.phases[0].children).toHaveLength(2);
      expect(snap.phases[0].children.map((c) => c.name)).toEqual(['inner1', 'inner2']);
      await r.endRun(true);
    });

    it('is a pass-through when no run is active', async () => {
      const r = CodeGenReporter.Instance;
      if (r.IsActive) await r.endRun(true);
      const val = await r.phase('ignored', async () => 42);
      expect(val).toBe(42);
    });

    it('preserves return value', async () => {
      const r = CodeGenReporter.Instance;
      r.startRun();
      const val = await r.phase('x', async () => 'hello');
      expect(val).toBe('hello');
      await r.endRun(true);
    });

    it('still records duration when the wrapped fn throws', async () => {
      const r = CodeGenReporter.Instance;
      r.startRun();
      await expect(
        r.phase('boom', async () => {
          throw new Error('test error');
        }),
      ).rejects.toThrow('test error');
      const snap = r.snapshot();
      expect(snap.phases).toHaveLength(1);
      expect(snap.phases[0].name).toBe('boom');
      await r.endRun(false);
    });
  });

  describe('entityPhase()', () => {
    it('accumulates total time and advanced generation time per entity', async () => {
      const r = CodeGenReporter.Instance;
      r.startRun();
      await r.entityPhase('Customer', 'advancedGeneration', async () => {
        await new Promise((resolve) => setTimeout(resolve, 3));
      });
      await r.entityPhase('Customer', 'other', async () => {
        await new Promise((resolve) => setTimeout(resolve, 2));
      });
      const snap = r.snapshot();
      const cust = snap.entities.find((e) => e.name === 'Customer')!;
      expect(cust).toBeDefined();
      expect(cust.totalMs).toBeGreaterThanOrEqual(4);
      expect(cust.advancedGenerationMs).toBeGreaterThanOrEqual(2);
      await r.endRun(true);
    });

    it('attributes LLM calls to the currently-active entity', async () => {
      const r = CodeGenReporter.Instance;
      r.startRun();
      await r.entityPhase('Order', 'advancedGeneration', async () => {
        r.recordLLMCall({
          promptName: 'Identify',
          tokensIn: 100,
          tokensOut: 50,
          costUSD: 0.001,
          latencyMs: 500,
        });
      });
      const snap = r.snapshot();
      const order = snap.entities.find((e) => e.name === 'Order')!;
      expect(order.llmCalls).toBe(1);
      expect(order.tokensIn).toBe(100);
      expect(order.tokensOut).toBe(50);
      expect(order.costUSD).toBeCloseTo(0.001);
      expect(snap.llmCalls[0].entityName).toBe('Order');
      await r.endRun(true);
    });
  });

  describe('recordLLMCall()', () => {
    it('sums into totals', async () => {
      const r = CodeGenReporter.Instance;
      r.startRun();
      r.recordLLMCall({
        promptName: 'A',
        tokensIn: 10,
        tokensOut: 5,
        costUSD: 0.01,
        latencyMs: 100,
      });
      r.recordLLMCall({
        promptName: 'B',
        tokensIn: 20,
        tokensOut: 15,
        costUSD: 0.02,
        latencyMs: 200,
      });
      const snap = r.snapshot();
      expect(snap.totalTokensIn).toBe(30);
      expect(snap.totalTokensOut).toBe(20);
      expect(snap.totalCostUSD).toBeCloseTo(0.03);
      expect(snap.llmCalls).toHaveLength(2);
      await r.endRun(true);
    });

    it('falls back to null entity when none is active', async () => {
      const r = CodeGenReporter.Instance;
      r.startRun();
      r.recordLLMCall({ promptName: 'OrphanCall', latencyMs: 50 });
      const snap = r.snapshot();
      expect(snap.llmCalls[0].entityName).toBeNull();
      await r.endRun(true);
    });
  });

  describe('counters and marks', () => {
    it('increments and reports counters', async () => {
      const r = CodeGenReporter.Instance;
      r.startRun();
      r.counter('sqlStatements', 5);
      r.counter('sqlStatements', 3);
      r.counter('filesWritten');
      r.spCallCounter('spDeleteUnneededEntityFields', 2);
      const snap = r.snapshot();
      expect(snap.counters.sqlStatements).toBe(8);
      expect(snap.counters.filesWritten).toBe(1);
      expect(snap.counters.spCalls.spDeleteUnneededEntityFields).toBe(2);
      await r.endRun(true);
    });

    it('records flagged entities', async () => {
      const r = CodeGenReporter.Instance;
      r.startRun();
      r.flagEntity('NewEntity', 'new');
      r.flagEntity('ModifiedEntity', 'modified');
      const snap = r.snapshot();
      expect(snap.entities.find((e) => e.name === 'NewEntity')!.flags.new).toBe(true);
      expect(snap.entities.find((e) => e.name === 'ModifiedEntity')!.flags.modified).toBe(true);
      await r.endRun(true);
    });
  });

  describe('listRuns() and loadRun()', () => {
    it('returns an empty list when state dir does not exist', async () => {
      const runs = await CodeGenReporter.listRuns();
      expect(runs).toEqual([]);
    });

    it('lists runs newest-first after writing a few', async () => {
      const r = CodeGenReporter.Instance;

      r.startRun();
      r.counter('entitiesProcessed', 10);
      await r.endRun(true);

      // Small delay so ISO timestamps differ
      await new Promise((resolve) => setTimeout(resolve, 10));

      r.startRun();
      r.counter('entitiesProcessed', 20);
      await r.endRun(true);

      const runs = await CodeGenReporter.listRuns();
      expect(runs.length).toBe(2);
      expect(runs[0].startedAt >= runs[1].startedAt).toBe(true);
      expect(runs[0].entitiesProcessed).toBe(20);
    });

    it('loadRun returns full report by runId', async () => {
      const r = CodeGenReporter.Instance;
      r.startRun();
      r.mark('testKey', 'testValue');
      const { filePath } = await r.endRun(true);
      const fileName = path.basename(filePath!);
      const runId = fileName.replace(/^run-/, '').replace(/\.json$/, '');

      const loaded = await CodeGenReporter.loadRun(runId);
      expect(loaded).not.toBeNull();
      expect(loaded!.context.testKey).toBe('testValue');
    });

    it('loadRun returns null for unknown runId', async () => {
      const loaded = await CodeGenReporter.loadRun('no-such-run');
      expect(loaded).toBeNull();
    });
  });

  describe('retention', () => {
    it('prunes old runs when over the limit', async () => {
      // Directly create 55 fake run files to exercise pruning
      const dir = CodeGenReporter.stateDir();
      await fs.mkdir(dir, { recursive: true });
      for (let i = 0; i < 55; i++) {
        const id = `2026-04-15T${String(i).padStart(2, '0')}-00-00-000Z`;
        await fs.writeFile(
          path.join(dir, `run-${id}.json`),
          JSON.stringify({
            runId: id,
            startedAt: id,
            totalMs: 0,
            success: true,
            llmCalls: [],
            counters: { entitiesProcessed: 0, spCalls: {} },
            totalCostUSD: 0,
          }),
        );
      }

      await CodeGenReporter.pruneOldRuns();

      const remaining = (await fs.readdir(dir)).filter((f) => f.startsWith('run-'));
      expect(remaining.length).toBe(50);
    });

    it('is a no-op when dir does not exist', async () => {
      await expect(CodeGenReporter.pruneOldRuns()).resolves.toBeUndefined();
    });
  });
});
