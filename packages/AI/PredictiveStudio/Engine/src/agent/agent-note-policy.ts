/**
 * @module agent/agent-note-policy
 *
 * `PredictiveStudioAgentNotePolicy` — the Predictive Studio agents' memory policy (`AgentMemoryPolicy`, PR 5 A5; design
 * §5.1.4, D5-4, D5-11). One owner class for the `PreSave` hook on `MJ: AI Agent Notes` and the hourly sweep; both decide
 * activation through one protected check, so the two cannot drift.
 *
 * The hook runs on every note save from any writer (GraphQL, `MemoryWriteManager`, the Memory Manager agent, an
 * `Update Record` Action) and applies only to notes whose `AgentID` is one of the five PS agents:
 *
 * 1. `Provisional` is never accepted (`provisional-refused`).
 * 2. A new PS-agent note (or a note moved onto a PS agent) is saved only as `Pending` (`pending-only-on-create`), and only
 *    when its source run tree links to no leakage-flagged model, no failed build and no model that is not `Published`
 *    with a publish record (`source-not-qualifying`). A tree that links to no model yet is accepted as `Pending`.
 * 3. A save that makes a note `Active`, or changes an `Active` note's agent, source run or scope, needs the activation
 *    rule (`activation-rule-failed`): the tree links to at least one model, every linked model is `Published` with an
 *    `MJ: ML Model Publish Records` `publish` row and unflagged, no build failed, and the note has a `UserID` or
 *    `CompanyID`. The hook re-reads the persisted row itself (never `OldValue`), whoever saves.
 *
 * The **source run tree** of a note (D5-A5-1): its `SourceAIAgentRunID`'s root run, every earlier run of that session
 * (`LastRunID`, as `BuildApprovalResolver.SessionRuns`), and every descendant of those roots. A tree **links to** the
 * pipelines its runs claimed builds for (`MJ: ML Build Approval Claims.MLTrainingPipelineID`), their training runs and
 * their models — the lineage G4.1 checks. A failed claim or a `Failed` training run is a failed build; a training run
 * whose stored trainer result carries leakage flags flags the tree.
 *
 * The sweep activates every qualifying `Pending` (or pre-policy `Provisional`) PS-agent note and archives every note
 * whose source stops qualifying (flagged, failed, not Published — archived, rolled back) or whose scope is NULL/NULL,
 * writing the outcome to the note's `Comments`. Existing PS notes at deploy time are archived by its first run (DD-3).
 * The framework's `isRunTainted` is unchanged for every agent (D5-4).
 */
import {
  BaseEngineRegistry, LogError, RunView,
  type BaseEntity, type CompositeKey, type IMetadataProvider, type PreSaveHook, type RunViewParams, type UserInfo,
} from '@memberjunction/core';
import { MJAIAgentNoteEntity, type MJAIAgentEntity, type MJAIAgentRunEntity, type MJMLBuildApprovalClaimEntity, type MJMLModelEntity, type MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDMap, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { PREDICTIVE_STUDIO_AGENT_MEMORY_POLICY, TrainingRunResultsParser, type NoteRefusal, type NoteSourceRefusalReason } from '@memberjunction/predictive-studio-core';

import { PreSaveHookRegistration } from '../registry/pre-save-hook-registration';
import type { RegistryContext } from '../registry/registry-context';
import { GuardContexts } from '../registry/guard-context';

/** A note refusal bound to the generated `Status` union. */
export type PredictiveStudioNoteRefusal = NoteRefusal<MJAIAgentNoteEntity['Status']>;

/** The note fields the policy reads (from the saving entity and from the persisted row). */
export type NotePolicyFields = Pick<MJAIAgentNoteEntity, 'ID' | 'AgentID' | 'Status' | 'UserID' | 'CompanyID' | 'SourceAIAgentRunID'>;

/** What a note's source run tree links to, read from stored rows. */
export interface NoteSourceFacts {
  /** The pipelines the tree's runs claimed builds for. */
  readonly PipelineIDs: readonly string[];
  /** Every model of those pipelines, with whether it is `Published` and has a `publish` record. */
  readonly Models: readonly { readonly ID: string; readonly Status: MJMLModelEntity['Status']; readonly HasPublishRecord: boolean }[];
  /** True when a claim failed or a training run of those pipelines is `Failed`. */
  readonly BuildFailed: boolean;
  /** True when a training run of those pipelines stores leakage flags. */
  readonly LeakageFlagged: boolean;
}

/** The source verdict: a refusal reason, no linked model yet, or qualifying. */
export type NoteSourceVerdict =
  | { readonly Kind: 'refused'; readonly Reason: NoteSourceRefusalReason }
  | { readonly Kind: 'no-model' }
  | { readonly Kind: 'qualifies'; readonly ModelIDs: readonly string[] };

/** Why the activation rule fails: no user or company, a refused source tree, or a tree that links to no model yet. */
export type NoteActivationFailure = 'no-scope' | 'source-refused' | 'no-model';

/** The activation rule's result, with the reason in words. */
export type NoteActivationVerdict =
  | { readonly Holds: true; readonly Reason: string }
  | { readonly Holds: false; readonly Failure: NoteActivationFailure; readonly Reason: string };

/** What the sweep did. `Failed` names each note save that failed (`<note id>: <message>`). */
export interface NoteSweepResult {
  readonly Activated: number;
  readonly Archived: number;
  readonly Failed: readonly string[];
}

/** Narrows a sweep to the notes a run of `UserID`/`CompanyID` would be injected (DD-10's pre-injection call). */
export interface NoteSweepScope {
  readonly UserID: string | null;
  readonly CompanyID: string | null;
}

type RunLink = Pick<MJAIAgentRunEntity, 'ID' | 'LastRunID' | 'RootParentRunID'>;
type ClaimRow = Pick<MJMLBuildApprovalClaimEntity, 'ID' | 'Outcome' | 'MLTrainingPipelineID'>;
type TrainingRow = Pick<MJMLTrainingRunEntity, 'ID' | 'Status' | 'ValidationResults'>;
type ModelRow = Pick<MJMLModelEntity, 'ID' | 'Status'>;
type AgentRow = { readonly ID: string; readonly Name: string | null };

/** Set once this copy of the module has registered (or found) its hook. */
let registered = false;

/** The PS-agent ID set per provider (agents are metadata; a per-request provider is collected with its entry). */
const agentIdsByProvider = new WeakMap<IMetadataProvider, Promise<UUIDSet>>();

/** The Predictive Studio agents' memory policy: the `PreSave` hook, the sweep and their shared activation rule. */
export class PredictiveStudioAgentNotePolicy {
  /** The entity the hook guards. */
  public static readonly EntityName = 'MJ: AI Agent Notes';
  /** The five Predictive Studio agents whose notes the policy governs. */
  public static readonly AGENT_NAMES: readonly string[] = ['Model Development Agent', 'Goal Analyst', 'Data Scout', 'Experiment Designer', 'Pipeline Builder'];
  /** The global mark of the note hook. */
  public static readonly HookMark: symbol = Symbol.for('@memberjunction/predictive-studio:agent-note-policy');
  /** The policy this class enforces. */
  public static readonly Policy = PREDICTIVE_STUDIO_AGENT_MEMORY_POLICY;
  /** Notes read per sweep page (keyset pages over `ID`; a page is processed before the next is read). */
  public static readonly SWEEP_PAGE_SIZE = 500; // one RunView page; bounds memory per page, not the number of notes swept
  /** The statuses the sweep visits: the injectable ones and the not-yet-active one. */
  private static readonly sweptStatuses: readonly MJAIAgentNoteEntity['Status'][] = ['Pending', 'Active', 'Provisional'];

  /** Registers the note hook once per process. */
  public static Register(): void {
    if (registered) return;
    registered = true;
    const hook: PreSaveHook = (entity, contextUser) => PredictiveStudioAgentNotePolicy.CheckNoteSave(entity, contextUser);
    PreSaveHookRegistration.RegisterOnce(PredictiveStudioAgentNotePolicy.HookMark, hook);
  }

  /**
   * The hook's body: `true` for a save the policy allows (or does not govern), else the refusal as a message naming the
   * note and the typed refusal. A save it cannot check (no provider or user, a failed read) is refused (fail closed).
   */
  public static async CheckNoteSave(entity: BaseEntity, contextUser: UserInfo | undefined): Promise<boolean | string> {
    if (entity.EntityInfo?.Name !== PredictiveStudioAgentNotePolicy.EntityName || !(entity instanceof MJAIAgentNoteEntity)) return true;
    const ctx = GuardContexts.ForSave(entity.ProviderToUse, contextUser);
    try {
      if (!entity.AgentID) return true;
      if (ctx === null) return PredictiveStudioAgentNotePolicy.uncheckable(entity, 'the save has no metadata provider or user to check it with');
      if (!(await PredictiveStudioAgentNotePolicy.IsPredictiveStudioAgent(entity.AgentID, ctx))) return true;
      const persisted = entity.IsSaved ? await PredictiveStudioAgentNotePolicy.ReadPersisted(entity.ID, ctx) : null;
      const refusal = await PredictiveStudioAgentNotePolicy.Decide(entity, persisted, ctx);
      return refusal === null ? true : PredictiveStudioAgentNotePolicy.RefusalMessage(entity.ID, refusal);
    } catch (error) {
      return PredictiveStudioAgentNotePolicy.uncheckable(entity, `a read of the stored rows failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * The decision for one save of a PS-agent note: null to allow, else the refusal. `persisted` is the stored row (null
   * for a create); a persisted row of a non-PS agent is treated as a create (the note is moving onto a PS agent).
   *
   * @throws Error when a read fails
   */
  public static async Decide(note: NotePolicyFields, persisted: NotePolicyFields | null, ctx: RegistryContext): Promise<PredictiveStudioNoteRefusal | null> {
    const created = persisted === null || !(await PredictiveStudioAgentNotePolicy.IsPredictiveStudioAgent(persisted.AgentID || '', ctx));
    if (created) return PredictiveStudioAgentNotePolicy.DecideCreate(note, ctx);
    if (note.Status === 'Provisional') return { kind: 'provisional-refused' };
    if (!PredictiveStudioAgentNotePolicy.NeedsActivationCheck(note, persisted)) return null;
    const verdict = await PredictiveStudioAgentNotePolicy.ActivationVerdict(note, ctx);
    return verdict.Holds ? null : { kind: 'activation-rule-failed', reason: verdict.Reason };
  }

  /**
   * The sweep (D5-11): activates every qualifying `Pending`/`Provisional` PS-agent note and archives every one whose
   * source does not qualify or whose scope is NULL/NULL; leaves a `Pending` note whose tree links to no model yet. Every
   * save goes through the hook (which re-checks the rule). `scope` narrows it to the notes a run of that user/company
   * would be injected, agent-wide ones included (DD-10).
   *
   * @throws Error when a read fails (a failed note save is counted in `Failed`, the others still swept)
   */
  public static async Sweep(provider: IMetadataProvider, contextUser: UserInfo, scope?: NoteSweepScope): Promise<NoteSweepResult> {
    const ctx: RegistryContext = { Provider: provider, ContextUser: contextUser };
    const agentIds = await PredictiveStudioAgentNotePolicy.PredictiveStudioAgentIDs(ctx);
    const verdicts = new UUIDMap<NoteSourceVerdict>();
    const totals = { Activated: 0, Archived: 0, Failed: [] as string[] };
    let after: CompositeKey | undefined;
    for (;;) {
      const page = await PredictiveStudioAgentNotePolicy.SweepPage(agentIds, scope, after, ctx);
      for (const note of page) await PredictiveStudioAgentNotePolicy.SweepNote(note, verdicts, totals, ctx);
      if (page.length < PredictiveStudioAgentNotePolicy.SWEEP_PAGE_SIZE) break;
      after = page[page.length - 1].PrimaryKey;
    }
    return { Activated: totals.Activated, Archived: totals.Archived, Failed: totals.Failed };
  }

  /** The activation rule as a yes/no (the hook and the sweep both decide through {@link ActivationVerdict}). */
  protected static async ActivationRuleHolds(note: NotePolicyFields, provider: IMetadataProvider, contextUser: UserInfo): Promise<boolean> {
    return (await PredictiveStudioAgentNotePolicy.ActivationVerdict(note, { Provider: provider, ContextUser: contextUser })).Holds;
  }

  /**
   * The activation rule (D5-11), from stored rows: a `UserID` or `CompanyID`, and a source run tree that qualifies
   * (links to a model; every linked model `Published` with a publish record; nothing flagged or failed).
   *
   * @throws Error when a read fails
   */
  public static async ActivationVerdict(note: NotePolicyFields, ctx: RegistryContext, source?: NoteSourceVerdict): Promise<NoteActivationVerdict> {
    const verdict = source ?? (await PredictiveStudioAgentNotePolicy.SourceVerdict(note.SourceAIAgentRunID, ctx));
    if (!note.UserID && !note.CompanyID) return { Holds: false, Failure: 'no-scope', Reason: 'the note has neither a UserID nor a CompanyID (scope user-or-company)' };
    if (verdict.Kind === 'refused') return { Holds: false, Failure: 'source-refused', Reason: `its source run tree is ${verdict.Reason}` };
    if (verdict.Kind === 'no-model') return { Holds: false, Failure: 'no-model', Reason: 'its source run tree links to no model' };
    return { Holds: true, Reason: `its source model(s) ${verdict.ModelIDs.join(', ')} are Published with a publish record and unflagged` };
  }

  /**
   * The source verdict of a run tree: `refused` (leakage flags first, then a failed build, then a linked model that is
   * not Published with a publish record), `no-model` when it links to none, else `qualifies`.
   *
   * @throws Error when a read fails
   */
  public static async SourceVerdict(sourceRunId: string | null, ctx: RegistryContext): Promise<NoteSourceVerdict> {
    const facts = await PredictiveStudioAgentNotePolicy.ReadSourceFacts(sourceRunId, ctx);
    return PredictiveStudioAgentNotePolicy.VerdictOf(facts);
  }

  /** The verdict of read facts. Pure. */
  public static VerdictOf(facts: NoteSourceFacts): NoteSourceVerdict {
    if (facts.LeakageFlagged) return { Kind: 'refused', Reason: 'leakage-flagged' };
    if (facts.BuildFailed) return { Kind: 'refused', Reason: 'build-failed' };
    if (facts.Models.length === 0) return { Kind: 'no-model' };
    if (facts.Models.some((m) => m.Status !== 'Published' || !m.HasPublishRecord)) return { Kind: 'refused', Reason: 'not-published' };
    return { Kind: 'qualifies', ModelIDs: facts.Models.map((m) => m.ID) };
  }

  /**
   * What a run tree links to (see the module comment): its runs, their claims, the claimed pipelines' training runs,
   * models and publish records. A NULL or unknown source run links to nothing.
   *
   * @throws Error when a read fails
   */
  public static async ReadSourceFacts(sourceRunId: string | null, ctx: RegistryContext): Promise<NoteSourceFacts> {
    const empty: NoteSourceFacts = { PipelineIDs: [], Models: [], BuildFailed: false, LeakageFlagged: false };
    if (!sourceRunId) return empty;
    const runIds = await PredictiveStudioAgentNotePolicy.TreeRunIDs(sourceRunId, ctx);
    if (runIds.length === 0) return empty;
    const claims = await PredictiveStudioAgentNotePolicy.read<ClaimRow>({
      EntityName: 'MJ: ML Build Approval Claims', ExtraFilter: `ClaimingAgentRunID IN (${PredictiveStudioAgentNotePolicy.idList(runIds)})`,
      Fields: ['ID', 'Outcome', 'MLTrainingPipelineID'],
    }, ctx);
    const pipelineIds = [...new UUIDSet(claims.map((c) => c.MLTrainingPipelineID).filter((id): id is string => !!id))];
    const claimFailed = claims.some((c) => c.Outcome === 'failed');
    if (pipelineIds.length === 0) return { ...empty, BuildFailed: claimFailed };
    return PredictiveStudioAgentNotePolicy.PipelineFacts(pipelineIds, claimFailed, ctx);
  }

  /** True when `agentId` is one of the five PS agents (resolved by name from the agent metadata, per provider). */
  public static async IsPredictiveStudioAgent(agentId: string, ctx: RegistryContext): Promise<boolean> {
    if (!agentId) return false;
    return (await PredictiveStudioAgentNotePolicy.PredictiveStudioAgentIDs(ctx)).Has(agentId);
  }

  /** The PS agents' IDs: from a loaded engine's `MJ: AI Agents` cache when one holds the full set, else one read. */
  public static async PredictiveStudioAgentIDs(ctx: RegistryContext): Promise<UUIDSet> {
    const known = agentIdsByProvider.get(ctx.Provider);
    if (known) return known;
    const loading = PredictiveStudioAgentNotePolicy.loadAgentIDs(ctx);
    agentIdsByProvider.set(ctx.Provider, loading);
    loading.catch(() => agentIdsByProvider.delete(ctx.Provider));
    return loading;
  }

  /** The refusal as the hook's message: the note, the typed refusal (JSON) and its meaning. */
  public static RefusalMessage(noteId: string, refusal: PredictiveStudioNoteRefusal): string {
    return `Predictive Studio note policy refused the save of note ${noteId || '(new)'}: ${JSON.stringify(refusal)} — ${PredictiveStudioAgentNotePolicy.explain(refusal)}`;
  }

  /** The stored row of a note, read by the hook itself past the cache; null when there is none. */
  protected static async ReadPersisted(noteId: string, ctx: RegistryContext): Promise<NotePolicyFields | null> {
    const rows = await PredictiveStudioAgentNotePolicy.read<NotePolicyFields>({
      EntityName: PredictiveStudioAgentNotePolicy.EntityName, ExtraFilter: `ID='${EscapeSQLString(noteId)}'`, // pk-filter-ok: MJ core entity keyed by ID
      Fields: ['ID', 'AgentID', 'Status', 'UserID', 'CompanyID', 'SourceAIAgentRunID'], MaxRows: 1,
    }, ctx);
    return rows.find((r) => UUIDsEqual(r.ID, noteId)) ?? null;
  }

  /** Rule 2: a new PS-agent note is `Pending`, from a source tree that is not refused. */
  protected static async DecideCreate(note: NotePolicyFields, ctx: RegistryContext): Promise<PredictiveStudioNoteRefusal | null> {
    if (note.Status !== 'Pending') return { kind: 'pending-only-on-create', status: note.Status };
    const verdict = await PredictiveStudioAgentNotePolicy.SourceVerdict(note.SourceAIAgentRunID, ctx);
    return verdict.Kind === 'refused' ? { kind: 'source-not-qualifying', reason: verdict.Reason } : null;
  }

  /** Rule 3's trigger: the save makes the note `Active`, or changes an `Active` note's agent, source or scope. */
  protected static NeedsActivationCheck(note: NotePolicyFields, persisted: NotePolicyFields): boolean {
    if (note.Status !== 'Active') return false;
    if (persisted.Status !== 'Active') return true;
    const same = (a: string | null, b: string | null): boolean => (a === null || b === null ? a === b : UUIDsEqual(a, b));
    return !same(note.AgentID, persisted.AgentID) || !same(note.SourceAIAgentRunID, persisted.SourceAIAgentRunID)
      || !same(note.UserID, persisted.UserID) || !same(note.CompanyID, persisted.CompanyID);
  }

  /** One keyset page of the PS-agent notes the sweep visits, as entity objects (it saves them). */
  protected static async SweepPage(agentIds: UUIDSet, scope: NoteSweepScope | undefined, after: CompositeKey | undefined, ctx: RegistryContext): Promise<MJAIAgentNoteEntity[]> {
    if (agentIds.Size === 0) return [];
    const statuses = PredictiveStudioAgentNotePolicy.sweptStatuses.map((s) => `'${s}'`).join(', ');
    const filters = [`AgentID IN (${PredictiveStudioAgentNotePolicy.idList([...agentIds])})`, `Status IN (${statuses})`];
    if (scope) filters.push(PredictiveStudioAgentNotePolicy.scopeFilter(scope));
    const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJAIAgentNoteEntity>({
      EntityName: PredictiveStudioAgentNotePolicy.EntityName, ExtraFilter: filters.join(' AND '), AfterKey: after,
      MaxRows: PredictiveStudioAgentNotePolicy.SWEEP_PAGE_SIZE, ResultType: 'entity_object', BypassCache: true,
    }, ctx.ContextUser);
    if (!r.Success) throw new Error(`Reading Predictive Studio agent notes failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results;
  }

  /** The sweep's step for one note: activate, archive or leave it, writing the outcome to its `Comments`. */
  protected static async SweepNote(note: MJAIAgentNoteEntity, verdicts: UUIDMap<NoteSourceVerdict>, totals: { Activated: number; Archived: number; Failed: string[] }, ctx: RegistryContext): Promise<void> {
    const source = await PredictiveStudioAgentNotePolicy.cachedVerdict(note.SourceAIAgentRunID, verdicts, ctx);
    const verdict = await PredictiveStudioAgentNotePolicy.ActivationVerdict(note, ctx, source);
    const next = PredictiveStudioAgentNotePolicy.SweepTarget(note.Status, verdict);
    if (next === null) return;
    note.Status = next;
    note.Comments = PredictiveStudioAgentNotePolicy.appendComment(note.Comments, next, verdict.Reason);
    if (await note.Save()) {
      if (next === 'Active') totals.Activated++;
      else totals.Archived++;
      return;
    }
    totals.Failed.push(`${note.ID}: ${note.LatestResult?.CompleteMessage || 'unknown error'}`);
  }

  /**
   * Where the sweep moves a note: `Active` when the rule holds and it is not already; `Archived` when the rule fails,
   * except a `Pending` note with a scope whose tree links to no model yet (it waits); null to leave it. Pure.
   */
  public static SweepTarget(status: MJAIAgentNoteEntity['Status'], verdict: NoteActivationVerdict): MJAIAgentNoteEntity['Status'] | null {
    if (verdict.Holds === true) return status === 'Active' ? null : 'Active';
    return status === 'Pending' && verdict.Failure === 'no-model' ? null : 'Archived';
  }

  /** Every run of the source run's tree: the session's roots (`LastRunID` walk from the root) and their descendants. */
  protected static async TreeRunIDs(sourceRunId: string, ctx: RegistryContext): Promise<string[]> {
    const source = await PredictiveStudioAgentNotePolicy.readRun(sourceRunId, ctx);
    if (!source) return [];
    const roots = new UUIDSet();
    let next: string | null = source.RootParentRunID || source.ID;
    while (next && !roots.Has(next)) {
      roots.Add(next);
      const root = await PredictiveStudioAgentNotePolicy.readRun(next, ctx);
      next = root?.LastRunID || null;
    }
    const list = PredictiveStudioAgentNotePolicy.idList([...roots]);
    const runs = await PredictiveStudioAgentNotePolicy.read<{ readonly ID: string }>({
      EntityName: 'MJ: AI Agent Runs', ExtraFilter: `ID IN (${list}) OR RootParentRunID IN (${list})`, Fields: ['ID'],
    }, ctx);
    return [...new UUIDSet([...roots, ...runs.map((r) => r.ID)])];
  }

  /** The claimed pipelines' training runs, models and publish records, as facts. */
  protected static async PipelineFacts(pipelineIds: readonly string[], claimFailed: boolean, ctx: RegistryContext): Promise<NoteSourceFacts> {
    const list = PredictiveStudioAgentNotePolicy.idList(pipelineIds);
    const [training, models] = await PredictiveStudioAgentNotePolicy.readMany<TrainingRow, ModelRow>([
      { EntityName: 'MJ: ML Training Runs', ExtraFilter: `PipelineID IN (${list})`, Fields: ['ID', 'Status', 'ValidationResults'] },
      { EntityName: 'MJ: ML Models', ExtraFilter: `PipelineID IN (${list})`, Fields: ['ID', 'Status'] },
    ], ctx);
    const published = await PredictiveStudioAgentNotePolicy.PublishedModelIDs(models.map((m) => m.ID), ctx);
    return {
      PipelineIDs: pipelineIds,
      Models: models.map((m) => ({ ID: m.ID, Status: m.Status, HasPublishRecord: published.Has(m.ID) })),
      BuildFailed: claimFailed || training.some((t) => t.Status === 'Failed'),
      LeakageFlagged: training.some((t) => PredictiveStudioAgentNotePolicy.HasLeakageFlags(t.ValidationResults)),
    };
  }

  /** The models among `modelIds` with an `MJ: ML Model Publish Records` row of kind `publish`. */
  protected static async PublishedModelIDs(modelIds: readonly string[], ctx: RegistryContext): Promise<UUIDSet> {
    if (modelIds.length === 0) return new UUIDSet();
    const rows = await PredictiveStudioAgentNotePolicy.read<{ readonly ID: string; readonly ModelID: string | null }>({
      EntityName: 'MJ: ML Model Publish Records', ExtraFilter: `Kind='publish' AND ModelID IN (${PredictiveStudioAgentNotePolicy.idList(modelIds)})`, Fields: ['ID', 'ModelID'],
    }, ctx);
    return new UUIDSet(rows.map((r) => r.ModelID).filter((id): id is string => !!id));
  }

  /** True when a training run's stored results carry a trainer result with at least one leakage flag. Pure. */
  public static HasLeakageFlags(validationResults: string | null): boolean {
    if (!validationResults) return false;
    const parsed = TrainingRunResultsParser.ParseTrainingRunResults(validationResults);
    if (parsed.Ok === false || parsed.Value.status !== 'completed' || parsed.Value.trainer === null) return false;
    return parsed.Value.trainer.leakageFlags.length > 0;
  }

  /** The PS agents' IDs, from an engine's unfiltered `MJ: AI Agents` cache when loaded, else one read by name. */
  private static async loadAgentIDs(ctx: RegistryContext): Promise<UUIDSet> {
    const names = new Set(PredictiveStudioAgentNotePolicy.AGENT_NAMES);
    const cached = BaseEngineRegistry.Instance.TryGetCachedRecords<MJAIAgentEntity>('MJ: AI Agents', { unfilteredOnly: true });
    const fromCache = cached ? cached.filter((a) => a.Name !== null && names.has(a.Name)) : [];
    if (fromCache.length === names.size) return new UUIDSet(fromCache.map((a) => a.ID));
    const quoted = PredictiveStudioAgentNotePolicy.AGENT_NAMES.map((n) => `'${EscapeSQLString(n)}'`).join(', ');
    const rows = await PredictiveStudioAgentNotePolicy.read<AgentRow>({ EntityName: 'MJ: AI Agents', ExtraFilter: `Name IN (${quoted})`, Fields: ['ID', 'Name'] }, ctx);
    return new UUIDSet(rows.map((r) => r.ID));
  }

  /** A run's link fields; null when there is none. */
  private static async readRun(runId: string, ctx: RegistryContext): Promise<RunLink | null> {
    const rows = await PredictiveStudioAgentNotePolicy.read<RunLink>({
      EntityName: 'MJ: AI Agent Runs', ExtraFilter: `ID='${EscapeSQLString(runId)}'`, Fields: ['ID', 'LastRunID', 'RootParentRunID'], MaxRows: 1, // pk-filter-ok: MJ core entity keyed by ID
    }, ctx);
    return rows.find((r) => UUIDsEqual(r.ID, runId)) ?? null;
  }

  /** A note's source verdict, read once per source run within one sweep. */
  private static async cachedVerdict(sourceRunId: string | null, verdicts: UUIDMap<NoteSourceVerdict>, ctx: RegistryContext): Promise<NoteSourceVerdict> {
    if (!sourceRunId) return { Kind: 'no-model' };
    const known = verdicts.Get(sourceRunId);
    if (known) return known;
    const verdict = await PredictiveStudioAgentNotePolicy.SourceVerdict(sourceRunId, ctx);
    verdicts.Set(sourceRunId, verdict);
    return verdict;
  }

  /** Simple rows of one read past the cache. @throws Error when the read fails */
  private static async read<T>(params: RunViewParams, ctx: RegistryContext): Promise<T[]> {
    const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<T>({ ...params, ResultType: 'simple', BypassCache: true }, ctx.ContextUser);
    if (!r.Success) throw new Error(`Reading ${params.EntityName} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results;
  }

  /** Two simple reads in one round trip past the cache. @throws Error when either fails */
  private static async readMany<A, B>(params: [RunViewParams, RunViewParams], ctx: RegistryContext): Promise<[A[], B[]]> {
    const [a, b] = await RunView.FromMetadataProvider(ctx.Provider).RunViews(params.map((p) => ({ ...p, ResultType: 'simple' as const, BypassCache: true })), ctx.ContextUser);
    if (!a?.Success || !b?.Success) throw new Error(`Reading ${params[0].EntityName}/${params[1].EntityName} failed: ${a?.ErrorMessage || b?.ErrorMessage || 'unknown error'}`);
    return [a.Results as A[], b.Results as B[]];
  }

  /** The sweep's narrowing to one run's injectable notes: the user's, the company's and the agent-wide ones. */
  private static scopeFilter(scope: NoteSweepScope): string {
    const parts = ['(UserID IS NULL AND CompanyID IS NULL)'];
    if (scope.UserID) parts.push(`UserID='${EscapeSQLString(scope.UserID)}'`);
    if (scope.CompanyID) parts.push(`CompanyID='${EscapeSQLString(scope.CompanyID)}'`);
    return `(${parts.join(' OR ')})`;
  }

  /** A quoted, escaped ID list for an `IN (…)` filter. */
  private static idList(ids: readonly string[]): string {
    return ids.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
  }

  /** The note's `Comments` with the sweep's outcome appended on its own line. */
  private static appendComment(existing: string | null, next: MJAIAgentNoteEntity['Status'], reason: string): string {
    const line = `[Predictive Studio note policy ${new Date().toISOString()}] ${next === 'Active' ? 'activated' : 'archived'}: ${reason}.`;
    return existing ? `${existing}\n${line}` : line;
  }

  /** A refusal in words. */
  private static explain(refusal: PredictiveStudioNoteRefusal): string {
    switch (refusal.kind) {
      case 'provisional-refused': return 'Predictive Studio agent notes are never Provisional.';
      case 'pending-only-on-create': return `a new Predictive Studio agent note is saved only as Pending (not ${refusal.status}); the hourly sweep activates it when its source model qualifies.`;
      case 'source-not-qualifying': return `its source run tree is ${refusal.reason}; notes come only from runs whose model is Published and unflagged.`;
      case 'activation-rule-failed': return `the activation rule does not hold: ${refusal.reason}.`;
      default: return 'refused.';
    }
  }

  /** The fail-closed refusal of a save the hook could not check. */
  private static uncheckable(entity: MJAIAgentNoteEntity, why: string): string {
    LogError(`Predictive Studio note policy could not check note ${entity.ID || '(new)'}: ${why}`);
    return `Predictive Studio note policy refused the save of note ${entity.ID || '(new)'}: it could not be checked (${why}).`;
  }
}
