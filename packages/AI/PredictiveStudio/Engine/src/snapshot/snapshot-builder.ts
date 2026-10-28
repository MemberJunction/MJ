/**
 * @module snapshot/snapshot-builder
 *
 * Builds the immutable Training Snapshot a model is trained on: its content (matrix, row manifest and per-value
 * provenance), the three files, the fingerprint, and the `MJ: Training Snapshots` row with every count the gates
 * read. Identical content resolves to one snapshot: the content hash is unique, so a build whose hash already exists
 * reuses that snapshot instead of writing another.
 */
import { randomUUID } from 'node:crypto';
import type { UserInfo } from '@memberjunction/core';
import { OrdinalCompare } from '@memberjunction/global';
import type { MJTrainingSnapshotEntity } from '@memberjunction/core-entities';
import {
  IncumbentExpressions, TaskTypeRules, LABEL_COLUMN, INCUMBENT_SCORE_COLUMN, SLICE_COLUMN_PREFIX, SNAPSHOT_MATRIX_FORMAT,
  type ClassBalanceEntry, type FeatureColumnSpec, type PredictionUnitSpec, type SnapshotCell, type SnapshotFeatureColumn,
  type SnapshotFeatureColumnHeader, type SnapshotMatrixHeader, type SnapshotRowKey, type SnapshotRowRole,
} from '@memberjunction/predictive-studio-core';
import { TrainingRefusedError } from '../training/training-refusal';
import { AsOfFeatureAssembler, type AsOfAssembledMatrix } from '../feature-assembly/as-of/as-of-assembler';
import type { UnitRow } from '../prediction-unit/unit-row-reader';
import { UtcDay } from '../prediction-unit/utc-day';
import type { IEntityFactory } from '../training/types';
import type { UnitRowsRead } from '../training/training-engine';
import { SnapshotHash } from './snapshot-hash';
import { CodeVersionInfo } from './code-version';
import { SnapshotFiles, type SnapshotContent, type SnapshotFileBytes } from './snapshot-serialization';
import type { ISnapshotFileStore, StoredSnapshotFile } from './snapshot-file-store';

/** Everything a snapshot is built from: the unit read, the assembled matrix, the row roles and where to write. */
export interface SnapshotBuildInput {
  readonly PipelineID: string;
  readonly FeatureSpecVersion: number;
  readonly Unit: PredictionUnitSpec;
  readonly UnitRead: UnitRowsRead;
  readonly Features: readonly FeatureColumnSpec[];
  readonly Assembled: AsOfAssembledMatrix;
  readonly Roles: ReadonlyMap<string, SnapshotRowRole>;
  readonly EvaluationProtocolID: string | null;
  /** Write the incumbent-score column (the bound protocol declares an `incumbent-heuristic` baseline). */
  readonly IncumbentScore: boolean;
  /** The protocol's slice subgroup fields, written as `__ps_slice:<field>` columns (empty when the protocol declares none). */
  readonly SliceFields: readonly string[];
  readonly Files: ISnapshotFileStore;
  readonly EntityFactory: IEntityFactory;
  readonly ContextUser?: UserInfo;
  /** The saved snapshot with this content hash, or null when there is none. */
  readonly ExistingByContentHash: (contentHash: string) => Promise<MJTrainingSnapshotEntity | null>;
}

/** A built snapshot: its row, its content, and whether an existing snapshot with the same content was reused. */
export interface BuiltSnapshot {
  readonly Entity: MJTrainingSnapshotEntity;
  readonly Content: SnapshotContent;
  readonly Reused: boolean;
}

/** The three stored snapshot files. */
export interface StoredSnapshotFiles {
  readonly Matrix: StoredSnapshotFile;
  readonly Manifest: StoredSnapshotFile;
  readonly Provenance: StoredSnapshotFile;
}

/** The snapshot's fingerprint: its content hash and the feature schema it was computed over. */
export interface SnapshotHashes {
  readonly ContentHash: string;
  readonly FeatureSchemaHash: string;
  readonly SchemaColumns: readonly SnapshotFeatureColumn[];
}

/** The outcome of saving the snapshot row: the saved row, or the failed Save's CompleteMessage. */
export type SnapshotRowSave =
  | { readonly Status: 'saved'; readonly Entity: MJTrainingSnapshotEntity }
  | { readonly Status: 'failed'; readonly Error: string };

/** A column appended after the label: its name and the cell of assembled row i. */
interface ExtraColumn {
  readonly Name: string;
  readonly Cell: (i: number) => SnapshotCell;
}

/** The appended columns: their names, and the cells of assembled row i in the same order. */
interface ExtraColumns {
  readonly Names: readonly string[];
  readonly Cells: (i: number) => SnapshotCell[];
}

/** The value a slice column writes for a missing, null or empty value. */
const MISSING_SLICE_VALUE = '(missing)';

/** Builds Training Snapshots; stateless, construct once and reuse. */
export class TrainingSnapshotBuilder {
  /** Content → files → fingerprint; reuses an existing snapshot with the same content hash, else writes files and row. */
  public async Build(input: SnapshotBuildInput): Promise<BuiltSnapshot> {
    const content = this.BuildContent(input);
    const files = SnapshotFiles.SerializeSnapshotFiles(content);
    const hashes = this.Fingerprint(input, files);
    const existing = await input.ExistingByContentHash(hashes.ContentHash);
    if (existing) return { Entity: existing, Content: content, Reused: true };
    const stored = await this.WriteFiles(input.Files, hashes.ContentHash, files);
    const saved = await this.SaveSnapshotRow(input, content, stored, hashes);
    if (saved.Status === 'saved') return { Entity: saved.Entity, Content: content, Reused: false };
    return { Entity: await this.SnapshotSavedFirst(input, hashes.ContentHash, saved.Error), Content: content, Reused: true };
  }

  /** The snapshot content: header, matrix rows (+ incumbent/slice cells), manifest in matrix order, provenance. */
  protected BuildContent(input: SnapshotBuildInput): SnapshotContent {
    const unitRows = new Map(input.UnitRead.Rows.map((r) => [r.RowId, r]));
    const labels = new Map(input.UnitRead.Rows.map((r) => [r.RowId, r.Label]));
    const shaped = AsOfFeatureAssembler.ToFeatureAssemblyResult(input.Assembled, labels, LABEL_COLUMN);
    const extra = this.extraColumns(input, unitRows);
    const header: SnapshotMatrixHeader = {
      format: SNAPSHOT_MATRIX_FORMAT,
      columns: [...shaped.matrix.columns, ...extra.Names],
      labelColumn: LABEL_COLUMN,
      featureColumns: this.featureColumns(input),
      incumbentScoreColumn: input.IncumbentScore ? INCUMBENT_SCORE_COLUMN : null,
      referenceScoreColumn: null,
      sliceColumns: Object.fromEntries(input.SliceFields.map((f) => [f, `${SLICE_COLUMN_PREFIX}${f}`])),
      decision: input.Unit.decision,
      featureSchema: shaped.featureSchema,
      preprocessing: shaped.preprocessing,
    };
    return {
      Header: header,
      Rows: shaped.matrix.rows.map((r, i) => [...r, ...extra.Cells(i)]),
      Manifest: input.Assembled.Rows.map((a) => this.manifestLine(input, unitRows, a.RowId)),
      Provenance: input.Assembled.Rows.map((a) => ({ rowId: a.RowId, values: a.Provenance })),
    };
  }

  /**
   * The content hash and the feature schema it covers. The provenance file is not an input (it records when each
   * value was computed, so identical data would otherwise hash differently on every assembly); its own hash is
   * stored on the row and verified when the files are read back.
   */
  protected Fingerprint(input: SnapshotBuildInput, files: SnapshotFileBytes): SnapshotHashes {
    const schemaColumns = input.Assembled.Columns.map((c) => ({ name: c.Name, encoding: c.Encoding, sourceColumn: c.SourceColumn }));
    const featureSchemaHash = SnapshotFiles.ComputeFeatureSchemaHash(schemaColumns);
    const contentHash = SnapshotFiles.ComputeSnapshotContentHash({
      MatrixSha256: SnapshotHash.Sha256Hex(files.Matrix),
      RowManifestSha256: SnapshotHash.Sha256Hex(files.Manifest),
      FeatureSchemaHash: featureSchemaHash,
      PredictionUnitID: input.Unit.id,
      LabelVersion: input.Unit.label.labelVersion,
      FeatureSpecVersion: input.FeatureSpecVersion,
      EvaluationProtocolID: input.EvaluationProtocolID,
      DataCutoff: input.UnitRead.Counts.dataCutoff,
    });
    return { ContentHash: contentHash, FeatureSchemaHash: featureSchemaHash, SchemaColumns: schemaColumns };
  }

  /**
   * The three write-once files, uploaded in parallel (independent objects). They sit under the content-hash prefix
   * plus a segment unique to this build, so a build that fails after writing (or loses the content-hash race) never
   * blocks a later build of the same content from writing its own files.
   */
  protected async WriteFiles(store: ISnapshotFileStore, contentHash: string, files: SnapshotFileBytes): Promise<StoredSnapshotFiles> {
    const prefix = `predictive-studio/training-snapshots/${contentHash}/${randomUUID()}`;
    const short = contentHash.slice(0, 12);
    const [matrix, manifest, provenance] = await Promise.all([
      store.Put(`${prefix}/matrix.jsonl`, `snapshot-${short}-matrix.jsonl`, files.Matrix, 'application/x-ndjson'),
      store.Put(`${prefix}/manifest.jsonl`, `snapshot-${short}-manifest.jsonl`, files.Manifest, 'application/x-ndjson'),
      store.Put(`${prefix}/provenance.jsonl`, `snapshot-${short}-provenance.jsonl`, files.Provenance, 'application/x-ndjson'),
    ]);
    return { Matrix: matrix, Manifest: manifest, Provenance: provenance };
  }

  /** The `MJ: Training Snapshots` row with every count the gates read, or the failed Save's CompleteMessage. */
  protected async SaveSnapshotRow(input: SnapshotBuildInput, content: SnapshotContent, stored: StoredSnapshotFiles, hashes: SnapshotHashes): Promise<SnapshotRowSave> {
    const s = await input.EntityFactory.getEntityObject<MJTrainingSnapshotEntity>('MJ: Training Snapshots', input.ContextUser);
    s.ContentHash = hashes.ContentHash;
    s.PipelineID = input.PipelineID;
    s.PredictionUnitID = input.Unit.id;
    s.LabelVersion = input.Unit.label.labelVersion;
    s.FeatureSpecVersion = input.FeatureSpecVersion;
    s.EvaluationProtocolID = input.EvaluationProtocolID;
    s.StorageProviderID = await input.Files.ProviderID();
    TrainingSnapshotBuilder.setFiles(s, stored);
    s.ManifestRowCount = content.Manifest.length;
    s.HoldoutRowCount = content.Manifest.filter((m) => m.role === 'locked-holdout').length;
    s.FeatureSpec = JSON.stringify(input.Features);
    s.FeatureSchema = JSON.stringify(hashes.SchemaColumns);
    s.FeatureSchemaHash = hashes.FeatureSchemaHash;
    s.ColumnProvenance = JSON.stringify(input.Assembled.ColumnProvenance);
    s.PinnedFeatureVersions = JSON.stringify(input.Features.flatMap((f) => (f.source.kind === 'feature-value' && f.source.pin ? [f.source.pin] : [])));
    TrainingSnapshotBuilder.setCounts(s, input);
    s.ClassBalance = TaskTypeRules.IsClassificationTask(input.Unit.label.outcome) ? JSON.stringify(TrainingSnapshotBuilder.classBalance(input)) : null;
    s.DataCutoff = new Date(`${input.UnitRead.Counts.dataCutoff}T00:00:00Z`);
    s.AssemblyCodeVersion = CodeVersionInfo.AssemblyCodeVersion();
    if (await s.Save()) return { Status: 'saved', Entity: s };
    return { Status: 'failed', Error: s.LatestResult?.CompleteMessage || 'unknown error' };
  }

  /**
   * The snapshot another build saved with the same content hash while this one was writing. A failed save is
   * resolved by re-reading rather than by reading the error text: when a snapshot with this hash now exists, the
   * unique content hash is what refused this row, and that snapshot is the one identical content resolves to. When
   * none exists, the save failed for another reason and that reason is thrown.
   */
  protected async SnapshotSavedFirst(input: SnapshotBuildInput, contentHash: string, saveError: string): Promise<MJTrainingSnapshotEntity> {
    const existing = await input.ExistingByContentHash(contentHash);
    if (existing) return existing;
    throw new Error(`Saving the Training Snapshot failed: ${saveError}`);
  }

  /** One manifest line: the unit row's keys and dates, and the role the carver assigned. */
  private manifestLine(input: SnapshotBuildInput, unitRows: ReadonlyMap<string, UnitRow>, rowId: string): SnapshotRowKey {
    const u = unitRows.get(rowId);
    if (!u) throw new Error(`Snapshot: assembled row ${rowId} is not a unit row`);
    return {
      rowId: u.RowId, entityKey: u.EntityKey, decisionDate: UtcDay.UtcDayIso(u.DecisionDate), groupKey: u.GroupKey,
      period: u.Period ? UtcDay.UtcDayIso(u.Period) : null, role: input.Roles.get(rowId) || 'development',
    };
  }

  /** Each matrix feature column with its source column and the full encoding of the feature it came from. */
  private featureColumns(input: SnapshotBuildInput): SnapshotFeatureColumnHeader[] {
    const byFeature = new Map(input.Features.map((f) => [f.name, f.encoding]));
    return input.Assembled.Columns.map((c) => {
      const encoding = byFeature.get(c.FeatureName);
      if (encoding === undefined) throw new Error(`Snapshot: assembled column ${c.Name} has no feature spec ${c.FeatureName}`);
      return { name: c.Name, sourceColumn: c.SourceColumn, encoding };
    });
  }

  /** The incumbent-score and slice columns: names and the cells of assembled row i. */
  private extraColumns(input: SnapshotBuildInput, unitRows: ReadonlyMap<string, UnitRow>): ExtraColumns {
    const position = new Map(input.Assembled.Columns.map((c, k) => [c.Name, k]));
    const columns = [
      ...(input.IncumbentScore ? [this.incumbentColumn(input, position)] : []),
      ...input.SliceFields.map((field) => this.sliceColumn(input, position, unitRows, field)),
    ];
    return { Names: columns.map((c) => c.Name), Cells: (i) => columns.map((c) => c.Cell(i)) };
  }

  /** `__ps_incumbent_score`: the unit's rule evaluated per row; a unit without a rule, or a rule naming an unassembled column, is refused. */
  private incumbentColumn(input: SnapshotBuildInput, position: ReadonlyMap<string, number>): ExtraColumn {
    const rule = input.Unit.incumbent;
    if (rule.kind !== 'rule') return TrainingSnapshotBuilder.refuseColumn(input, 'IncumbentHeuristic');
    const parsed = IncumbentExpressions.ParseIncumbentExpression(rule.scoreExpression);
    if (parsed.Ok === false) return TrainingSnapshotBuilder.refuseColumn(input, `IncumbentHeuristic.scoreExpression: ${parsed.Errors.join('; ')}`);
    const expression = parsed.Value;
    for (const column of IncumbentExpressions.IncumbentExpressionColumns(expression)) {
      if (!position.has(column)) TrainingSnapshotBuilder.refuseColumn(input, column);
    }
    const numberAt = (i: number, column: string): number | null => {
      const k = position.get(column);
      const v = k === undefined ? null : input.Assembled.Rows[i]?.Values[k];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    };
    return { Name: INCUMBENT_SCORE_COLUMN, Cell: (i) => IncumbentExpressions.EvaluateIncumbentExpression(expression, (column) => numberAt(i, column)) };
  }

  /**
   * `__ps_slice:<field>`: the field's value as a string, from the assembled column of that name, else from the unit
   * row's own field. A field that is neither an assembled column nor a field of every unit row is refused.
   */
  private sliceColumn(input: SnapshotBuildInput, position: ReadonlyMap<string, number>, unitRows: ReadonlyMap<string, UnitRow>, field: string): ExtraColumn {
    const k = position.get(field);
    if (k === undefined && input.Assembled.Rows.some((a) => !(field in (unitRows.get(a.RowId)?.Source || {})))) {
      TrainingSnapshotBuilder.refuseColumn(input, field);
    }
    return {
      Name: `${SLICE_COLUMN_PREFIX}${field}`,
      Cell: (i) => {
        const row = input.Assembled.Rows[i];
        const raw = k !== undefined ? row?.Values[k] : row ? unitRows.get(row.RowId)?.Source[field] : undefined;
        if (raw === null || raw === undefined || raw === '') return MISSING_SLICE_VALUE;
        return raw instanceof Date ? UtcDay.UtcDayIso(raw) : String(raw);
      },
    };
  }

  /** The three files' IDs, hashes and sizes on the snapshot row. */
  private static setFiles(s: MJTrainingSnapshotEntity, stored: StoredSnapshotFiles): void {
    s.MatrixFileID = stored.Matrix.FileID;
    s.MatrixSha256 = stored.Matrix.Sha256;
    s.MatrixSizeBytes = stored.Matrix.SizeBytes;
    s.RowManifestFileID = stored.Manifest.FileID;
    s.RowManifestSha256 = stored.Manifest.Sha256;
    s.RowManifestSizeBytes = stored.Manifest.SizeBytes;
    s.ProvenanceFileID = stored.Provenance.FileID;
    s.ProvenanceSha256 = stored.Provenance.Sha256;
    s.ProvenanceSizeBytes = stored.Provenance.SizeBytes;
  }

  /** The unit read's resolution counts and the assembly's uncovered-row counts. A snapshot exists only for a complete read. */
  private static setCounts(s: MJTrainingSnapshotEntity, input: SnapshotBuildInput): void {
    const counts = input.UnitRead.Counts;
    s.RowsRead = counts.rowsRead;
    s.ReadComplete = true;
    s.CensoredRowsExcluded = counts.censoredRowsExcluded;
    s.LabelKnownRowsExcluded = counts.labelKnownRowsExcluded;
    s.EmptyLabelRowsExcluded = counts.emptyLabelRowsExcluded;
    s.UncoveredHistoryRowsExcluded = JSON.stringify(input.Assembled.UncoveredRowsExcluded);
    s.DuplicateRowsRemoved = counts.duplicateRowsRemoved;
  }

  private static refuseColumn(input: SnapshotBuildInput, field: string): never {
    throw new TrainingRefusedError({ stage: 'assembly', reason: { kind: 'unresolved-column', entity: input.Unit.name, field } });
  }

  /** Rows per label over the snapshot's rows (those the carver assigned a role), in ordinal label order. */
  private static classBalance(input: SnapshotBuildInput): ClassBalanceEntry[] {
    const m = new Map<string, number>();
    for (const r of input.UnitRead.Rows) {
      if (!input.Roles.has(r.RowId)) continue;
      const label = String(r.Label);
      m.set(label, (m.get(label) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => OrdinalCompare(a[0], b[0])).map(([label, rows]) => ({ label, rows }));
  }
}
