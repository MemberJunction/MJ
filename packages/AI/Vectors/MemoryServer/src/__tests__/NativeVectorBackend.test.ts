import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'node:module';

const mocks = vi.hoisted(() => ({
  LogError: vi.fn<(message: string) => void>(),
  LogStatus: vi.fn<(message: string) => void>(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, LogError: mocks.LogError, LogStatus: mocks.LogStatus };
});

import {
  MetricScore,
  SearchRows,
  VectorRowsView,
  VectorSearchJob,
  VectorSearchSpec,
  VectorStore,
} from '@memberjunction/ai-vectors-memory';
import { NativeVectorBackend } from '../NativeVectorBackend';
import { VectorAccelerationSettings } from '../VectorAccelerationSettings';

/** The same CommonJS module instance the backend loads, so its exports can be spied on. */
const usearch = createRequire(import.meta.url)('usearch') as typeof import('usearch');

/** A backend whose usearch binary is missing. A subclass is its own singleton, so this never touches the real one. */
class MissingUsearchBackend extends NativeVectorBackend {
  public Attempts = 0;
  public constructor() {
    super();
  }
  public static override get Instance(): MissingUsearchBackend {
    return MissingUsearchBackend.getInstance<MissingUsearchBackend>();
  }
  protected override RequireUsearch(): typeof import('usearch') {
    this.Attempts++;
    throw new Error("Cannot find module 'usearch'");
  }
}

/** A backend whose loader throws something other than an Error. */
class OddFailureBackend extends NativeVectorBackend {
  public constructor() {
    super();
  }
  public static override get Instance(): OddFailureBackend {
    return OddFailureBackend.getInstance<OddFailureBackend>();
  }
  protected override RequireUsearch(): typeof import('usearch') {
    throw 'dlopen failed';
  }
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randomStore(rows: number, dims: number, seed = 1): VectorStore<string> {
  const rand = seeded(seed);
  const store = new VectorStore<string>('float32');
  for (let i = 0; i < rows; i++) store.Write(`k${i}`, Array.from({ length: dims }, () => rand() * 2 - 1));
  return store;
}

function specFor(query: ArrayLike<number>, overrides: Partial<VectorSearchSpec> = {}): VectorSearchSpec {
  const q = Float64Array.from(query);
  return {
    Query: q,
    QueryNormSq: q.reduce((s, v) => s + v * v, 0),
    Candidates: null,
    Metric: 'cosine',
    TopK: 5,
    Threshold: null,
    ...overrides,
  };
}

function annJob(store: VectorStore<string>, query: ArrayLike<number>, overrides: Partial<VectorSearchSpec> = {}): VectorSearchJob {
  return { ...specFor(query, overrides), Snapshot: store.Snapshot(), Source: store };
}

async function waitFor(condition: () => boolean, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('condition not met in time');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

const native = NativeVectorBackend.Instance;

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.LogError.mockClear();
  mocks.LogStatus.mockClear();
  VectorAccelerationSettings.Instance.Reset();
  native.Load();
});

afterAll(() => {
  VectorAccelerationSettings.Instance.Reset();
});

describe('loading usearch', () => {
  it('reports itself unavailable, once, when usearch cannot load — and every search declines', () => {
    const missing = MissingUsearchBackend.Instance;
    expect(missing.Load()).toBe(false);
    expect(missing.Load()).toBe(false);
    expect(missing.Attempts).toBe(1);
    expect(missing.IsAvailable).toBe(false);
    expect(mocks.LogStatus).toHaveBeenCalledWith(expect.stringContaining("native usearch backend unavailable, using JS kernels (Cannot find module 'usearch')"));

    const store = randomStore(10, 4);
    const spec = specFor(store.CopyRow(0));
    expect(missing.CanSearch(spec, store.View())).toBe(false);
    expect(missing.SearchRows(store.View(), spec, 0)).toBeNull();
    VectorAccelerationSettings.Instance.Configure({ ANN: { Enabled: true, MinRows: 1 } });
    expect(missing.SearchApproximate(annJob(store, store.CopyRow(0)))).toBeNull();
  });

  it('logs a non-Error load failure as text', () => {
    expect(OddFailureBackend.Instance.Load()).toBe(false);
    expect(mocks.LogStatus).toHaveBeenCalledWith('Vector acceleration: native usearch backend unavailable, using JS kernels (dlopen failed)');
  });

  it('is available once the real binary loads', () => {
    expect(native.Load()).toBe(true);
    expect(native.IsAvailable).toBe(true);
  });
});

describe('exact native search', () => {
  it('declines what it cannot serve exactly', () => {
    const store = randomStore(20, 4);
    const view = store.View();
    const query = store.CopyRow(0);
    expect(native.CanSearch(specFor(query), view)).toBe(true);
    expect(native.CanSearch(specFor(query, { Candidates: Int32Array.from([1]) }), view)).toBe(false);
    expect(native.CanSearch(specFor(query, { TopK: null }), view)).toBe(false);
    expect(native.CanSearch(specFor(query, { TopK: 0 }), view)).toBe(false);
    for (const metric of ['manhattan', 'jaccard', 'hamming'] as const) {
      expect(native.CanSearch(specFor(query, { Metric: metric }), view)).toBe(false);
    }
    expect(native.CanSearch(specFor([0, 0, 0, 0]), view)).toBe(false); // cosine with a zero query
    expect(native.CanSearch(specFor([0, 0, 0, 0], { Metric: 'euclidean' }), view)).toBe(true);
    expect(native.CanSearch(specFor(query), { ...view, Dims: 0 })).toBe(false);
  });

  it('refuses an empty view and a view that starts part-way into its buffer', () => {
    const store = randomStore(20, 4);
    const view = store.View();
    const spec = specFor(store.CopyRow(0));
    expect(native.SearchRows({ ...view, RowCount: 0 }, spec, 0)).toBeNull();
    const shifted: VectorRowsView = { ...view, Data: view.Data.subarray(4), RowCount: view.RowCount - 1 };
    expect(native.SearchRows(shifted, spec, 0)).toBeNull();
  });

  it('returns exactly the JS result for every native metric, with and without a threshold', () => {
    const store = randomStore(400, 16, 7);
    const view = store.View();
    for (const metric of ['cosine', 'euclidean', 'dotproduct'] as const) {
      for (const threshold of [null, 0.55]) {
        for (const topK of [1, 10, 50]) {
          const spec = specFor(store.CopyRow(42), { Metric: metric, TopK: topK, Threshold: threshold });
          expect(native.SearchRows(view, spec, 1)).toEqual(SearchRows(view, spec));
        }
      }
    }
  });

  it('serves float64 stores too, converting the query to match', () => {
    const rand = seeded(29);
    const store = new VectorStore<string>('float64');
    for (let i = 0; i < 200; i++) store.Write(`k${i}`, Array.from({ length: 8 }, () => rand() * 2 - 1));
    const spec = specFor(store.CopyRow(9), { TopK: 7 });
    expect(native.SearchRows(store.View(), spec, 1)).toEqual(SearchRows(store.View(), spec));
  });

  it('skips a removed row that native code still finds in the buffer', () => {
    const store = randomStore(100, 8);
    const query = store.CopyRow(5);
    store.Remove('k5'); // a tombstone: the row's values are still in the buffer
    const spec = specFor(query);
    const result = native.SearchRows(store.View(), spec, 1)!;
    expect(Array.from(result.Rows)).not.toContain(5);
    expect(result).toEqual(SearchRows(store.View(), spec));
  });

  it('logs and declines when the native call throws', () => {
    const exactSearch = vi.spyOn(usearch, 'exactSearch').mockImplementation(() => {
      throw new Error('simd fault');
    });
    const store = randomStore(30, 4);
    expect(native.SearchRows(store.View(), specFor(store.CopyRow(0)), 1)).toBeNull();
    expect(mocks.LogError).toHaveBeenCalledWith('Vector acceleration: native exact search failed, falling back to JS: simd fault');
    exactSearch.mockImplementation(() => {
      throw 'raw failure';
    });
    expect(native.SearchRows(store.View(), specFor(store.CopyRow(0)), 1)).toBeNull();
    expect(mocks.LogError).toHaveBeenLastCalledWith('Vector acceleration: native exact search failed, falling back to JS: raw failure');
  });

  it('declines when a candidate scores NaN, leaving NaN handling to the JS path', () => {
    const store = new VectorStore<string>('float32');
    store.Write('nan', [Number.NaN, 1]);
    store.Write('ok', [1, 0]);
    vi.spyOn(usearch, 'exactSearch').mockReturnValue(new usearch.Matches(BigUint64Array.from([0n, 1n]), new Float32Array(2)));
    expect(native.SearchRows(store.View(), specFor([1, 0], { TopK: 1 }), 1)).toBeNull();
  });

  it('declines a partial candidate list it cannot prove complete', () => {
    const store = new VectorStore<string>('float32');
    for (let i = 0; i < 40; i++) store.Write(`k${i}`, [i === 0 ? 1 : 0, i === 0 ? 0 : 1]);
    // Pretend native found only a poor match: the true best (row 0) is missing from the list.
    vi.spyOn(usearch, 'exactSearch').mockReturnValue(new usearch.Matches(BigUint64Array.from([3n]), new Float32Array(1)));
    expect(native.SearchRows(store.View(), specFor([1, 0], { TopK: 1 }), 1)).toBeNull();
  });
});

describe('approximate (HNSW) search', () => {
  beforeEach(() => {
    VectorAccelerationSettings.Instance.Configure({ ANN: { Enabled: true, MinRows: 50, BuildSliceMs: 0 } });
  });

  it('declines searches it does not serve', () => {
    const store = randomStore(100, 8);
    const query = store.CopyRow(0);
    expect(native.SearchApproximate(annJob(store, query, { Metric: 'euclidean' }))).toBeNull();
    expect(native.SearchApproximate(annJob(store, query, { TopK: null }))).toBeNull();
    expect(native.SearchApproximate(annJob(store, query, { TopK: 0 }))).toBeNull();
    expect(native.SearchApproximate(annJob(store, [0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(native.SearchApproximate({ ...annJob(store, query), Source: undefined })).toBeNull();
    expect(native.SearchApproximate(annJob(randomStore(10, 8), query))).toBeNull(); // below MinRows
    VectorAccelerationSettings.Instance.Configure({ ANN: { Enabled: false } });
    expect(native.SearchApproximate(annJob(store, query))).toBeNull();
    expect(native.IsAnnReady(store.StoreID)).toBe(false); // none of the above started a build
  });

  it('builds in the background — a chunk per event-loop turn even with BuildSliceMs 0 — then answers with exact scores', async () => {
    const store = randomStore(700, 8, 3);
    const query = store.CopyRow(10);
    expect(native.SearchApproximate(annJob(store, query))).toBeNull(); // starts the build
    expect(native.IsAnnReady(store.StoreID)).toBe(false);
    expect(native.SearchApproximate(annJob(store, query))).toBeNull(); // still building
    await waitFor(() => native.IsAnnReady(store.StoreID));
    expect(mocks.LogStatus).toHaveBeenCalledWith(expect.stringContaining('HNSW index ready (700 vectors)'));

    const job = annJob(store, query, { TopK: 10 });
    const result = native.SearchApproximate(job)!;
    const exact = SearchRows(job.Snapshot, job);
    const exactRows = new Set(exact.Rows);
    expect(Array.from(result.Rows).filter(r => exactRows.has(r)).length).toBeGreaterThanOrEqual(9);
    const view = store.View();
    result.Rows.forEach((row, i) => {
      expect(result.Scores[i]).toBe(MetricScore('cosine', job.Query, 0, job.QueryNormSq, view.Data, row * 8, view.Norms[row], 8));
    });
  });

  it('applies writes, updates and removals made after the build on the next search', async () => {
    const store = randomStore(300, 8, 5);
    native.SearchApproximate(annJob(store, store.CopyRow(0)));
    await waitFor(() => native.IsAnnReady(store.StoreID));

    const target = Array.from({ length: 8 }, (_, i) => (i === 0 ? 1 : 0));
    store.Write('k7', target); // update an indexed row in place
    store.Write('fresh', target.map(v => v * 2)); // add a row
    store.Remove('k1');
    const result = native.SearchApproximate(annJob(store, target, { TopK: 2 }))!;
    expect(Array.from(result.Rows).sort()).toEqual([store.RowOf('k7'), store.RowOf('fresh')].sort());
    expect(Array.from(native.SearchApproximate(annJob(store, store.CopyRow(store.RowOf('k2')!), { TopK: 300 }))!.Rows)).not.toContain(1);
  });

  it('rebuilds instead of patching after a large burst of changes', async () => {
    const store = randomStore(300, 8, 9);
    native.SearchApproximate(annJob(store, store.CopyRow(0)));
    await waitFor(() => native.IsAnnReady(store.StoreID));
    for (let i = 0; i < 2100; i++) store.Write(`k${i % 300}`, store.CopyRow(i % 300));
    expect(native.SearchApproximate(annJob(store, store.CopyRow(0)))).toBeNull(); // rebuild started
    expect(native.IsAnnReady(store.StoreID)).toBe(false);
    await waitFor(() => native.IsAnnReady(store.StoreID));
    expect(native.SearchApproximate(annJob(store, store.CopyRow(0)))).not.toBeNull();
  });

  it('does not start a second build when rows are renumbered mid-build, and rebuilds once the first finishes', async () => {
    const store = randomStore(900, 8, 11);
    native.SearchApproximate(annJob(store, store.CopyRow(0)));
    for (let i = 0; i < 300; i++) store.Remove(`k${i}`); // compaction renumbers rows: a new generation
    expect(native.SearchApproximate(annJob(store, store.CopyRow(0)))).toBeNull();
    await waitFor(() => native.IsAnnReady(store.StoreID));
    // Ready, but built for the old numbering: the next search rebuilds rather than answering.
    expect(native.SearchApproximate(annJob(store, store.CopyRow(0)))).toBeNull();
    await waitFor(() => native.IsAnnReady(store.StoreID));
    const row = store.LiveRows()[0];
    const result = native.SearchApproximate(annJob(store, store.CopyRow(row), { TopK: 1 }))!;
    expect(Array.from(result.Rows)).toEqual([row]);
  });

  it('falls back to an exact scan when filtering leaves fewer than K candidates', async () => {
    const store = randomStore(400, 8, 13);
    native.SearchApproximate(annJob(store, store.CopyRow(0)));
    await waitFor(() => native.IsAnnReady(store.StoreID));
    const farRows = SearchRows(store.View(), { ...specFor(store.CopyRow(0)), TopK: null });
    const leastSimilar = Int32Array.from(Array.from(farRows.Rows).slice(-5));
    expect(native.SearchApproximate(annJob(store, store.CopyRow(0), { TopK: 5, Candidates: leastSimilar }))).toBeNull();
  });

  it('drops dead rows and rows below the threshold from approximate candidates', async () => {
    const store = randomStore(300, 8, 17);
    const query = store.CopyRow(3);
    native.SearchApproximate(annJob(store, query));
    await waitFor(() => native.IsAnnReady(store.StoreID));
    // A snapshot where row 3 reads as dead but the index has not been told (same version).
    const job = annJob(store, query, { TopK: 5 });
    const live = Uint8Array.from(job.Snapshot.Live);
    live[3] = 0;
    const result = native.SearchApproximate({ ...job, Snapshot: { ...job.Snapshot, Live: live } })!;
    expect(Array.from(result.Rows)).not.toContain(3);

    // Some of the oversampled candidates score below 0.5; they are dropped, and 3 still remain.
    const thresholded = native.SearchApproximate(annJob(store, query, { TopK: 3, Threshold: 0.5 }))!;
    expect(thresholded.Rows.length).toBe(3);
    expect(Array.from(thresholded.Scores).every(s => s >= 0.5)).toBe(true);
  });

  it('falls back to an exact scan when a threshold leaves fewer than K approximate candidates', async () => {
    const store = randomStore(300, 8, 23);
    native.SearchApproximate(annJob(store, store.CopyRow(0)));
    await waitFor(() => native.IsAnnReady(store.StoreID));
    expect(native.SearchApproximate(annJob(store, store.CopyRow(0), { TopK: 50, Threshold: 0.95 }))).toBeNull();
  });

  it('patches in a change that only removed rows', async () => {
    const store = randomStore(300, 8, 31);
    native.SearchApproximate(annJob(store, store.CopyRow(0)));
    await waitFor(() => native.IsAnnReady(store.StoreID));
    const query = store.CopyRow(4);
    store.Remove('k4');
    // The removed row was the exact match; it is gone from the index, not just filtered out.
    const result = native.SearchApproximate(annJob(store, query, { TopK: 10 }))!;
    expect(Array.from(result.Rows)).not.toContain(4);
    expect(result.Rows.length).toBe(10);
  });

  it('builds past a chunk whose rows were all removed', async () => {
    const store = randomStore(2000, 4, 37);
    for (let i = 0; i < 256; i++) store.Remove(`k${i}`); // 13% removed: below the compaction threshold
    expect(store.RowCount).toBe(2000);
    native.SearchApproximate(annJob(store, store.CopyRow(300)));
    await waitFor(() => native.IsAnnReady(store.StoreID));
    const result = native.SearchApproximate(annJob(store, store.CopyRow(300), { TopK: 1 }))!;
    expect(Array.from(result.Rows)).toEqual([300]);
  });

  it('logs a failed build, stays on exact search, and retries on a later search', async () => {
    const store = randomStore(100, 8, 19);
    const add = vi.spyOn(usearch.Index.prototype, 'add').mockImplementation(() => {
      throw new Error('out of memory');
    });
    expect(native.SearchApproximate(annJob(store, store.CopyRow(0)))).toBeNull();
    expect(native.IsAnnReady(store.StoreID)).toBe(false);
    expect(mocks.LogError).toHaveBeenCalledWith('Vector acceleration: HNSW build failed, staying on exact search: out of memory');

    add.mockImplementation(() => {
      throw 'disk full';
    });
    native.SearchApproximate(annJob(store, store.CopyRow(0)));
    expect(mocks.LogError).toHaveBeenLastCalledWith('Vector acceleration: HNSW build failed, staying on exact search: disk full');

    add.mockRestore();
    native.SearchApproximate(annJob(store, store.CopyRow(0)));
    await waitFor(() => native.IsAnnReady(store.StoreID));
  });

  it('keeps at most 8 indexes, dropping the least recently used ready one', async () => {
    const stores = Array.from({ length: 9 }, (_, i) => randomStore(60, 4, 100 + i));
    for (const store of stores) {
      native.SearchApproximate(annJob(store, store.CopyRow(0)));
      await waitFor(() => native.IsAnnReady(store.StoreID));
    }
    expect(native.IsAnnReady(stores[0].StoreID)).toBe(false);
    expect(stores.slice(1).every(s => native.IsAnnReady(s.StoreID))).toBe(true);
  });

  it('never drops an index that is still building, even when every slot is building', async () => {
    const stores = Array.from({ length: 9 }, (_, i) => randomStore(600, 4, 200 + i));
    stores.forEach(store => native.SearchApproximate(annJob(store, store.CopyRow(0))));
    await waitFor(() => stores.every(s => native.IsAnnReady(s.StoreID)));
  });
});
