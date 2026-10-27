import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, InputType, Int } from 'type-graphql';
import { LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { ActionEngineServer } from '@memberjunction/actions';
import type { ActionResult, MJActionEntityExtended } from '@memberjunction/actions-base';
import { IntegrationProgressEmitter, IntegrationProgressReader } from '@memberjunction/integration-progress-artifacts';
import { ResolverBase } from '../generic/ResolverBase.js';
import { AppContext } from '../types.js';
import { GetReadWriteProvider } from '../util.js';
import { IsScopeLimitedPrincipal } from '../auth/scopeLimitedPrincipal.js';
import { AssertCanRunAction } from '../auth/actionRunGuard.js';
import {
  BOOTSTRAP_ACTION_NAME,
  BuildBootstrapActionParams,
  ValidateBootstrapLaunchInput,
  type BootstrapLaunchInput,
} from '../integration/BootstrapLaunch.js';

@InputType()
export class IntegrationBootstrapInput implements BootstrapLaunchInput {
  @Field() CompanyIntegrationID: string;
  @Field() BackupUrls: string;
  @Field({ nullable: true }) SasToken?: string;
  @Field({ nullable: true }) StorageCredentialID?: string;
  @Field({ nullable: true }) StagingDatabaseName?: string;
  @Field({ nullable: true }) DropStagingDbOnComplete?: boolean;
  @Field({ nullable: true }) TruncateTargetBeforeLoad?: boolean;
  @Field(() => Int, { nullable: true }) BatchSize?: number;
  @Field({ nullable: true }) EntityMapIDs?: string;
  @Field({ nullable: true }) TargetDataFileDirectory?: string;
  @Field({ nullable: true }) TargetLogFileDirectory?: string;
}

@ObjectType()
export class IntegrationBootstrapStartOutput {
  @Field() Success: boolean;
  @Field() Message: string;
  /** The run to tail with IntegrationGetRun / IntegrationTailRunEvents (or the IntegrationProgress subscription). */
  @Field({ nullable: true }) RunID?: string;
  @Field() InProgress: boolean;
}

/**
 * Launches the SQL Server backup bootstrap as a DETACHED run. A restore of a multi-terabyte
 * backup and the loads that follow take hours, far beyond what one HTTP request can be held open
 * for, so this mutation validates, authorizes, mints a run ID, starts the action without awaiting
 * it, and returns at once. The action reports every stage onto the run's progress artifact stream;
 * the caller follows it with `IntegrationTailRunEvents` and reads the outcome with
 * `IntegrationGetRun`, exactly as a detached schema refresh is followed.
 */
@Resolver()
export class IntegrationBootstrapResolver extends ResolverBase {
  @Mutation(() => IntegrationBootstrapStartOutput)
  async IntegrationStartBootstrap(
    @Arg('input') input: IntegrationBootstrapInput,
    @Ctx() ctx: AppContext
  ): Promise<IntegrationBootstrapStartOutput> {
    try {
      const user = this.getPrincipal(ctx);
      const validationError = ValidateBootstrapLaunchInput(input);
      if (validationError) {
        return { Success: false, Message: validationError, InProgress: false };
      }

      await ActionEngineServer.Instance.Config(false, user);
      const action = this.findBootstrapAction();
      await this.CheckAPIKeyScopeAuthorization('action:execute', action.ID, ctx.userPayload);
      await AssertCanRunAction(action, user, ctx.providers);

      const runID = IntegrationProgressEmitter.NewRunID('bootstrap');
      const provider = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: true }) ?? undefined;
      LogStatus(`Bootstrap run ${runID} launched for CompanyIntegration ${input.CompanyIntegrationID} by ${user.Email}`);

      // Deliberately not awaited: the action owns the run's artifact stream from its first statement
      // on and terminates it itself. Only a launch that never reached the action (the engine refused
      // it, or it threw before opening its emitter) has to be published here, or the run the caller
      // was handed would never produce an event.
      void ActionEngineServer.Instance.RunAction({
        Action: action,
        ContextUser: user,
        Params: BuildBootstrapActionParams(input, runID),
        SkipActionLog: false,
        Filters: [],
        Provider: provider,
      })
        .then(result => this.publishIfRunNeverOpened(runID, input.CompanyIntegrationID, result))
        .catch((err: unknown) => this.publishDetachedLaunchFailure(runID, input.CompanyIntegrationID, this.errorMessage(err)));

      return {
        Success: true,
        Message: `Bootstrap started as run ${runID}. Tail it with IntegrationTailRunEvents.`,
        RunID: runID,
        InProgress: true,
      };
    } catch (e) {
      LogError(`IntegrationStartBootstrap error: ${e}`);
      return { Success: false, Message: this.errorMessage(e), InProgress: false };
    }
  }

  /** The authenticated caller; a scope-limited session may not launch an action, as with RunAction. */
  private getPrincipal(ctx: AppContext): UserInfo {
    const user = ctx.userPayload?.userRecord;
    if (!user) {
      throw new Error('User is not authenticated');
    }
    if (IsScopeLimitedPrincipal(user)) {
      throw new Error('IntegrationStartBootstrap is not permitted for scope-limited sessions');
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
   * After the detached action settles: a failed result whose run artifact never appeared means the
   * action was refused before it could open its emitter, so the failure is published onto the run.
   */
  private async publishIfRunNeverOpened(runID: string, companyIntegrationID: string, result: ActionResult): Promise<void> {
    if (result.Success) {
      return;
    }
    const snapshot = await new IntegrationProgressReader().GetRun(runID).catch(() => null);
    if (!snapshot) {
      this.publishDetachedLaunchFailure(runID, companyIntegrationID, result.Message ?? 'The bootstrap action was refused before it started.');
    }
  }

  /** Terminates a run that failed before the action could open its own artifact stream. */
  private publishDetachedLaunchFailure(runID: string, companyIntegrationID: string, message: string): void {
    LogError(`Detached bootstrap (run ${runID}) failed to launch: ${message}`);
    try {
      const emitter = new IntegrationProgressEmitter({
        runID,
        runKind: 'Other',
        companyIntegrationID,
        triggerType: 'Manual',
        startedAt: new Date().toISOString(),
        context: { kind: 'SQLServerBackupBootstrap' },
      });
      emitter.RunStart('Detached bootstrap launch');
      emitter.StageError('Launch', message, { code: 'bootstrap-launch-failed' });
      void emitter.Fail(`Bootstrap could not start: ${message}`, 'bootstrap-launch-failed')
        .catch(e => LogError(`Detached bootstrap (run ${runID}): failure artifact write failed — ${e}`));
    } catch (e) {
      LogError(`Detached bootstrap (run ${runID}): could not open failure artifact — ${e}`);
    }
  }

  private errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }
}

export default IntegrationBootstrapResolver;
