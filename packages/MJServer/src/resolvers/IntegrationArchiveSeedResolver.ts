import { Resolver, Mutation, Query, Arg, Ctx, ObjectType, Field, InputType, Int, Float } from 'type-graphql';
import { LogError, LogStatus, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import { ActionEngineServer } from '@memberjunction/actions';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';
import type { ArchiveSeedDiscoveredTable, ArchiveSeedSummary } from '@memberjunction/schema-engine';
import { ResolverBase } from '../generic/ResolverBase.js';
import { AppContext } from '../types.js';
import { configInfo } from '../config.js';
import { ResolveServerRole, ShouldRunBackgroundWorkers } from '../serverRoleConfigUnits.js';
import { GetReadWriteProvider } from '../util.js';
import { IsScopeLimitedPrincipal } from '../auth/scopeLimitedPrincipal.js';
import { AssertCanRunAction } from '../auth/actionRunGuard.js';
import { BOOTSTRAP_ACTION_NAME } from '../integration/BootstrapLaunch.js';
import type { ArchiveSeedStartInput } from '../integration/archiveSeed/ArchiveSeedState.js';
import type { ArchiveSeedJobState } from '../integration/archiveSeed/ArchiveSeedJob.js';
import { ArchiveSeedJobInstance } from '../integration/archiveSeed/ArchiveSeedJobInstance.js';

@InputType()
export class IntegrationArchiveSeedStartInput implements ArchiveSeedStartInput {
  @Field() CompanyID: string;
  @Field() ConnectionName: string;
  @Field() BackupUrls: string;
  @Field({ nullable: true }) SasToken?: string;
  @Field({ nullable: true }) StorageCredentialID?: string;
  @Field({ nullable: true }) StagingDatabaseName?: string;
  @Field(() => Int, { nullable: true }) BatchSize?: number;
  @Field({ nullable: true }) TargetDataFileDirectory?: string;
  @Field({ nullable: true }) TargetLogFileDirectory?: string;
}

@ObjectType()
export class IntegrationArchiveSeedStartOutput {
  @Field() Success: boolean;
  @Field() Message: string;
  @Field({ nullable: true }) JobID?: string;
  /** Run A (restore + discover); tail it with IntegrationTailRunEvents. */
  @Field({ nullable: true }) RunID?: string;
  @Field({ nullable: true }) CompanyIntegrationID?: string;
}

@ObjectType()
export class IntegrationArchiveSeedTableOutput {
  @Field() Name: string;
  @Field(() => Int) ColumnCount: number;
  @Field() HasPrimaryKey: boolean;
  @Field({ nullable: true }) WatermarkField?: string;
}

@ObjectType()
export class IntegrationArchiveSeedSummaryOutput {
  @Field(() => Int) TablesProcessed: number;
  @Field(() => Float) TotalRowsTransferred: number;
  @Field(() => Float) DurationSeconds: number;
  @Field() StagingDatabaseDropped: boolean;
}

@ObjectType()
export class IntegrationArchiveSeedStateOutput {
  @Field() Success: boolean;
  @Field() Message: string;
  @Field({ nullable: true }) JobID?: string;
  @Field({ nullable: true }) CompanyIntegrationID?: string;
  @Field(() => String, { nullable: true }) State?: string;
  @Field({ nullable: true }) CurrentRunID?: string;
  @Field({ nullable: true }) StagingDatabaseName?: string;
  @Field({ nullable: true }) BackupDatabaseName?: string;
  @Field(() => [IntegrationArchiveSeedTableOutput], { nullable: true }) Tables?: IntegrationArchiveSeedTableOutput[];
  @Field(() => IntegrationArchiveSeedSummaryOutput, { nullable: true }) Summary?: IntegrationArchiveSeedSummaryOutput;
  @Field({ nullable: true }) Error?: string;
}

/** The caller and the provider an authorized archive seed operation runs with. */
interface ArchiveSeedCaller {
  User: UserInfo;
  Provider: IMetadataProvider;
}

/**
 * Seeds a SQL Server integration from a backup archive, as a job that outlives the request and the
 * API restart in its middle: `Start` restores and discovers in the background, `SelectTables`
 * applies the caller's choice (which restarts the API; the job resumes on boot), `Finish` applies
 * the cleanup decision, and `State` reports where the job is. Every operation is gated exactly as
 * launching the bootstrap action is; the job-scoped ones also require that the caller can read the
 * job's company integration. Job refusals come back as `Success: false`, never as GraphQL errors.
 */
@Resolver()
export class IntegrationArchiveSeedResolver extends ResolverBase {
  @Mutation(() => IntegrationArchiveSeedStartOutput)
  async IntegrationArchiveSeedStart(
    @Arg('input') input: IntegrationArchiveSeedStartInput,
    @Ctx() ctx: AppContext
  ): Promise<IntegrationArchiveSeedStartOutput> {
    try {
      const caller = await this.authorize(ctx, 'IntegrationArchiveSeedStart');
      this.assertRunsBackgroundWorkers();
      const started = await ArchiveSeedJobInstance.Start(input, caller.User, caller.Provider);
      LogStatus(`Archive seed job ${started.JobID} started (run ${started.RunID}) by ${caller.User.Email}`);
      return {
        Success: true,
        Message: `Archive seed started as job ${started.JobID}. Tail run ${started.RunID} with IntegrationTailRunEvents.`,
        ...started,
      };
    } catch (e) {
      return this.failure('IntegrationArchiveSeedStart', e);
    }
  }

  @Mutation(() => IntegrationArchiveSeedStateOutput)
  async IntegrationArchiveSeedSelectTables(
    @Arg('jobID') jobID: string,
    @Arg('tableNames', () => [String]) tableNames: string[],
    @Ctx() ctx: AppContext
  ): Promise<IntegrationArchiveSeedStateOutput> {
    try {
      const caller = await this.authorize(ctx, 'IntegrationArchiveSeedSelectTables');
      await this.loadReadableJob(jobID, caller);
      await ArchiveSeedJobInstance.SelectTables(jobID, tableNames, caller.User, caller.Provider);
      // The apply now runs in the background and ends in an API restart, so nothing is read back
      // here: the caller follows the job with IntegrationArchiveSeedState once the server is back.
      return { Success: true, Message: `Tables selected for job ${jobID}; the server is applying them and will restart.` };
    } catch (e) {
      return this.failure('IntegrationArchiveSeedSelectTables', e);
    }
  }

  @Mutation(() => IntegrationArchiveSeedStateOutput)
  async IntegrationArchiveSeedFinish(
    @Arg('jobID') jobID: string,
    @Arg('dropStaging') dropStaging: boolean,
    @Ctx() ctx: AppContext
  ): Promise<IntegrationArchiveSeedStateOutput> {
    try {
      const caller = await this.authorize(ctx, 'IntegrationArchiveSeedFinish');
      await this.loadReadableJob(jobID, caller);
      await ArchiveSeedJobInstance.Finish(jobID, dropStaging, caller.User, caller.Provider);
      return this.stateOutput(await this.loadReadableJob(jobID, caller), 'Cleanup decision applied.');
    } catch (e) {
      return this.failure('IntegrationArchiveSeedFinish', e);
    }
  }

  @Mutation(() => IntegrationArchiveSeedStateOutput)
  async IntegrationArchiveSeedCancel(
    @Arg('jobID') jobID: string,
    @Ctx() ctx: AppContext
  ): Promise<IntegrationArchiveSeedStateOutput> {
    try {
      const caller = await this.authorize(ctx, 'IntegrationArchiveSeedCancel');
      await this.loadReadableJob(jobID, caller);
      await ArchiveSeedJobInstance.Cancel(jobID, caller.User, caller.Provider);
      return this.stateOutput(await this.loadReadableJob(jobID, caller), 'Archive seed cancelled.');
    } catch (e) {
      return this.failure('IntegrationArchiveSeedCancel', e);
    }
  }

  @Query(() => IntegrationArchiveSeedStateOutput)
  async IntegrationArchiveSeedState(
    @Arg('jobID') jobID: string,
    @Ctx() ctx: AppContext
  ): Promise<IntegrationArchiveSeedStateOutput> {
    try {
      const caller = await this.authorize(ctx, 'IntegrationArchiveSeedState');
      const job = await this.loadReadableJob(jobID, caller);
      return this.stateOutput(job, `Archive seed job ${job.JobID} is ${job.State}.`);
    } catch (e) {
      return this.failure('IntegrationArchiveSeedState', e);
    }
  }

  /**
   * Refuses a node that does not run background workers (`MJ_SERVER_ROLE=api`): the job's phases run
   * detached in this process and resume on this node's boot, so starting one here would strand it.
   * The role is resolved exactly as `serve()` resolves it.
   */
  private assertRunsBackgroundWorkers(): void {
    if (!ShouldRunBackgroundWorkers(ResolveServerRole(configInfo.serverRole ?? process.env.MJ_SERVER_ROLE))) {
      throw new Error('Archive seeding requires a node that runs background workers');
    }
  }

  /** The guards of IntegrationStartBootstrap, in its order; throws the refusal. */
  private async authorize(ctx: AppContext, operation: string): Promise<ArchiveSeedCaller> {
    const user = this.getPrincipal(ctx, operation);
    await ActionEngineServer.Instance.Config(false, user);
    const action = this.findBootstrapAction();
    await this.CheckAPIKeyScopeAuthorization('action:execute', action.ID, ctx.userPayload);
    await AssertCanRunAction(action, user, ctx.providers);
    const provider = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: true });
    if (!provider) {
      throw new Error('No data provider is available for this request');
    }
    return { User: user, Provider: provider };
  }

  /** The authenticated caller; a scope-limited session may not run an action. */
  private getPrincipal(ctx: AppContext, operation: string): UserInfo {
    const user = ctx.userPayload?.userRecord;
    if (!user) {
      throw new Error('User is not authenticated');
    }
    if (IsScopeLimitedPrincipal(user)) {
      throw new Error(`${operation} is not permitted for scope-limited sessions`);
    }
    return user;
  }

  private findBootstrapAction(): MJActionEntityExtended {
    const action = ActionEngineServer.Instance.Actions.find(a => a.Name.trim().toLowerCase() === BOOTSTRAP_ACTION_NAME.toLowerCase());
    if (!action) {
      throw new Error(`Action '${BOOTSTRAP_ACTION_NAME}' is not registered. Push the integration action metadata first.`);
    }
    return action;
  }

  /**
   * The job, when it exists and the caller can read its company integration. A job the caller
   * cannot read is reported exactly as a missing one, so its existence does not leak.
   */
  private async loadReadableJob(jobID: string, caller: ArchiveSeedCaller): Promise<ArchiveSeedJobState> {
    const job = await ArchiveSeedJobInstance.GetState(jobID, caller.User, caller.Provider);
    if (!job || !(await this.userCanReadCompanyIntegration(job.CompanyIntegrationID, caller))) {
      throw new Error(`Archive seed job "${jobID}" was not found`);
    }
    return job;
  }

  /** Whether a RunView as the caller sees the company integration (permissions and row-level security). */
  private async userCanReadCompanyIntegration(companyIntegrationID: string, caller: ArchiveSeedCaller): Promise<boolean> {
    const result = await RunView.FromMetadataProvider(caller.Provider).RunView<{ ID: string }>({
      EntityName: 'MJ: Company Integrations',
      ExtraFilter: `ID='${EscapeSQLString(companyIntegrationID)}'`,
      Fields: ['ID'],
      MaxRows: 1,
      ResultType: 'simple',
    }, caller.User);
    return result.Success && result.Results.length > 0;
  }

  private stateOutput(job: ArchiveSeedJobState, message: string): IntegrationArchiveSeedStateOutput {
    return {
      Success: true,
      Message: message,
      JobID: job.JobID,
      CompanyIntegrationID: job.CompanyIntegrationID,
      State: job.State,
      CurrentRunID: job.CurrentRunID,
      StagingDatabaseName: job.StagingDatabaseName,
      BackupDatabaseName: job.BackupDatabaseName,
      Tables: job.Tables?.map(t => this.tableOutput(t)),
      Summary: job.Summary ? this.summaryOutput(job.Summary) : undefined,
      Error: job.Error,
    };
  }

  private tableOutput(table: ArchiveSeedDiscoveredTable): IntegrationArchiveSeedTableOutput {
    return { Name: table.Name, ColumnCount: table.ColumnCount, HasPrimaryKey: table.HasPrimaryKey, WatermarkField: table.WatermarkField };
  }

  private summaryOutput(summary: ArchiveSeedSummary): IntegrationArchiveSeedSummaryOutput {
    return {
      TablesProcessed: summary.TablesProcessed,
      TotalRowsTransferred: summary.TotalRowsTransferred,
      DurationSeconds: summary.DurationSeconds,
      StagingDatabaseDropped: summary.StagingDatabaseDropped,
    };
  }

  private failure(operation: string, e: unknown): { Success: false; Message: string } {
    const message = e instanceof Error ? e.message : String(e);
    LogError(`${operation} error: ${message}`);
    return { Success: false, Message: message };
  }
}

export default IntegrationArchiveSeedResolver;
