import { describe, it, expect, vi, afterEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import {
  BaseVectorAccelerator,
  VECTOR_ACCELERATOR_KEY,
  VectorAcceleratorResolver,
  VectorSearchJob,
} from '../models/VectorAccelerator';
import { VectorStore } from '../models/VectorStore';
import { SearchRows } from '../models/VectorKernels';

function jobOver(store: VectorStore<string>, query: number[]): VectorSearchJob {
  return {
    Query: Float64Array.from(query),
    QueryNormSq: query.reduce((s, v) => s + v * v, 0),
    Candidates: null,
    Metric: 'cosine',
    TopK: 2,
    Threshold: null,
    Snapshot: store.Snapshot(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BaseVectorAccelerator (in-process default)', () => {
  const accelerator = new BaseVectorAccelerator();

  it('allocates ordinary, non-shared memory', () => {
    const buffer = accelerator.AllocateBuffer(32);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBe(32);
  });

  it('has no synchronous fast path and declines clustering', async () => {
    const store = new VectorStore<string>();
    store.Write('a', [1, 0]);
    expect(accelerator.TrySearchSync(jobOver(store, [1, 0]))).toBeNull();
    expect(await accelerator.ClusterAsync({ Snapshot: store.Snapshot(), Candidates: null, Algorithm: 'kmeans', Metric: 'euclidean', K: 1 })).toBeNull();
  });

  it('searches in-process with the shared kernels', async () => {
    const store = new VectorStore<string>();
    store.Write('a', [1, 0]);
    store.Write('b', [0, 1]);
    store.Write('c', [1, 1]);
    const job = jobOver(store, [1, 0]);
    expect(await accelerator.SearchAsync(job)).toEqual(SearchRows(job.Snapshot, job));
  });
});

describe('VectorAcceleratorResolver', () => {
  it('resolves the in-process accelerator when nothing else is registered, and reuses it', () => {
    const first = VectorAcceleratorResolver.Instance.Current;
    expect(first).toBeInstanceOf(BaseVectorAccelerator);
    expect(VectorAcceleratorResolver.Instance.Current).toBe(first);
  });

  it('falls back to a plain in-process accelerator when the ClassFactory cannot create the registered one', () => {
    const factory = MJGlobal.Instance.ClassFactory;
    class Unbuildable extends BaseVectorAccelerator {}
    factory.Register(BaseVectorAccelerator, Unbuildable, 'resolver-fallback-test', 1);
    const registration = factory.GetRegistration(BaseVectorAccelerator, 'resolver-fallback-test');
    vi.spyOn(factory, 'GetRegistration').mockReturnValue(registration);
    vi.spyOn(factory, 'CreateInstance').mockReturnValue(null);
    const resolved = VectorAcceleratorResolver.Instance.Current;
    expect(resolved.constructor).toBe(BaseVectorAccelerator);
  });

  it('treats a missing registration as the in-process accelerator', () => {
    const factory = MJGlobal.Instance.ClassFactory;
    vi.spyOn(factory, 'GetRegistration').mockReturnValue(null);
    vi.spyOn(factory, 'CreateInstance').mockReturnValue(new BaseVectorAccelerator());
    expect(VectorAcceleratorResolver.Instance.Current).toBeInstanceOf(BaseVectorAccelerator);
  });

  it('switches to an accelerator registered after the first lookup', () => {
    const before = VectorAcceleratorResolver.Instance.Current;
    class LateAccelerator extends BaseVectorAccelerator {}
    MJGlobal.Instance.ClassFactory.Register(BaseVectorAccelerator, LateAccelerator, VECTOR_ACCELERATOR_KEY, 10_000);
    const after = VectorAcceleratorResolver.Instance.Current;
    expect(after).toBeInstanceOf(LateAccelerator);
    expect(after).not.toBe(before);
    expect(VectorAcceleratorResolver.Instance.Current).toBe(after);
  });
});
