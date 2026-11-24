/**
 * @module registry/publish-notifications
 *
 * `PublishNotifications` — the surfaced half of an automatic publish attempt (§5.7 R4): one `MJ: User Notifications`
 * row per automatic outcome — a publish (a rollback and a restore included), a withheld publish, or a run stopped at
 * Evaluate — sent to the user who stands behind the automated initiator (D4-18):
 *
 * | Initiator | Recipient |
 * |---|---|
 * | `system` with a `processRunId` (auto-train) | `MJ: Process Runs.StartedByUserID` |
 * | `agent` | `MJ: AI Agent Runs.UserID` |
 * | `scheduled-job` | the run's job's `MJ: Scheduled Jobs.OwnerUserID` (through `MJ: Scheduled Job Runs.ScheduledJobID`) |
 * | `human` | nobody: an interactive publish answers its user directly, so it is never notified |
 *
 * A recipient that cannot be resolved (a `system` initiator without a Process Run, a missing row, a null column) writes
 * nothing and logs one `LogStatus` line naming why. De-duplication: at most one row per recipient, subject (the model;
 * for a run stopped at Evaluate with no model row, its pipeline — D4-56), outcome kind and UTC calendar day. The key
 * is the row's `ResourceConfiguration` JSON (`{ Entity, RecordID, Kind, Day }`, built in that order so equal keys are
 * equal text), read back past the RunView cache before each write. The notification never throws out of the publish
 * it reports on: a failed read or save is logged with `LogError` and the outcome stands.
 */
import { LogError, LogStatus } from '@memberjunction/core';
import type {
  MJAIAgentRunEntity,
  MJMLModelEntity,
  MJMLTrainingRunEntity,
  MJProcessRunEntity,
  MJScheduledJobEntity,
  MJScheduledJobRunEntity,
  MJUserNotificationEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, IsValidUUID } from '@memberjunction/global';
import type { Actor, TransitionRefusal } from '@memberjunction/predictive-studio-core';

import type { GateContext, PublishOutcome, PublishRequest } from './gate-context';
import { GateRefusals } from './gate-refusals';
import { SYSTEM_CLOCK, type GateClock } from './publish-locks';
import { RecordNotificationLinks, type RecordResourceConfiguration } from './record-notification-links';
import type { RegistryContext } from './registry-context';
import { StoredRowReads } from './stored-row-reads';

/** The record a notification is about: a model, or (for a run-level outcome, which has no model) its pipeline. */
export interface PublishNotificationSubject {
  /** The entity the record belongs to. */
  readonly Entity: 'MJ: ML Models' | 'MJ: ML Training Pipelines';
  /** The record's ID (the notification's `ResourceRecordID`). */
  readonly RecordID: string;
  /** How the notification names the record, e.g. `ML Model 'Renewals' v3`. */
  readonly Label: string;
}

/** The de-duplication key, stored as the notification's `ResourceConfiguration` (a record link Explorer opens). */
export interface PublishNotificationConfiguration extends RecordResourceConfiguration {
  /** `published` or `rolled-back` (an applied publish by its purpose), or the refusal kind of a withheld attempt. */
  readonly Kind: 'published' | 'rolled-back' | TransitionRefusal['kind'];
  /** The UTC calendar day of the outcome, `YYYY-MM-DD`. */
  readonly Day: string;
}

/** Who a notification goes to, or why nobody can be named. */
export type PublishNotificationRecipient = { readonly Found: true; readonly UserID: string } | { readonly Found: false; readonly Reason: string };

/** The words of one notification. */
export interface PublishNotificationContent {
  /** The notification's `Title`. */
  readonly Title: string;
  /** The notification's `Message`. */
  readonly Message: string;
}

/** The training run columns a notification reads. */
export type PublishNotificationRunColumns = Pick<MJMLTrainingRunEntity, 'ID' | 'PipelineID' | 'Pipeline' | 'ResultingModelID'>;

/** The MJ core entities a notification reads one row of by ID (every one is keyed by `ID`). */
type ReadEntityName = 'MJ: Process Runs' | 'MJ: AI Agent Runs' | 'MJ: Scheduled Job Runs' | 'MJ: Scheduled Jobs' | 'MJ: ML Models' | 'MJ: ML Training Runs';

/** One notification to deliver: its kind, how to find its subject, and its words once the subject is known. */
interface PendingNotification {
  readonly Kind: PublishNotificationConfiguration['Kind'];
  /** What the notification is about, in words for the log line when it cannot be found. */
  readonly About: string;
  readonly Subject: () => Promise<PublishNotificationSubject | null>;
  readonly Content: (subject: PublishNotificationSubject) => PublishNotificationContent;
}

/** What one set of notifications sends. */
export interface PublishNotificationOptions {
  /**
   * Whether withheld outcomes (a withheld publish, a run stopped at Evaluate) are notified; default `true`. A published
   * or rolled-back outcome is always notified. Auto-train passes its process's `autoTrain.notifyOnWithheld` (§5.7 R4 (d)).
   */
  readonly NotifyWithheld?: boolean;
}

/** The lifecycle gate's notifications of automatic outcomes. */
export class PublishNotifications {
  private readonly notifyWithheld: boolean;

  /**
   * @param clock what the de-duplication day is read from; `Now()` must be milliseconds since the Unix epoch
   *   (production: the system clock)
   * @param options what is sent (default: every outcome)
   */
  constructor(private readonly clock: GateClock = SYSTEM_CLOCK, options: PublishNotificationOptions = {}) {
    this.notifyWithheld = options.NotifyWithheld !== false;
  }

  /**
   * Notifies the initiator's user of an automatic publish outcome, named by its purpose: `published` ("Published
   * automatically" for a `publish`, which R1's restore of a model changed outside the gate also is; "Rolled back
   * automatically" for a `rollback`) or `withheld` (its refusal in plain words, `GateRefusals.Describe`; not sent when
   * {@link PublishNotificationOptions.NotifyWithheld} is false). An `already-published` retry repeats an outcome
   * that was already notified and sends nothing; a `human` initiator is interactive and is never notified.
   */
  public async Notify(outcome: PublishOutcome, initiator: Actor, ctx: GateContext): Promise<void> {
    if (outcome.Kind === 'already-published') return;
    const subject = () => this.ReadModelSubject(outcome.ModelID, ctx);
    if (outcome.Kind === 'published') {
      const kind = outcome.Purpose === 'rollback' ? 'rolled-back' : 'published';
      await this.deliver(initiator, ctx, { Kind: kind, About: `ML Model ${outcome.ModelID}`, Subject: subject, Content: (s) => PublishNotifications.PublishedContent(s, outcome) });
      return;
    }
    if (!this.notifyWithheld) return;
    const content = (s: PublishNotificationSubject) => PublishNotifications.WithheldContent(s, outcome.Refusal, outcome.Transient, outcome.Purpose);
    await this.deliver(initiator, ctx, { Kind: outcome.Refusal.kind, About: `ML Model ${outcome.ModelID}`, Subject: subject, Content: content });
  }

  /**
   * Notifies the initiator's user of an automatic attempt that stopped at Evaluate. A run with a model row (a
   * model-level refusal, which writes no record) is a withheld publish of that model; a run without one (no-signal, or
   * a kept incumbent-heuristic rule, whose run-level record the gate wrote — D4-56) is reported on its pipeline. A
   * `human` initiator is never notified, and nothing is sent when {@link PublishNotificationOptions.NotifyWithheld} is false.
   */
  public async NotifyStoppedAtEvaluate(trainingRunId: string, refusal: TransitionRefusal, initiator: Actor, ctx: GateContext): Promise<void> {
    if (!this.notifyWithheld) return;
    const subject = async (): Promise<PublishNotificationSubject | null> => {
      const run = await this.ReadRun(trainingRunId, ctx);
      if (run === null) return null;
      return run.ResultingModelID ? this.ReadModelSubject(run.ResultingModelID, ctx) : PublishNotifications.pipelineSubject(run);
    };
    const content = (s: PublishNotificationSubject) =>
      s.Entity === 'MJ: ML Models' ? PublishNotifications.WithheldContent(s, refusal, false, 'publish') : PublishNotifications.StoppedContent(s, trainingRunId, refusal);
    await this.deliver(initiator, ctx, { Kind: refusal.kind, About: `ML Training Run ${trainingRunId}`, Subject: subject, Content: content });
  }

  // ========================================================================================= protected steps ==

  /**
   * The user behind an automated initiator (D4-18): a Process Run's `StartedByUserID`, an agent run's `UserID`, a
   * scheduled job run's job's `OwnerUserID`; `Found: false` naming why for a `human` initiator (interactive), a `system`
   * initiator without a Process Run, a missing row or a null column.
   *
   * @throws Error when a read fails
   */
  protected async ResolveRecipient(initiator: Actor, ctx: GateContext): Promise<PublishNotificationRecipient> {
    switch (initiator.kind) {
      case 'human':
        return { Found: false, Reason: 'a human initiator is interactive and is not notified' };
      case 'system':
        return initiator.processRunId
          ? PublishNotifications.recipientOf(await this.readOne<Pick<MJProcessRunEntity, 'ID' | 'StartedByUserID'>>('MJ: Process Runs', initiator.processRunId, ['ID', 'StartedByUserID'], ctx), 'StartedByUserID', `Process Run ${initiator.processRunId}`)
          : { Found: false, Reason: `the ${initiator.component} initiator names no Process Run` };
      case 'agent':
        return PublishNotifications.recipientOf(await this.readOne<Pick<MJAIAgentRunEntity, 'ID' | 'UserID'>>('MJ: AI Agent Runs', initiator.agentRunId, ['ID', 'UserID'], ctx), 'UserID', `AI Agent Run ${initiator.agentRunId}`);
      case 'scheduled-job':
        return this.scheduledJobOwner(initiator.scheduledJobRunId, ctx);
    }
  }

  /**
   * The model as a notification subject, named by its pipeline and version; null when the model row is not found.
   *
   * @throws Error when the read fails
   */
  protected async ReadModelSubject(modelId: string, ctx: GateContext): Promise<PublishNotificationSubject | null> {
    const model = await this.readOne<Pick<MJMLModelEntity, 'ID' | 'Pipeline' | 'Version'>>('MJ: ML Models', modelId, ['ID', 'Pipeline', 'Version'], ctx);
    if (model === null) return null;
    return { Entity: 'MJ: ML Models', RecordID: model.ID, Label: `ML Model '${model.Pipeline || model.ID}' v${model.Version}` };
  }

  /**
   * The training run's pipeline and resulting model; null when the run row is not found.
   *
   * @throws Error when the read fails
   */
  protected async ReadRun(trainingRunId: string, ctx: GateContext): Promise<PublishNotificationRunColumns | null> {
    return this.readOne<PublishNotificationRunColumns>('MJ: ML Training Runs', trainingRunId, ['ID', 'PipelineID', 'Pipeline', 'ResultingModelID'], ctx);
  }

  /**
   * True when the recipient already has the notification this key names (same subject, kind and day), read past the
   * RunView cache.
   *
   * @throws Error when the read fails
   */
  protected async AlreadySent(userId: string, key: PublishNotificationConfiguration, ctx: GateContext): Promise<boolean> {
    const r = await StoredRowReads.Run<Pick<MJUserNotificationEntity, 'ID'>>(
      {
        EntityName: 'MJ: User Notifications',
        ExtraFilter: `UserID='${EscapeSQLString(userId)}' AND ResourceRecordID='${EscapeSQLString(key.RecordID)}' AND ResourceConfiguration='${EscapeSQLString(JSON.stringify(key))}'`,
        Fields: ['ID'], MaxRows: 1, ResultType: 'simple',
      },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading the notifications of user ${userId} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results.length > 0;
  }

  /**
   * Saves one unread notification to `userId` linked to the subject's record (the `Records` resource type when it is
   * seeded; the row is saved without the link otherwise).
   *
   * @throws Error naming the save's message when the row is not saved
   */
  protected async WriteNotification(userId: string, key: PublishNotificationConfiguration, content: PublishNotificationContent, ctx: GateContext): Promise<void> {
    const row = await ctx.Provider.GetEntityObject<MJUserNotificationEntity>('MJ: User Notifications', ctx.ContextUser);
    row.NewRecord();
    row.UserID = userId;
    row.Title = content.Title;
    row.Message = content.Message;
    row.Unread = true;
    row.ResourceTypeID = await RecordNotificationLinks.RecordsResourceTypeID(ctx.Provider, ctx.ContextUser, 'Predictive Studio notifications', 'publish notification');
    row.ResourceRecordID = key.RecordID;
    row.ResourceConfiguration = JSON.stringify(key);
    if (!(await row.Save())) throw new Error(`Saving the notification to user ${userId} failed: ${row.LatestResult?.CompleteMessage || 'unknown error'}`);
  }

  /** The UTC calendar day (`YYYY-MM-DD`) the clock reads now. */
  protected Today(): string {
    return new Date(this.clock.Now()).toISOString().slice(0, 10);
  }

  /** The words of an applied automatic publish, by its purpose: a publish (a restore included) or a rollback. Pure. */
  public static PublishedContent(subject: PublishNotificationSubject, outcome: Extract<PublishOutcome, { readonly Kind: 'published' }>): PublishNotificationContent {
    const replaces = outcome.Replaces === null ? '' : `, replacing ML Model ${outcome.Replaces}`;
    const approver = outcome.Approver === 'automated-gate' ? 'the automated gate' : 'a user';
    if (outcome.Purpose === 'rollback') {
      return { Title: `Rolled back automatically: ${subject.Label}`, Message: `The lifecycle gate rolled back to ${subject.Label}${replaces}; approved by ${approver}.` };
    }
    return { Title: `Published automatically: ${subject.Label}`, Message: `The lifecycle gate published ${subject.Label}${replaces}; approved by ${approver}.` };
  }

  /**
   * The words of a withheld automatic publish or rollback: the refusal in plain words, and whether a later attempt can
   * pass. Pure.
   */
  public static WithheldContent(subject: PublishNotificationSubject, refusal: TransitionRefusal, transient: boolean, purpose: PublishRequest['purpose']): PublishNotificationContent {
    const retry = transient ? ' The refusal is transient; a later attempt can pass.' : '';
    const what = purpose === 'rollback' ? 'rollback' : 'publish';
    return { Title: `Automatic ${what} withheld: ${subject.Label}`, Message: `${GateRefusals.Describe(refusal)}${retry}` };
  }

  /** The words of a training run stopped at Evaluate with no model row, reported on its pipeline. Pure. */
  public static StoppedContent(subject: PublishNotificationSubject, trainingRunId: string, refusal: TransitionRefusal): PublishNotificationContent {
    return { Title: `No model to publish: ${subject.Label}`, Message: `Training run ${trainingRunId} produced no model to publish. ${GateRefusals.Describe(refusal)}` };
  }

  // ================================================================================================ private ==

  /** Resolves the recipient and the subject, skips a duplicate, writes the row; logs and swallows every failure. */
  private async deliver(initiator: Actor, ctx: GateContext, pending: PendingNotification): Promise<void> {
    if (initiator.kind === 'human') return;
    try {
      const recipient = await this.ResolveRecipient(initiator, ctx);
      if (recipient.Found === false) {
        LogStatus(`Predictive Studio notifications: the ${pending.Kind} outcome of ${pending.About} notifies nobody: ${recipient.Reason}.`);
        return;
      }
      const subject = await pending.Subject();
      if (subject === null) {
        LogStatus(`Predictive Studio notifications: the ${pending.Kind} outcome of ${pending.About} notifies nobody: its record was not found.`);
        return;
      }
      const key: PublishNotificationConfiguration = { Entity: subject.Entity, RecordID: subject.RecordID, Kind: pending.Kind, Day: this.Today() };
      if (await this.AlreadySent(recipient.UserID, key, ctx)) return;
      await this.WriteNotification(recipient.UserID, key, pending.Content(subject), ctx);
    } catch (error) {
      LogError(`Predictive Studio notifications: the ${pending.Kind} outcome of ${pending.About} was not notified: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** The scheduled job run's job's owner. */
  private async scheduledJobOwner(scheduledJobRunId: string, ctx: GateContext): Promise<PublishNotificationRecipient> {
    const run = await this.readOne<Pick<MJScheduledJobRunEntity, 'ID' | 'ScheduledJobID'>>('MJ: Scheduled Job Runs', scheduledJobRunId, ['ID', 'ScheduledJobID'], ctx);
    if (run === null) return { Found: false, Reason: `Scheduled Job Run ${scheduledJobRunId} was not found` };
    const job = await this.readOne<Pick<MJScheduledJobEntity, 'ID' | 'OwnerUserID'>>('MJ: Scheduled Jobs', run.ScheduledJobID, ['ID', 'OwnerUserID'], ctx);
    return PublishNotifications.recipientOf(job, 'OwnerUserID', `Scheduled Job ${run.ScheduledJobID}`);
  }

  /**
   * One row's columns by ID, past the RunView cache; null for an ID that is not a UUID or names no row.
   *
   * @throws Error when the read fails
   */
  private async readOne<T extends { readonly ID: string }>(entityName: ReadEntityName, id: string, fields: readonly (keyof T & string)[], ctx: RegistryContext): Promise<T | null> {
    if (!IsValidUUID(id)) return null;
    const r = await StoredRowReads.Run<T>({ EntityName: entityName, ExtraFilter: `ID='${EscapeSQLString(id)}'`, Fields: [...fields], MaxRows: 1, ResultType: 'simple' }, ctx); // pk-filter-ok: ReadEntityName lists MJ core entities only, each keyed by ID
    if (!r.Success) throw new Error(`Reading ${entityName} ${id} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results[0] || null;
  }

  /** The user a row's column names, or why there is none. */
  private static recipientOf<T extends { readonly ID: string }, K extends keyof T>(row: T | null, column: K, what: string): PublishNotificationRecipient {
    if (row === null) return { Found: false, Reason: `${what} was not found` };
    const userId = row[column];
    return typeof userId === 'string' && userId.length > 0 ? { Found: true, UserID: userId } : { Found: false, Reason: `${what} has no ${String(column)}` };
  }

  /** A run's pipeline as the subject of its run-level outcome. */
  private static pipelineSubject(run: PublishNotificationRunColumns): PublishNotificationSubject {
    return { Entity: 'MJ: ML Training Pipelines', RecordID: run.PipelineID, Label: `ML Training Pipeline '${run.Pipeline || run.PipelineID}'` };
  }
}
