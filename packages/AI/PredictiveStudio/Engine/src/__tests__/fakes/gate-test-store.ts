/**
 * `GateTestStore` — the lifecycle gate's fake provider over in-memory rows (Task M3.2), and `GateWorld`, the stored rows
 * of one pipeline that the gate tests act on. The store answers `RunView` (evaluating the `Field='v'`, `Field=n` and
 * `Field IN (…)` clauses the registry writes, and `Field IN (SELECT ID FROM [__mj].[<view>] WHERE Col='v')` over the
 * entities {@link GateTestStore.BaseViews} names, case-insensitively as SQL Server's collation does), `GetEntityObject`,
 * `EntityByName` for the entities {@link GateTestStore.PermissionedEntities} names, with their permissions from
 * {@link GateTestStore.EntityPermissions} ({@link GateWorld.User}'s role holds every grant, {@link GateTestStore.UserWithPermissions}
 * makes a user with others; any other name throws, so a test cannot silently get `undefined`), and a `Save()` of one
 * of those entities that refuses, as `BaseEntity.Save` does, a user without `CanCreate` (a new row) or `CanUpdate`
 * (and a publish record SQL Server's constraints would refuse, {@link GateTestStore.ConstraintRefusal}, and the one save a
 * test set to fail, {@link GateTestStore.FailNext}),
 * `RunQuery` for the three stored lock/version Queries and entity transactions (a transaction snapshots every table at
 * its outermost begin and a rollback restores the snapshot). Every read is appended to {@link GateTestStore.Reads} and
 * every save counted, so a test can assert "one read" or "read after the locks". Entity rows are handed to the gate as
 * plain field bags behind a `Proxy`, through one deliberate test-double cast at the provider boundary (the gate only
 * ever touches the typed generated members, never `.Get()`/`.Set()`).
 */
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import {
  EntityInfo, IsPlatformSQL, UserInfo, UserRoleInfo, type EntityTransactionScope, type IMetadataProvider, type RunQueryParams, type RunQueryResult, type RunViewParams,
} from '@memberjunction/core';
import { DatabaseProviderStub } from '@memberjunction/unit-testing';
import { UUIDsEqual } from '@memberjunction/global';
import {
  GateRecords,
  GateRules,
  JsonParse,
  SemanticsRules,
  TrainingRunResultsParser,
  type EvaluationProtocolColumns,
  type JsonObject,
  type LeakageFlag,
  type MetricWithInterval,
  type PromotionRule,
  type RegisteredDeliveryView,
  type StoredGateRecord,
  type StoredTrainerResult,
  type TaskType,
  type TrainerCompleted,
} from '@memberjunction/predictive-studio-core';

import type { GateClock } from '../../registry/publish-locks';
import { SnapshotHash } from '../../snapshot/snapshot-hash';
import { ProtocolRowFixture } from '../../training/__tests__/fixtures/protocol-row';
import { TrainerResultFixtures } from '../../training/__tests__/fixtures/trainer-result';
import type { MemoryStorageAccount } from './storage-fakes';

/** One stored cell. */
export type Cell = string | number | boolean | null | Date;
/** One stored row. */
export type Row = Record<string, Cell>;

/** The members of a fake entity that are not columns. */
const RECORD_MEMBERS = new Set(['Save', 'Delete', 'Load', 'NewRecord', 'LatestResult', 'IsSaved', 'then']);
/** The generated `<Column>Object` accessors of JSON-typed columns, answered with the column's parsed JSON (null when unset). */
const JSON_OBJECT_ACCESSORS = new Set(['RefusalObject', 'EvidenceObject', 'InitiatorObject', 'GateDecisionObject']);
/** The database defaults a save fills when a new row leaves them unset (`DF_MLModelPublishRecord_RecordedAt`). */
const INSERT_DEFAULTS: Readonly<Record<string, () => Row>> = { 'MJ: ML Model Publish Records': () => ({ RecordedAt: new Date() }) };

/** The store's read log: every read in order, and reads set to fail (the guard tests' fail-closed cases). */
export class ReadLog {
  private readonly failing: string[] = [];
  constructor(public readonly Entries: string[]) {}

  /** Makes the next read of `entityName` fail as a provider read does (`Success: false`). */
  public FailNext(entityName: string): void {
    this.failing.push(entityName);
  }

  /** @internal true, once, when the next read of `entityName` was set to fail */
  public TakeFailure(entityName: string): boolean {
    const at = this.failing.indexOf(entityName);
    if (at < 0) return false;
    this.failing.splice(at, 1);
    return true;
  }
}

/** A clock that advances by every sleep and never waits (the lock wait's tests). */
export class FakeClock implements GateClock {
  public NowMs = 0;
  public readonly Sleeps: number[] = [];
  public Now(): number {
    return this.NowMs;
  }
  public async Sleep(ms: number): Promise<void> {
    this.Sleeps.push(ms);
    this.NowMs += ms;
  }
}

/** The binary task every gate-world model scores. */
export const GATE_TASK: TaskType = { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 };

/** One role's grant on an entity, as an `MJ: Entity Permissions` row holds it. */
export interface EntityGrant {
  readonly CanCreate: boolean;
  readonly CanRead: boolean;
  readonly CanUpdate: boolean;
  readonly CanDelete: boolean;
}

/** The in-memory provider. */
export class GateTestStore {
  /** The entities the provider describes (`EntityByName`), by name, with their IDs; their saves enforce permissions. */
  public static readonly PermissionedEntities: Readonly<Record<string, string>> = {
    'MJ: ML Models': '6A1D2E3F-0000-4000-8000-0000000000E1',
    'MJ: ML Model Publish Records': '6A1D2E3F-0000-4000-8000-0000000000E3',
    'MJ: ML Training Runs': '6A1D2E3F-0000-4000-8000-0000000000E4',
    'MJ: ML Output Bindings': '6A1D2E3F-0000-4000-8000-0000000000E5',
    'MJ: Scheduled Jobs': '6A1D2E3F-0000-4000-8000-0000000000E6',
  };
  /**
   * The base view of each table a filter may name in a `Field IN (SELECT <col> FROM [__mj].[<view>] WHERE Col='v')`
   * subquery (auto-train's refusal read of a pipeline's runs; a binding's view-authorization check over the
   * `vwUserHeldAuthorizations` rows); {@link EntityInfoOf} reports an entity of it with schema `__mj`.
   */
  public static readonly BaseViews: Readonly<Record<string, string>> = { 'MJ: ML Training Runs': 'vwMLTrainingRuns', vwUserHeldAuthorizations: 'vwUserHeldAuthorizations' };
  /** The role {@link GateWorld.User} holds; every entity of {@link PermissionedEntities} grants it every permission (the gate's write lists included). */
  public static readonly FullRoleID = '6A1D2E3F-0000-4000-8000-0000000000E2';
  /** The entity permission rows the provider's entities answer `GetUserPermisions` from, by entity name and role. */
  public readonly EntityPermissions: (EntityGrant & { readonly EntityName: string; readonly RoleID: string })[] = Object.keys(GateTestStore.PermissionedEntities).map((EntityName) => ({
    EntityName, RoleID: GateTestStore.FullRoleID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true,
  }));
  /** Rows by entity name. */
  public Tables: Record<string, Row[]> = {};
  /** Every read, in order: `view <entity> <filter>` or `query <name>`. */
  public readonly Reads: string[] = [];
  /** The same reads as a log a test can make fail ({@link ReadLog.FailNext}). */
  public readonly ReadLog = new ReadLog(this.Reads);
  /** Every save, in order: `<entity> <ID>`. */
  public readonly Saves: string[] = [];
  /** The same saves with the user each was saved as: `<entity> <ID> <user ID>`. */
  public readonly SavedAs: string[] = [];
  /**
   * A stale copy of tables, as a RunView cache would hold it after an out-of-band write: a RunView WITHOUT `BypassCache`
   * reads an entity's rows from here when the entity has an entry; a read with `BypassCache` (and every write) uses
   * {@link Tables}, the "database".
   */
  public readonly CachedTables: Record<string, Row[]> = {};
  /** Every RunView in order: the entity and whether it went past the RunView cache (`BypassCache`). */
  public readonly ViewReads: { readonly EntityName: string; readonly BypassCache: boolean }[] = [];
  /** Transaction events in order: `begin`, `commit`, `rollback`. */
  public readonly Transactions: string[] = [];
  /** How many more lock-query calls fail as a held lock would (`Success: false`). */
  public LockFailures = 0;
  /** When set, every RunQuery throws this message (a lost connection). */
  public QueryThrows: string | null = null;
  /** Entity names whose saves fail, with the message. */
  public readonly FailingSaves = new Map<string, string>();
  /** The next save of each listed entity fails once ({@link FailNext}), with the message; consumed by that save. */
  private readonly failNextSaves: { readonly EntityName: string; readonly Message: string }[] = [];
  /** Called at the start of each save (before a configured failure) with the entity name and the record being saved. */
  public OnSave: ((entityName: string, record: object) => void) | null = null;
  /** The world whose rows the store holds; {@link PinProtocol} and {@link FlagLeakage} act on it. */
  public World: GateWorld | null = null;
  /** While set, the model lock query fails (as a held NOWAIT lock does) until the clock reaches `UntilMs`. */
  public ModelLockHeld: { readonly Clock: GateClock; readonly UntilMs: number } | null = null;
  /** Called before each lock query, with its name (a test changes rows "meanwhile" here). */
  public BeforeLockQuery: ((queryName: string) => void) | null = null;
  /** Answers entity transactions; false makes the provider a client-like provider. */
  public SupportsTransactions = true;
  private depth = 0;
  private snapshot: Record<string, Row[]> | null = null;

  /** The provider the gate runs on: a real `DatabaseProviderBase` (the unit-testing stub) answering from this store. */
  public Provider(): IMetadataProvider {
    return new GateTestProvider(this);
  }

  /** Reads served so far. */
  public ReadCount(): number {
    return this.Reads.length;
  }

  /** Saves made so far. */
  public SaveCount(): number {
    return this.Saves.length;
  }

  /** The row of `entityName` with this ID. */
  public Row(entityName: string, id: string): Row | undefined {
    return (this.Tables[entityName] || []).find((r) => UUIDsEqual(String(r['ID']), id));
  }

  /** A JSON-object column of a stored row, parsed and narrowed (throws naming the column when it is not a JSON object). */
  public static JsonObjectColumn(row: Row, column: string): JsonObject {
    const cell = row[column];
    const parsed = JsonParse.ParseJsonText(typeof cell === 'string' ? cell : null, column);
    if (parsed.Ok === false) throw new Error(parsed.Errors.join('; '));
    if (!JsonParse.IsJsonObject(parsed.Value)) throw new Error(`${column} does not hold a JSON object`);
    return parsed.Value;
  }

  /**
   * Makes the next save of `entityName` fail once, as a database write refused mid-transaction does (`Save()` false
   * with `message`); later saves of the entity succeed. The plan's `provider.FailNextSaveOf(...)` (D4-139). Reads are
   * failed with {@link ReadLog.FailNext} instead.
   */
  public FailNext(entityName: string, message = `GateTestStore: the save of ${entityName} failed`): void {
    this.failNextSaves.push({ EntityName: entityName, Message: message });
  }

  /** @internal the message of a one-shot save failure set for `entityName` ({@link FailNext}), consumed; null when none */
  public TakeSaveFailure(entityName: string): string | null {
    const at = this.failNextSaves.findIndex((f) => f.EntityName === entityName);
    if (at < 0) return null;
    const [failure] = this.failNextSaves.splice(at, 1);
    return failure.Message;
  }

  /** The model's persisted status. */
  public Status(modelId: string): Cell {
    return GateTestStore.cellOrNull(this.Row('MJ: ML Models', modelId)?.['Status']);
  }

  /** Sets the model's persisted status directly, as a write outside the gate would (a test's starting state). */
  public SetStatus(modelId: string, status: string): void {
    const row = this.Row('MJ: ML Models', modelId);
    if (!row) throw new Error(`GateTestStore: no ML Model ${modelId}`);
    row['Status'] = status;
  }

  /** The model's persisted `StatusReason`. */
  public StatusReason(modelId: string): Cell {
    return GateTestStore.cellOrNull(this.Row('MJ: ML Models', modelId)?.['StatusReason']);
  }

  /** The model's publish records. */
  public PublishRecords(modelId: string): Row[] {
    return (this.Tables['MJ: ML Model Publish Records'] || []).filter((r) => UUIDsEqual(String(r['ModelID']), modelId));
  }

  /** The publish records of a training run. */
  public PublishRecordsOfRun(trainingRunId: string): Row[] {
    return (this.Tables['MJ: ML Model Publish Records'] || []).filter((r) => UUIDsEqual(String(r['TrainingRunID']), trainingRunId));
  }

  /** The model's output-binding rows (`MJ: ML Output Bindings`). */
  public OutputBindings(modelId: string): Row[] {
    return (this.Tables['MJ: ML Output Bindings'] || []).filter((r) => UUIDsEqual(String(r['ModelID']), modelId));
  }

  /** The `MJ: Record Processes` row with this ID, as auto-train repoints it. */
  public RecordProcess(id: string): { readonly ID: string; readonly Configuration: string | null } {
    const row = this.Row('MJ: Record Processes', id);
    if (!row) throw new Error(`GateTestStore: no Record Process ${id}`);
    const configuration = row['Configuration'];
    return { ID: String(row['ID']), Configuration: typeof configuration === 'string' ? configuration : null };
  }

  /** The pipeline's `MJ: ML Training Runs` rows, in the order they were saved. */
  public TrainingRuns(pipelineId: string): Row[] {
    return (this.Tables['MJ: ML Training Runs'] || []).filter((r) => UUIDsEqual(String(r['PipelineID']), pipelineId));
  }

  /**
   * A model of the pipeline in `Status` with a stored, verifiable artifact and no training run row (a reuse candidate,
   * or a configured model): see {@link GateWorld.AddModel}.
   */
  public AddModel(pipelineId: string, o: { readonly Status: string; readonly ArtifactStatus: string }): WorldModel {
    return this.world().AddModel(pipelineId, o.Status, o.ArtifactStatus);
  }

  /** The `MJ: User Notifications` rows sent to `userId`, in the order they were saved. */
  public Notifications(userId: string): Row[] {
    return (this.Tables['MJ: User Notifications'] || []).filter((r) => UUIDsEqual(String(r['UserID']), userId));
  }

  /**
   * Stores a person's `sign-off` record of the model (approver {@link GateWorld.User}) with the given decision, over
   * evidence whose hash is `evidenceSha256` (default: a hash no rebuilt evidence has), and returns its ID.
   */
  public SignOff(modelId: string, decision: 'approve' | 'reject', evidenceSha256 = '0'.repeat(64)): string {
    const id = randomUUID().toUpperCase();
    this.Insert('MJ: ML Model Publish Records', {
      ID: id, ModelID: modelId, TrainingRunID: GateTestStore.cellOrNull(this.Row('MJ: ML Models', modelId)?.['TrainingRunID']), Kind: 'sign-off', Purpose: 'publish',
      ApproverKind: 'user', UserID: GateWorld.User.ID, Initiator: JSON.stringify({ kind: 'human', userId: GateWorld.User.ID }), Decision: decision, Reason: 'reviewed',
      Evidence: JSON.stringify({}), EvidenceSha256: evidenceSha256, OverridesFlags: '[]', RecordedAt: new Date(),
    });
    return id;
  }

  /**
   * A user holding one new role, which the store's entities grant exactly `grants` (the provider's `EntityByName`
   * answers `GetUserPermisions` from {@link EntityPermissions}; an entity `grants` does not name grants that role nothing).
   */
  public UserWithPermissions(grants: Readonly<Record<string, Partial<EntityGrant>>>): UserInfo {
    const roleId = randomUUID().toUpperCase();
    for (const [entityName, grant] of Object.entries(grants)) {
      this.EntityPermissions.push({ EntityName: entityName, RoleID: roleId, CanCreate: grant.CanCreate === true, CanRead: grant.CanRead === true, CanUpdate: grant.CanUpdate === true, CanDelete: grant.CanDelete === true });
    }
    const userId = randomUUID().toUpperCase();
    return new UserInfo(null, { ID: userId, Email: `gate-tests-${userId}@example.com`, Type: 'User', UserRoles: [new UserRoleInfo({ UserID: userId, RoleID: roleId })] });
  }

  /**
   * One of {@link PermissionedEntities} as the provider describes it: every API allowed, its permissions from
   * {@link EntityPermissions}; null for an entity the store does not describe.
   */
  public EntityInfoOf(entityName: string, provider?: IMetadataProvider): EntityInfo | null {
    const name = Object.keys(GateTestStore.PermissionedEntities).find((n) => n.toLowerCase() === entityName.trim().toLowerCase());
    if (name === undefined) return null;
    const entityId = GateTestStore.PermissionedEntities[name];
    const permissions = this.EntityPermissions.filter((p) => p.EntityName === name).map((p) => ({ ...p, ID: randomUUID().toUpperCase(), EntityID: entityId, Type: 'Allow' }));
    return new EntityInfo({ ID: entityId, Name: name, SchemaName: '__mj', BaseView: GateTestStore.BaseViews[name] || null, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true, EntityPermissions: permissions }, provider);
  }

  /**
   * Why `user` may not save a row of `entityName` (`CanCreate` for a new row, `CanUpdate` for a saved one), as
   * `BaseEntity.Save`'s permission check words it; null when it may, or when the store does not describe the entity.
   */
  public SaveRefusal(entityName: string, user: UserInfo | undefined, isNew: boolean): string | null {
    const entity = this.EntityInfoOf(entityName);
    if (entity === null) return null;
    if (user === undefined) return `GateTestStore: a save of ${entityName} has no user`;
    const permissions = entity.GetUserPermisions(user);
    const allowed = isNew ? permissions.CanCreate : permissions.CanUpdate;
    return allowed ? null : `User: ${user.Email} (ID: ${user.ID}) does not have ${isNew ? 'create' : 'update'} permissions on ${entityName}`;
  }

  /**
   * Why SQL Server would refuse to store `values` as a row of `entityName`, worded as SQL Server words it; null when it
   * would not, or when the store emulates no constraint of the entity. For `MJ: ML Model Publish Records` it emulates
   * the constraints of `migrations/v6/V202611170733__v6.3.x__PS_Honest_Serving_Schema.sql` that decide which refusal
   * records the gate may write:
   * - `CK_MLModelPublishRecord_RunLevel` (`:57-58`): `([ModelID] IS NOT NULL AND [Purpose] <> 'evaluate')
   *   OR ([ModelID] IS NULL AND [Kind] = 'refusal' AND [Purpose] = 'evaluate')`;
   * - `UX_MLModelPublishRecord_OnePublishPerRun` (`:80-82`): unique `[TrainingRunID]`
   *   `WHERE [Kind] = 'publish' AND [Purpose] IN ('publish', 'adopt') AND [TrainingRunID] IS NOT NULL`;
   * - `UX_MLModelPublishRecord_OneRunOutcome` (`:84-86`): unique `[TrainingRunID]`
   *   `WHERE [Purpose] = 'evaluate' AND [TrainingRunID] IS NOT NULL`.
   * An update of a stored row is checked against the other rows only. The CHECK message names the statement
   * (`INSERT` for a new row, `UPDATE` for a stored one), as SQL Server's does.
   */
  public ConstraintRefusal(entityName: string, values: Row, isNew: boolean): string | null {
    if (entityName !== 'MJ: ML Model Publish Records') return null;
    const hasModel = values['ModelID'] !== null && values['ModelID'] !== undefined;
    const runLevel = hasModel ? values['Purpose'] !== 'evaluate' : values['Kind'] === 'refusal' && values['Purpose'] === 'evaluate';
    if (!runLevel) {
      return `The ${isNew ? 'INSERT' : 'UPDATE'} statement conflicted with the CHECK constraint "CK_MLModelPublishRecord_RunLevel". The conflict occurred in table "__mj.MLModelPublishRecord".`;
    }
    const runId = values['TrainingRunID'];
    if (runId === null || runId === undefined) return null;
    const indexes: ReadonlyArray<readonly [string, (r: Row) => boolean]> = [
      ['UX_MLModelPublishRecord_OnePublishPerRun', (r) => r['Kind'] === 'publish' && (r['Purpose'] === 'publish' || r['Purpose'] === 'adopt')],
      ['UX_MLModelPublishRecord_OneRunOutcome', (r) => r['Purpose'] === 'evaluate'],
    ];
    const others = (this.Tables[entityName] || []).filter((r) => !(values['ID'] && UUIDsEqual(String(r['ID']), String(values['ID']))));
    for (const [index, covers] of indexes) {
      if (covers(values) && others.some((r) => covers(r) && r['TrainingRunID'] !== null && r['TrainingRunID'] !== undefined && UUIDsEqual(String(r['TrainingRunID']), String(runId)))) {
        return `Cannot insert duplicate key row in object '__mj.MLModelPublishRecord' with unique index '${index}'. The duplicate key value is (${String(runId)}).`;
      }
    }
    return null;
  }

  /** The scheduled jobs whose configuration names the model. */
  public ScheduledJobs(modelId: string): Row[] {
    return (this.Tables['MJ: Scheduled Jobs'] || []).filter((j) => typeof j['Configuration'] === 'string' && j['Configuration'].includes(`"modelId":"${modelId}"`));
  }

  /** Changes the promotion rule of the protocol version row the model's training run was evaluated under. */
  public PinProtocol(modelId: string, change: Partial<PromotionRule>): void {
    this.world().PinProtocol(modelId, change);
  }

  /** Stores `flags` as the leakage audit of the model's training run (PR 3's `LeakageFlag[]`). */
  public FlagLeakage(modelId: string, flags: readonly LeakageFlag[]): void {
    this.world().FlagLeakage(modelId, flags);
  }

  /** The Training Snapshot row the model was trained on (its `TrainingSnapshotID`). */
  public SnapshotOf(modelId: string): Row {
    const snapshot = this.Row('MJ: ML Training Snapshots', String(this.Row('MJ: ML Models', modelId)?.['TrainingSnapshotID']));
    if (!snapshot) throw new Error(`GateTestStore: ML Model ${modelId} has no Training Snapshot row`);
    return snapshot;
  }

  /** Rewrites the `ContentHash` of the Training Snapshot row `run` trained on (the run row's `TrainingSnapshotID`). */
  public RewriteSnapshotHash(run: Pick<WorldModel, 'RunID'>, contentHash: string): void {
    const snapshot = this.Row('MJ: ML Training Snapshots', String(this.Row('MJ: ML Training Runs', run.RunID)?.['TrainingSnapshotID']));
    if (!snapshot) throw new Error(`GateTestStore: training run ${run.RunID} names no Training Snapshot row`);
    snapshot['ContentHash'] = contentHash;
  }

  /** The holdout primary score in the run's stored trainer result, read back from its `ValidationResults`. */
  public StoredHoldoutPrimary(run: Pick<WorldModel, 'RunID'>): MetricWithInterval {
    return this.storedTrainer(run).holdout.primary;
  }

  /** The holdout score of the simple baseline member `member` (e.g. `glm`) in the run's stored trainer result. */
  public StoredMemberHoldout(run: Pick<WorldModel, 'RunID'>, member: string): MetricWithInterval {
    const found = this.storedTrainer(run).baselines.find((b) => b.role === 'simple' && GateRules.BaselineMemberName(b.baseline) === member);
    if (!found) throw new Error(`GateTestStore: training run ${run.RunID} stores no simple baseline '${member}'`);
    return found.holdout;
  }

  private storedTrainer(run: Pick<WorldModel, 'RunID'>): StoredTrainerResult {
    const cell = this.Row('MJ: ML Training Runs', run.RunID)?.['ValidationResults'];
    const parsed = TrainingRunResultsParser.ParseTrainingRunResults(typeof cell === 'string' ? cell : null);
    if (parsed.Ok === false || parsed.Value.status !== 'completed') throw new Error(`GateTestStore: training run ${run.RunID} stores no completed results`);
    return parsed.Value.trainer;
  }

  /** Appends a row another session has already committed: an open transaction's rollback keeps it. */
  public InsertCommitted(entityName: string, row: Row): void {
    this.Insert(entityName, row);
    if (this.snapshot !== null) (this.snapshot[entityName] ||= []).push({ ...row });
  }

  /** Appends a row. */
  public Insert(entityName: string, row: Row): void {
    (this.Tables[entityName] ||= []).push({ ...row });
  }

  private world(): GateWorld {
    if (this.World === null) throw new Error('GateTestStore: no GateWorld is attached');
    return this.World;
  }

  /** @internal the provider's transaction scope */
  public async Begin(): Promise<EntityTransactionScope> {
    return this.begin();
  }

  private async begin(): Promise<EntityTransactionScope> {
    const nested = this.depth > 0;
    if (!nested) this.snapshot = GateTestStore.copyTables(this.Tables);
    this.depth++;
    this.Transactions.push('begin');
    let settled = false;
    return {
      IsNested: nested,
      Commit: async () => {
        if (settled) return;
        settled = true;
        this.depth--;
        this.Transactions.push('commit');
        if (this.depth === 0) this.snapshot = null;
      },
      Rollback: async () => {
        if (settled) return;
        settled = true;
        this.depth--;
        this.Transactions.push('rollback');
        if (this.depth === 0 && this.snapshot !== null) {
          this.Tables = this.snapshot;
          this.snapshot = null;
        }
      },
    };
  }

  /** @internal the provider's RunView */
  public RunViewRows(params: RunViewParams, contextUser?: UserInfo): { Success: boolean; Results: object[]; TotalRowCount: number; ErrorMessage: string } {
    const filter = GateTestStore.textOf(params.ExtraFilter);
    const orderBy = GateTestStore.textOf(params.OrderBy);
    this.Reads.push(`view ${params.EntityName} ${filter}`);
    this.ViewReads.push({ EntityName: params.EntityName || '', BypassCache: params.BypassCache === true });
    if (this.ReadLog.TakeFailure(params.EntityName || '')) return { Success: false, Results: [], TotalRowCount: 0, ErrorMessage: `GateTestStore: the read of ${params.EntityName} failed` };
    const predicates = filter.split(' AND ').filter((c) => c.trim().length > 0).map((c) => this.clause(c.trim()));
    const cached = params.BypassCache === true ? undefined : this.CachedTables[params.EntityName || ''];
    let rows = (cached || this.Tables[params.EntityName || ''] || []).filter((r) => predicates.every((p) => p(r)));
    if (orderBy.includes('RecordedAt DESC')) rows = [...rows].reverse();   // rows are appended in RecordedAt order
    else rows = GateTestStore.ordered(rows, orderBy);
    if (params.MaxRows) rows = rows.slice(0, params.MaxRows);
    const results = params.ResultType === 'entity_object'
      ? rows.map((r) => this.record(params.EntityName || '', { ...r }, true, contextUser))
      : rows.map((r) => (params.Fields ? Object.fromEntries(params.Fields.map((f) => [f, GateTestStore.cellOrNull(r[f])])) : { ...r }));
    return { Success: true, Results: results, TotalRowCount: results.length, ErrorMessage: '' };
  }

  /** @internal the provider's RunQuery */
  public RunQueryRows(params: RunQueryParams): RunQueryResult {
    const name = params.QueryName || '';
    this.Reads.push(`query ${name}`);
    if (this.QueryThrows !== null) throw new Error(this.QueryThrows);
    if (name.startsWith('Predictive Studio: Lock')) this.BeforeLockQuery?.(name);
    const p: Record<string, string> = {};
    for (const [k, v] of Object.entries(params.Parameters || {})) p[k] = String(v);
    const rows = this.queryRows(name, p);
    return {
      QueryID: '', QueryName: name, Success: rows !== null, Results: rows || [], RowCount: rows?.length || 0, TotalRowCount: rows?.length || 0,
      ExecutionTime: 0, ErrorMessage: rows === null ? 'Error executing SQL\n    Error: Lock request time out period exceeded.' : '',
    };
  }

  /** A query's rows, or null for a held lock. */
  private queryRows(name: string, p: Record<string, string>): Row[] | null {
    switch (name) {
      case 'Predictive Studio: Lock Pipeline For Publish':
      case 'Predictive Studio: Lock Model For Publish': {
        if (this.LockFailures > 0) {
          this.LockFailures--;
          return null;
        }
        const held = this.ModelLockHeld;
        if (name.endsWith('Model For Publish') && held !== null && held.Clock.Now() < held.UntilMs) return null;
        if (name.endsWith('Pipeline For Publish')) return [{ ID: p['PipelineID'] }];
        const model = this.Row('MJ: ML Models', p['ModelID']);
        return model ? [{ Status: model['Status'] }] : [];
      }
      case 'Predictive Studio: Running Training Run': {
        const after = Date.parse(p['StartedAfter']);
        const running = this.TrainingRuns(p['PipelineID'])
          .filter((r) => r['Status'] === 'Running' && r['StartedAt'] instanceof Date && r['StartedAt'].getTime() > after)
          .sort((a, b) => Number(b['StartedAt'] instanceof Date ? b['StartedAt'].getTime() : 0) - Number(a['StartedAt'] instanceof Date ? a['StartedAt'].getTime() : 0));
        return running.slice(0, 1).map((r) => ({ ID: r['ID'], StartedAt: r['StartedAt'] }));
      }
      case 'Predictive Studio: Next Model Version': {
        const versions = (this.Tables['MJ: ML Models'] || []).filter((m) => UUIDsEqual(String(m['PipelineID']), p['PipelineID'])).map((m) => Number(m['Version']));
        return [{ NextVersion: Math.max(0, ...versions) + 1 }];
      }
      default:
        throw new Error(`GateTestStore: no such query ${name}`);
    }
  }

  /** @internal a new, unsaved record of `entityName` */
  public NewRecordOf(entityName: string, contextUser?: UserInfo): object {
    return this.record(entityName, {}, false, contextUser);
  }

  /** A field bag behind a Proxy: column reads and writes go to `values`; `Save()` writes the row back. */
  private record(entityName: string, values: Row, saved: boolean, contextUser: UserInfo | undefined): object {
    const store = this;
    const state: { saved: boolean; latest: { CompleteMessage: string } | null } = { saved, latest: null };
    const target = {
      async Save(): Promise<boolean> {
        store.OnSave?.(entityName, proxy);
        const failure = store.FailingSaves.get(entityName) || store.TakeSaveFailure(entityName) || store.SaveRefusal(entityName, contextUser, !state.saved) || store.ConstraintRefusal(entityName, values, !state.saved);
        if (failure !== null && failure !== undefined) {
          state.latest = { CompleteMessage: failure };
          return false;
        }
        if (!values['ID']) {
          values['ID'] = randomUUID().toUpperCase();
          for (const [k, v] of Object.entries(INSERT_DEFAULTS[entityName]?.() || {})) if (values[k] === undefined || values[k] === null) values[k] = v;
        }
        const table = (store.Tables[entityName] ||= []);
        const at = table.findIndex((r) => UUIDsEqual(String(r['ID']), String(values['ID'])));
        if (at >= 0) table[at] = { ...table[at], ...values };
        else table.push({ ...values });
        store.Saves.push(`${entityName} ${values['ID']}`);
        store.SavedAs.push(`${entityName} ${values['ID']} ${contextUser ? contextUser.ID : '(no user)'}`);
        state.saved = true;
        state.latest = { CompleteMessage: '' };
        return true;
      },
      async Delete(): Promise<boolean> {
        store.Tables[entityName] = (store.Tables[entityName] || []).filter((r) => !UUIDsEqual(String(r['ID']), String(values['ID'])));
        return true;
      },
      NewRecord(): boolean {
        return true;
      },
      /** `BaseEntity.Load`: the stored row with this ID becomes the record's values (false when there is none). */
      async Load(id: string): Promise<boolean> {
        const row = store.Row(entityName, id);
        if (!row) return false;
        for (const key of Object.keys(values)) delete values[key];
        Object.assign(values, row);
        state.saved = true;
        return true;
      },
    };
    const proxy: object = new Proxy(target, {
      get(t, prop) {
        if (prop === 'LatestResult') return state.latest;
        if (prop === 'IsSaved') return state.saved;
        const jsonColumn = typeof prop === 'string' && JSON_OBJECT_ACCESSORS.has(prop) ? prop.slice(0, -'Object'.length) : null;
        if (jsonColumn !== null) {
          const cell = values[jsonColumn];
          if (typeof cell !== 'string') return null;
          const parsed = JsonParse.ParseJsonText(cell, jsonColumn);
          if (parsed.Ok === false) throw new Error(`GateTestStore: ${entityName}.${jsonColumn} is not JSON: ${parsed.Errors.join('; ')}`);
          return parsed.Value;
        }
        if (typeof prop === 'string' && RECORD_MEMBERS.has(prop)) return Reflect.get(t, prop);
        return typeof prop === 'string' ? GateTestStore.cellOrNull(values[prop]) : undefined;
      },
      set(_t, prop, value: Cell) {
        if (typeof prop !== 'string') return false;
        values[prop] = value;
        return true;
      },
    });
    return proxy;
  }

  /** A filter or order clause as text: the registry writes plain strings, never per-platform SQL. */
  private static textOf(value: RunViewParams['ExtraFilter']): string {
    if (value === undefined || value === null) return '';
    if (IsPlatformSQL(value)) throw new Error('GateTestStore: the registry writes no per-platform clauses');
    return value;
  }

  private clause(clause: string): (row: Row) => boolean {
    if (clause.includes(' OR ')) {
      const any = clause.split(' OR ').map((c) => this.clause(c.trim()));
      return (row) => any.some((p) => p(row));
    }
    const sub = /^(\w+) IN \(SELECT (\w+) FROM \[__mj\]\.\[(\w+)\] WHERE (\w+)='((?:[^']|'')*)'\)$/.exec(clause);
    if (sub) return this.subqueryClause(sub[1], sub[2], sub[3], sub[4], sub[5].replace(/''/g, "'"));
    const isNull = /^(\w+) IS (NOT )?NULL$/.exec(clause);
    if (isNull) return (row) => (row[isNull[1]] === null || row[isNull[1]] === undefined) === (isNull[2] === undefined);
    const inList = /^(\w+) IN \((.*)\)$/.exec(clause);
    if (inList) {
      const set = new Set([...inList[2].matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'").toLowerCase()));
      return (row) => row[inList[1]] !== null && row[inList[1]] !== undefined && set.has(String(row[inList[1]]).toLowerCase());
    }
    const text = /^(\w+)\s*=\s*'((?:[^']|'')*)'$/.exec(clause);
    if (text) return (row) => row[text[1]] !== null && row[text[1]] !== undefined && String(row[text[1]]).toLowerCase() === text[2].replace(/''/g, "'").toLowerCase();
    const num = /^(\w+)\s*=\s*(-?\d+)$/.exec(clause);
    if (num) return (row) => Number(row[num[1]]) === Number(num[2]);
    throw new Error(`GateTestStore cannot evaluate the filter clause "${clause}"`);
  }

  /**
   * `column IN (SELECT selected FROM [__mj].[view] WHERE where='value')`: the `selected` values of the rows of the table
   * whose base view is `view` ({@link BaseViews}) with `where` equal to `value` (case-insensitively), read when the
   * filter is evaluated.
   */
  private subqueryClause(column: string, selected: string, view: string, where: string, value: string): (row: Row) => boolean {
    const entityName = Object.keys(GateTestStore.BaseViews).find((n) => GateTestStore.BaseViews[n] === view);
    if (entityName === undefined) throw new Error(`GateTestStore cannot evaluate a subquery over the view "${view}"`);
    const ids = new Set((this.Tables[entityName] || []).filter((r) => String(r[where]).toLowerCase() === value.toLowerCase()).map((r) => String(r[selected]).toLowerCase()));
    return (row) => row[column] !== null && row[column] !== undefined && ids.has(String(row[column]).toLowerCase());
  }

  /**
   * Rows in the order a single-column `<Column> ASC|DESC` clause asks for (a stable sort of numbers, dates and text);
   * any other clause leaves the stored order.
   */
  private static ordered(rows: Row[], orderBy: string): Row[] {
    const order = /^(\w+) (ASC|DESC)$/.exec(orderBy.trim());
    if (!order) return rows;
    const key = (r: Row): number | string => {
      const cell = r[order[1]];
      return cell instanceof Date ? cell.getTime() : typeof cell === 'number' ? cell : String(cell);
    };
    const sign = order[2] === 'DESC' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      return x === y ? 0 : (x < y ? -1 : 1) * sign;
    });
  }

  /** A stored cell, or null for a column the row does not hold. */
  private static cellOrNull(cell: Cell | undefined): Cell {
    return cell === undefined ? null : cell;
  }

  private static copyTables(tables: Record<string, Row[]>): Record<string, Row[]> {
    return Object.fromEntries(Object.entries(tables).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]));
  }
}

/**
 * The store's provider: the unit-testing `DatabaseProviderStub` (a real `DatabaseProviderBase`, so no cast), with the
 * members the registry calls answered from the store: entity transactions, `RunQuery`, `RunView` and `GetEntityObject`
 * (the last two through `vi.fn`, as the repo's other stub providers do, since their generic results are field bags).
 */
export class GateTestProvider extends DatabaseProviderStub {
  constructor(private readonly store: GateTestStore) {
    super();
    this.RunView = vi.fn().mockImplementation(async (params: RunViewParams, contextUser?: UserInfo) => store.RunViewRows(params, contextUser));
    this.GetEntityObject = vi.fn().mockImplementation(async (entityName: string, contextUser?: UserInfo) => store.NewRecordOf(entityName, contextUser));
  }

  public override get SupportsEntityTransactions(): boolean {
    return this.store.SupportsTransactions;
  }

  public override async BeginEntityTransaction(): Promise<EntityTransactionScope> {
    return this.store.Begin();
  }

  public override async RunQuery(params: RunQueryParams): Promise<RunQueryResult> {
    return this.store.RunQueryRows(params);
  }

  /**
   * One of the store's {@link GateTestStore.PermissionedEntities}, with its permission rows (the gate's initiator check
   * reads `MJ: ML Models`).
   *
   * @throws Error naming the entity for any other name, so a step that reads an entity the fake does not describe
   *   fails loudly instead of getting `undefined`
   */
  public override EntityByName(entityName: string): EntityInfo | undefined {
    const entity = this.store.EntityInfoOf(entityName, this);
    if (entity === null) throw new Error(`GateTestProvider: EntityByName('${entityName}') — the fake describes only ${Object.keys(GateTestStore.PermissionedEntities).join(', ')}`);
    return entity;
  }
}

/** What the world stores for one training run, so a test can rewrite its stored leakage audit. */
interface WorldRun {
  readonly RunID: string;
  readonly ProtocolID: string;
  Result: TrainerCompleted;
  readonly Gate: StoredGateRecord;
}

/** One model of the world, as the tests name it. */
export interface WorldModel {
  readonly ID: string;
  readonly RunID: string;
}

/**
 * The stored rows of one pipeline: per training run, its own protocol version row (so pinning one model's protocol
 * changes nothing else), a v2 `ValidationResults` envelope with the gate record the gate owner builds, and, for a run
 * that ships, a model row with its registered delivery and the shipped artifact's bytes in the memory storage account.
 */
export class GateWorld {
  public static readonly PipelineID = '6A1D2E3F-0000-4000-8000-0000000000A1';
  public static readonly UnitID = '6A1D2E3F-0000-4000-8000-0000000000A2';
  public static readonly StorageProviderID = '6A1D2E3F-0000-4000-8000-0000000000A3';
  public static readonly JobTypeID = '6A1D2E3F-0000-4000-8000-0000000000A4';
  public static readonly PipelineName = 'Gate Test Pipeline';
  /** The world's MJ system user (the gate's write identity, D4-134): it holds the full role, like the server's account. */
  public static readonly SystemUser: UserInfo = new UserInfo(null, {
    ID: '6A1D2E3F-0000-4000-8000-0000000000A6', Email: 'gate-system@example.com', Type: 'Owner',
    UserRoles: [new UserRoleInfo({ UserID: '6A1D2E3F-0000-4000-8000-0000000000A6', RoleID: GateTestStore.FullRoleID })],
  });
  public static readonly User: UserInfo = new UserInfo(null, {
    ID: '6A1D2E3F-0000-4000-8000-0000000000A5', Email: 'gate-tests@example.com', Type: 'User',
    UserRoles: [new UserRoleInfo({ UserID: '6A1D2E3F-0000-4000-8000-0000000000A5', RoleID: GateTestStore.FullRoleID })],
  });
  private readonly runs = new Map<string, WorldRun>();
  private next = 0;

  constructor(public readonly Store: GateTestStore, private readonly storage: MemoryStorageAccount) {
    Store.World = this;
    Store.Insert('MJ: Scheduled Job Types', { ID: GateWorld.JobTypeID, Name: 'Predictive Studio Model Monitoring' });
    Store.Insert('MJ: ML Training Pipelines', { ID: GateWorld.PipelineID, Name: GateWorld.PipelineName });
  }

  /**
   * An `MJ: Process Runs` row started by `startedByUserId` (an auto-train run's recipient, D4-18), of the Record Process
   * `recordProcessId` when given; returns it.
   */
  public ProcessRun(startedByUserId: string | null, recordProcessId: string | null = null): { readonly ID: string; readonly StartedByUserID: string | null } {
    const row = { ID: this.id(), StartedByUserID: startedByUserId, RecordProcessID: recordProcessId, Status: 'Running' };
    this.Store.Insert('MJ: Process Runs', row);
    return row;
  }

  /** An `MJ: AI Agent Runs` row run for `userId` (an agent publish's recipient, D4-18); returns it. */
  public AgentRun(userId: string | null): { readonly ID: string; readonly UserID: string | null } {
    const row = { ID: this.id(), UserID: userId, Status: 'Running' };
    this.Store.Insert('MJ: AI Agent Runs', row);
    return row;
  }

  /** An `MJ: Scheduled Job Runs` row of a new `MJ: Scheduled Jobs` row owned by `ownerUserId` (D4-18); returns the run. */
  public ScheduledJobRun(ownerUserId: string | null): { readonly ID: string; readonly ScheduledJobID: string } {
    const job = { ID: this.id(), JobTypeID: GateWorld.JobTypeID, OwnerUserID: ownerUserId, Status: 'Active' };
    this.Store.Insert('MJ: Scheduled Jobs', job);
    const run = { ID: this.id(), ScheduledJobID: job.ID, Status: 'Running' };
    this.Store.Insert('MJ: Scheduled Job Runs', run);
    return run;
  }

  /** An `'ML Model'` `MJ: Record Processes` row whose Configuration declares `autoTrain` for the world's pipeline; returns it. */
  public RecordProcess(): { readonly ID: string } {
    const row = { ID: this.id(), EntityID: GateWorld.UnitID, WorkType: 'ML Model', ScheduleEnabled: false, Configuration: JSON.stringify({ autoTrain: { pipelineId: GateWorld.PipelineID } }) };
    this.Store.Insert('MJ: Record Processes', row);
    return row;
  }

  /**
   * Completes the training run row `runId` (one a claim saved `Running`) as the world's trainer would: its stored
   * results for `outcome` (`model`: the finalist ships; `keep`: the simple baseline is kept; `no-signal`: nothing ships)
   * and, for a run that ships, its Draft model; returns the run and model IDs.
   */
  public TrainRun(runId: string, outcome: 'model' | 'keep' | 'no-signal'): { readonly TrainingRunID: string; readonly ModelID: string | null } {
    if (outcome === 'no-signal') {
      this.storeRun(runId, TrainerResultFixtures.CannedNoSignal(runId, ProtocolRowFixture.Spec()), null);
      return { TrainingRunID: runId, ModelID: null };
    }
    const modelId = this.id();
    const result = outcome === 'model' ? TrainerResultFixtures.CannedModelWins(runId, ProtocolRowFixture.Spec()) : TrainerResultFixtures.CannedCompleted(runId, ProtocolRowFixture.Spec());
    const run = this.storeRun(runId, result, modelId);
    this.storeModel(modelId, run, this.storeSnapshot(run), 'Draft', this.nextVersion());
    return { TrainingRunID: runId, ModelID: modelId };
  }

  /**
   * A model of the world's pipeline in `status` with a stored artifact that verifies and no training run row (the
   * pipeline's training runs stay those a test trains): a reuse candidate, or the model a process is configured with.
   */
  public AddModel(pipelineId: string, status: string, artifactStatus: string): WorldModel {
    if (!UUIDsEqual(pipelineId, GateWorld.PipelineID)) throw new Error(`GateWorld: the world holds one pipeline (${GateWorld.PipelineID}), not ${pipelineId}`);
    const modelId = this.id();
    const bytes = new TextEncoder().encode(JSON.stringify({ format: 'ps-predictor/v2', version: 2, candidate: 'xgb', model: modelId }));
    const fileId = this.storeArtifact(bytes);
    this.Store.Insert('MJ: ML Models', {
      ID: modelId, PipelineID: GateWorld.PipelineID, Pipeline: GateWorld.PipelineName, Version: this.nextVersion(), Status: status, StatusReason: null, TrainingRunID: null,
      ArtifactFileID: fileId, ArtifactSha256: SnapshotHash.Sha256Hex(bytes), ArtifactStatus: artifactStatus, ArtifactCheckedAt: null, Lineage: null,
    });
    return { ID: modelId, RunID: '' };
  }

  /** A model of `outcome` in `status` (the incumbent's diff, when given, is stored on its run). */
  public Model(
    status: string, outcome: 'model' | 'keep', o: { readonly IncumbentID?: string | null; readonly Version?: number } = {},
  ): WorldModel {
    const runId = this.id();
    const modelId = this.id();
    const base = outcome === 'model'
      ? TrainerResultFixtures.CannedModelWins(runId, ProtocolRowFixture.Spec())
      : TrainerResultFixtures.CannedCompleted(runId, ProtocolRowFixture.Spec());
    const result: TrainerCompleted = o.IncumbentID ? { ...base, incumbentDiff: { incumbentModelId: o.IncumbentID, value: 0.02, lower: 0.01, upper: 0.03 } } : base;
    const run = this.storeRun(runId, result, modelId);
    const snapshotId = this.storeSnapshot(run);
    // ML Model versions start at 1, so `||` falls back to the counter only for an absent Version.
    this.storeModel(modelId, run, snapshotId, status, o.Version || this.next);
    return { ID: modelId, RunID: runId };
  }

  /** A completed run with no model row: `no-signal`, or a kept incumbent-heuristic rule. */
  public RunWithoutModel(kind: 'no-signal' | 'kept-rule'): { readonly ID: string } {
    const runId = this.id();
    const canned = TrainerResultFixtures.CannedCompleted(runId, ProtocolRowFixture.Spec());
    const result: TrainerCompleted = kind === 'no-signal' ? TrainerResultFixtures.CannedNoSignal(runId, ProtocolRowFixture.Spec()) : {
      ...canned,
      baselines: [...canned.baselines, { baseline: { kind: 'incumbent-heuristic', name: 'renewed last year' }, role: 'simple', holdout: TrainerResultFixtures.Mwi('log-loss', 0.44, 0.42, 0.46, 1205) }],
      comparisons: { ...canned.comparisons, 'heuristic:renewed last yearVsDummy': { value: 0.08, ci: [0.06, 0.1], beats: true }, 'modelVs:heuristic:renewed last year': { value: -0.012, ci: [-0.02, -0.004], beats: false } },
      gate: { outcome: 'keep-simple-baseline', branch: 'b:keep-simple-baseline', shipped: 'heuristic:renewed last year', shippedRole: 'simpleBaseline', note: null },
    };
    this.storeRun(runId, result, null);
    return { ID: runId };
  }

  /** Changes the promotion rule of the protocol version row the model's run was evaluated under. */
  public PinProtocol(modelId: string, change: Partial<PromotionRule>): void {
    const run = this.runOf(modelId);
    const row = this.Store.Row('MJ: ML Evaluation Protocols', run.ProtocolID);
    if (!row) throw new Error(`no protocol row ${run.ProtocolID}`);
    row['Promotion'] = JSON.stringify({ ...GateTestStore.JsonObjectColumn(row, 'Promotion'), ...change });
  }

  /** Stores `flags` as the leakage audit of the model's training run (`ValidationResults.trainer.leakageFlags`). */
  public FlagLeakage(modelId: string, flags: readonly LeakageFlag[]): void {
    const run = this.runOf(modelId);
    run.Result = { ...run.Result, leakageFlags: flags };
    const row = this.Store.Row('MJ: ML Training Runs', run.RunID);
    if (row) row['ValidationResults'] = TrainerResultFixtures.ValidationResultsFor(run.Result, { Gate: run.Gate });
  }

  /**
   * Replaces the stored gate record (and trainer result) of the model's training run with the ones `result` gives under
   * the run's own protocol row: a stored record whose intervals re-derive to whatever `result`'s do.
   */
  public StoreGateRecord(modelId: string, result: TrainerCompleted): void {
    const run = this.runOf(modelId);
    const built = GateRecords.BuildStoredGateRecord({ Result: result, Protocol: ProtocolRowFixture.Spec({ ID: run.ProtocolID, LineageRootID: run.ProtocolID }), Task: GATE_TASK, Carve: null });
    if (built.Ok === false) throw new Error(`GateWorld: the gate record was refused: ${built.Refusal.kind}`);
    const row = this.Store.Row('MJ: ML Training Runs', run.RunID);
    if (row) row['ValidationResults'] = TrainerResultFixtures.ValidationResultsFor(result, { Gate: built.Record });
  }

  /** The bytes of the model's shipped artifact in storage, replaced (a hash mismatch on the next load). */
  public CorruptArtifact(modelId: string): void {
    const key = String(this.Store.Row('MJ: ML Models', modelId)?.['ArtifactFileID']);
    this.storage.Objects.set(`artifacts/${key}`, new TextEncoder().encode('{"tampered":true}'));
  }

  private storeRun(runId: string, result: TrainerCompleted, modelId: string | null): WorldRun {
    const protocolId = this.id();
    const protocol: EvaluationProtocolColumns = ProtocolRowFixture.Row({ ID: protocolId, LineageRootID: protocolId });
    this.Store.Insert('MJ: ML Evaluation Protocols', { ...protocol, __mj_CreatedAt: new Date('2026-01-01T00:00:00Z') });
    const built = GateRecords.BuildStoredGateRecord({ Result: result, Protocol: ProtocolRowFixture.Spec({ ID: protocolId, LineageRootID: protocolId }), Task: GATE_TASK, Carve: null });
    if (built.Ok === false) throw new Error(`GateWorld: the gate record was refused: ${built.Refusal.kind}`);
    const run: WorldRun = { RunID: runId, ProtocolID: protocolId, Result: result, Gate: built.Record };
    this.runs.set(runId, run);
    const columns: Row = {
      ID: runId, PipelineID: GateWorld.PipelineID, Pipeline: GateWorld.PipelineName, ResultingModelID: modelId, EvaluationProtocolID: protocolId, Status: 'Completed',
      ValidationResults: TrainerResultFixtures.ValidationResultsFor(result, { Gate: built.Record }),
    };
    const claimed = this.Store.Row('MJ: ML Training Runs', runId);
    if (claimed) Object.assign(claimed, columns);
    else this.Store.Insert('MJ: ML Training Runs', columns);
    return run;
  }

  /**
   * The Training Snapshot row the run trained on (its own content hash, the fixtures' data cutoff), linked from the run
   * row; returns its ID.
   */
  private storeSnapshot(run: WorldRun): string {
    const snapshotId = this.id();
    this.Store.Insert('MJ: ML Training Snapshots', {
      ID: snapshotId, PipelineID: GateWorld.PipelineID, PredictionUnitID: GateWorld.UnitID, ContentHash: SnapshotHash.Sha256Hex(new TextEncoder().encode(`snapshot ${snapshotId}`)),
      DataCutoff: new Date('2026-01-01T00:00:00Z'),
    });
    const row = this.Store.Row('MJ: ML Training Runs', run.RunID);
    if (row) row['TrainingSnapshotID'] = snapshotId;
    return snapshotId;
  }

  private storeModel(modelId: string, run: WorldRun, snapshotId: string, status: string, version: number): void {
    const decision = run.Gate.decision;
    if (decision.outcome === 'no-signal') throw new Error('GateWorld: a no-signal run has no model row');
    const shipped = decision.shipped;
    const bytes = new TextEncoder().encode(JSON.stringify({ format: 'ps-predictor/v2', version: 2, candidate: shipped }));
    const sha = SnapshotHash.Sha256Hex(bytes);
    const fileId = this.storeArtifact(bytes);
    const delivery: RegisteredDeliveryView = {
      kind: 'delivered', gate: decision, shipped, shippedRole: decision.shippedRole,
      artifact: { fileId, storageProviderId: GateWorld.StorageProviderID, providerKey: `artifacts/${fileId}`, sha256: sha, sizeBytes: bytes.byteLength, writeOnce: true },
    };
    this.Store.Insert('MJ: ML Models', {
      ID: modelId, PipelineID: GateWorld.PipelineID, Pipeline: GateWorld.PipelineName, Version: version, Status: status, StatusReason: null, TrainingRunID: run.RunID,
      EvaluationProtocolID: run.ProtocolID, PredictionUnitID: GateWorld.UnitID, OutputSemantics: JSON.stringify({ task: GATE_TASK }),
      Delivery: JSON.stringify(delivery), ArtifactFileID: fileId, ArtifactSha256: sha, ArtifactStatus: 'verified', ArtifactCheckedAt: null,
      Lineage: null, FeatureSchema: JSON.stringify([{ Name: 'EventsAttended' }, { Name: 'Tenure' }]), TrainingSnapshotID: snapshotId,
      SnapshotHash: this.Store.Row('MJ: ML Training Snapshots', snapshotId)?.['ContentHash'] || null,
      ServingWhileUnevaluated: false,
    });
    if (status !== 'Draft' && status !== 'Unevaluated') this.storeDefaultBindings(modelId);
  }

  /** The output bindings Evaluate creates, stored for a model the world puts past Draft (it was evaluated). */
  private storeDefaultBindings(modelId: string): void {
    for (const b of SemanticsRules.DefaultBindings({ task: GATE_TASK })) this.Store.Insert('MJ: ML Output Bindings', { ID: this.id(), ModelID: modelId, ...b });
  }

  /** Stores artifact bytes in the memory storage account with their `MJ: Files` row; returns the file ID. */
  private storeArtifact(bytes: Uint8Array): string {
    const fileId = this.id();
    this.storage.Objects.set(`artifacts/${fileId}`, bytes);
    this.Store.Insert('MJ: Files', { ID: fileId, ProviderID: GateWorld.StorageProviderID, ProviderKey: `artifacts/${fileId}` });
    return fileId;
  }

  /** The next model version of the world's pipeline (the highest stored version plus one). */
  private nextVersion(): number {
    return Math.max(0, ...(this.Store.Tables['MJ: ML Models'] || []).map((m) => Number(m['Version']) || 0)) + 1;
  }

  private runOf(modelId: string): WorldRun {
    const runId = String(this.Store.Row('MJ: ML Models', modelId)?.['TrainingRunID']);
    const run = this.runs.get(runId);
    if (!run) throw new Error(`GateWorld: no run for model ${modelId}`);
    return run;
  }

  private id(): string {
    this.next++;
    return `6A1D2E3F-0000-4000-8000-${this.next.toString(16).padStart(12, '0').toUpperCase()}`;
  }
}
