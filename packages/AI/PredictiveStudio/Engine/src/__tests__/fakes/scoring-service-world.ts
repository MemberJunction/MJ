/**
 * `ScoringServiceWorld` — the scoring service's fake world (Task M5.5): the gate test store as the provider (bindings,
 * pipelines, models, scoring runs, Feature Values, the authorizations a user holds), a fake `Memberships` target entity
 * with decimal columns, and doubles for the service's seams: a stub sidecar that returns per-batch predictions (and can
 * fail one batch), a model runtime that records the as-of argument of each assembly, an in-memory Feature Value store
 * that records its `RecordModelValues` calls, and a challenger source.
 */
import { randomUUID } from 'node:crypto';
import { EntityInfo, UserInfo, UserRoleInfo, type IMetadataProvider, type RunViewParams } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import type { FeatureValueRecordRef, RecordHumanValueParams, RecordModelValuesOutcome, RecordModelValuesParams } from '@memberjunction/feature-pipelines';
import { UUIDSet, UUIDsEqual } from '@memberjunction/global';
import type { HumanValueQuestion } from '@memberjunction/record-set-processor';
import type { AssemblyRefusal, FeatureSchemaEntry, PredictionUnitSpec, PredictRequest, PredictResponse, ScoringRequest, ScoringScope, UnitRows } from '@memberjunction/predictive-studio-core';
import { resolveOutcomeConfig } from '@memberjunction/predictive-studio-core';
import { vi } from 'vitest';

import { InMemoryArtifactLoader } from '../../scoring/artifact-loader';
import { ScoringBindings } from '../../scoring/scoring-binding';
import type { ScoringContext } from '../../scoring/scoring-context';
import type { ChallengerSelection, IChallengerSource, IScoringModelRuntime, IScoringPreparedModel, ScoringAssembly, ScoringValueStore } from '../../scoring/scoring-seams';
import type { ISidecarPredictor, LoadedModel } from '../../scoring/types';
import { SnapshotFiles } from '../../snapshot/snapshot-serialization';
import { SnapshotHash } from '../../snapshot/snapshot-hash';
import { GateTestProvider, GateTestStore, type Cell, type Row } from './gate-test-store';

/** The run date of every test (the clock's day). */
export const RUN_DATE = new Date('2026-03-04T00:00:00Z');
/** Records per batch in the world. */
export const BATCH = 3;
/** The target entity. */
export const MEMBERSHIPS = 'Memberships';
export const MEMBERSHIPS_ID = 'E0000000-0000-4000-8000-0000000005E1';
/** The authorization every world binding is seen through; {@link ScoringServiceWorld.User} holds it. */
export const VIEW_AUTH_ID = 'A0000000-0000-4000-8000-0000000005A1';
/** The class order of every classification model: class 1 (`renewed`) is the scored class, class 0 the adverse one. */
const CLASS_ORDER = ['lapsed', 'renewed'];
const FEATURES: readonly FeatureSchemaEntry[] = [{ Name: 'Tenure', Kind: 'numeric' }, { Name: 'Visits', Kind: 'numeric' }];

const membershipsInfo = new EntityInfo({
  ID: MEMBERSHIPS_ID, Name: MEMBERSHIPS, SchemaName: 'dbo', BaseTable: 'Membership', BaseView: 'vwMemberships',
  EntityFields: [
    { ID: 'F0000000-0000-4000-8000-0000000005F1', EntityID: MEMBERSHIPS_ID, Name: 'ID', Type: 'nvarchar', IsPrimaryKey: true, Sequence: 1 },
    { ID: 'F0000000-0000-4000-8000-0000000005F2', EntityID: MEMBERSHIPS_ID, Name: 'Score', Type: 'decimal', Precision: 5, Scale: 4, Sequence: 2 },
    { ID: 'F0000000-0000-4000-8000-0000000005F3', EntityID: MEMBERSHIPS_ID, Name: 'RenewalProbability', Type: 'decimal', Precision: 5, Scale: 4, Sequence: 3 },
    { ID: 'F0000000-0000-4000-8000-0000000005F4', EntityID: MEMBERSHIPS_ID, Name: 'MinWeight', Type: 'decimal', Precision: 3, Scale: 2, Sequence: 4 },
  ],
});
const authorizationsInfo = new EntityInfo({ ID: 'E0000000-0000-4000-8000-0000000005E2', Name: 'MJ: Authorizations', SchemaName: '__mj', BaseTable: 'Authorization', BaseView: 'vwAuthorizations' });

/** The score the stub sidecar gives a record: 0.1000–0.8906, four decimals, from the record ID. Pure. */
export function ScoreOf(recordId: string): number {
  let sum = 0;
  for (const ch of recordId) sum += ch.charCodeAt(0);
  return Math.round((0.1 + (sum % 80) / 100 + (sum % 7) / 10_000) * 10_000) / 10_000;
}
/** A record's probability of `cls`. */
export function ProbabilityOf(recordId: string, cls: 'renewed' | 'lapsed'): number {
  const p = cls === 'renewed' ? ScoreOf(recordId) : 1 - ScoreOf(recordId);
  return Math.round(p * 10_000) / 10_000;   // as the decimal(5,4) column stores it
}
/** A record's adverse-class (`lapsed`) probability, as a decimal(5,4) column stores it. */
export function AdverseOf(recordId: string): number {
  return ProbabilityOf(recordId, 'lapsed');
}
/** A record's predicted class (`$.Value` of a classification). */
export function ValueOf(recordId: string): string {
  return ScoreOf(recordId) >= 0.5 ? 'renewed' : 'lapsed';
}
/** A record-ids scope over the target entity. */
export function Records(...ids: string[]): ScoringScope {
  return { kind: 'record-ids', entity: MEMBERSHIPS, ids };
}
/** Three full batches of records. */
export function ThreeBatches(): ScoringScope {
  return Records(...Array.from({ length: 3 * BATCH }, (_, i) => `m${i + 1}`));
}

/** One fake target record: its column values; a save writes them back to the table. */
class FakeMember {
  public LatestResult: { CompleteMessage: string } | null = null;
  constructor(private readonly table: TargetTable, private readonly values: Record<string, Cell>) {}
  public Get(field: string): Cell {
    return this.values[field] === undefined ? null : this.values[field];
  }
  public Set(field: string, value: Cell): void {
    this.values[field] = value;
  }
  public async Save(): Promise<boolean> {
    this.table.Writes++;
    this.table.Rows.set(String(this.values['ID']), { ...this.values });
    return true;
  }
}

/** The fake target table. */
export class TargetTable {
  public readonly Rows = new Map<string, Record<string, Cell>>();
  public Writes = 0;
  /** When set, a read reports this `TotalRowCount` (more rows matched than it returns: a short read). */
  public ReportedTotal: number | null = null;
  /** A person sets the record's `Score`. */
  public SetByPerson(recordId: string, value: number, column = 'Score'): void {
    this.Rows.set(recordId, { ...(this.Rows.get(recordId) || { ID: recordId }), [column]: value });
  }
  /** Each record's value of `column`. */
  public Values(column = 'Score'): Record<string, Cell> {
    return Object.fromEntries([...this.Rows].filter(([, row]) => row[column] !== undefined).map(([id, row]) => [id, row[column] === undefined ? null : row[column]]));
  }
  /** A RunView of the target: the records whose ID the `ID IN (…)` filter names (every scoped record exists, empty until written). */
  public View(params: RunViewParams): { Success: boolean; Results: object[]; TotalRowCount: number; ErrorMessage: string } {
    const ids = [...String(params.ExtraFilter).matchAll(/'([^']*)'/g)].map((m) => m[1]);
    const results = ids.map((id) => new FakeMember(this, { ...(this.Rows.get(id) || { ID: id }) }));
    return { Success: true, Results: results, TotalRowCount: this.ReportedTotal === null ? results.length : this.ReportedTotal, ErrorMessage: '' };
  }
}

/** The store's provider, describing and serving the target entity and describing `MJ: Authorizations`. */
export class ScoringTestProvider extends GateTestProvider {
  constructor(store: GateTestStore, target: TargetTable) {
    super(store);
    this.RunView = vi.fn().mockImplementation(async (params: RunViewParams, user?: UserInfo) => (params.EntityName === MEMBERSHIPS ? target.View(params) : store.RunViewRows(params, user)));
  }
  public override EntityByID(entityId: string): EntityInfo | undefined {
    return UUIDsEqual(entityId, MEMBERSHIPS_ID) ? membershipsInfo : undefined;
  }
  public override EntityByName(entityName: string): EntityInfo | undefined {
    if (entityName === MEMBERSHIPS) return membershipsInfo;
    if (entityName === 'MJ: Authorizations') return authorizationsInfo;
    return super.EntityByName(entityName);
  }
}

/** The in-memory Feature Value store: rows in the gate store's table, calls recorded. */
export class ValuesDouble implements ScoringValueStore {
  private readonly calls: RecordModelValuesParams[] = [];
  constructor(private readonly store: GateTestStore) {}
  /** Every `RecordModelValues` call. */
  public Calls(): RecordModelValuesParams[] {
    return [...this.calls];
  }
  /** Every read of `MJ: Feature Values`. */
  public Reads(): string[] {
    return this.store.Reads.filter((r) => r.startsWith('view MJ: Feature Values'));
  }
  /** The stored `Model` rows. */
  public Store(): Row[] {
    return this.rows().filter((r) => r['Source'] === 'Model');
  }
  /** A `Champion` `Model` row of the binding as of `day`, whose value resolves to `value` through any copy source. */
  public Seed(binding: Pick<MJMLModelScoringBindingEntity, 'ID'>, recordId: string, day: Date, value: number): void {
    this.store.Insert('MJ: Feature Values', {
      ID: `seed-${recordId}-${day.toISOString()}`, Source: 'Model', Role: 'Champion', MLModelScoringBindingID: binding.ID, EntityID: MEMBERSHIPS_ID,
      FeatureName: 'Renewal', RecordID: recordId, ValueNumeric: value, ValueText: 'lapsed', ValueJSON: JSON.stringify({ Probabilities: { lapsed: value, renewed: value } }),
      EffectiveAsOf: day, ComputedAt: day,
    });
  }
  /** A `Human` row of the binding's feature on the record, scoped by the Record Process or, without one, the binding. */
  public SeedHuman(binding: Pick<MJMLModelScoringBindingEntity, 'ID' | 'FeatureName'>, recordId: string, recordProcessId: string | null): void {
    this.store.Insert('MJ: Feature Values', {
      ID: `human-${recordId}-${recordProcessId || 'binding'}`, Source: 'Human', Role: 'Champion', EntityID: MEMBERSHIPS_ID, FeatureName: binding.FeatureName, RecordID: recordId,
      RecordProcessID: recordProcessId, MLModelScoringBindingID: recordProcessId === null ? binding.ID : null, ValueNumeric: 0.11,
    });
  }
  /** @inheritdoc writes into the store's table on the model-row key, replacing a row already on it. */
  public async RecordModelValues(p: RecordModelValuesParams): Promise<RecordModelValuesOutcome> {
    this.calls.push(p);
    const out: RecordModelValuesOutcome = { Inserted: 0, Replaced: 0 };
    for (const row of p.Rows) {
      const values: Row = {
        Source: 'Model', Role: p.Role, MLModelScoringBindingID: p.MLModelScoringBindingID, EntityID: p.EntityID, FeatureName: p.FeatureName, RecordID: row.RecordID,
        EffectiveAsOf: p.EffectiveAsOf, MLModelID: p.MLModelID, MLScoringRunID: p.MLScoringRunID, InTraining: row.InTraining, Confidence: row.Confidence,
        ValueNumeric: row.Value.ValueNumeric, ValueText: row.Value.ValueText, ValueJSON: row.Value.ValueJSON, ComputedAt: new Date(),
      };
      const table = (this.store.Tables['MJ: Feature Values'] ||= []);
      const at = table.findIndex((r) => r['Source'] === 'Model' && r['Role'] === p.Role && UUIDsEqual(String(r['MLModelScoringBindingID']), p.MLModelScoringBindingID)
        && String(r['RecordID']).toLowerCase() === row.RecordID.toLowerCase() && r['EffectiveAsOf'] instanceof Date && r['EffectiveAsOf'].getTime() === p.EffectiveAsOf.getTime());
      if (at >= 0) table[at] = { ...table[at], ...values };
      else table.push({ ID: `fv-${table.length + 1}-${row.RecordID}`, ...values });
      out[at >= 0 ? 'Replaced' : 'Inserted']++;
    }
    return out;
  }
  /** @inheritdoc */
  public async RecordHumanValue(p: RecordHumanValueParams): Promise<void> {
    this.store.Insert('MJ: Feature Values', { ID: `human-${p.RecordID}-${this.rows().length}`, Source: 'Human', Role: 'Champion', EntityID: p.EntityID, RecordID: p.RecordID, FeatureName: p.FeatureName, RecordProcessID: p.RecordProcessID, MLModelScoringBindingID: p.MLModelScoringBindingID || null, ValueNumeric: Number(p.Value) });
  }
  /** @inheritdoc */
  public async RetireHumanValue(p: FeatureValueRecordRef): Promise<number> {
    const before = this.rows().length;
    this.store.Tables['MJ: Feature Values'] = this.rows().filter((r) => !(r['Source'] === 'Human' && String(r['RecordID']) === p.RecordID && r['FeatureName'] === p.FeatureName
      && (p.RecordProcessID === null ? UUIDsEqual(String(r['MLModelScoringBindingID']), p.MLModelScoringBindingID || '') : UUIDsEqual(String(r['RecordProcessID']), p.RecordProcessID))));
    return before - this.rows().length;
  }
  private rows(): Row[] {
    return this.store.Tables['MJ: Feature Values'] || [];
  }
}

/** The stub sidecar: one prediction per row from its `Tenure` feature (the record's score); can fail one call. */
export class SidecarDouble implements ISidecarPredictor {
  private calls = 0;
  private failing: number | null = null;
  /** When true, every answer leaves out its last row's prediction. */
  public OmitLastPrediction = false;
  /** Makes the `n`th call from now fail (null: none). */
  public FailBatch(n: number | null): void {
    this.calls = 0;
    this.failing = n;
  }
  /** @inheritdoc */
  public async predict(req: PredictRequest): Promise<PredictResponse> {
    this.calls++;
    if (this.failing !== null && this.calls === this.failing) throw new Error(`sidecar: batch ${this.calls} failed`);
    const predictions = req.rows.map((row) => {
      const s = Number(row['Tenure']);
      return { score: s, class: s >= 0.5 ? 'renewed' : 'lapsed', probabilities: [1 - s, s] };
    });
    return { classOrder: [...CLASS_ORDER], predictions: this.OmitLastPrediction ? predictions.slice(0, -1) : predictions };
  }
}

/** The model runtime double: the frozen contract from the model row; assembly records its as-of argument. */
export class RuntimeDouble implements IScoringModelRuntime {
  public readonly AsOfs: ('unit-rule' | Date)[] = [];
  public readonly Units = new Map<string, UnitRows['kind'] | null>();
  public readonly Renamed = new Map<string, { readonly From: string; readonly To: string }>();
  /** Models whose assembly refuses, with the refusal. */
  public readonly Refusals = new Map<string, AssemblyRefusal>();
  /** The provider each assembly read through (its caller's context), in call order. */
  public readonly AssemblyProviders: IMetadataProvider[] = [];
  /** Every assembly's as-of argument, in call order. */
  public AsOfArguments(): ('unit-rule' | Date)[] {
    return [...this.AsOfs];
  }
  /** @inheritdoc */
  public async Prepare(model: MJMLModelEntity, bytes: Uint8Array): Promise<IScoringPreparedModel> {
    const unitKind = this.Units.has(model.ID) ? this.Units.get(model.ID) || null : 'grain';
    const loaded: LoadedModel = {
      modelId: model.ID, targetEntityName: MEMBERSHIPS, artifactB64: Buffer.from(bytes).toString('base64'), fittedPreprocessing: {}, featureSchema: [...FEATURES],
      problemType: 'classification', targetVariable: 'Renewed', sourceBindings: [], featureSteps: { Steps: [] }, asOf: { Mode: 'none' },
      leakageGuard: { DenyFields: [], SingleFeatureDominanceThreshold: 1 }, outcomeConfig: resolveOutcomeConfig(), trainingRowIds: new UUIDSet(),
      unit: unitKind === null ? null : { Spec: RuntimeDouble.unit(unitKind), Features: [], RowEntity: MEMBERSHIPS, CategoryLevels: new Map() },
    };
    const renamed = this.Renamed.get(model.ID);
    const refusal = this.Refusals.get(model.ID);
    return {
      Loaded: loaded,
      Assemble: async (ids, _key, asOf, _entity, ctx) => {
        this.AssemblyProviders.push(ctx.Provider);
        return refusal ? { Status: 'refused', Refusal: refusal } : this.assemble(loaded, renamed, ids, asOf);
      },
    };
  }
  private assemble(loaded: LoadedModel, renamed: { readonly From: string; readonly To: string } | undefined, ids: readonly string[], asOf: 'unit-rule' | Date): ScoringAssembly {
    this.AsOfs.push(asOf);
    const columns = loaded.featureSchema.map((c) => (renamed && c.Name === renamed.From ? renamed.To : c.Name));
    return {
      Status: 'assembled', Matrix: { columns, rows: ids.map((id) => columns.map((c) => (c === 'Tenure' ? ScoreOf(id) : 3))) },
      Columns: columns.map((Name) => ({ Name, Kind: 'numeric' })), RowIDs: [...ids],
      HashColumns: loaded.unit === null ? null : columns.map((name) => ({ name, encoding: 'numeric', sourceColumn: name })),
    };
  }
  /** A unit of the given row kind. */
  private static unit(kind: UnitRows['kind']): PredictionUnitSpec {
    const rows: UnitRows = kind === 'grain'
      ? { kind: 'grain', grainEntity: MEMBERSHIPS, decisionDate: { kind: 'fixed', date: '2026-01-01' }, filter: [] }
      : { kind: 'grain-x-periods', grainEntity: 'Members', childEntity: MEMBERSHIPS, foreignKey: 'MemberID', periodDate: 'StartDate', filter: [] };
    return {
      id: 'U1', lineageRootId: 'U1', version: 1, name: 'unit', rows,
      label: { rule: { kind: 'column', column: 'Renewed' }, windowDays: 1, gapDays: 0, outcome: { kind: 'binary', classOrder: ['lapsed', 'renewed'], adverseIndex: 0 }, labelVersion: 1 },
      censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-10-21' } },
      history: { onUncoveredRow: 'exclude-and-count', externalSourceRows: 'ineligible' }, groupKey: null, temporal: null,
      decision: { action: 'review', actorRole: 'analyst', capacityPerPeriod: null, period: 'month' },
      incumbent: { kind: 'none' }, authoredBy: { kind: 'system', component: 'test' },
    };
  }
}

/** The challenger source double. */
export class ChallengersDouble implements IChallengerSource {
  private readonly named = new Map<string, ChallengerSelection>();
  /** The binding's runs mirror to `challenger`, for the records `sampled` takes (every record when omitted). */
  public NameChallenger(binding: Pick<MJMLModelScoringBindingEntity, 'ID'>, challenger: Pick<MJMLModelEntity, 'ID'>, sampled: (recordId: string) => boolean = () => true): void {
    this.named.set(binding.ID.toLowerCase(), { ModelID: challenger.ID, Sampled: sampled });
  }
  /** @inheritdoc */
  public async Challenger(binding: MJMLModelScoringBindingEntity): Promise<ChallengerSelection | null> {
    return this.named.get(binding.ID.toLowerCase()) || null;
  }
}

/** A world model: its ID and pipeline (the service reads the row itself). */
export type WorldModelRef = Pick<MJMLModelEntity, 'ID' | 'PipelineID'>;

/** What a world model is made with. */
export interface WorldModelOptions {
  readonly Status?: MJMLModelEntity['Status'];
  readonly ServingWhileUnevaluated?: boolean;
  /** Stored feature importance; null stores none. */
  readonly FeatureImportance?: Record<string, number> | null;
  /** The unit's row kind; null: a model trained without a Prediction Unit. */
  readonly Unit?: UnitRows['kind'] | null;
  /** The assembly produces this column under another name. */
  readonly RenamedColumn?: string;
  /** The stored feature-schema hash, when it should differ from the hash of the assembled columns. */
  readonly FeatureSchemaHash?: string;
  /** The model has no artifact file (it was never trained). */
  readonly NoArtifactFile?: boolean;
}

/** The world. */
export class ScoringServiceWorld {
  public readonly Store = new GateTestStore();
  public readonly Target = new TargetTable();
  public readonly Values = new ValuesDouble(this.Store);
  public readonly Sidecar = new SidecarDouble();
  public readonly Runtime = new RuntimeDouble();
  public readonly Challengers = new ChallengersDouble();
  public readonly Artifacts = new InMemoryArtifactLoader();
  public readonly Provider: ScoringTestProvider = new ScoringTestProvider(this.Store, this.Target);
  /** The scorer: it holds the store's full role (so it may save the model's ArtifactStatus) and the view authorization. */
  public static readonly User = new UserInfo(null, {
    ID: 'A0000000-0000-4000-8000-0000000005D1', Email: 'scorer@example.com', Type: 'User',
    UserRoles: [new UserRoleInfo({ UserID: 'A0000000-0000-4000-8000-0000000005D1', RoleID: GateTestStore.FullRoleID })],
  });

  constructor() {
    this.Store.Insert('MJ: Authorizations', { ID: VIEW_AUTH_ID, Name: 'View Model Predictions' });
    this.Store.Insert('vwUserHeldAuthorizations', { UserID: ScoringServiceWorld.User.ID, AuthorizationID: VIEW_AUTH_ID });
  }

  /** The scoring context of the world user, with every seam replaced. */
  public Ctx(over: Partial<ScoringContext> = {}): ScoringContext {
    return {
      ContextUser: ScoringServiceWorld.User, Provider: this.Provider, Path: 'score-record-set', OverwriteHumanValues: false, ProcessRunID: null, ScheduledJobRunID: null,
      Seams: { ArtifactLoader: this.Artifacts, Sidecar: this.Sidecar, Runtime: this.Runtime, Values: this.Values, Challengers: this.Challengers, BatchSize: BATCH, Clock: { Now: () => RUN_DATE } },
      ...over,
    };
  }

  /**
   * A scorer who holds the view authorization and every grant of the world user's role except create on
   * `MJ: Feature Values` (read only there).
   */
  public ScorerWithoutFeatureValueCreate(): UserInfo {
    return this.scorerWithFeatureValueGrant({ CanRead: true });
  }

  /** A scorer who may create but not update `MJ: Feature Values` (a same-as-of re-run updates its rows in place). */
  public ScorerWithoutFeatureValueUpdate(): UserInfo {
    return this.scorerWithFeatureValueGrant({ CanRead: true, CanCreate: true });
  }

  /** A scorer holding the view authorization, every grant on the other entities and `grant` on `MJ: Feature Values`. */
  private scorerWithFeatureValueGrant(grant: { readonly CanRead: boolean; readonly CanCreate?: boolean }): UserInfo {
    const all = { CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true };
    const grants = Object.fromEntries(Object.keys(GateTestStore.PermissionedEntities).map((name) => [name, name === 'MJ: Feature Values' ? grant : all]));
    const user = this.Store.UserWithPermissions(grants);
    this.Store.Insert('vwUserHeldAuthorizations', { UserID: user.ID, AuthorizationID: VIEW_AUTH_ID });
    return user;
  }

  /** A user with no authorization at all. */
  public static WithoutAuthorization(): UserInfo {
    return new UserInfo(null, { ID: 'A0000000-0000-4000-8000-0000000005D2', Email: 'nobody@example.com', Type: 'User', UserRoles: [] });
  }

  /** A model of a new pipeline (or of `pipelineId`), with its artifact stored and registered. */
  public Model(o: WorldModelOptions = {}, pipelineId = this.id()): WorldModelRef {
    const id = this.id();
    const bytes = new TextEncoder().encode(`artifact of ${id}`);
    this.Artifacts.Set(`file-${id}`, bytes);
    const unit = o.Unit === undefined ? 'grain' : o.Unit;
    this.Runtime.Units.set(id, unit);
    if (o.RenamedColumn) this.Runtime.Renamed.set(id, { From: o.RenamedColumn, To: `${o.RenamedColumn}Months` });
    const importance = o.FeatureImportance === undefined ? { Tenure: 0.5, Visits: 0.5 } : o.FeatureImportance;
    if (!this.Store.Row('MJ: ML Training Pipelines', pipelineId)) this.Store.Insert('MJ: ML Training Pipelines', { ID: pipelineId, LeakageGuard: null });
    this.Store.Insert('MJ: ML Models', {
      ID: id, PipelineID: pipelineId, Version: 1, Status: o.Status || 'Published', ServingWhileUnevaluated: o.ServingWhileUnevaluated === true,
      FeatureImportance: importance === null ? null : JSON.stringify(importance), FeatureSchema: JSON.stringify(FEATURES), ProblemType: 'classification',
      FeatureSchemaHash: o.FeatureSchemaHash || (unit === null || o.Status === 'Unevaluated' ? null : SnapshotFiles.ComputeFeatureSchemaHash(FEATURES.map((c) => ({ name: c.Name, encoding: 'numeric', sourceColumn: c.Name })))),
      ArtifactFileID: o.NoArtifactFile ? null : `file-${id}`, ArtifactSha256: SnapshotHash.Sha256Hex(bytes), ArtifactStatus: 'verified', ArtifactCheckedAt: null,
      OutputSemantics: JSON.stringify({ task: { kind: 'binary', classOrder: CLASS_ORDER, adverseIndex: 0 } }),
    });
    return { ID: id, PipelineID: pipelineId };
  }

  /** A binding of the model's pipeline on the target entity, with no column. */
  public async Binding(model: Pick<MJMLModelEntity, 'PipelineID'>, over: Row = {}): Promise<MJMLModelScoringBindingEntity> {
    const id = this.id();
    this.Store.Insert('MJ: ML Model Scoring Bindings', {
      ID: id, MLTrainingPipelineID: model.PipelineID, FeatureName: 'Renewal', TargetEntityID: MEMBERSHIPS_ID, TargetEntity: MEMBERSHIPS, TargetColumn: null, TargetColumnSource: null,
      Status: 'Active', Mode: 'OnDemand', ViewAuthorizationID: VIEW_AUTH_ID, RecordProcessID: null, ...over,
    });
    return this.load<MJMLModelScoringBindingEntity>('MJ: ML Model Scoring Bindings', id);
  }

  /** The binding with its stored row changed and reloaded. */
  public async Changed(binding: Pick<MJMLModelScoringBindingEntity, 'ID'>, change: Row): Promise<MJMLModelScoringBindingEntity> {
    Object.assign(this.Store.Row('MJ: ML Model Scoring Bindings', binding.ID) || {}, change);
    return this.load<MJMLModelScoringBindingEntity>('MJ: ML Model Scoring Bindings', binding.ID);
  }

  /** A stored model row. */
  public ModelRow(model: Pick<MJMLModelEntity, 'ID'>): Row | undefined {
    return this.Store.Row('MJ: ML Models', model.ID);
  }

  /** The reads of `MJ: Feature Values` since `from` (an index into the store's read log). */
  public FeatureValueReadsSince(from: number): string[] {
    return this.Store.Reads.slice(from).filter((r) => r.startsWith('view MJ: Feature Values'));
  }

  /** The scoring runs, in write order. */
  public Runs(): Row[] {
    return this.Store.Tables['MJ: ML Scoring Runs'] || [];
  }

  /** How many transactions began. */
  public TransactionCount(): number {
    return this.Store.Transactions.filter((t) => t === 'begin').length;
  }

  /** A model-path request of the world user. */
  public RequestFor(modelId: string, scope: ScoringScope): ScoringRequest {
    return { ScoringRunID: '', ModelID: modelId, Scope: scope, EntityMapping: null, AsOfDate: RUN_DATE.toISOString(), Read: { mode: 'complete' }, DryRun: false, RequestedBy: { kind: 'human', userId: ScoringServiceWorld.User.ID } };
  }

  /** A guard question about `column`'s current value, compared as the column copy compares. */
  public Question(column: string, current: number): HumanValueQuestion {
    return { FieldName: column, CurrentValue: current, Provider: this.Provider, Resolve: async (v) => v, Equals: (a, b) => ScoringBindings.IsCopiedValue(a, b) };
  }

  /** A stored row as its entity object (loaded through the store's provider). */
  private async load<T extends MJMLModelScoringBindingEntity | MJMLModelEntity>(entityName: string, id: string): Promise<T> {
    const record = await this.Provider.GetEntityObject<T>(entityName, ScoringServiceWorld.User);
    if (!(await record.Load(id))) throw new Error(`ScoringServiceWorld: ${entityName} ${id} is not stored`);
    return record;
  }

  private id(): string {
    return randomUUID().toUpperCase();
  }
}
