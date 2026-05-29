/**
 * @fileoverview Types and contracts for **colocated** vector search — the case where the
 * application's relational database is *also* the vector store (PostgreSQL + pgvector, or
 * SQL Server 2025 native vectors), rather than a separate remote service (Pinecone, Qdrant).
 *
 * A colocated provider borrows the host data provider's connection via {@link IColocatedVectorHost}
 * instead of opening its own pool. This gives three properties a foreign store cannot:
 *   1. one connection / one credential, and the same transaction as the entity write;
 *   2. results resolve to entity records without a second round-trip;
 *   3. true hybrid search (vector + keyword + filter) fused server-side in a single query.
 *
 * @module @memberjunction/ai-vectordb
 */

/** Dialect of the host relational database backing a colocated vector store. */
export type ColocatedDialect = 'PostgreSQL' | 'SQLServer';

/** Matches a safe, unquoted SQL identifier: a letter/underscore followed by word characters. */
const SQL_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Validate that `name` is a safe SQL identifier (schema, table, column) and return it unchanged.
 * Throws otherwise. Colocated providers build raw SQL with these identifiers interpolated (they
 * bypass the data providers' auto-quoting), and the values can originate from admin-supplied
 * `MJVectorIndex.ProviderConfig` — so every interpolated identifier is validated against an
 * allow-list rather than "cleaned", which would silently alter it and still miss escape vectors.
 */
export function ValidateSqlIdentifier(name: string, kind = 'identifier'): string {
    if (typeof name !== 'string' || !SQL_IDENTIFIER_PATTERN.test(name)) {
        throw new Error(`Invalid SQL ${kind}: ${JSON.stringify(name)} (must match ${SQL_IDENTIFIER_PATTERN}).`);
    }
    return name;
}

/**
 * Contract a relational data provider implements so a colocated vector provider can borrow
 * its connection — running vector DDL/DML in the SAME database (and, when a transaction is
 * open, the same transaction) as the application's entity data.
 *
 * Implemented by `SQLServerDataProvider` / `PostgreSQLDataProvider`. When a host is wired in,
 * the vector provider never opens its own pool.
 */
export interface IColocatedVectorHost {
    /** Which SQL dialect this host speaks — selects the colocated provider's SQL/placeholder syntax. */
    readonly ColocatedDialect: ColocatedDialect;
    /** Default schema where MJ entity tables/views live (e.g. `"__mj"`). */
    readonly ColocatedSchema: string;
    /**
     * Execute a parameterized statement against the host connection and return result rows.
     * Placeholders use the host dialect's native convention: `$1..$n` (PostgreSQL) or
     * `@p0..@pN` (SQL Server). Params are positional; index `i` maps to `$${i+1}` / `@p${i}`.
     */
    RunColocatedSQL<T = Record<string, unknown>>(sql: string, params?: ReadonlyArray<unknown>): Promise<T[]>;
}

/**
 * Runtime type guard for {@link IColocatedVectorHost}. Structural so a data provider can
 * satisfy the contract without `ai-vectordb` having to import the data-provider package.
 */
export function IsColocatedVectorHost(obj: unknown): obj is IColocatedVectorHost {
    if (!obj || typeof obj !== 'object') {
        return false;
    }
    const o = obj as Record<string, unknown>;
    return (o['ColocatedDialect'] === 'PostgreSQL' || o['ColocatedDialect'] === 'SQLServer')
        && typeof o['ColocatedSchema'] === 'string'
        && typeof o['RunColocatedSQL'] === 'function';
}

/** How a colocated provider fuses the vector and keyword result lists in a hybrid query. */
export type ColocatedFusion = 'rrf' | 'vector-only' | 'keyword-only';

/**
 * Options for a colocated query — a vector component, an optional keyword component, fused
 * together, with an optional metadata filter. Distinct from {@link QueryOptions} because it
 * carries the keyword + fusion controls and is answered in a single server-side statement.
 */
export interface ColocatedQueryOptions {
    /** Index (table) name. */
    indexName: string;
    /** Query embedding. Optional only when {@link keyword} is supplied (keyword-only search). */
    vector?: number[];
    /** Keyword string for the full-text component of a hybrid query. */
    keyword?: string;
    /** Maximum results to return. */
    topK: number;
    /** Metadata filter — same shape accepted by `QueryOptions.filter`. */
    filter?: object;
    /**
     * Fusion strategy. Defaults to `'rrf'` when both a vector and a keyword are present,
     * otherwise the single available component is used.
     */
    fusion?: ColocatedFusion;
    /** Include raw embedding values with each match (default false). */
    includeValues?: boolean;
    /** Include stored metadata with each match (default true). */
    includeMetadata?: boolean;
}

/** A single match from a colocated query. */
export interface ColocatedMatch {
    /** Vector record id, stored in `CompositeKey` URL format to mirror the external providers. */
    id: string;
    /** Fused relevance score; higher is more relevant regardless of the underlying metric. */
    score: number;
    /** Stored metadata, present when `includeMetadata` is true. */
    metadata?: Record<string, string | number | boolean | string[]>;
    /** Embedding values, present when `includeValues` is true. */
    values?: number[];
}

/** Result of a colocated query. */
export interface ColocatedQueryResult {
    matches: ColocatedMatch[];
}
