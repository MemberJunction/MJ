/**
 * Shared mock of the `mssql` module for SQLServerDataProvider behavioral tests.
 *
 * The suites in this package drive the REAL provider classes (SQLServerDataProvider,
 * SQLServerTransactionGroup) and mock only the mssql pool/transaction/request boundary —
 * the exact seam a live database would sit behind. Every SQL statement the provider
 * emits is captured in {@link mssqlState} so tests can assert on the precise SQL text,
 * bound parameters, and the begin/query/commit/rollback ordering.
 *
 * Usage in a test file (the factory + static import resolve to the SAME module instance,
 * so the recorder state is shared):
 *
 * ```ts
 * vi.mock('mssql', async () => (await import('./helpers/mock-mssql')).createMockMssqlModule());
 * import { mssqlState, MockConnectionPool } from './helpers/mock-mssql';
 * ```
 */

export interface RecordedInput {
  name: string;
  value: unknown;
}

export interface RecordedQuery {
  sql: string;
  inputs: RecordedInput[];
  /** true when the request was created on a Transaction, false when on the pool */
  viaTransaction: boolean;
}

export type ConnectionEvent =
  | { kind: 'begin' }
  | { kind: 'commit' }
  | { kind: 'rollback' }
  | { kind: 'query'; sql: string };

/** One queued response for the next `request.query()` call (FIFO). */
export interface QueuedResult {
  rows?: Record<string, unknown>[];
  /** For multi-result-set responses; overrides `rows` when provided. */
  recordsets?: Record<string, unknown>[][];
  error?: Error;
}

export interface MockQueryResult {
  recordset: Record<string, unknown>[];
  recordsets: Record<string, unknown>[][];
  rowsAffected: number[];
  output: Record<string, unknown>;
}

class MssqlMockState {
  public Queries: RecordedQuery[] = [];
  public Events: ConnectionEvent[] = [];
  public QueuedResults: QueuedResult[] = [];
  /** Rows returned when nothing is queued. */
  public DefaultRows: Record<string, unknown>[] = [];

  public Reset(): void {
    this.Queries = [];
    this.Events = [];
    this.QueuedResults = [];
    this.DefaultRows = [];
  }

  public QueueResult(result: QueuedResult): void {
    this.QueuedResults.push(result);
  }

  /** Kinds only — convenient for asserting begin/query/commit/rollback ordering. */
  public EventKinds(): string[] {
    return this.Events.map((e) => e.kind);
  }

  public NextResult(): MockQueryResult {
    const queued = this.QueuedResults.shift();
    if (queued?.error) {
      throw queued.error;
    }
    const recordsets = queued?.recordsets ?? [queued?.rows ?? this.DefaultRows];
    return {
      recordset: recordsets[0] ?? [],
      recordsets,
      rowsAffected: recordsets.map((r) => r.length),
      output: {},
    };
  }
}

export const mssqlState = new MssqlMockState();

/* eslint-disable @typescript-eslint/naming-convention -- these classes mimic the mssql API surface (lowercase methods) */

export class MockConnectionPool {
  public connected = true;
  public readonly config?: unknown;

  constructor(config?: unknown) {
    this.config = config;
  }

  public async connect(): Promise<this> {
    this.connected = true;
    return this;
  }

  public async close(): Promise<void> {
    this.connected = false;
  }
}

export class MockTransaction {
  public readonly parent: MockConnectionPool;

  constructor(parent: MockConnectionPool) {
    this.parent = parent;
  }

  public async begin(): Promise<void> {
    mssqlState.Events.push({ kind: 'begin' });
  }

  public async commit(): Promise<void> {
    mssqlState.Events.push({ kind: 'commit' });
  }

  public async rollback(): Promise<void> {
    mssqlState.Events.push({ kind: 'rollback' });
  }
}

export class MockRequest {
  public readonly parent?: unknown;
  private readonly boundInputs: RecordedInput[] = [];

  constructor(parent?: unknown) {
    this.parent = parent;
  }

  public input(name: string, value: unknown): this {
    this.boundInputs.push({ name, value });
    return this;
  }

  public async query(sqlText: string): Promise<MockQueryResult> {
    mssqlState.Events.push({ kind: 'query', sql: sqlText });
    mssqlState.Queries.push({
      sql: sqlText,
      inputs: [...this.boundInputs],
      viaTransaction: this.parent instanceof MockTransaction,
    });
    return mssqlState.NextResult();
  }
}

/* eslint-enable @typescript-eslint/naming-convention */

/**
 * Builds the module shape returned by the `vi.mock('mssql', ...)` factory. Both the
 * default export and named exports point at the mock classes so `import sql from 'mssql'`
 * and `import * as sql from 'mssql'` consumers see the same constructors (keeping
 * `instanceof` checks inside the provider working).
 */
export function createMockMssqlModule(): Record<string, unknown> {
  const mod = {
    ConnectionPool: MockConnectionPool,
    Transaction: MockTransaction,
    Request: MockRequest,
  };
  return { ...mod, default: mod };
}
