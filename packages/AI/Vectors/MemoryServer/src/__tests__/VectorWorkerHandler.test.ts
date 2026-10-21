import { describe, it, expect, vi, afterEach } from 'vitest';
import { SearchRows, SimpleVectorService, VectorSearchSpec, VectorStore } from '@memberjunction/ai-vectors-memory';
import { HandleWorkerRequest } from '../worker/VectorWorkerHandler';
import { NativeVectorBackend } from '../NativeVectorBackend';
import { IsClusterResponse, IsErrorResponse, IsSearchResponse } from '../worker/VectorWorkerProtocol';

function storeOf(rows: number[][]): VectorStore<string> {
  const store = new VectorStore<string>('float32');
  rows.forEach((row, i) => store.Write(`r${i}`, row));
  return store;
}

function specFor(query: number[], overrides: Partial<VectorSearchSpec> = {}): VectorSearchSpec {
  return {
    Query: Float64Array.from(query),
    QueryNormSq: query.reduce((s, v) => s + v * v, 0),
    Candidates: null,
    Metric: 'cosine',
    TopK: 3,
    Threshold: null,
    ...overrides,
  };
}

const ROWS = [[1, 0, 0], [0.9, 0.1, 0], [0, 1, 0], [0, 0, 1], [0.5, 0.5, 0]];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HandleWorkerRequest', () => {
  it('answers a search with the JS kernels when no native threads are given, transferring the result buffers', () => {
    const view = storeOf(ROWS).View();
    const spec = specFor([1, 0, 0]);
    const nativeSpy = vi.spyOn(NativeVectorBackend.Instance, 'SearchRows');
    const { Response, Transfer } = HandleWorkerRequest({ TaskID: 7, Kind: 'search', View: view, Spec: spec, NativeThreads: 0 });
    expect(nativeSpy).not.toHaveBeenCalled();
    expect(IsSearchResponse(Response)).toBe(true);
    if (!IsSearchResponse(Response)) return;
    const expected = SearchRows(view, spec);
    expect(Response.TaskID).toBe(7);
    expect(Array.from(Response.Rows)).toEqual(Array.from(expected.Rows));
    expect(Array.from(Response.Scores)).toEqual(Array.from(expected.Scores));
    expect(Transfer).toEqual([Response.Rows.buffer, Response.Scores.buffer]);
  });

  it('uses the native backend when given threads, with the same exact result', () => {
    expect(NativeVectorBackend.Instance.Load()).toBe(true);
    const view = storeOf(ROWS).View();
    const spec = specFor([1, 0, 0]);
    const nativeSpy = vi.spyOn(NativeVectorBackend.Instance, 'SearchRows');
    const { Response } = HandleWorkerRequest({ TaskID: 1, Kind: 'search', View: view, Spec: spec, NativeThreads: 1 });
    expect(nativeSpy).toHaveBeenCalledWith(view, spec, 1);
    expect(nativeSpy.mock.results[0].value).not.toBeNull();
    if (!IsSearchResponse(Response)) throw new Error('expected a search response');
    expect(Array.from(Response.Rows)).toEqual(Array.from(SearchRows(view, spec).Rows));
  });

  it('falls back to the JS kernels when native search does not apply', () => {
    NativeVectorBackend.Instance.Load();
    const view = storeOf(ROWS).View();
    const spec = specFor([1, 0, 0], { Candidates: Int32Array.from([2, 3, 4]) }); // native cannot filter
    const { Response } = HandleWorkerRequest({ TaskID: 2, Kind: 'search', View: view, Spec: spec, NativeThreads: 2 });
    if (!IsSearchResponse(Response)) throw new Error('expected a search response');
    expect(Array.from(Response.Rows)).toEqual([4, 2, 3]);
  });

  it('runs a clustering job with the service\'s own clustering code', () => {
    const store = storeOf([[0, 0], [0.01, 0], [10, 10], [10.01, 10]]);
    const job = { Snapshot: store.Snapshot(), Candidates: null, Algorithm: 'dbscan' as const, Metric: 'euclidean' as const, Epsilon: 0.5, MinPoints: 2 };
    const { Response, Transfer } = HandleWorkerRequest({ TaskID: 3, Kind: 'cluster', Job: job });
    expect(Transfer).toEqual([]);
    if (!IsClusterResponse(Response)) throw new Error('expected a cluster response');
    expect(Response.Result).toEqual(SimpleVectorService.RunClusterJob(job));
    expect(Response.Result.Clusters.size).toBe(2);
  });

  it('turns a failure into an error response instead of throwing', () => {
    const view = storeOf(ROWS).View();
    const { Response, Transfer } = HandleWorkerRequest({
      TaskID: 4, Kind: 'search', View: view, Spec: specFor([1, 0, 0], { Metric: 'nope' as 'cosine' }), NativeThreads: 0,
    });
    expect(IsErrorResponse(Response)).toBe(true);
    expect(Response).toEqual({ TaskID: 4, Ok: false, Error: 'Unknown distance metric: nope' });
    expect(Transfer).toEqual([]);
  });

  it('reports a thrown non-Error value as text', () => {
    vi.spyOn(SimpleVectorService, 'RunClusterJob').mockImplementation(() => {
      throw 'plain string failure';
    });
    const store = storeOf([[0, 0]]);
    const { Response } = HandleWorkerRequest({
      TaskID: 5, Kind: 'cluster', Job: { Snapshot: store.Snapshot(), Candidates: null, Algorithm: 'kmeans', Metric: 'euclidean', K: 1 },
    });
    expect(Response).toEqual({ TaskID: 5, Ok: false, Error: 'plain string failure' });
  });
});
