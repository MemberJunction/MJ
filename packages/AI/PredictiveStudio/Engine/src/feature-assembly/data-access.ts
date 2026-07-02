/**
 * @module feature-assembly/data-access
 *
 * The **data-access seam** for the FeatureAssembly executor. The executor reads
 * source rows (entities, Queries, external entities) and persisted embedding
 * vectors through this narrow, read-only interface rather than calling
 * `RunView` directly. This keeps the executor:
 *
 * - **Testable without a live database** — unit tests inject an in-memory
 *   implementation backed by plain arrays (no DB, no GraphQL).
 * - **Single-pathed** — the same executor code runs in all three contexts
 *   (train / materialize / on-demand), with only the data-access implementation
 *   differing between a real `RunView`-backed reader and a test fixture.
 *
 * The production implementation ({@link RunViewDataAccess}) wraps
 * `@memberjunction/core`'s `RunView` and always passes the `contextUser` so the
 * reads honor per-user data isolation on the server.
 */

import { RunView, type UserInfo, type IMetadataProvider } from '@memberjunction/core';

/**
 * A single fetched row — a plain map of column name → value. Deliberately loose
 * because sources come from heterogeneous entities/queries; the executor selects
 * and types the columns it needs downstream.
 */
export type SourceRow = Record<string, string | number | boolean | null | undefined>;

/**
 * Read parameters for fetching rows from a named source. A subset of MJ's
 * `RunViewParams`, narrowed to what FeatureAssembly needs (read-only).
 */
export interface FetchRowsParams {
  /** Entity / external-entity name to read from. */
  EntityName: string;
  /** Optional SQL-ish filter expression (passed through to RunView's `ExtraFilter`). */
  ExtraFilter?: string;
  /** Optional ordering expression (passed through to RunView's `OrderBy`). */
  OrderBy?: string;
  /** Optional column projection — narrows the read for performance. */
  Fields?: string[];
  /** Optional cap on rows returned. */
  MaxRows?: number;
}

/**
 * Result of a {@link IFeatureDataAccess.fetchRows} call.
 */
export interface FetchRowsResult {
  /** Whether the read succeeded. */
  Success: boolean;
  /** The fetched rows (empty when `Success` is false). */
  Rows: SourceRow[];
  /** Error detail when `Success` is false. */
  ErrorMessage?: string;
}

/**
 * The read-only data-access contract the FeatureAssembly executor depends on.
 *
 * Implementations:
 * - {@link RunViewDataAccess} — production, wraps `RunView` (DB-backed).
 * - test fixtures — in-memory, back the unit tests with plain arrays.
 */
export interface IFeatureDataAccess {
  /**
   * Fetch rows from a named source (entity / external entity / query-backed
   * entity). Returns a {@link FetchRowsResult} — never throws for logical
   * read failures (mirrors `RunView`'s non-throwing contract).
   */
  fetchRows(params: FetchRowsParams): Promise<FetchRowsResult>;

  /**
   * Fetch a persisted, version-pinned embedding vector for a single record of
   * an entity (plan §5.2). Returns the dense numeric vector, or `null` when no
   * persisted embedding exists for that record/model.
   *
   * The default implementation is a documented integration seam (see
   * {@link RunViewDataAccess.fetchEmbedding}); tests supply vectors directly.
   *
   * @param entity entity whose persisted embedding is requested
   * @param recordId primary-key value of the record
   * @param embeddingModelRef pinned embedding-model id/name (part of model lineage)
   * @param dims expected dimensionality
   */
  fetchEmbedding(entity: string, recordId: string, embeddingModelRef: string, dims: number): Promise<number[] | null>;
}

/**
 * Production {@link IFeatureDataAccess} backed by `@memberjunction/core`'s
 * `RunView`. Always passes `contextUser` so server-side reads honor per-user
 * data isolation. Constructed with an optional `IMetadataProvider` for
 * multi-provider correctness (CLAUDE.md) — the provider, when supplied, is the
 * one the reads run against.
 */
export class RunViewDataAccess implements IFeatureDataAccess {
  private readonly runView: RunView;
  private readonly contextUser?: UserInfo;
  private readonly provider?: IMetadataProvider;

  /**
   * @param contextUser the request's user — REQUIRED on the server for isolation/audit
   * @param provider optional provider for multi-provider scenarios (defaults to global)
   */
  constructor(contextUser?: UserInfo, provider?: IMetadataProvider) {
    this.contextUser = contextUser;
    this.provider = provider;
    this.runView = this.provider ? RunView.FromMetadataProvider(this.provider) : new RunView();
  }

  /** @inheritdoc */
  public async fetchRows(params: FetchRowsParams): Promise<FetchRowsResult> {
    const result = await this.runView.RunView<SourceRow>(
      {
        EntityName: params.EntityName,
        ExtraFilter: params.ExtraFilter ?? '',
        OrderBy: params.OrderBy ?? '',
        Fields: params.Fields,
        MaxRows: params.MaxRows,
        ResultType: 'simple',
      },
      this.contextUser,
    );

    if (!result.Success) {
      return { Success: false, Rows: [], ErrorMessage: result.ErrorMessage };
    }
    return { Success: true, Rows: result.Results ?? [] };
  }

  /**
   * @inheritdoc
   *
   * INTEGRATION SEAM (plan §5.2): wiring persisted embeddings is a later-phase
   * task (PS-FEAT-1 pulls persisted vectors; the concrete read depends on the
   * vector-store binding — pgvector / Qdrant / Pinecone / SQL Server via
   * `EntityVectorSyncer`). Until that binding is wired, this returns `null`
   * (no persisted embedding), which the executor handles by emitting zero-filled
   * embedding columns. It MUST NOT regenerate embeddings inline — embeddings are
   * persisted + version-pinned (anti-skew, §6.5). Tests inject vectors directly
   * via an in-memory `IFeatureDataAccess`, so this stub never blocks them.
   */
  public async fetchEmbedding(_entity: string, _recordId: string, _embeddingModelRef: string, _dims: number): Promise<number[] | null> {
    return null;
  }
}
