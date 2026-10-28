import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type { BaseEntity, IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJFileStorageProviderEntity, MJTrainingSnapshotEntity } from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';
import type { FeatureColumnSpec, PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { TrainingSnapshotBuilder, type SnapshotBuildInput } from '../snapshot-builder';
import { InMemorySnapshotFileStore, StorageProviderSnapshotFileStore } from '../snapshot-file-store';
import { TrailingFractionCarver } from '../holdout-carver';
import { SnapshotHash } from '../snapshot-hash';
import { SnapshotFiles } from '../snapshot-serialization';
import type { IEntityFactory } from '../../training/types';
import type { UnitRowsRead } from '../../training/training-engine';
import type { AsOfAssembledMatrix } from '../../feature-assembly/as-of/as-of-assembler';
import type { UnitRow } from '../../prediction-unit/unit-row-reader';

// ---------------------------------------------------------------------------
// Fixtures: a three-row unit read (five rows read, two censored), one numeric feature, its assembled matrix.
// ---------------------------------------------------------------------------

const UNIT_ID = '6f2c1a9e-4b7d-4e21-9a3c-0d5e8f1b2c34';

const unit: PredictionUnitSpec = {
  id: UNIT_ID, lineageRootId: UNIT_ID, version: 1, name: 'yearly renewal unit',
  rows: { kind: 'grain', grainEntity: 'Years', decisionDate: { kind: 'column', column: 'DecisionDate' }, filter: [] },
  label: { rule: { kind: 'column', column: 'Renewed' }, windowDays: 365, gapDays: 0, outcome: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 }, labelVersion: 1 },
  censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-01-01' } },
  history: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' },
  groupKey: null, temporal: null,
  decision: { action: 'outreach', actorRole: 'team', capacityPerPeriod: null, period: 'year' },
  incumbent: { kind: 'none' }, authoredBy: { kind: 'human', userId: 'U' },
};

const features: FeatureColumnSpec[] = [{
  name: 'PriorVisits',
  source: { kind: 'immutable-field', entity: 'Years', field: 'PriorVisits', keyField: null },
  encoding: { kind: 'numeric', nonNumericValue: 'fail' },
  missing: { impute: 'median', indicator: true, constant: null },
}];

const day = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const unitRow = (id: string, decided: string, label: string, visits: number): UnitRow => ({
  RowId: id, EntityKey: `Y-${id}`, DecisionDate: day(decided), WindowEnd: day(decided), GroupKey: null, Period: null,
  Label: label, Source: { ID: `Y-${id}`, PriorVisits: visits, Region: 'North' },
});

const unitRead: UnitRowsRead = {
  Status: 'read',
  Rows: [unitRow('r1', '2024-01-01', '1', 1), unitRow('r2', '2024-06-01', '0', 2), unitRow('r3', '2025-01-01', '1', 3)],
  Counts: { rowsRead: 5, censoredRowsExcluded: 2, labelKnownRowsExcluded: 0, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 3, dataCutoff: '2026-01-01' },
  DataCutoff: day('2026-01-01'),
  RowEntity: { ID: 'E-YEARS', Name: 'Years', PrimaryKey: 'ID', TrackRecordChanges: false, Fields: [] },
};

const assembled: AsOfAssembledMatrix = {
  Status: 'assembled',
  Columns: [{ Name: 'PriorVisits', Encoding: 'numeric', SourceColumn: 'Years.PriorVisits', FeatureName: 'PriorVisits' }],
  Rows: unitRead.Rows.map((r, i) => ({
    RowId: r.RowId,
    Values: [i + 1],
    Provenance: [{ column: 'PriorVisits', source: 'immutable-field', sourceRef: `Years:${r.EntityKey}`, sourceVersion: 'immutable-after-create', computedAt: '2026-10-27T00:00:00.000Z' }],
  })),
  ExcludedRowIds: new Set<string>(),
  UncoveredRowsExcluded: [],
  Coverage: [],
  Preprocessing: [{ op: 'impute', col: 'PriorVisits', strategy: 'median', indicator: true }],
  ColumnProvenance: [{ column: 'PriorVisits', source: 'immutable-field', sourceRef: 'Years.PriorVisits', sourceVersion: 'immutable-after-create' }],
  CategoryLevels: new Map<string, readonly string[]>(),
};

const rowsById: ReadonlyMap<string, UnitRow> = new Map(unitRead.Rows.map((r) => [r.RowId, r]));

// ---------------------------------------------------------------------------
// Entity fakes: every snapshot column as a public field, Save() that can be told to fail once.
// ---------------------------------------------------------------------------

interface FakeSaveResult { CompleteMessage: string }

class FakeSnapshotEntity {
  public ID = '';
  public ContentHash = '';
  public PipelineID = '';
  public PredictionUnitID = '';
  public LabelVersion = 0;
  public FeatureSpecVersion = 0;
  public EvaluationProtocolID: string | null = null;
  public StorageProviderID = '';
  public MatrixFileID = '';
  public MatrixSha256 = '';
  public MatrixSizeBytes = 0;
  public RowManifestFileID = '';
  public RowManifestSha256 = '';
  public RowManifestSizeBytes = 0;
  public ProvenanceFileID = '';
  public ProvenanceSha256 = '';
  public ProvenanceSizeBytes = 0;
  public ManifestRowCount = 0;
  public HoldoutRowCount = 0;
  public FeatureSpec = '';
  public FeatureSchema = '';
  public FeatureSchemaHash = '';
  public ColumnProvenance = '';
  public PinnedFeatureVersions = '';
  public RowsRead = 0;
  public ReadComplete = false;
  public CensoredRowsExcluded = 0;
  public LabelKnownRowsExcluded = 0;
  public EmptyLabelRowsExcluded = 0;
  public UncoveredHistoryRowsExcluded = '';
  public DuplicateRowsRemoved = 0;
  public ClassBalance: string | null = null;
  public DataCutoff = new Date(0);
  public AssemblyCodeVersion = '';
  public LatestResult: FakeSaveResult | null = null;
  constructor(private readonly saveFailure: string | null) {}
  public async Save(): Promise<boolean> {
    if (this.saveFailure !== null) {
      this.LatestResult = { CompleteMessage: this.saveFailure };
      return false;
    }
    this.ID = `snapshot-${this.ContentHash.slice(0, 8)}`;
    return true;
  }
}

class FakeFileEntity {
  public ID = '';
  public Name = '';
  public ContentType: string | null = null;
  public ProviderID = '';
  public ProviderKey: string | null = null;
  public Status = '';
  public Description: string | null = null;
  public LatestResult: FakeSaveResult | null = null;
  constructor(private readonly id: string) {}
  public async Save(): Promise<boolean> {
    this.ID = this.id;
    return true;
  }
}

/** Creates snapshot and file fakes; `snapshotSaveFailures` snapshot saves fail (with that message) before saves succeed. */
class FakeEntityFactory implements IEntityFactory {
  public readonly Snapshots: FakeSnapshotEntity[] = [];
  public readonly Files: FakeFileEntity[] = [];
  constructor(private snapshotSaveFailures = 0, private readonly failure = 'Violation of UNIQUE KEY constraint \'UQ_TrainingSnapshot_ContentHash\'') {}
  async getEntityObject<T extends BaseEntity>(entityName: string, _contextUser?: UserInfo): Promise<T> {
    if (entityName === 'MJ: Training Snapshots') {
      const failing = this.snapshotSaveFailures > 0;
      if (failing) this.snapshotSaveFailures -= 1;
      const s = new FakeSnapshotEntity(failing ? this.failure : null);
      this.Snapshots.push(s);
      return s as unknown as T;
    }
    if (entityName === 'MJ: Files') {
      const f = new FakeFileEntity(`file-${this.Files.length + 1}`);
      this.Files.push(f);
      return f as unknown as T;
    }
    throw new Error(`unexpected entity ${entityName}`);
  }
}

const roles = new TrailingFractionCarver(1 / 3).AssignRoles(assembled.Rows);
const input = (files: InMemorySnapshotFileStore, factory: IEntityFactory = new FakeEntityFactory()): SnapshotBuildInput => ({
  PipelineID: 'pipe', FeatureSpecVersion: 3, Unit: unit, UnitRead: unitRead, Features: features, Assembled: assembled, Roles: roles,
  EvaluationProtocolID: null, IncumbentScore: false, SliceFields: [], Files: files, EntityFactory: factory, ExistingByContentHash: async () => null,
});
const asSnapshot = (s: FakeSnapshotEntity): MJTrainingSnapshotEntity => s as unknown as MJTrainingSnapshotEntity;

describe('TrainingSnapshotBuilder', () => {
  it('writes three files, fingerprints them and stores the counts the gates read', async () => {
    const files = new InMemorySnapshotFileStore('provider-local');
    const factory = new FakeEntityFactory();
    const built = await new TrainingSnapshotBuilder().Build({ PipelineID: 'pipe', FeatureSpecVersion: 3, Unit: unit, UnitRead: unitRead, Features: features, Assembled: assembled, Roles: new TrailingFractionCarver(1 / 3).AssignRoles(assembled.Rows), EvaluationProtocolID: null, IncumbentScore: false, SliceFields: [], Files: files, EntityFactory: factory, ExistingByContentHash: async () => null });
    const s = built.Entity;
    expect(files.Saved.size).toBe(3);
    expect([s.ManifestRowCount, s.HoldoutRowCount, s.RowsRead, s.CensoredRowsExcluded, s.ReadComplete]).toEqual([3, 1, 5, 2, true]);
    const savedMatrix = files.Saved.get(s.MatrixFileID);
    const savedManifest = files.Saved.get(s.RowManifestFileID);
    const savedProvenance = files.Saved.get(s.ProvenanceFileID);
    expect(savedMatrix).toBeDefined();
    expect(s.MatrixSha256).toBe(SnapshotHash.Sha256Hex(savedMatrix?.Bytes ?? new Uint8Array()));
    expect(s.ProvenanceSha256).toBe(SnapshotHash.Sha256Hex(savedProvenance?.Bytes ?? new Uint8Array()));
    expect(s.ContentHash).toBe(SnapshotFiles.ComputeSnapshotContentHash({ MatrixSha256: s.MatrixSha256, RowManifestSha256: s.RowManifestSha256, FeatureSchemaHash: s.FeatureSchemaHash, PredictionUnitID: unit.id, LabelVersion: 1, FeatureSpecVersion: 3, EvaluationProtocolID: null, DataCutoff: unitRead.Counts.dataCutoff }));
    expect(built.Content.Manifest.map((m) => m.role)).toEqual(['development', 'development', 'locked-holdout']);
    expect(built.Content.Header.featureColumns.map((c) => c.encoding.kind)).toEqual(['numeric']);
    expect(built.Content.Header.incumbentScoreColumn).toBeNull();
    // The written files read back as the built content (the header passes its store schema).
    const parsed = SnapshotFiles.ParseSnapshotFiles(savedMatrix?.Bytes ?? new Uint8Array(), savedManifest?.Bytes ?? new Uint8Array(), savedProvenance?.Bytes ?? new Uint8Array());
    expect(parsed.Header).toEqual(built.Content.Header);
    expect(s.DataCutoff.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(s.ClassBalance).toBe(JSON.stringify([{ label: '0', rows: 1 }, { label: '1', rows: 2 }]));
  });

  it('writes the incumbent-score and slice columns when asked, and refuses an expression naming an unassembled column', async () => {
    const files = new InMemorySnapshotFileStore('provider-local');
    const ruled = { ...unit, incumbent: { kind: 'rule' as const, name: 'busy last year', scoreExpression: `${features[0].name} >= 2` } };
    const built = await new TrainingSnapshotBuilder().Build({ ...input(files), Unit: ruled, IncumbentScore: true, SliceFields: [features[0].name], ExistingByContentHash: async () => null });
    expect(built.Content.Header.columns.slice(-2)).toEqual(['__ps_incumbent_score', `__ps_slice:${features[0].name}`]);
    expect(built.Content.Rows.every((r) => r[r.length - 2] === 0 || r[r.length - 2] === 1 || r[r.length - 2] === null)).toBe(true);
    expect(built.Content.Rows.map((r) => r[r.length - 2])).toEqual([0, 1, 1]);
    const missing = { ...unit, incumbent: { kind: 'rule' as const, name: 'x', scoreExpression: 'NotAssembled >= 1' } };
    await expect(new TrainingSnapshotBuilder().Build({ ...input(new InMemorySnapshotFileStore('p')), Unit: missing, IncumbentScore: true, ExistingByContentHash: async () => null }))
      .rejects.toMatchObject({ Refusal: { stage: 'assembly', reason: { kind: 'unresolved-column', entity: unit.name, field: 'NotAssembled' } } });
    await expect(new TrainingSnapshotBuilder().Build({ ...input(new InMemorySnapshotFileStore('p')), IncumbentScore: true }))
      .rejects.toMatchObject({ Refusal: { stage: 'assembly', reason: { kind: 'unresolved-column', entity: unit.name, field: 'IncumbentHeuristic' } } });
  });

  it('reuses the existing snapshot when the content hash already exists (identical data, one snapshot)', async () => {
    const files = new InMemorySnapshotFileStore('provider-local');
    const first = await new TrainingSnapshotBuilder().Build({ ...input(files), ExistingByContentHash: async () => null });
    const second = await new TrainingSnapshotBuilder().Build({ ...input(files), ExistingByContentHash: async (h) => (h === first.Entity.ContentHash ? first.Entity : null) });
    expect(second.Reused).toBe(true);
    expect(files.Saved.size).toBe(3);
  });

  it('reuses the snapshot another build saved first when its own row loses the content-hash race, and throws when none exists', async () => {
    const winner = asSnapshot(new FakeSnapshotEntity(null));
    let lookups = 0;
    // The first lookup (before writing) finds nothing; the build's own save then fails on the unique content hash.
    const existing = async (): Promise<MJTrainingSnapshotEntity | null> => (lookups++ === 0 ? null : winner);
    const raced = await new TrainingSnapshotBuilder().Build({ ...input(new InMemorySnapshotFileStore('p'), new FakeEntityFactory(1)), ExistingByContentHash: existing });
    expect(raced.Reused).toBe(true);
    expect(raced.Entity).toBe(winner);
    expect(lookups).toBe(2);

    const failing = new FakeEntityFactory(1, 'PipelineID must reference an existing pipeline');
    await expect(new TrainingSnapshotBuilder().Build({ ...input(new InMemorySnapshotFileStore('p'), failing), ExistingByContentHash: async () => null }))
      .rejects.toThrow(/PipelineID must reference an existing pipeline/);
  });
});

describe('StorageProviderSnapshotFileStore', () => {
  let root = '';
  let savedRoot: string | undefined;
  const providerRow = { ID: 'BCC08E0E-F0A8-4703-A9C4-1F2A040786A2', Name: 'Local File System', ServerDriverKey: 'Local File System Storage', IsActive: false } as unknown as MJFileStorageProviderEntity;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ps-snapshot-store-'));
    savedRoot = process.env.STORAGE_LOCAL_ROOT;
    process.env.STORAGE_LOCAL_ROOT = root;
    vi.spyOn(FileStorageEngine.Instance, 'Config').mockResolvedValue();
    vi.spyOn(FileStorageEngine.Instance, 'Providers', 'get').mockReturnValue([providerRow]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (savedRoot === undefined) delete process.env.STORAGE_LOCAL_ROOT;
    else process.env.STORAGE_LOCAL_ROOT = savedRoot;
    rmSync(root, { recursive: true, force: true });
  });

  it('refuses a second write under one key (write-once) and an unsafe key, through the inactive provider selected by name', async () => {
    const factory = new FakeEntityFactory();
    const store = new StorageProviderSnapshotFileStore(factory, {} as IMetadataProvider, undefined, 'Local File System');
    const stored = await store.Put('predictive-studio/training-snapshots/abc/matrix.jsonl', 'matrix.jsonl', new TextEncoder().encode('first\n'), 'application/x-ndjson');
    expect(stored.ProviderID).toBe(providerRow.ID);
    expect(stored.Sha256).toBe(SnapshotHash.Sha256Hex('first\n'));
    expect(factory.Files.map((f) => [f.ProviderKey, f.Status])).toEqual([['predictive-studio/training-snapshots/abc/matrix.jsonl', 'Uploaded']]);
    await expect(store.Put('predictive-studio/training-snapshots/abc/matrix.jsonl', 'matrix.jsonl', new TextEncoder().encode('second\n'), 'application/x-ndjson'))
      .rejects.toThrow(/write-once/);
    await expect(store.Put('predictive-studio/../escape.jsonl', 'escape.jsonl', new TextEncoder().encode('x\n'), 'application/x-ndjson'))
      .rejects.toThrow(/not a safe storage key/);
    expect(factory.Files).toHaveLength(1);
  });
});
