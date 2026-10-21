/**
 * @fileoverview Packed, row-oriented storage behind {@link SimpleVectorService}.
 *
 * Vectors live in one contiguous typed array instead of one `number[]` per
 * key, with each row's sum of squares cached alongside. That halves memory at
 * float32, removes per-search allocation, and lets a worker thread read the
 * same memory when the buffers are `SharedArrayBuffer`s.
 *
 * Rows are kept in insertion order — the order a `Map` iterates — so ranking
 * ties resolve exactly as they did when the service stored a `Map`:
 * - overwriting an existing key writes its row in place (keeps its position)
 * - removing a key leaves a tombstone; the next add appends at the end
 * - tombstones are reclaimed by an order-preserving compaction
 *
 * **Concurrency contract for readers on other threads.** Growth and compaction
 * allocate NEW buffers and a NEW key array, so a snapshot taken earlier keeps
 * a consistent row→key mapping. An in-place overwrite can be observed half
 * written by a concurrent reader; callers that read from another thread must
 * re-score their final rows against the live store (the service does).
 *
 * @module @memberjunction/ai-vectors-memory
 */

import { SumOfSquares, VectorArray, VectorRowsView } from './VectorKernels';

/** Element precision of a packed store. */
export type VectorPrecision = 'float64' | 'float32';

/** Allocates the memory behind a store. Returning a `SharedArrayBuffer` makes the store readable by workers. */
export type VectorBufferAllocator = (byteLength: number) => ArrayBufferLike;

/** Everything a reader on another thread needs to score a store, plus version stamps. */
export interface VectorStoreSnapshot extends VectorRowsView {
  /** Process-unique identity of the store, stable for its lifetime */
  StoreID: number;
  /** Live rows (RowCount minus tombstones) */
  LiveCount: number;
  Precision: VectorPrecision;
  /** Changes when rows are renumbered (compaction, clear) */
  Generation: number;
  /** Changes on every mutation */
  Version: number;
}

const MIN_CAPACITY = 16;
const GROWTH_FACTOR = 1.5;
/** Compact once tombstones exceed both this count and {@link COMPACT_RATIO} of rows. */
const COMPACT_MIN_TOMBSTONES = 64;
const COMPACT_RATIO = 0.25;

/** Most recent row changes remembered for {@link VectorStore.ChangedRowsSince}. */
const CHANGE_LOG_CAPACITY = 8192;

const DEFAULT_ALLOCATOR: VectorBufferAllocator = (byteLength: number) => new ArrayBuffer(byteLength);

let nextStoreID = 1;

/**
 * Packed row store keyed by string. Not thread-safe for writers; see the
 * file overview for the reader contract.
 */
export class VectorStore<TMetadata> {
  private readonly precision: VectorPrecision;
  private readonly allocate: VectorBufferAllocator;
  private readOnly = false;
  private readonly storeID = nextStoreID++;

  private dims = 0;
  private capacity = 0;
  private rowCount = 0;
  private liveCount = 0;
  private zeroNormRows = 0;
  private generation = 0;
  private version = 0;

  private data: VectorArray;
  private norms: Float64Array<ArrayBufferLike> = new Float64Array(0);
  private live: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  private keys: Array<string | null> = [];
  private metadata: Array<TMetadata | undefined> = [];
  private rowByKey = new Map<string, number>();
  /** Rows written or removed, oldest first, with the version each change produced. */
  private changedRows: number[] = [];
  private changedVersions: number[] = [];
  /** Changes at or before this version are no longer in the log. */
  private changeLogFloor = 0;

  constructor(precision: VectorPrecision = 'float64', allocate?: VectorBufferAllocator) {
    this.precision = precision;
    this.allocate = allocate ?? DEFAULT_ALLOCATOR;
    this.data = precision === 'float32' ? new Float32Array(0) : new Float64Array(0);
  }

  /**
   * Wraps an existing view (for example, shared memory received by a worker)
   * as a read-only store. Each live row in `candidates` (or every live row)
   * gets the synthetic key `String(row)`, so results computed on the
   * adopted store map straight back to source rows.
   */
  public static Adopt<T>(view: VectorRowsView, precision: VectorPrecision, candidates: Int32Array | null): VectorStore<T> {
    const store = new VectorStore<T>(precision);
    store.adoptView(view, candidates);
    return store;
  }

  // ── Read accessors ─────────────────────────────────────────────────────

  public get Precision(): VectorPrecision { return this.precision; }
  /** Dimensions per row, or 0 before the first vector is written. */
  public get Dims(): number { return this.dims; }
  /** Live rows. */
  public get Size(): number { return this.liveCount; }
  /** Rows written, including tombstones. */
  public get RowCount(): number { return this.rowCount; }
  /** Live rows whose vector is all zeros. */
  public get ZeroNormRows(): number { return this.zeroNormRows; }
  /** Process-unique identity of this store. */
  public get StoreID(): number { return this.storeID; }
  public get Generation(): number { return this.generation; }
  public get Version(): number { return this.version; }
  /** True when the row buffers are shared with other threads. */
  public get IsShared(): boolean {
    return typeof SharedArrayBuffer !== 'undefined' && this.data.buffer instanceof SharedArrayBuffer;
  }

  /**
   * The current row→key array. It is replaced (never reordered) on
   * compaction, so a captured reference stays valid for the rows it saw.
   */
  public get Keys(): ReadonlyArray<string | null> { return this.keys; }

  public Has(key: string): boolean { return this.rowByKey.has(key); }
  public RowOf(key: string): number | undefined { return this.rowByKey.get(key); }
  public KeyAt(row: number): string | null { return this.keys[row] ?? null; }
  public MetadataAt(row: number): TMetadata | undefined { return this.metadata[row]; }
  public NormAt(row: number): number { return this.norms[row]; }
  public IsLive(row: number): boolean { return this.live[row] === 1; }

  /** The live view used by kernels on this thread. */
  public View(): VectorRowsView {
    return { Data: this.data, Norms: this.norms, Live: this.live, RowCount: this.rowCount, Dims: this.dims };
  }

  /** A view plus version stamps, for readers on other threads. */
  public Snapshot(): VectorStoreSnapshot {
    return {
      ...this.View(),
      StoreID: this.storeID,
      LiveCount: this.liveCount,
      Precision: this.precision,
      Generation: this.generation,
      Version: this.version,
    };
  }

  /**
   * Rows written or removed after `version`, oldest first (a row can repeat).
   * Lets a derived index — a native ANN graph, say — follow the store
   * incrementally. Returns null when it cannot answer: the change log no
   * longer reaches back that far, or rows were renumbered since (generation
   * changed), so the caller must rebuild from scratch.
   */
  public ChangedRowsSince(version: number, generation: number): Int32Array | null {
    if (generation !== this.generation || version < this.changeLogFloor) return null;
    let first = this.changedVersions.length;
    while (first > 0 && this.changedVersions[first - 1] > version) first--;
    return Int32Array.from(this.changedRows.slice(first));
  }

  /** Live rows in insertion order. */
  public LiveRows(): Int32Array {
    const rows = new Int32Array(this.liveCount);
    let n = 0;
    for (let row = 0; row < this.rowCount; row++) {
      if (this.live[row] === 1) rows[n++] = row;
    }
    return rows;
  }

  /** A row's values as a plain array (a copy). */
  public ReadRow(row: number): number[] {
    const start = row * this.dims;
    return Array.from(this.data.subarray(start, start + this.dims));
  }

  /** A row's values as a typed array in the store's precision (a copy). */
  public CopyRow(row: number): VectorArray {
    const start = row * this.dims;
    return this.data.slice(start, start + this.dims);
  }

  /**
   * Copies a vector into a Float64Array with each value rounded to the store's
   * precision, so it compares exactly like a stored row (equality-based
   * metrics such as hamming depend on that).
   */
  public ToStorePrecision(vector: ArrayLike<number>): Float64Array {
    return this.precision === 'float32' ? Float64Array.from(vector, Math.fround) : Float64Array.from(vector);
  }

  // ── Mutation ───────────────────────────────────────────────────────────

  /** Reserves room for `additionalRows` more rows so a bulk load allocates once. */
  public Reserve(additionalRows: number, dims: number): void {
    this.assertWritable();
    if (this.dims === 0) this.dims = dims;
    this.ensureCapacity(this.rowCount + additionalRows);
  }

  /**
   * Writes a vector for `key`, overwriting the existing row in place or
   * appending a new one. Metadata is left to {@link SetMetadata}. The caller
   * is responsible for dimension validation.
   *
   * @returns The row the vector was written to
   */
  public Write(key: string, vector: ArrayLike<number>): number {
    this.assertWritable();
    if (this.dims === 0) this.dims = vector.length;
    let row = this.rowByKey.get(key);
    if (row === undefined) {
      this.ensureCapacity(this.rowCount + 1);
      row = this.rowCount++;
      this.keys[row] = key;
      this.metadata[row] = undefined;
      this.rowByKey.set(key, row);
      this.live[row] = 1;
      this.liveCount++;
    } else if (this.norms[row] === 0) {
      this.zeroNormRows--;
    }
    this.writeValues(row, vector);
    this.version++;
    this.recordChange(row);
    return row;
  }

  public SetMetadata(row: number, metadata: TMetadata | undefined): void {
    this.assertWritable();
    this.metadata[row] = metadata;
  }

  /** Removes a key, leaving a tombstone. Compacts when tombstones pile up. */
  public Remove(key: string): boolean {
    this.assertWritable();
    const row = this.rowByKey.get(key);
    if (row === undefined) return false;
    this.rowByKey.delete(key);
    this.keys[row] = null;
    this.metadata[row] = undefined;
    this.live[row] = 0;
    if (this.norms[row] === 0) this.zeroNormRows--;
    this.liveCount--;
    this.version++;
    this.recordChange(row);
    this.compactIfWorthwhile();
    return true;
  }

  /** Removes every row. The dimension lock is kept, as the service always has. */
  public Clear(): void {
    this.assertWritable();
    this.rowCount = 0;
    this.liveCount = 0;
    this.zeroNormRows = 0;
    this.capacity = 0;
    this.data = this.precision === 'float32' ? new Float32Array(0) : new Float64Array(0);
    this.norms = new Float64Array(0);
    this.live = new Uint8Array(0);
    this.keys = [];
    this.metadata = [];
    this.rowByKey = new Map();
    this.generation++;
    this.version++;
    this.resetChangeLog();
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private recordChange(row: number): void {
    this.changedRows.push(row);
    this.changedVersions.push(this.version);
    if (this.changedRows.length > CHANGE_LOG_CAPACITY) {
      const drop = this.changedRows.length - CHANGE_LOG_CAPACITY / 2;
      this.changeLogFloor = this.changedVersions[drop - 1];
      this.changedRows.splice(0, drop);
      this.changedVersions.splice(0, drop);
    }
  }

  /** Renumbering rows invalidates the change log; readers must rebuild. */
  private resetChangeLog(): void {
    this.changedRows = [];
    this.changedVersions = [];
    this.changeLogFloor = this.version;
  }

  private writeValues(row: number, vector: ArrayLike<number>): void {
    const offset = row * this.dims;
    for (let i = 0; i < this.dims; i++) {
      this.data[offset + i] = vector[i];
    }
    // Norm from the STORED values so float32 rows and their norms agree.
    const normSq = SumOfSquares(this.data, offset, this.dims);
    this.norms[row] = normSq;
    if (normSq === 0) this.zeroNormRows++;
  }

  private ensureCapacity(rows: number): void {
    if (rows <= this.capacity) return;
    const next = Math.max(rows, Math.ceil(this.capacity * GROWTH_FACTOR), MIN_CAPACITY);
    this.reallocate(next, this.rowCount);
  }

  /** Copies the first `rowsToCopy` rows into freshly allocated buffers of `capacity` rows. */
  private reallocate(capacity: number, rowsToCopy: number): void {
    const data = this.allocateData(capacity * this.dims);
    const norms = new Float64Array(this.allocate(capacity * Float64Array.BYTES_PER_ELEMENT));
    const live = new Uint8Array(this.allocate(capacity));
    data.set(this.data.subarray(0, rowsToCopy * this.dims));
    norms.set(this.norms.subarray(0, rowsToCopy));
    live.set(this.live.subarray(0, rowsToCopy));
    this.data = data;
    this.norms = norms;
    this.live = live;
    this.capacity = capacity;
    this.version++;
  }

  private allocateData(elements: number): VectorArray {
    const bytesPer = this.precision === 'float32' ? Float32Array.BYTES_PER_ELEMENT : Float64Array.BYTES_PER_ELEMENT;
    const buffer = this.allocate(elements * bytesPer);
    return this.precision === 'float32' ? new Float32Array(buffer) : new Float64Array(buffer);
  }

  private compactIfWorthwhile(): void {
    const tombstones = this.rowCount - this.liveCount;
    if (tombstones < COMPACT_MIN_TOMBSTONES || tombstones < this.rowCount * COMPACT_RATIO) return;
    this.compact();
  }

  /** Order-preserving compaction into new buffers and a new key array. */
  private compact(): void {
    const liveRows = this.LiveRows();
    const capacity = Math.max(MIN_CAPACITY, Math.ceil(liveRows.length * GROWTH_FACTOR));
    const data = this.allocateData(capacity * this.dims);
    const norms = new Float64Array(this.allocate(capacity * Float64Array.BYTES_PER_ELEMENT));
    const live = new Uint8Array(this.allocate(capacity));
    const keys: Array<string | null> = new Array(liveRows.length);
    const metadata: Array<TMetadata | undefined> = new Array(liveRows.length);
    const rowByKey = new Map<string, number>();
    for (let newRow = 0; newRow < liveRows.length; newRow++) {
      const oldRow = liveRows[newRow];
      data.set(this.data.subarray(oldRow * this.dims, (oldRow + 1) * this.dims), newRow * this.dims);
      norms[newRow] = this.norms[oldRow];
      live[newRow] = 1;
      const key = this.keys[oldRow] as string;
      keys[newRow] = key;
      metadata[newRow] = this.metadata[oldRow];
      rowByKey.set(key, newRow);
    }
    this.data = data;
    this.norms = norms;
    this.live = live;
    this.keys = keys;
    this.metadata = metadata;
    this.rowByKey = rowByKey;
    this.capacity = capacity;
    this.rowCount = liveRows.length;
    this.generation++;
    this.version++;
    this.resetChangeLog();
  }

  private adoptView(view: VectorRowsView, candidates: Int32Array | null): void {
    this.data = view.Data;
    this.norms = view.Norms;
    this.live = view.Live;
    this.dims = view.Dims;
    this.rowCount = view.RowCount;
    this.capacity = view.RowCount;
    this.keys = new Array(view.RowCount).fill(null);
    this.metadata = new Array(view.RowCount).fill(undefined);
    const rows = candidates ?? this.liveRowsOfView(view);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (view.Live[row] !== 1) continue;
      const key = String(row);
      this.keys[row] = key;
      this.rowByKey.set(key, row);
      this.liveCount++;
      if (view.Norms[row] === 0) this.zeroNormRows++;
    }
    // Rows outside `candidates` must be invisible to the adopted store's scans.
    if (candidates) this.live = this.maskLive(view, rows);
    this.readOnly = true;
  }

  private liveRowsOfView(view: VectorRowsView): Int32Array {
    const rows: number[] = [];
    for (let row = 0; row < view.RowCount; row++) {
      if (view.Live[row] === 1) rows.push(row);
    }
    return Int32Array.from(rows);
  }

  /** A private live mask limited to `rows`, so the shared mask is never written. */
  private maskLive(view: VectorRowsView, rows: Int32Array): Uint8Array {
    const mask = new Uint8Array(view.RowCount);
    for (let i = 0; i < rows.length; i++) {
      if (view.Live[rows[i]] === 1) mask[rows[i]] = 1;
    }
    return mask;
  }

  private assertWritable(): void {
    if (this.readOnly) {
      throw new Error('This vector store is a read-only view and cannot be modified');
    }
  }
}
