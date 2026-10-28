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
import { LogError, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { ActionParam, ActionResult } from '@memberjunction/actions-base';
import { IntegrationProgressEmitter } from '@memberjunction/integration-progress-artifacts';
import type { ArchiveSeedState, ArchiveSeedWork } from '@memberjunction/schema-engine';
import { DefaultArchiveSeedDeps, type ArchiveSeedDataSourceValues, type ArchiveSeedDeps } from './ArchiveSeedDeps.js';
import {
  BuildDropActionParams,
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
const DATA_SOURCE_DRIVER = 'SQLServerExternalDriver';
const ARCHIVE_CONNECTION_CONFIG = '{"authMode":"host"}';
const HANDOFF_MESSAGE = 'Tables created; the API will restart to load the new entities';

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
  Emitter?: IntegrationProgressEmitter;
  /** A restore in this operation succeeded, so a staging database exists even if its outputs were incomplete. */
  StagingRestored?: boolean;
  User: UserInfo;
  Provider: IMetadataProvider;
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
};

export class ArchiveSeedJob {
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly deps: ArchiveSeedDeps = DefaultArchiveSeedDeps()) {}

  /** Resolves once the detached background phase started by this instance has settled. */
  public async WaitForIdle(): Promise<void> {
    await this.pending;
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
    const ctx: ArchiveSeedContext = { JobID: jobID, CompanyIntegrationID: companyIntegrationID, Work: work, User: user, Provider: provider };
    await this.openRunA(ctx);
    this.pending = this.runDetached(ctx, () => this.runPhaseA(ctx, input.SasToken));
    return { JobID: jobID, RunID: runID, CompanyIntegrationID: companyIntegrationID };
  }

  /**
   * Records the caller's table selection, completes run A with the handoff, then applies the
   * tables (which restarts the API). A synchronous apply failure fails the job; it does not throw.
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
    await this.applySelection(ctx);
  }

  /** The job's work and identifiers, or undefined when there is no such archive-seed job. */
  public async GetState(jobID: string, user: UserInfo, provider: IMetadataProvider): Promise<ArchiveSeedJobState | undefined> {
    const stored = await this.deps.Store.Read(jobID, user, provider);
    if (!stored) {
      return undefined;
    }
    return { ...stored.Work, JobID: stored.ID, CompanyIntegrationID: stored.CompanyIntegrationID };
  }

  // ---------------------------------------------------------------- start helpers

  /** The SQL Server integration ID, or throws the refusal (invalid input, no connector, decision A). */
  private async assertCanStart(input: ArchiveSeedStartInput, user: UserInfo, provider: IMetadataProvider): Promise<string> {
    const invalid = ValidateArchiveSeedStartInput(input);
    if (invalid) {
      throw new Error(invalid);
    }
    const integrationID = await this.deps.Records.FindSqlServerIntegrationID(user, provider);
    if (!integrationID) {
      throw new Error('SQL Server connector is not installed');
    }
    if ((await this.deps.Records.CountCompanyIntegrations(integrationID, user, provider)) > 0) {
      throw new Error('An archive seed is limited to the first SQL Server connection in this workspace; one already exists');
    }
    return integrationID;
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
    await this.advance(ctx, 'Restoring');
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
      }
    } catch (err) {
      await this.fail(ctx, `Applying the selected tables failed: ${this.messageOf(err)}`);
    }
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
    return { JobID: stored.ID, CompanyIntegrationID: stored.CompanyIntegrationID, Work: stored.Work, User: user, Provider: provider };
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
      ctx.Emitter = this.newEmitter(ctx);
    }
  }

  /**
   * Fails the job: persists `Failed`, reports it on the current run (only while that run is open —
   * the job alone terminates runs), removes the archive data source, drops the staging database when
   * one was restored, and marks the store row failed. Cleanup errors are appended to the recorded
   * failure rather than masking it. `StageErrorReported` skips the stage error an action already emitted.
   */
  private async fail(ctx: ArchiveSeedContext, message: string, options: { StageErrorReported?: boolean } = {}): Promise<void> {
    if (ctx.Work.State === 'Failed' || ctx.Work.State === 'Done') {
      LogError(`Archive seed job ${ctx.JobID} is already ${ctx.Work.State}; not failing again: ${message}`);
      return;
    }
    const stage = STAGE_FOR_STATE[ctx.Work.State] ?? ctx.Work.State;
    await this.advance(ctx, 'Failed', { Error: message });
    if (!ctx.Work.RunClosed && !options.StageErrorReported) {
      this.emitterFor(ctx).StageError(stage, message);
    }
    const cleanupErrors = [...(await this.removeArchiveSource(ctx)), ...(await this.dropStaging(ctx))];
    const recorded = cleanupErrors.length > 0 ? `${message} (cleanup: ${cleanupErrors.join('; ')})` : message;
    if (!ctx.Work.RunClosed) {
      await this.emitterFor(ctx).Fail(recorded);
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

  /** Drops the staging database when a restore produced one that is not yet dropped; the errors. */
  private async dropStaging(ctx: ArchiveSeedContext): Promise<string[]> {
    const restored = ctx.StagingRestored === true || ctx.Work.BackupStartDate !== undefined;
    if (!restored || ctx.Work.Summary?.StagingDatabaseDropped) {
      return [];
    }
    try {
      const runID = ctx.Work.RunClosed ? undefined : this.runID(ctx.Work);
      const params = BuildDropActionParams(ctx.Work, ctx.CompanyIntegrationID, runID);
      const result = await this.runAction(ctx, ARCHIVE_SEED_DROP_ACTION, params, 'Cleanup');
      return result.Success ? [] : [`dropping staging database '${ctx.Work.StagingDatabaseName}' failed: ${result.Message ?? 'no message'}`];
    } catch (err) {
      return [`dropping staging database '${ctx.Work.StagingDatabaseName}' failed: ${this.messageOf(err)}`];
    }
  }

  // ---------------------------------------------------------------- small helpers

  private emitterFor(ctx: ArchiveSeedContext): IntegrationProgressEmitter {
    if (!ctx.Emitter) {
      ctx.Emitter = this.newEmitter(ctx);
    }
    return ctx.Emitter;
  }

  /** Opens (or resumes, when it already exists on disk) the job's current run. */
  private newEmitter(ctx: ArchiveSeedContext): IntegrationProgressEmitter {
    const manifest = RunManifestFor(ctx.Work, ctx.JobID, ctx.CompanyIntegrationID, 'A', this.runID(ctx.Work), this.deps.Now());
    return this.deps.CreateEmitter(manifest);
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
