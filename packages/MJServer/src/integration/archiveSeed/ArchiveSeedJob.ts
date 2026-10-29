/**
 * Orchestrates seeding a SQL Server integration from a backup archive.
 *
 * Phase A (this file's first half): create the records, restore the backup to a staging database,
 * discover its tables, then wait for the caller's table selection and hand off to the schema-apply
 * pipeline (which restarts the API). Every state change is persisted through `Transition` +
 * `Store.Update` before the side effect that depends on it, so a crash leaves an accurate record.
 *
 * Progress: run A is opened here; the restore/drop actions write to the same run, so after every
 * action call the emitter is re-created (it resumes from the run's file) before emitting again.
 */
import { LogError, LogStatus, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UUIDMap, UUIDSet } from '@memberjunction/global';
import type { ActionParam, ActionResult } from '@memberjunction/actions-base';
import { IntegrationProgressEmitter } from '@memberjunction/integration-progress-artifacts';
import type { ArchiveSeedState, ArchiveSeedSummary, ArchiveSeedWork } from '@memberjunction/schema-engine';
import {
  DefaultArchiveSeedDeps,
  type ArchiveSeedCompanyIntegrationRef,
  type ArchiveSeedDataSourceValues,
  type ArchiveSeedDeps,
  type ArchiveSeedEntityMap,
  type ArchiveSeedStoredJob,
} from './ArchiveSeedDeps.js';
import {
  ARCHIVE_SEED_APPLY_TIMEOUT_MS,
  ARCHIVE_SEED_CLEANUP_DECISION_TIMEOUT_MS,
  BuildDropActionParams,
  BuildLoadActionParams,
  BuildRestoreActionParams,
  CanonicalizeTableSelection,
  NewArchiveSeedWork,
  RunManifestFor,
  Transition,
  ValidateArchiveSeedStartInput,
  ValidateTableSelection,
  type ArchiveSeedStartInput,
} from './ArchiveSeedState.js';

export const ARCHIVE_SEED_RESTORE_ACTION = 'Restore SQL Server Backup To Staging';
export const ARCHIVE_SEED_DROP_ACTION = 'Drop SQL Server Staging Database';
export const ARCHIVE_SEED_LOAD_ACTION = 'Load SQL Server Integration From Staging';
const DATA_SOURCE_DRIVER = 'SQLServerExternalDriver';
const ARCHIVE_CONNECTION_CONFIG = '{"authMode":"host"}';
const HANDOFF_MESSAGE = 'Tables created; the API will restart to load the new entities';
const NO_RESTART_MESSAGE = 'The API did not restart after creating tables; configure RSU_RESTART_COMMAND or run MJAPI under PM2';
const DEFAULT_POLL_INTERVAL_MS = 5000;

/** States in which a restart interrupted work that cannot be picked up again; resuming fails the job. */
const INTERRUPTED_STATES: ReadonlySet<ArchiveSeedState> = new Set<ArchiveSeedState>([
  'Created',
  'Restoring',
  'Discovering',
  'Loading',
  'Seeding',
  'CleaningUp',
]);

/**
 * States in which the job waits (for the caller, or for the entity maps the post-restart step writes)
 * and may be cancelled; no action runs in any of them.
 */
const CANCELLABLE_STATES: ReadonlySet<ArchiveSeedState> = new Set<ArchiveSeedState>(['AwaitingSelection', 'Mapping', 'AwaitingCleanupDecision']);

/** States whose progress is reported on run B (the load run) rather than run A. */
const PHASE_B_STATES: ReadonlySet<ArchiveSeedState> = new Set<ArchiveSeedState>([
  'Mapping',
  'Loading',
  'Seeding',
  'AwaitingCleanupDecision',
  'CleaningUp',
  'Done',
]);

type ArchiveSeedPhase = 'A' | 'B';

/** What `Start` hands back to the caller. */
export interface ArchiveSeedStartResult {
  JobID: string;
  RunID: string;
  CompanyIntegrationID: string;
}

/** A job's work plus the identifiers a caller needs. */
export type ArchiveSeedJobState = ArchiveSeedWork & { JobID: string; CompanyIntegrationID: string };

/** The mutable context one job operation carries between steps. */
interface ArchiveSeedContext {
  JobID: string;
  CompanyIntegrationID: string;
  Work: ArchiveSeedWork;
  /** Which progress run (A: restore/discover, B: map/load/cleanup) the current run ID belongs to. */
  Phase: ArchiveSeedPhase;
  Emitter?: IntegrationProgressEmitter;
  /** A restore in this operation succeeded, so a staging database exists even if its outputs were incomplete. */
  StagingRestored?: boolean;
  User: UserInfo;
  Provider: IMetadataProvider;
}

/** How {@link ArchiveSeedJob} fails a job. */
interface ArchiveSeedFailOptions {
  /** The action already reported the stage error on the run. */
  StageErrorReported?: boolean;
  /** Keep the staging database (the caller chose to keep it); its storage credential is still dropped. */
  KeepStaging?: boolean;
}

/** The `seededFromBackup` block of the company integration's configuration. */
interface SeededFromBackup {
  jobID: string;
  backupStartDate?: string;
  backupDatabaseName?: string;
  stagingDatabaseName?: string;
}

/** The progress stage a failure in this state is reported against. */
const STAGE_FOR_STATE: Partial<Record<ArchiveSeedState, string>> = {
  Created: 'Start',
  Restoring: 'Restore',
  Discovering: 'Discover',
  AwaitingSelection: 'Discover',
  Building: 'Handoff',
  Mapping: 'Mapping',
  Loading: 'Load',
  Seeding: 'Load',
  AwaitingCleanupDecision: 'Cleanup',
  CleaningUp: 'Cleanup',
};

export class ArchiveSeedJob {
  private pending: Promise<void> = Promise.resolve();
  /** Jobs this instance is resuming or running phase B for, so a repeated Resume is a no-op. */
  private readonly active = new UUIDSet();
  /** In-process cleanup-decision timers of parked jobs, so a decision that never comes still ends the job. */
  private readonly cleanupTimers = new UUIDMap<ReturnType<typeof setTimeout>>();
  private readonly pollIntervalMs: number;

  constructor(
    private readonly deps: ArchiveSeedDeps = DefaultArchiveSeedDeps(),
    options: { pollIntervalMs?: number } = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  /** Resolves once every detached background phase started by this instance has settled. */
  public async WaitForIdle(): Promise<void> {
    let observed: Promise<void> | undefined;
    while (observed !== this.pending) {
      observed = this.pending;
      await observed;
    }
  }

  /**
   * Validates, creates the deferred data source, the company integration and the job row, opens
   * run A, then restores and discovers in the background. Throws on refusal before anything exists.
   */
  public async Start(input: ArchiveSeedStartInput, user: UserInfo, provider: IMetadataProvider): Promise<ArchiveSeedStartResult> {
    const integrationID = await this.assertCanStart(input, user, provider);
    const typeID = await this.deps.Records.FindDataSourceTypeID(DATA_SOURCE_DRIVER, user, provider);
    const deferredID = await this.deps.Records.CreateDataSource(this.deferredSourceValues(input.ConnectionName, typeID), user, provider);
    const companyIntegrationID = await this.createCompanyIntegration(input, integrationID, deferredID, user, provider);
    const runID = IntegrationProgressEmitter.NewRunID('archive-seed');
    const work: ArchiveSeedWork = {
      ...NewArchiveSeedWork(input, user.ID, integrationID, this.deps.Now()),
      DeferredDataSourceID: deferredID,
      CurrentRunID: runID,
    };
    const jobID = await this.deps.Store.Create(work, companyIntegrationID, user, provider);
    const ctx: ArchiveSeedContext = { JobID: jobID, CompanyIntegrationID: companyIntegrationID, Work: work, Phase: 'A', User: user, Provider: provider };
    await this.openRunA(ctx);
    this.track(this.runDetached(ctx, () => this.runPhaseA(ctx, input.SasToken)));
    return { JobID: jobID, RunID: runID, CompanyIntegrationID: companyIntegrationID };
  }

  /**
   * Records the caller's table selection and completes run A with the handoff, then starts the
   * apply in the background and returns at once: the apply runs migrations, CodeGen and a compile
   * and then restarts the API, so a caller awaiting it would lose its response. An apply failure
   * fails the job; it never reaches the caller. {@link WaitForIdle} resolves once the apply settles.
   * Throws when the job is missing, not awaiting selection, or the selection is invalid.
   */
  public async SelectTables(jobID: string, tableNames: string[], user: UserInfo, provider: IMetadataProvider): Promise<void> {
    const ctx = await this.loadContext(jobID, user, provider);
    if (ctx.Work.State !== 'AwaitingSelection') {
      throw new Error(`Archive seed job "${jobID}" is ${ctx.Work.State}, not AwaitingSelection`);
    }
    const invalid = ValidateTableSelection(ctx.Work, tableNames);
    if (invalid) {
      throw new Error(invalid);
    }
    // RunClosed is persisted before run A is completed, so a later failure never emits after run.complete.
    await this.advance(ctx, 'Building', { SelectedTables: CanonicalizeTableSelection(ctx.Work, tableNames), RunClosed: true });
    const emitter = this.emitterFor(ctx);
    emitter.StageComplete('Handoff');
    await emitter.Complete(HANDOFF_MESSAGE);
    this.track(this.runDetached(ctx, () => this.applySelection(ctx)));
  }

  /** The job's work and identifiers, or undefined when there is no such archive-seed job. */
  public async GetState(jobID: string, user: UserInfo, provider: IMetadataProvider): Promise<ArchiveSeedJobState | undefined> {
    const stored = await this.deps.Store.Read(jobID, user, provider);
    if (!stored) {
      return undefined;
    }
    return { ...stored.Work, JobID: stored.ID, CompanyIntegrationID: stored.CompanyIntegrationID };
  }

  /**
   * Picks a job up after a restart (the boot-time dispatcher calls this for every pending job).
   * Work a restart cannot continue fails the job; `Building`/`Mapping` re-enter phase B in the
   * background; an expired cleanup decision finishes keeping staging. Never throws, and a repeated
   * call while this instance is already working on the job is a no-op.
   */
  public async Resume(jobID: string, user: UserInfo, provider: IMetadataProvider): Promise<void> {
    if (this.active.Has(jobID)) {
      return;
    }
    this.active.Add(jobID);
    let detached: { Phase: Promise<void> } | undefined;
    try {
      detached = await this.resumeJob(jobID, user, provider);
    } catch (err) {
      LogError(`Archive seed job ${jobID}: resume failed: ${this.messageOf(err)}`);
    } finally {
      if (detached) {
        this.track(detached.Phase.finally(() => this.active.Delete(jobID)));
      } else {
        this.active.Delete(jobID);
      }
    }
  }

  /**
   * Applies the caller's cleanup decision: repoints the integration at its deferred source, removes
   * the archive source, optionally drops staging, then completes run B and the job. Throws when the
   * job is missing or not awaiting the decision; a later error fails the job instead.
   */
  public async Finish(jobID: string, dropStaging: boolean, user: UserInfo, provider: IMetadataProvider): Promise<void> {
    const ctx = await this.loadContext(jobID, user, provider);
    if (ctx.Work.State !== 'AwaitingCleanupDecision') {
      throw new Error(`Archive seed job "${jobID}" is ${ctx.Work.State}, not AwaitingCleanupDecision`);
    }
    this.disarmCleanupTimer(jobID);
    await this.finishContext(ctx, dropStaging);
  }

  /**
   * Abandons a job that is waiting (`AwaitingSelection`, `Mapping` or `AwaitingCleanupDecision`):
   * the job fails with a cancellation message, which drops the staging database and removes the
   * archive data source like any other failure, so the connection can then be deleted or replaced.
   * Throws when the job is missing or in any other state, since a running phase cannot be interrupted.
   * A phase B still polling in `Mapping` sees the stored `Failed` on its next poll and stops.
   */
  public async Cancel(jobID: string, user: UserInfo, provider: IMetadataProvider): Promise<void> {
    const ctx = await this.loadContext(jobID, user, provider);
    if (!CANCELLABLE_STATES.has(ctx.Work.State)) {
      throw new Error(`Archive seed job "${jobID}" is ${ctx.Work.State}; only a job awaiting a selection, its entity maps or a cleanup decision can be cancelled`);
    }
    this.disarmCleanupTimer(jobID);
    ctx.StagingRestored = true;
    await this.fail(ctx, `Cancelled by ${user.Email || user.Name || 'the user'}`);
  }

  /**
   * Fails a job whose stored owner no longer exists instead of resuming it as someone else. The
   * boot dispatcher calls this as the system user. Never throws; a no-op while the job is active.
   */
  public async FailUnresolvableOwner(jobID: string, user: UserInfo, provider: IMetadataProvider): Promise<void> {
    if (this.active.Has(jobID)) {
      return;
    }
    this.active.Add(jobID);
    try {
      const stored = await this.deps.Store.Read(jobID, user, provider);
      if (!stored || stored.Work.State === 'Done' || stored.Work.State === 'Failed') {
        return;
      }
      const ctx = this.contextOf(stored, user, provider);
      ctx.StagingRestored = ctx.Work.State !== 'Created';
      await this.fail(ctx, `Seed owner ${ctx.Work.UserID} no longer exists`);
    } catch (err) {
      LogError(`Archive seed job ${jobID}: failing for an unresolvable owner failed: ${this.messageOf(err)}`);
    } finally {
      this.active.Delete(jobID);
    }
  }

  // ---------------------------------------------------------------- start helpers

  /**
   * The SQL Server integration ID, or throws the refusal (invalid input, no connector, decision A). A
   * connection left by a failed seed is replaced: deleting it removes its job row and data source.
   */
  private async assertCanStart(input: ArchiveSeedStartInput, user: UserInfo, provider: IMetadataProvider): Promise<string> {
    const invalid = ValidateArchiveSeedStartInput(input);
    if (invalid) {
      throw new Error(invalid);
    }
    const integrationID = await this.deps.Records.FindSqlServerIntegrationID(user, provider);
    if (!integrationID) {
      throw new Error('SQL Server connector is not installed');
    }
    const existing = await this.deps.Records.FindCompanyIntegrations(integrationID, user, provider);
    const failedSeed = await this.failedSeedAmong(existing, user, provider);
    if (existing.length > 0 && !failedSeed) {
      throw new Error(
        `An archive seed is limited to the first SQL Server connection in this workspace; '${existing[0].Name}' already exists — delete it to seed again`,
      );
    }
    if (failedSeed) {
      await this.deps.Records.DeleteCompanyIntegration(failedSeed.ID, user, provider);
    }
    return integrationID;
  }

  /**
   * The one existing connection when it is the leftover of a failed archive seed (its job is Failed,
   * or its job row is gone); undefined otherwise. A finished seed holds data and is never replaced.
   */
  private async failedSeedAmong(
    existing: ArchiveSeedCompanyIntegrationRef[],
    user: UserInfo,
    provider: IMetadataProvider,
  ): Promise<ArchiveSeedCompanyIntegrationRef | undefined> {
    if (existing.length !== 1 || !existing[0].SeededJobID) {
      return undefined;
    }
    const stored = await this.deps.Store.Read(existing[0].SeededJobID, user, provider);
    return !stored || stored.Work.State === 'Failed' ? existing[0] : undefined;
  }

  /** Creates the company integration; on failure removes the deferred source created just before it. */
  private async createCompanyIntegration(
    input: ArchiveSeedStartInput,
    integrationID: string,
    deferredID: string,
    user: UserInfo,
    provider: IMetadataProvider,
  ): Promise<string> {
    try {
      return await this.deps.Records.CreateCompanyIntegration(
        {
          CompanyID: input.CompanyID,
          IntegrationID: integrationID,
          Name: input.ConnectionName,
          Configuration: this.configuration(deferredID, { jobID: '' }),
        },
        user,
        provider,
      );
    } catch (err) {
      await this.deps.Records.DeleteDataSource(deferredID, user, provider).catch((cleanupErr: unknown) =>
        LogError(`Archive seed: failed to remove deferred data source ${deferredID}: ${this.messageOf(cleanupErr)}`),
      );
      throw err;
    }
  }

  /** Points the configuration at the real job ID and opens run A. A failure here fails the job. */
  private async openRunA(ctx: ArchiveSeedContext): Promise<void> {
    try {
      await this.setConfiguration(ctx, this.deferredID(ctx.Work));
      const emitter = this.emitterFor(ctx);
      emitter.RunStart(`Archive seed of '${ctx.Work.ConnectionName}'`);
      await emitter.Flush();
    } catch (err) {
      await this.fail(ctx, this.messageOf(err));
      throw err;
    }
  }

  // ---------------------------------------------------------------- phase A

  /** Restore → Discover → AwaitingSelection. Any error fails the job. */
  private async runPhaseA(ctx: ArchiveSeedContext, sasToken: string | undefined): Promise<void> {
    if (!(await this.restore(ctx, sasToken))) {
      return;
    }
    await this.discover(ctx);
  }

  /** Runs the restore action and records its outputs; false when the job was failed. */
  private async restore(ctx: ArchiveSeedContext, sasToken: string | undefined): Promise<boolean> {
    // Recorded before the action runs: every drop passes it as CreatedAfter, so a database that already
    // carried the staging name (the action's absence check comes after its credential/inspect stages) is never dropped.
    await this.advance(ctx, 'Restoring', { RestoreStartedAt: this.deps.Now().toISOString() });
    const params = BuildRestoreActionParams(ctx.Work, ctx.CompanyIntegrationID, this.runID(ctx.Work), sasToken);
    const result = await this.runAction(ctx, ARCHIVE_SEED_RESTORE_ACTION, params, 'Restore');
    if (!result.Success) {
      const code = result.ResultCode ? ` (${result.ResultCode})` : '';
      // The action already reported the stage error on the run.
      await this.fail(ctx, `Restore failed${code}: ${result.Message ?? 'no message'}`, { StageErrorReported: true });
      return false;
    }
    ctx.StagingRestored = true;
    await this.recordRestoreOutputs(ctx, result);
    return true;
  }

  /** Persists the backup facts, then stamps them on the deferred source and the configuration. */
  private async recordRestoreOutputs(ctx: ArchiveSeedContext, result: ActionResult): Promise<void> {
    const backupStartDate = this.outputParam(result, 'BackupStartDate');
    const backupDatabaseName = this.outputParam(result, 'BackupDatabaseName');
    await this.patch(ctx, { BackupStartDate: backupStartDate, BackupDatabaseName: backupDatabaseName, ContainerUrl: this.outputParam(result, 'ContainerUrl') });
    if (!backupStartDate || !backupDatabaseName) {
      throw new Error("The restore action did not report 'BackupStartDate' and 'BackupDatabaseName'");
    }
    await this.deps.Records.SetDataSourceDefaultDatabase(this.deferredID(ctx.Work), backupDatabaseName, ctx.User, ctx.Provider);
    await this.setConfiguration(ctx, this.deferredID(ctx.Work));
  }

  /** Creates the archive source, points the integration at it, introspects, then awaits selection. */
  private async discover(ctx: ArchiveSeedContext): Promise<void> {
    await this.advance(ctx, 'Discovering');
    this.emitterFor(ctx).StageStart('Discover', 'Introspecting the restored archive');
    const typeID = await this.deps.Records.FindDataSourceTypeID(DATA_SOURCE_DRIVER, ctx.User, ctx.Provider);
    const archiveID = await this.deps.Records.CreateDataSource(this.archiveSourceValues(ctx.Work, typeID), ctx.User, ctx.Provider);
    await this.patch(ctx, { ArchiveDataSourceID: archiveID });
    await this.setConfiguration(ctx, archiveID);
    const tables = await this.deps.Discovery.IntrospectArchive(ctx.CompanyIntegrationID, ctx.User, ctx.Provider);
    await this.advance(ctx, 'AwaitingSelection', { Tables: tables });
    const emitter = this.emitterFor(ctx);
    emitter.StageComplete('Discover', { processed: tables.length });
    emitter.Emit('stage.complete', { stage: 'Tables', data: { tables } });
    await emitter.Flush();
  }

  /** Hands the selection to the schema-apply pipeline; a refusal fails the job. */
  private async applySelection(ctx: ArchiveSeedContext): Promise<void> {
    try {
      const result = await this.deps.Apply.ApplyTables(ctx.CompanyIntegrationID, ctx.Work.SelectedTables ?? [], ctx.User, ctx.Provider);
      if (!result.Success) {
        await this.fail(ctx, `Applying the selected tables failed: ${result.Message}`);
      } else if (!result.APIRestarted) {
        // This process is still running and nothing will restart it, so phase B would never start.
        await this.fail(ctx, NO_RESTART_MESSAGE);
      }
    } catch (err) {
      await this.fail(ctx, `Applying the selected tables failed: ${this.messageOf(err)}`);
    }
  }

  // ---------------------------------------------------------------- resume

  /** Resumes a stored job by state; returns the detached phase B when one was started. */
  private async resumeJob(jobID: string, user: UserInfo, provider: IMetadataProvider): Promise<{ Phase: Promise<void> } | undefined> {
    const stored = await this.deps.Store.Read(jobID, user, provider);
    if (!stored) {
      return undefined;
    }
    const ctx = this.contextOf(stored, user, provider);
    const state = ctx.Work.State;
    if (state === 'Done' || state === 'Failed') {
      // The job finished but its row is still Pending (a crash between the last state write and
      // the store close): close it so boot does not re-dispatch it forever.
      await this.closeTerminalRow(ctx, stored.Status);
      return undefined;
    }
    if (state === 'Building' || state === 'Mapping') {
      return { Phase: this.runDetached(ctx, () => this.runPhaseB(ctx)) };
    }
    if (INTERRUPTED_STATES.has(state)) {
      // From Restoring on, a staging database may exist (even half-restored); the drop is idempotent.
      ctx.StagingRestored = state !== 'Created';
      await this.fail(ctx, `interrupted during ${state}`);
    } else if (state === 'AwaitingCleanupDecision') {
      await this.resumeCleanupDecision(ctx);
    }
    return undefined;
  }

  private async closeTerminalRow(ctx: ArchiveSeedContext, rowStatus: ArchiveSeedStoredJob['Status']): Promise<void> {
    if (rowStatus !== 'Pending') {
      return;
    }
    if (ctx.Work.State === 'Done') {
      await this.deps.Store.Complete(ctx.JobID, ctx.User, ctx.Provider);
    } else {
      await this.deps.Store.Fail(ctx.JobID, ctx.Work.Error ?? 'archive seed failed', ctx.User, ctx.Provider);
    }
  }

  /** An expired decision finishes keeping staging now; otherwise the timer is armed for what remains. */
  private async resumeCleanupDecision(ctx: ArchiveSeedContext): Promise<void> {
    if (this.cleanupDecisionRemainingMs(ctx.Work) <= 0) {
      await this.finishContext(ctx, false);
      return;
    }
    this.armCleanupTimer(ctx.JobID, ctx.Work, ctx.User, ctx.Provider);
  }

  /** Milliseconds left before the parked job's cleanup decision times out (≤ 0 once it has). */
  private cleanupDecisionRemainingMs(work: ArchiveSeedWork): number {
    return ARCHIVE_SEED_CLEANUP_DECISION_TIMEOUT_MS - (this.deps.Now().getTime() - Date.parse(work.StateChangedAt));
  }

  /**
   * Arms (or re-arms) the in-process timer that finishes a parked job keeping staging once the
   * decision times out. Unref'd, so it never keeps the process alive; a restart re-arms it on resume.
   */
  private armCleanupTimer(jobID: string, work: ArchiveSeedWork, user: UserInfo, provider: IMetadataProvider): void {
    this.disarmCleanupTimer(jobID);
    const timer = setTimeout(() => {
      this.cleanupTimers.Delete(jobID);
      this.track(this.finishOnTimeout(jobID, user, provider));
    }, Math.max(0, this.cleanupDecisionRemainingMs(work)));
    timer.unref?.();
    this.cleanupTimers.Set(jobID, timer);
  }

  private disarmCleanupTimer(jobID: string): void {
    const timer = this.cleanupTimers.Get(jobID);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.Delete(jobID);
    }
  }

  /** The timeout's `Finish(jobID, false)`; a job already decided or gone is left alone. Never throws. */
  private async finishOnTimeout(jobID: string, user: UserInfo, provider: IMetadataProvider): Promise<void> {
    try {
      const state = (await this.deps.Store.Read(jobID, user, provider))?.Work.State;
      if (state === 'AwaitingCleanupDecision') {
        await this.Finish(jobID, false, user, provider);
      }
    } catch (err) {
      LogError(`Archive seed job ${jobID}: finishing after the cleanup decision timed out failed: ${this.messageOf(err)}`);
    }
  }

  // ---------------------------------------------------------------- phase B

  /** Mapping wait → bulk-loadable entities → load → AwaitingCleanupDecision. Any error fails the job. */
  private async runPhaseB(ctx: ArchiveSeedContext): Promise<void> {
    await this.openRunB(ctx);
    const maps = await this.awaitEntityMaps(ctx);
    if (!maps) {
      return;
    }
    const emitter = this.emitterFor(ctx);
    emitter.StageComplete('Mapping', { processed: maps.length });
    await emitter.Flush();
    await this.deps.Records.MarkEntitiesBulkLoadable(ctx.CompanyIntegrationID, maps.map(m => m.EntityID), ctx.User, ctx.Provider);
    await this.load(ctx);
  }

  /**
   * Opens run B. Coming from `Building`, the new run ID, `RunClosed: false` and `Mapping` are
   * persisted in one transition before the run is written; coming from `Mapping` (a restart during
   * the wait) the same run is resumed, and started only if the crash came before its first event.
   */
  private async openRunB(ctx: ArchiveSeedContext): Promise<void> {
    ctx.Phase = 'B';
    ctx.Emitter = undefined;
    if (ctx.Work.State === 'Building') {
      await this.advance(ctx, 'Mapping', { CurrentRunID: IntegrationProgressEmitter.NewRunID('archive-seed'), RunClosed: false });
    }
    const emitter = this.emitterFor(ctx);
    if (!emitter.IsResumed) {
      emitter.RunStart(`Archive seed load of '${ctx.Work.ConnectionName}'`);
    }
    emitter.StageStart('Mapping', 'Waiting for the entity maps of the selected tables');
    await emitter.Flush();
  }

  /**
   * Polls until every selected table has an entity map (returns those maps), the schema-apply work
   * failed, or the apply timeout (measured from entering `Mapping`) elapsed — the latter two fail
   * the job and return undefined. `Mapping` is cancellable, so every poll re-reads the stored job:
   * once it is no longer `Mapping` (a Cancel failed it) the wait stops without writing anything.
   */
  private async awaitEntityMaps(ctx: ArchiveSeedContext): Promise<ArchiveSeedEntityMap[] | undefined> {
    const since = Date.parse(ctx.Work.StateChangedAt);
    for (;;) {
      const maps = this.mapsForSelection(ctx.Work, await this.deps.Records.EntityMapsFor(ctx.CompanyIntegrationID, ctx.User, ctx.Provider));
      if (!(await this.stillMapping(ctx))) {
        return undefined;
      }
      if (maps) {
        return maps;
      }
      const apply = await this.deps.Store.ApplyWorkStatus(ctx.CompanyIntegrationID, ctx.User, ctx.Provider);
      if (apply?.Status === 'Failed') {
        await this.fail(ctx, apply.ErrorMessage || 'Applying the selected tables failed');
        return undefined;
      }
      if (this.deps.Now().getTime() - since > ARCHIVE_SEED_APPLY_TIMEOUT_MS) {
        await this.fail(ctx, 'Timed out waiting for entity maps');
        return undefined;
      }
      await this.delay(this.pollIntervalMs);
    }
  }

  /** Whether the stored job is still `Mapping`; logs and returns false once something else (a Cancel) moved it on. */
  private async stillMapping(ctx: ArchiveSeedContext): Promise<boolean> {
    const state = (await this.deps.Store.Read(ctx.JobID, ctx.User, ctx.Provider))?.Work.State;
    if (state === 'Mapping') {
      return true;
    }
    LogStatus(`Archive seed job ${ctx.JobID}: stopped waiting for entity maps; the job is now ${state ?? 'gone'}`);
    return false;
  }

  /** The map of each selected table (matched case-insensitively), or undefined while any is missing. */
  private mapsForSelection(work: ArchiveSeedWork, maps: ArchiveSeedEntityMap[]): ArchiveSeedEntityMap[] | undefined {
    const byName = new Map(maps.map(m => [m.ExternalObjectName.toLowerCase(), m]));
    const matched: ArchiveSeedEntityMap[] = [];
    for (const table of work.SelectedTables ?? []) {
      const map = byName.get(table.toLowerCase());
      if (!map) {
        return undefined;
      }
      matched.push(map);
    }
    return matched.length > 0 ? matched : undefined;
  }

  /** Runs the load action; on success records the summary and parks at AwaitingCleanupDecision. */
  private async load(ctx: ArchiveSeedContext): Promise<void> {
    await this.advance(ctx, 'Loading');
    const params = BuildLoadActionParams(ctx.Work, ctx.CompanyIntegrationID, this.runID(ctx.Work));
    const result = await this.runAction(ctx, ARCHIVE_SEED_LOAD_ACTION, params, 'Load');
    if (!result.Success) {
      const code = result.ResultCode ? ` (${result.ResultCode})` : '';
      // The action already reported the stage error on the run and left staging in place.
      await this.fail(ctx, `Load failed${code}: ${result.Message ?? 'no message'}`, { StageErrorReported: true });
      return;
    }
    const summary = this.summaryFrom(result);
    // The action's own Watermarks stage already seeded the watermarks, so Seeding is passed straight through.
    await this.advance(ctx, 'Seeding');
    await this.advance(ctx, 'AwaitingCleanupDecision', { Summary: summary });
    this.armCleanupTimer(ctx.JobID, ctx.Work, ctx.User, ctx.Provider);
    const emitter = this.emitterFor(ctx);
    emitter.Emit('stage.complete', { stage: 'Summary', data: { ...summary } });
    await emitter.Flush();
  }

  private summaryFrom(result: ActionResult): ArchiveSeedSummary {
    return {
      TablesProcessed: this.numberParam(result, 'TablesProcessed'),
      TotalRowsTransferred: this.numberParam(result, 'TotalRowsTransferred'),
      DurationSeconds: this.numberParam(result, 'DurationSeconds'),
      StagingDatabaseDropped: false,
    };
  }

  // ---------------------------------------------------------------- finish

  /**
   * CleaningUp → Done. A failed staging drop is a warning (the data is loaded; staging stays and
   * `StagingDatabaseDropped` stays false); any other error fails the job, keeping staging when the
   * caller chose to keep it.
   */
  private async finishContext(ctx: ArchiveSeedContext, dropStaging: boolean): Promise<void> {
    await this.advance(ctx, 'CleaningUp');
    try {
      await this.retireArchiveSource(ctx);
      if (dropStaging) {
        await this.dropStagingOnFinish(ctx);
      } else {
        await this.dropCredentialOnFinish(ctx);
      }
      // RunClosed is persisted before run B is completed, so a later failure never emits after run.complete.
      await this.advance(ctx, 'Done', { RunClosed: true });
    } catch (err) {
      await this.fail(ctx, this.messageOf(err), { KeepStaging: !dropStaging });
      return;
    }
    await this.emitterFor(ctx).Complete(`Archive seed of '${ctx.Work.ConnectionName}' complete`);
    await this.deps.Store.Complete(ctx.JobID, ctx.User, ctx.Provider);
  }

  /** Points the integration back at its deferred source and deletes the archive source. Throws on error. */
  private async retireArchiveSource(ctx: ArchiveSeedContext): Promise<void> {
    await this.setConfiguration(ctx, this.deferredID(ctx.Work));
    if (ctx.Work.ArchiveDataSourceID) {
      await this.deps.Records.DeleteDataSource(ctx.Work.ArchiveDataSourceID, ctx.User, ctx.Provider);
    }
  }

  private async dropStagingOnFinish(ctx: ArchiveSeedContext): Promise<void> {
    const params = BuildDropActionParams(ctx.Work, ctx.CompanyIntegrationID, this.runID(ctx.Work));
    const result = await this.runAction(ctx, ARCHIVE_SEED_DROP_ACTION, params, 'Cleanup');
    const emitter = this.emitterFor(ctx);
    if (!result.Success) {
      emitter.Warning('Cleanup', 'STAGING_DROP_FAILED', `Staging database '${ctx.Work.StagingDatabaseName}' was kept: ${result.Message ?? 'no message'}`);
      return;
    }
    await this.patch(ctx, { Summary: { ...this.summaryOf(ctx.Work), StagingDatabaseDropped: true } });
    emitter.StageComplete('Cleanup');
  }

  /** Keeping staging still drops the storage credential (it holds the SAS token); a failure is a warning. */
  private async dropCredentialOnFinish(ctx: ArchiveSeedContext): Promise<void> {
    if (!ctx.Work.ContainerUrl) {
      return;
    }
    const params = BuildDropActionParams(ctx.Work, ctx.CompanyIntegrationID, this.runID(ctx.Work), { KeepDatabase: true });
    const result = await this.runAction(ctx, ARCHIVE_SEED_DROP_ACTION, params, 'Cleanup');
    const emitter = this.emitterFor(ctx);
    if (!result.Success) {
      emitter.Warning('Cleanup', 'CREDENTIAL_DROP_FAILED', `The storage credential for '${ctx.Work.ContainerUrl}' was kept: ${result.Message ?? 'no message'}`);
      return;
    }
    emitter.StageComplete('Cleanup');
  }

  private summaryOf(work: ArchiveSeedWork): ArchiveSeedSummary {
    return work.Summary ?? { TablesProcessed: 0, TotalRowsTransferred: 0, DurationSeconds: 0, StagingDatabaseDropped: false };
  }

  // ---------------------------------------------------------------- seams shared with Resume/Finish

  /** Runs a detached phase: any error fails the job; a failure to fail is logged, never thrown. */
  private async runDetached(ctx: ArchiveSeedContext, phase: () => Promise<void>): Promise<void> {
    try {
      await phase();
    } catch (err) {
      await this.fail(ctx, this.messageOf(err)).catch((failErr: unknown) =>
        LogError(`Archive seed job ${ctx.JobID}: could not record failure: ${this.messageOf(failErr)}`),
      );
    }
  }

  /** Reads the job into a fresh context; throws when it does not exist. */
  private async loadContext(jobID: string, user: UserInfo, provider: IMetadataProvider): Promise<ArchiveSeedContext> {
    const stored = await this.deps.Store.Read(jobID, user, provider);
    if (!stored) {
      throw new Error(`Archive seed job "${jobID}" not found`);
    }
    return this.contextOf(stored, user, provider);
  }

  private contextOf(stored: ArchiveSeedStoredJob, user: UserInfo, provider: IMetadataProvider): ArchiveSeedContext {
    const phase: ArchiveSeedPhase = PHASE_B_STATES.has(stored.Work.State) ? 'B' : 'A';
    return { JobID: stored.ID, CompanyIntegrationID: stored.CompanyIntegrationID, Work: stored.Work, Phase: phase, User: user, Provider: provider };
  }

  /** Adds a detached phase to what {@link WaitForIdle} waits for. */
  private track(phase: Promise<void>): void {
    this.pending = Promise.all([this.pending, phase]).then(() => undefined);
  }

  /** Transitions to `next` (with an optional patch) and persists it. */
  private async advance(ctx: ArchiveSeedContext, next: ArchiveSeedState, patch?: Partial<ArchiveSeedWork>): Promise<void> {
    ctx.Work = Transition(ctx.Work, next, this.deps.Now(), patch);
    await this.deps.Store.Update(ctx.JobID, ctx.Work, ctx.User, ctx.Provider);
  }

  /** Persists a patch that does not change state. */
  private async patch(ctx: ArchiveSeedContext, patch: Partial<ArchiveSeedWork>): Promise<void> {
    ctx.Work = { ...ctx.Work, ...patch };
    await this.deps.Store.Update(ctx.JobID, ctx.Work, ctx.User, ctx.Provider);
  }

  /**
   * Runs an action that writes to the job's current run: flushes this writer first, then re-creates
   * the emitter afterwards so its sequence continues after the action's events.
   */
  private async runAction(ctx: ArchiveSeedContext, actionName: string, params: ActionParam[], stage: string): Promise<ActionResult> {
    if (ctx.Work.RunClosed) {
      return this.deps.Actions.Run(actionName, params, ctx.User, ctx.Provider);
    }
    const before = this.emitterFor(ctx);
    before.StageStart(stage);
    await before.Flush();
    try {
      return await this.deps.Actions.Run(actionName, params, ctx.User, ctx.Provider);
    } finally {
      ctx.Emitter = this.newEmitter(ctx, ctx.Phase);
    }
  }

  /**
   * Fails the job: persists `Failed`, reports it on the current run (only while that run is open —
   * the job alone terminates runs), removes the archive data source, drops the staging database when
   * one was restored, and marks the store row failed. Cleanup errors are appended to the recorded
   * failure rather than masking it. `StageErrorReported` skips the stage error an action already
   * emitted; `KeepStaging` leaves the staging database (the caller chose to keep it) but still drops
   * its storage credential. The cleanup and the store close run even when persisting `Failed` throws,
   * so a store error never leaves an Active host-mode source behind; that error is rethrown after.
   */
  private async fail(ctx: ArchiveSeedContext, message: string, options: ArchiveSeedFailOptions = {}): Promise<void> {
    if (ctx.Work.State === 'Failed' || ctx.Work.State === 'Done') {
      LogError(`Archive seed job ${ctx.JobID} is already ${ctx.Work.State}; not failing again: ${message}`);
      return;
    }
    this.disarmCleanupTimer(ctx.JobID);
    const stage = STAGE_FOR_STATE[ctx.Work.State] ?? ctx.Work.State;
    try {
      await this.advance(ctx, 'Failed', { Error: message });
      if (!ctx.Work.RunClosed && !options.StageErrorReported) {
        this.emitterFor(ctx).StageError(stage, message);
      }
    } finally {
      await this.cleanUpAndClose(ctx, message, options);
    }
  }

  /** The failure cleanup and the store close; the recorded message carries the cleanup errors. */
  private async cleanUpAndClose(ctx: ArchiveSeedContext, message: string, options: ArchiveSeedFailOptions): Promise<void> {
    const archiveErrors = await this.removeArchiveSource(ctx);
    const stagingErrors = options.KeepStaging ? await this.dropCredentialOnly(ctx) : await this.dropStaging(ctx);
    const cleanupErrors = [...archiveErrors, ...stagingErrors];
    const recorded = cleanupErrors.length > 0 ? `${message} (cleanup: ${cleanupErrors.join('; ')})` : message;
    if (!ctx.Work.RunClosed) {
      await this.emitterFor(ctx).Fail(recorded).catch((err: unknown) =>
        LogError(`Archive seed job ${ctx.JobID}: could not report the failure on its run: ${this.messageOf(err)}`),
      );
    }
    await this.deps.Store.Fail(ctx.JobID, recorded, ctx.User, ctx.Provider);
  }

  /** Repoints the configuration at the deferred source and deletes the archive source; the errors. */
  private async removeArchiveSource(ctx: ArchiveSeedContext): Promise<string[]> {
    const archiveID = ctx.Work.ArchiveDataSourceID;
    if (!archiveID) {
      return [];
    }
    try {
      await this.setConfiguration(ctx, this.deferredID(ctx.Work));
      await this.deps.Records.DeleteDataSource(archiveID, ctx.User, ctx.Provider);
      return [];
    } catch (err) {
      return [`removing the archive data source failed: ${this.messageOf(err)}`];
    }
  }

  /**
   * Drops the staging database when a restore produced one that is not yet dropped; the errors. The
   * drop is refused by the action for a database created before `RestoreStartedAt`, and is not
   * attempted at all when no restore start is recorded (nothing proves the database is the job's).
   */
  private async dropStaging(ctx: ArchiveSeedContext): Promise<string[]> {
    const restored = ctx.StagingRestored === true || ctx.Work.BackupStartDate !== undefined;
    if (!restored || ctx.Work.Summary?.StagingDatabaseDropped) {
      return [];
    }
    if (!ctx.Work.RestoreStartedAt) {
      return [`staging database '${ctx.Work.StagingDatabaseName}' was kept: the job recorded no restore start`];
    }
    return this.runCleanupDrop(ctx, false, `dropping staging database '${ctx.Work.StagingDatabaseName}' failed`);
  }

  /** Drops only the storage credential (the staging database stays); the errors. */
  private async dropCredentialOnly(ctx: ArchiveSeedContext): Promise<string[]> {
    if (!ctx.Work.ContainerUrl) {
      return [];
    }
    return this.runCleanupDrop(ctx, true, `dropping the storage credential for '${ctx.Work.ContainerUrl}' failed`);
  }

  /** Runs the drop action for a failure cleanup; the errors, each prefixed with `what`. */
  private async runCleanupDrop(ctx: ArchiveSeedContext, keepDatabase: boolean, what: string): Promise<string[]> {
    try {
      const runID = ctx.Work.RunClosed ? undefined : this.runID(ctx.Work);
      const params = BuildDropActionParams(ctx.Work, ctx.CompanyIntegrationID, runID, { KeepDatabase: keepDatabase });
      const result = await this.runAction(ctx, ARCHIVE_SEED_DROP_ACTION, params, 'Cleanup');
      return result.Success ? [] : [`${what}: ${result.Message ?? 'no message'}`];
    } catch (err) {
      return [`${what}: ${this.messageOf(err)}`];
    }
  }

  // ---------------------------------------------------------------- small helpers

  private emitterFor(ctx: ArchiveSeedContext): IntegrationProgressEmitter {
    if (!ctx.Emitter) {
      ctx.Emitter = this.newEmitter(ctx, ctx.Phase);
    }
    return ctx.Emitter;
  }

  /** Opens (or resumes, when it already exists on disk) the job's current run, which belongs to `phase`. */
  private newEmitter(ctx: ArchiveSeedContext, phase: ArchiveSeedPhase): IntegrationProgressEmitter {
    const manifest = RunManifestFor(ctx.Work, ctx.JobID, ctx.CompanyIntegrationID, phase, this.runID(ctx.Work), this.deps.Now());
    return this.deps.CreateEmitter(manifest);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** A numeric output param; 0 when absent or not a number. */
  private numberParam(result: ActionResult, name: string): number {
    const value = Number(this.outputParam(result, name));
    return Number.isFinite(value) ? value : 0;
  }

  private runID(work: ArchiveSeedWork): string {
    if (!work.CurrentRunID) {
      throw new Error('Archive seed job has no current progress run');
    }
    return work.CurrentRunID;
  }

  private deferredID(work: ArchiveSeedWork): string {
    if (!work.DeferredDataSourceID) {
      throw new Error('Archive seed job has no deferred data source');
    }
    return work.DeferredDataSourceID;
  }

  private async setConfiguration(ctx: ArchiveSeedContext, externalDataSourceID: string): Promise<void> {
    const configuration = this.configuration(externalDataSourceID, this.seededFromBackup(ctx));
    await this.deps.Records.SetCompanyIntegrationConfiguration(ctx.CompanyIntegrationID, configuration, ctx.User, ctx.Provider);
  }

  private seededFromBackup(ctx: ArchiveSeedContext): SeededFromBackup {
    const block: SeededFromBackup = { jobID: ctx.JobID };
    if (ctx.Work.BackupStartDate && ctx.Work.BackupDatabaseName) {
      block.backupStartDate = ctx.Work.BackupStartDate;
      block.backupDatabaseName = ctx.Work.BackupDatabaseName;
      block.stagingDatabaseName = ctx.Work.StagingDatabaseName;
    }
    return block;
  }

  private configuration(externalDataSourceID: string, seededFromBackup: SeededFromBackup): string {
    return JSON.stringify({ externalDataSourceID, seededFromBackup });
  }

  private deferredSourceValues(connectionName: string, typeID: string): ArchiveSeedDataSourceValues {
    return { Name: `${connectionName} (source)`, TypeID: typeID, DefaultDatabase: null, ConnectionConfig: null, Status: 'Disabled' };
  }

  private archiveSourceValues(work: ArchiveSeedWork, typeID: string): ArchiveSeedDataSourceValues {
    return {
      Name: `${work.ConnectionName} (archive staging)`,
      TypeID: typeID,
      DefaultDatabase: work.StagingDatabaseName,
      ConnectionConfig: ARCHIVE_CONNECTION_CONFIG,
      Status: 'Active',
    };
  }

  /** An output (or in/out) param's value as a string; undefined when absent or empty. */
  private outputParam(result: ActionResult, name: string): string | undefined {
    const param = result.Params?.find(p => (p.Type === 'Output' || p.Type === 'Both') && p.Name.toLowerCase() === name.toLowerCase());
    if (param?.Value === undefined || param.Value === null || param.Value === '') {
      return undefined;
    }
    return String(param.Value);
  }

  private messageOf(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
