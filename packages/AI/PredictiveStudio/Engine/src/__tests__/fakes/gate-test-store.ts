/**
 * `GateTestStore` — the lifecycle gate's fake provider over in-memory rows (Task M3.2), and `GateWorld`, the stored rows
 * of one pipeline that the gate tests act on. The store answers `RunView` (evaluating the `Field='v'`, `Field=n` and
 * `Field IN (…)` clauses the registry writes, case-insensitively as SQL Server's collation does), `GetEntityObject`,
 * `RunQuery` for the three stored lock/version Queries and entity transactions (a transaction snapshots every table at
 * its outermost begin and a rollback restores the snapshot). Every read is appended to {@link GateTestStore.Reads} and
 * every save counted, so a test can assert "one read" or "read after the locks". Entity rows are handed to the gate as
 * plain field bags behind a `Proxy`, through one deliberate test-double cast at the provider boundary (the gate only
 * ever touches the typed generated members, never `.Get()`/`.Set()`).
 */
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { IsPlatformSQL, UserInfo, type EntityTransactionScope, type IMetadataProvider, type RunQueryParams, type RunQueryResult, type RunViewParams } from '@memberjunction/core';
import { DatabaseProviderStub } from '@memberjunction/unit-testing';
import { UUIDsEqual } from '@memberjunction/global';
import {
  GateRecords,
  JsonParse,
  type EvaluationProtocolColumns,
  type JsonObject,
  type JsonValue,
  type LeakageFlag,
  type PromotionRule,
  type RegisteredDeliveryView,
  type StoredGateRecord,
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
const RECORD_MEMBERS = new Set(['Save', 'Delete', 'NewRecord', 'LatestResult', 'RefusalObject', 'IsSaved', 'then']);

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

/** The in-memory provider. */
export class GateTestStore {
  /** Rows by entity name. */
  public Tables: Record<string, Row[]> = {};
  /** Every read, in order: `view <entity> <filter>` or `query <name>`. */
  public readonly Reads: string[] = [];
  /** The same reads as a log a test can make fail ({@link ReadLog.FailNext}). */
  public readonly ReadLog = new ReadLog(this.Reads);
  /** Every save, in order: `<entity> <ID>`. */
  public readonly Saves: string[] = [];
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

  /** The model's persisted status. */
  public Status(modelId: string): Cell {
    return this.Row('MJ: ML Models', modelId)?.['Status'] ?? null;
  }

  /** The model's persisted `StatusReason`. */
  public StatusReason(modelId: string): Cell {
    return this.Row('MJ: ML Models', modelId)?.['StatusReason'] ?? null;
  }

  /** The model's publish records. */
  public PublishRecords(modelId: string): Row[] {
    return (this.Tables['MJ: ML Model Publish Records'] || []).filter((r) => UUIDsEqual(String(r['ModelID']), modelId));
  }

  /** The publish records of a training run. */
  public PublishRecordsOfRun(trainingRunId: string): Row[] {
    return (this.Tables['MJ: ML Model Publish Records'] || []).filter((r) => UUIDsEqual(String(r['TrainingRunID']), trainingRunId));
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
  public RunViewRows(params: RunViewParams): { Success: boolean; Results: object[]; TotalRowCount: number; ErrorMessage: string } {
    const filter = GateTestStore.textOf(params.ExtraFilter);
    const orderBy = GateTestStore.textOf(params.OrderBy);
    this.Reads.push(`view ${params.EntityName} ${filter}`);
    this.ViewReads.push({ EntityName: params.EntityName || '', BypassCache: params.BypassCache === true });
    if (this.ReadLog.TakeFailure(params.EntityName || '')) return { Success: false, Results: [], TotalRowCount: 0, ErrorMessage: `GateTestStore: the read of ${params.EntityName} failed` };
    const predicates = filter.split(' AND ').filter((c) => c.trim().length > 0).map((c) => GateTestStore.clause(c.trim()));
    const cached = params.BypassCache === true ? undefined : this.CachedTables[params.EntityName || ''];
    let rows = (cached || this.Tables[params.EntityName || ''] || []).filter((r) => predicates.every((p) => p(r)));
    if (orderBy.includes('RecordedAt DESC')) rows = [...rows].reverse();   // rows are appended in RecordedAt order
    if (params.MaxRows) rows = rows.slice(0, params.MaxRows);
    const results = params.ResultType === 'entity_object'
      ? rows.map((r) => this.record(params.EntityName || '', { ...r }, true))
      : rows.map((r) => (params.Fields ? Object.fromEntries(params.Fields.map((f) => [f, r[f] ?? null])) : { ...r }));
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
      case 'Predictive Studio: Next Model Version': {
        const versions = (this.Tables['MJ: ML Models'] || []).filter((m) => UUIDsEqual(String(m['PipelineID']), p['PipelineID'])).map((m) => Number(m['Version']));
        return [{ NextVersion: Math.max(0, ...versions) + 1 }];
      }
      default:
        throw new Error(`GateTestStore: no such query ${name}`);
    }
  }

  /** @internal a new, unsaved record of `entityName` */
  public NewRecordOf(entityName: string): object {
    return this.record(entityName, {}, false);
  }

  /** A field bag behind a Proxy: column reads and writes go to `values`; `Save()` writes the row back. */
  private record(entityName: string, values: Row, saved: boolean): object {
    const store = this;
    const state: { saved: boolean; latest: { CompleteMessage: string } | null } = { saved, latest: null };
    const target = {
      async Save(): Promise<boolean> {
        store.OnSave?.(entityName, proxy);
        const failure = store.FailingSaves.get(entityName);
        if (failure !== undefined) {
          state.latest = { CompleteMessage: failure };
          return false;
        }
        if (!values['ID']) values['ID'] = randomUUID().toUpperCase();
        const table = (store.Tables[entityName] ||= []);
        const at = table.findIndex((r) => UUIDsEqual(String(r['ID']), String(values['ID'])));
        if (at >= 0) table[at] = { ...table[at], ...values };
        else table.push({ ...values });
        store.Saves.push(`${entityName} ${values['ID']}`);
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
    };
    const proxy: object = new Proxy(target, {
      get(t, prop) {
        if (prop === 'LatestResult') return state.latest;
        if (prop === 'IsSaved') return state.saved;
        if (prop === 'RefusalObject') {
          if (typeof values['Refusal'] !== 'string') return null;
          const refusal: JsonValue = JSON.parse(values['Refusal']);
          return refusal;
        }
        if (typeof prop === 'string' && RECORD_MEMBERS.has(prop)) return Reflect.get(t, prop);
        return typeof prop === 'string' ? (values[prop] ?? null) : undefined;
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

  private static clause(clause: string): (row: Row) => boolean {
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
    this.RunView = vi.fn().mockImplementation(async (params: RunViewParams) => store.RunViewRows(params));
    this.GetEntityObject = vi.fn().mockImplementation(async (entityName: string) => store.NewRecordOf(entityName));
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
  public static readonly User: UserInfo = new UserInfo(null, { ID: '6A1D2E3F-0000-4000-8000-0000000000A5', Email: 'gate-tests@example.com', Type: 'User' });
  private readonly runs = new Map<string, WorldRun>();
  private next = 0;

  constructor(public readonly Store: GateTestStore, private readonly storage: MemoryStorageAccount) {
    Store.World = this;
    Store.Insert('MJ: Scheduled Job Types', { ID: GateWorld.JobTypeID, Name: 'Predictive Studio Model Monitoring' });
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
    this.storeModel(modelId, run, status, o.Version ?? this.next);
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
    this.Store.Insert('MJ: ML Training Runs', {
      ID: runId, PipelineID: GateWorld.PipelineID, ResultingModelID: modelId, EvaluationProtocolID: protocolId, Status: 'Completed',
      ValidationResults: TrainerResultFixtures.ValidationResultsFor(result, { Gate: built.Record }),
    });
    return run;
  }

  private storeModel(modelId: string, run: WorldRun, status: string, version: number): void {
    const decision = run.Gate.decision;
    if (decision.outcome === 'no-signal') throw new Error('GateWorld: a no-signal run has no model row');
    const shipped = decision.shipped;
    const bytes = new TextEncoder().encode(JSON.stringify({ format: 'ps-predictor/v2', version: 2, candidate: shipped }));
    const sha = SnapshotHash.Sha256Hex(bytes);
    const fileId = this.id();
    this.storage.Objects.set(`artifacts/${fileId}`, bytes);
    this.Store.Insert('MJ: Files', { ID: fileId, ProviderID: GateWorld.StorageProviderID, ProviderKey: `artifacts/${fileId}` });
    const delivery: RegisteredDeliveryView = {
      kind: 'delivered', gate: decision, shipped, shippedRole: decision.shippedRole,
      artifact: { fileId, storageProviderId: GateWorld.StorageProviderID, providerKey: `artifacts/${fileId}`, sha256: sha, sizeBytes: bytes.byteLength, writeOnce: true },
    };
    this.Store.Insert('MJ: ML Models', {
      ID: modelId, PipelineID: GateWorld.PipelineID, Version: version, Status: status, StatusReason: null, TrainingRunID: run.RunID,
      EvaluationProtocolID: run.ProtocolID, PredictionUnitID: GateWorld.UnitID, OutputSemantics: JSON.stringify({ task: GATE_TASK }),
      Delivery: JSON.stringify(delivery), ArtifactFileID: fileId, ArtifactSha256: sha, ArtifactStatus: 'verified', ArtifactCheckedAt: null,
      Lineage: null, FeatureSchema: JSON.stringify([{ Name: 'EventsAttended' }, { Name: 'Tenure' }]), SnapshotHash: 'a'.repeat(64),
      ServingWhileUnevaluated: false,
    });
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
