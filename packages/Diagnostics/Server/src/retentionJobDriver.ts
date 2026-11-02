import { EscapeSQLString, RegisterClass, UUIDSet } from '@memberjunction/global';
import { BaseScheduledJob, ScheduledJobExecutionContext } from '@memberjunction/scheduling-engine';
import { ScheduledJobConfiguration, ScheduledJobResult, NotificationContent } from '@memberjunction/scheduling-base-types';
import {
  IMetadataProvider,
  RunView,
  UserInfo,
  ValidationErrorInfo,
  ValidationErrorType,
  ValidationResult,
  WithoutDiagnosticCapture
} from '@memberjunction/core';
import { MJDiagnosticBundleEntity, MJDiagnosticSessionEntity, MJScheduledJobEntity } from '@memberjunction/core-entities';
import { DiagnosticsSettings } from './settings.js';
import { BundleFileRemover } from './bundleFileRemover.js';

export interface DiagnosticRetentionJobConfiguration extends ScheduledJobConfiguration {
  LocalRetentionDays?: number;
  ReceivedRetentionDays?: number;
  MaxDeletesPerRun?: number;
}

const DEFAULT_MAX_DELETES_PER_RUN = 2000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NUMERIC_CONFIG_FIELDS = ['LocalRetentionDays', 'ReceivedRetentionDays', 'MaxDeletesPerRun'] as const;

type BundleDirection = MJDiagnosticBundleEntity['Direction'];
type SessionStatus = MJDiagnosticSessionEntity['Status'];
type PurgeRecord = MJDiagnosticBundleEntity | MJDiagnosticSessionEntity;

/** One purge query: an entity and the filter that selects its expired rows. */
interface PurgeTarget {
  EntityName: 'MJ: Diagnostic Bundles' | 'MJ: Diagnostic Sessions';
  ExtraFilter: string;
}

/**
 * Running totals for one job run. `Remaining` is the delete budget and only successful deletes
 * charge it; `AttemptsLeft` caps all attempts so rows that keep failing cannot loop the run.
 */
interface PurgeTally {
  Remaining: number;
  AttemptsLeft: number;
  Deleted: number;
  DeletedFiles: number;
  Failures: string[];
  FailedIDs: UUIDSet;
}

/** A configuration field that is not a non-negative number. */
interface ConfigurationError {
  Field: string;
  Message: string;
  Value: unknown;
}

/** Work done before a record's own delete. Returns `null` to go on, or why the record must be kept. */
type BeforeDelete<T> = (record: T) => Promise<string | null>;

/**
 * Deletes expired diagnostic bundles and finished diagnostic sessions.
 * A bundle's stored file (object and `MJ: Files` row) is deleted first; a bundle whose file
 * cannot be deleted is kept. Session chunks go with their session through the FK's ON DELETE CASCADE.
 * Rows that fail are skipped for the rest of the run and reported in `Details.Failures`.
 */
@RegisterClass(BaseScheduledJob, 'DiagnosticRetentionScheduledJobDriver')
export class DiagnosticRetentionScheduledJobDriver extends BaseScheduledJob {
  public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
    const { Config: config, Errors: errors } = this.readConfiguration(context.Schedule.Configuration);
    if (errors.length > 0) {
      return { Success: false, ErrorMessage: errors.map((e) => e.Message).join('; ') };
    }
    const settings = await DiagnosticsSettings.Load(context.ContextUser, context.Provider);
    const localRetentionDays = config.LocalRetentionDays ?? settings.RetentionDays;
    const receivedRetentionDays = config.ReceivedRetentionDays ?? settings.IntakeRetentionDays;
    const maxDeletesPerRun = config.MaxDeletesPerRun ?? DEFAULT_MAX_DELETES_PER_RUN;

    const now = Date.now();
    const bundleTargets = [
      this.bundleTarget('Local', this.cutoff(now, localRetentionDays)),
      this.bundleTarget('Received', this.cutoff(now, receivedRetentionDays))
    ];
    const sessionTarget = this.sessionTarget(this.cutoff(now, localRetentionDays));
    const tally = this.newTally(maxDeletesPerRun);
    const counts = await WithoutDiagnosticCapture(() =>
      this.runPurges(bundleTargets, sessionTarget, tally, context.ContextUser, context.Provider)
    );

    return {
      Success: tally.Failures.length === 0,
      ErrorMessage: tally.Failures.length > 0 ? `${tally.Failures.length} purge step(s) failed` : undefined,
      Details: {
        LocalRetentionDays: localRetentionDays,
        ReceivedRetentionDays: receivedRetentionDays,
        MaxDeletesPerRun: maxDeletesPerRun,
        DeletedSessions: counts.DeletedSessions,
        DeletedBundles: counts.DeletedBundles,
        DeletedFiles: tally.DeletedFiles,
        Failures: tally.Failures
      }
    };
  }

  public ValidateConfiguration(schedule: MJScheduledJobEntity): ValidationResult {
    const result = new ValidationResult();
    for (const error of this.readConfiguration(schedule.Configuration).Errors) {
      result.Errors.push(new ValidationErrorInfo(error.Field, error.Message, error.Value, ValidationErrorType.Failure));
    }
    result.Success = result.Errors.length === 0;
    return result;
  }

  public FormatNotification(
    context: ScheduledJobExecutionContext,
    result: ScheduledJobResult
  ): NotificationContent {
    return {
      Subject: `Diagnostic Retention Purge (${context.Schedule.Name}): ${result.Success ? 'Success' : 'Failed'}`,
      Body: JSON.stringify(result.Details ?? {}),
      Priority: 'Normal'
    };
  }

  private newTally(maxDeletesPerRun: number): PurgeTally {
    return {
      Remaining: maxDeletesPerRun,
      AttemptsLeft: 2 * maxDeletesPerRun,
      Deleted: 0,
      DeletedFiles: 0,
      Failures: [],
      FailedIDs: new UUIDSet()
    };
  }

  /** Purges bundles first, then sessions, sharing one delete budget. */
  private async runPurges(
    bundleTargets: PurgeTarget[],
    sessionTarget: PurgeTarget,
    tally: PurgeTally,
    contextUser: UserInfo,
    provider: IMetadataProvider
  ): Promise<{ DeletedBundles: number; DeletedSessions: number }> {
    const removeFile = this.fileRemoval(new BundleFileRemover(contextUser, provider), tally);
    for (const target of bundleTargets) {
      await this.purge<MJDiagnosticBundleEntity>(target, tally, contextUser, provider, removeFile);
    }
    const deletedBundles = tally.Deleted;
    await this.purge<MJDiagnosticSessionEntity>(sessionTarget, tally, contextUser, provider);
    return { DeletedBundles: deletedBundles, DeletedSessions: tally.Deleted - deletedBundles };
  }

  /** Deletes a bundle's file, when it has one, and counts it. */
  private fileRemoval(remover: BundleFileRemover, tally: PurgeTally): BeforeDelete<MJDiagnosticBundleEntity> {
    return async (bundle) => {
      if (!bundle.FileID) {
        return null;
      }
      const error = await remover.Remove(bundle.FileID);
      if (!error) {
        tally.DeletedFiles++;
      }
      return error;
    };
  }

  /** Parses the optional JSON configuration and lists every numeric field that is not valid. */
  private readConfiguration(rawConfig: string | null): { Config: DiagnosticRetentionJobConfiguration; Errors: ConfigurationError[] } {
    if (!rawConfig) {
      return { Config: {}, Errors: [] };
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawConfig) as Record<string, unknown>;
    } catch {
      return { Config: {}, Errors: [{ Field: 'Configuration', Message: 'Configuration is not valid JSON', Value: rawConfig }] };
    }
    const errors: ConfigurationError[] = [];
    for (const field of NUMERIC_CONFIG_FIELDS) {
      const error = this.configFieldError(field, parsed[field]);
      if (error) {
        errors.push(error);
      }
    }
    return { Config: parsed as DiagnosticRetentionJobConfiguration, Errors: errors };
  }

  /** Returns the error for a field that is set but not a non-negative number (an integer for `MaxDeletesPerRun`). */
  private configFieldError(field: (typeof NUMERIC_CONFIG_FIELDS)[number], value: unknown): ConfigurationError | null {
    if (value === undefined) {
      return null;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return { Field: field, Message: `${field} must be a non-negative number`, Value: value };
    }
    if (field === 'MaxDeletesPerRun' && !Number.isInteger(value)) {
      return { Field: field, Message: `${field} must be a non-negative integer`, Value: value };
    }
    return null;
  }

  /** ISO timestamp of the moment `days` days before `now`. */
  private cutoff(now: number, days: number): string {
    return new Date(now - days * MS_PER_DAY).toISOString();
  }

  private bundleTarget(direction: BundleDirection, cutoffIso: string): PurgeTarget {
    return {
      EntityName: 'MJ: Diagnostic Bundles',
      ExtraFilter: `Direction = '${direction}' AND __mj_CreatedAt < '${cutoffIso}'`
    };
  }

  private sessionTarget(cutoffIso: string): PurgeTarget {
    const active: SessionStatus = 'Active';
    return {
      EntityName: 'MJ: Diagnostic Sessions',
      ExtraFilter: `Status <> '${active}' AND __mj_CreatedAt < '${cutoffIso}'`
    };
  }

  /** Pages through one target's expired rows, skipping rows that failed earlier in the run. */
  private async purge<T extends PurgeRecord>(
    target: PurgeTarget,
    tally: PurgeTally,
    contextUser: UserInfo,
    provider: IMetadataProvider,
    beforeDelete?: BeforeDelete<T>
  ): Promise<void> {
    while (tally.Remaining > 0 && tally.AttemptsLeft > 0) {
      const batchSize = Math.min(tally.Remaining, tally.AttemptsLeft);
      const rows = await this.loadBatch<T>(target, tally, batchSize, contextUser, provider);
      if (!rows) {
        return;
      }
      for (const record of rows.slice(0, batchSize)) {
        await this.deleteOne(target.EntityName, record, tally, beforeDelete);
      }
      if (rows.length < batchSize) {
        return;
      }
    }
  }

  /** Loads the next batch of expired rows, or `null` (with a recorded failure) when the query fails. */
  private async loadBatch<T extends PurgeRecord>(
    target: PurgeTarget,
    tally: PurgeTally,
    batchSize: number,
    contextUser: UserInfo,
    provider: IMetadataProvider
  ): Promise<T[] | null> {
    const result = await RunView.FromMetadataProvider(provider).RunView<T>(
      {
        EntityName: target.EntityName,
        ExtraFilter: this.withoutFailedRows(target.ExtraFilter, tally.FailedIDs),
        OrderBy: '__mj_CreatedAt ASC',
        MaxRows: batchSize,
        ResultType: 'entity_object',
        BypassCache: true
      },
      contextUser
    );
    if (!result.Success) {
      tally.Failures.push(`${target.EntityName}: query failed: ${result.ErrorMessage}`);
      return null;
    }
    return result.Results;
  }

  private withoutFailedRows(filter: string, failedIds: UUIDSet): string {
    if (failedIds.Size === 0) {
      return filter;
    }
    const ids = [...failedIds].map((id) => `'${EscapeSQLString(id)}'`).join(', ');
    return `(${filter}) AND ID NOT IN (${ids})`;
  }

  private async deleteOne<T extends PurgeRecord>(
    entityName: string,
    record: T,
    tally: PurgeTally,
    beforeDelete?: BeforeDelete<T>
  ): Promise<void> {
    tally.AttemptsLeft--;
    const blocked = beforeDelete ? await beforeDelete(record) : null;
    if (blocked) {
      this.recordFailure(record.ID, `${entityName} ${record.ID} kept: ${blocked}`, tally);
      return;
    }
    if (await record.Delete()) {
      tally.Remaining--;
      tally.Deleted++;
      return;
    }
    const message = record.LatestResult?.CompleteMessage ?? 'unknown error';
    this.recordFailure(record.ID, `${entityName} ${record.ID}: ${message}`, tally);
  }

  private recordFailure(id: string, message: string, tally: PurgeTally): void {
    tally.FailedIDs.Add(id);
    tally.Failures.push(message);
  }
}
