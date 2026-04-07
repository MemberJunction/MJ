/**
 * @fileoverview Metrics collector for MetadataSync benchmark tests
 *
 * Provides instrumented wrappers around RunView, batch context, and timing
 * utilities so benchmark tests can capture deterministic performance metrics
 * without touching real infrastructure.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BenchmarkMetrics {
  wallClockMs: number;
  queryCount: number;
  batchContextScans: number;
  batchContextSize: number;
  peakMemoryMB: number;
  queriesByEntity: Map<string, number>;
}

// ---------------------------------------------------------------------------
// RunView counting wrapper
// ---------------------------------------------------------------------------

export interface CountingRunViewResult {
  /** The mock object — pass this wherever RunView is expected */
  mock: any;
  /** Total RunView invocations */
  getCount(): number;
  /** Invocations broken down by entity name */
  getByEntity(): Map<string, number>;
  /** Reset all counters */
  reset(): void;
}

/**
 * Create a RunView mock that counts every invocation and returns configurable
 * results. The `resultFactory` callback lets callers supply entity-specific
 * return values; when omitted every call returns `{ Success: true, Results: [] }`.
 */
function createCountingRunView(
  resultFactory?: (params: { EntityName: string; ExtraFilter?: string }) => {
    Success: boolean;
    Results: any[];
    ErrorMessage?: string;
  },
): CountingRunViewResult {
  let totalCount = 0;
  const byEntity = new Map<string, number>();

  const RunViewFn = async (
    params: { EntityName: string; ExtraFilter?: string; [k: string]: any },
    _user?: any,
  ) => {
    totalCount++;
    byEntity.set(params.EntityName, (byEntity.get(params.EntityName) ?? 0) + 1);

    if (resultFactory) {
      return resultFactory(params);
    }
    return { Success: true, Results: [] };
  };

  const mock = {
    RunView: RunViewFn,
  };

  return {
    mock,
    getCount: () => totalCount,
    getByEntity: () => new Map(byEntity),
    reset: () => {
      totalCount = 0;
      byEntity.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Instrumented batch context Map
// ---------------------------------------------------------------------------

export interface InstrumentedBatchContext {
  /** A real Map that tracks iteration (for...of) scans */
  map: Map<string, any>;
  /** Number of full iteration scans observed */
  getScanCount(): number;
  /** Reset the scan counter */
  reset(): void;
}

/**
 * Returns a Map wrapped with a Proxy that counts how many times the caller
 * iterates over entries via `for...of`, `Symbol.iterator`, `entries()`, or
 * `forEach()`. This mirrors the linear scan in `SyncEngine.resolveLookup`.
 *
 * Note: Map methods like `set`, `get`, `delete` must be bound to the real Map
 * target — not the Proxy — because V8's built-in Map methods check `this`
 * against the internal slot and throw "incompatible receiver" otherwise.
 */
function createInstrumentedBatchContext(
  initial?: Map<string, any>,
): InstrumentedBatchContext {
  let scanCount = 0;
  const inner = new Map<string, any>(initial ?? []);

  const proxy = new Proxy(inner, {
    get(target, prop, _receiver) {
      // Intercept iteration entry-points to count scans
      if (
        prop === Symbol.iterator ||
        prop === 'entries' ||
        prop === 'forEach'
      ) {
        scanCount++;
      }

      const value = Reflect.get(target, prop, target);
      // Bind Map methods to the real target so they pass the internal-slot check
      if (typeof value === 'function') {
        return value.bind(target);
      }
      return value;
    },
  });

  return {
    map: proxy,
    getScanCount: () => scanCount,
    reset: () => {
      scanCount = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Memory capture
// ---------------------------------------------------------------------------

interface MemorySnapshot {
  heapUsedMB: number;
}

function captureMemory(): MemorySnapshot {
  if (typeof globalThis.process !== 'undefined' && process.memoryUsage) {
    const mem = process.memoryUsage();
    return { heapUsedMB: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100 };
  }
  return { heapUsedMB: 0 };
}

// ---------------------------------------------------------------------------
// Timing helper
// ---------------------------------------------------------------------------

interface TimedResult<T> {
  result: T;
  ms: number;
}

async function time<T>(fn: () => Promise<T>): Promise<TimedResult<T>> {
  const start = performance.now();
  const result = await fn();
  const ms = performance.now() - start;
  return { result, ms: Math.round(ms * 100) / 100 };
}

// ---------------------------------------------------------------------------
// Synchronous timing helper (for purely sync workloads)
// ---------------------------------------------------------------------------

function timeSync<T>(fn: () => T): { result: T; ms: number } {
  const start = performance.now();
  const result = fn();
  const ms = performance.now() - start;
  return { result, ms: Math.round(ms * 100) / 100 };
}

// ---------------------------------------------------------------------------
// Full benchmark runner — combines all collectors for a single run
// ---------------------------------------------------------------------------

export interface BenchmarkRun {
  wallClockMs: number;
  queryCount: number;
  queriesByEntity: Map<string, number>;
  batchContextScans: number;
  batchContextSize: number;
  peakMemoryMB: number;
}

/**
 * Execute `fn` while collecting RunView queries, batch context scans, timing,
 * and memory metrics in one shot.
 */
async function runBenchmark(
  fn: (ctx: {
    runView: CountingRunViewResult;
    batchCtx: InstrumentedBatchContext;
  }) => Promise<void>,
  batchContextInitial?: Map<string, any>,
): Promise<BenchmarkRun> {
  const runView = createCountingRunView();
  const batchCtx = createInstrumentedBatchContext(batchContextInitial);

  const memBefore = captureMemory();
  const { ms } = await time(async () => fn({ runView, batchCtx }));
  const memAfter = captureMemory();

  return {
    wallClockMs: ms,
    queryCount: runView.getCount(),
    queriesByEntity: runView.getByEntity(),
    batchContextScans: batchCtx.getScanCount(),
    batchContextSize: batchCtx.map.size,
    peakMemoryMB: Math.max(memAfter.heapUsedMB, memBefore.heapUsedMB),
  };
}

// ---------------------------------------------------------------------------
// Public API — single static-like object for convenience
// ---------------------------------------------------------------------------

export const MetricsCollector = {
  createCountingRunView,
  createInstrumentedBatchContext,
  captureMemory,
  time,
  timeSync,
  runBenchmark,
} as const;
