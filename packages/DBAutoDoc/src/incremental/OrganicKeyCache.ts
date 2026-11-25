/**
 * OrganicKeyCache — per-table normalization and embedding cache for
 * incremental organic-key detection.
 *
 * `TableNormalizer` makes one LLM call per table using ONLY intra-table inputs
 * (schema/table descriptions + column types, descriptions, sample values, PK/FK flags).
 * Hashing those inputs lets incremental runs skip both `TableNormalizer` LLM calls
 * and `EmbeddingProvider` vector calls for every unchanged table, while still
 * running global clustering + FK bridge walks across the union of cached and new columns.
 */

import { createHash } from 'node:crypto';
import { NormalizedColumn, TableNormalizationInput } from '../discovery/ColumnNormalizer.js';
import { CachedNormalizedColumn, CachedTableNormalization } from '../types/incremental.js';

export interface PartitionedNormalizations {
  CachedNormalized: NormalizedColumn[];
  CachedRejectedCount: number;
  CachedTablesCount: number;
  DirtyInputs: TableNormalizationInput[];
  CachedEmbeddings: Map<string, CachedEmbeddingEntry>;
  RejectedCountByTable: Map<string, number>;
}

export interface CachedEmbeddingEntry {
  ProviderKey: string;
  EmbeddingText: string;
  Vector: Float32Array;
}

export interface EmbedWithCacheResult {
  Embeddings: Float32Array[];
  ReusedCount: number;
  ComputedCount: number;
}

/** Deterministic SHA-256 fingerprint of all inputs seen by `TableNormalizer.NormalizeTable`. */
export function ComputeTableNormalizationFingerprint(input: TableNormalizationInput): string {
  const canonical = {
    schema: input.schema,
    schemaDesc: input.SchemaDescription ?? '',
    table: input.table,
    tableDesc: input.TableDescription ?? '',
    columns: input.columns.map((c) => ({
      col: c.Column,
      type: c.dataType,
      desc: c.OriginalDescription,
      samples: c.SampleValues.slice(0, 5),
      fk: c.ParticipatesInFK,
      fkTarget: c.FkTarget ? `${c.FkTarget.schema}.${c.FkTarget.table}.${c.FkTarget.column}` : null,
      pk: c.isPrimaryKey,
    })),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/** Split `tableInputs` into cache hits (0 LLM calls) and dirty tables requiring normalization. */
export function PartitionTableNormalizations(
  tableInputs: TableNormalizationInput[],
  priorCache?: Record<string, CachedTableNormalization>,
): PartitionedNormalizations {
  const result: PartitionedNormalizations = {
    CachedNormalized: [],
    CachedRejectedCount: 0,
    CachedTablesCount: 0,
    DirtyInputs: [],
    CachedEmbeddings: new Map(),
    RejectedCountByTable: new Map(),
  };
  if (!priorCache) {
    result.DirtyInputs.push(...tableInputs);
    return result;
  }

  const lowerCache = new Map<string, CachedTableNormalization>(
    Object.entries(priorCache).map(([k, v]) => [k.toLowerCase(), v]),
  );

  for (const input of tableInputs) {
    const key = `${input.schema}.${input.table}`;
    const fingerprint = ComputeTableNormalizationFingerprint(input);
    const hit = lowerCache.get(key.toLowerCase());
    if (hit && hit.Fingerprint === fingerprint) {
      hydrateCachedTable(input.schema, input.table, hit, result);
    } else {
      result.DirtyInputs.push(input);
    }
  }
  return result;
}

function hydrateCachedTable(
  schemaName: string,
  tableName: string,
  hit: CachedTableNormalization,
  out: PartitionedNormalizations,
): void {
  out.CachedTablesCount++;
  out.CachedRejectedCount += hit.RejectedCount;
  out.RejectedCountByTable.set(`${schemaName}.${tableName}`.toLowerCase(), hit.RejectedCount);

  for (const col of hit.NormalizedColumns) {
    out.CachedNormalized.push(fromCachedColumn(schemaName, tableName, col));
    if (col.Embedding && col.EmbeddingProviderKey && col.EmbeddingText) {
      const colKey = `${schemaName}.${tableName}.${col.Column}`.toLowerCase();
      out.CachedEmbeddings.set(colKey, {
        ProviderKey: col.EmbeddingProviderKey,
        EmbeddingText: col.EmbeddingText,
        Vector: Float32Array.from(col.Embedding),
      });
    }
  }
}

/** Embed `texts` while reusing cached vectors whose provider/model and input text still match. */
export async function EmbedNormalizedColumnsWithCache(
  columns: NormalizedColumn[],
  texts: string[],
  providerKey: string,
  embedFn: (batchTexts: string[]) => Promise<Float32Array[]>,
  cachedEmbeddings: Map<string, CachedEmbeddingEntry>,
): Promise<EmbedWithCacheResult> {
  const vectors = new Array<Float32Array>(columns.length);
  const missingIndices: number[] = [];
  const missingTexts: string[] = [];
  let reused = 0;

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const colKey = `${col.schema}.${col.table}.${col.Column}`.toLowerCase();
    const cached = cachedEmbeddings.get(colKey);
    if (cached && cached.ProviderKey === providerKey && cached.EmbeddingText === texts[i]) {
      vectors[i] = cached.Vector;
      reused++;
    } else {
      missingIndices.push(i);
      missingTexts.push(texts[i]);
    }
  }

  if (missingTexts.length > 0) {
    const freshVectors = await embedFn(missingTexts);
    for (let j = 0; j < missingIndices.length; j++) {
      vectors[missingIndices[j]] = freshVectors[j];
    }
  }
  return { Embeddings: vectors, ReusedCount: reused, ComputedCount: missingTexts.length };
}

/** Build the updated per-table cache record after normalization and embedding finish. */
export function BuildUpdatedNormalizationCache(
  tableInputs: TableNormalizationInput[],
  normalizedColumns: NormalizedColumn[],
  texts: string[],
  embeddings: Float32Array[],
  providerKey: string,
  rejectedCountByTable: Map<string, number>,
  skippedLowerTables: Set<string>,
  priorCache?: Record<string, CachedTableNormalization>,
): Record<string, CachedTableNormalization> {
  const byTable = groupIndexedColumnsByTable(normalizedColumns, texts, embeddings, providerKey);
  const now = new Date().toISOString();
  const updated: Record<string, CachedTableNormalization> = {};

  for (const input of tableInputs) {
    const key = `${input.schema}.${input.table}`;
    const lowerKey = key.toLowerCase();
    if (skippedLowerTables.has(lowerKey)) {
      const prior = findPriorEntry(priorCache, lowerKey);
      if (prior) updated[key] = prior;
      continue;
    }
    updated[key] = {
      SchemaName: input.schema,
      TableName: input.table,
      Fingerprint: ComputeTableNormalizationFingerprint(input),
      NormalizedColumns: byTable.get(lowerKey) ?? [],
      RejectedCount: rejectedCountByTable.get(lowerKey) ?? 0,
      UpdatedAt: now,
    };
  }
  return updated;
}

function groupIndexedColumnsByTable(
  columns: NormalizedColumn[],
  texts: string[],
  embeddings: Float32Array[],
  providerKey: string,
): Map<string, CachedNormalizedColumn[]> {
  const byTable = new Map<string, CachedNormalizedColumn[]>();
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const lowerTable = `${col.schema}.${col.table}`.toLowerCase();
    const list = byTable.get(lowerTable) ?? [];
    list.push(toCachedColumn(col, providerKey, texts[i], embeddings[i]));
    byTable.set(lowerTable, list);
  }
  return byTable;
}

function toCachedColumn(
  col: NormalizedColumn,
  providerKey: string,
  embeddingText: string | undefined,
  embedding: Float32Array | undefined,
): CachedNormalizedColumn {
  return {
    Column: col.Column,
    DataType: col.dataType,
    OriginalDescription: col.OriginalDescription,
    SampleValues: [...col.SampleValues],
    ParticipatesInFK: col.ParticipatesInFK,
    FkTarget: col.FkTarget
      ? { Schema: col.FkTarget.schema, Table: col.FkTarget.table, Column: col.FkTarget.column }
      : null,
    IsPrimaryKey: col.isPrimaryKey,
    ConceptName: col.ConceptName,
    NormalizationStrategy: col.NormalizationStrategy,
    CustomNormalizationExpression: col.CustomNormalizationExpression,
    NormalizedDescription: col.NormalizedDescription,
    IsUsefulOrganicKey: col.IsUsefulOrganicKey,
    Confidence: col.confidence,
    Reasoning: col.reasoning,
    EmbeddingProviderKey: embedding ? providerKey : undefined,
    EmbeddingText: embedding ? embeddingText : undefined,
    Embedding: embedding ? Array.from(embedding) : undefined,
  };
}

function fromCachedColumn(schema: string, table: string, cached: CachedNormalizedColumn): NormalizedColumn {
  return {
    schema,
    table,
    Column: cached.Column,
    dataType: cached.DataType,
    OriginalDescription: cached.OriginalDescription,
    SampleValues: [...cached.SampleValues],
    ParticipatesInFK: cached.ParticipatesInFK,
    FkTarget: cached.FkTarget
      ? { schema: cached.FkTarget.Schema, table: cached.FkTarget.Table, column: cached.FkTarget.Column }
      : null,
    isPrimaryKey: cached.IsPrimaryKey,
    ConceptName: cached.ConceptName,
    NormalizationStrategy: cached.NormalizationStrategy,
    CustomNormalizationExpression: cached.CustomNormalizationExpression,
    NormalizedDescription: cached.NormalizedDescription,
    IsUsefulOrganicKey: cached.IsUsefulOrganicKey,
    confidence: cached.Confidence,
    reasoning: cached.Reasoning,
  };
}

function findPriorEntry(
  priorCache: Record<string, CachedTableNormalization> | undefined,
  lowerKey: string,
): CachedTableNormalization | undefined {
  if (!priorCache) return undefined;
  for (const [k, v] of Object.entries(priorCache)) {
    if (k.toLowerCase() === lowerKey) return v;
  }
  return undefined;
}
