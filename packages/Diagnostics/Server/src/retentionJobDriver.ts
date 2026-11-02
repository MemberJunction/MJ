import { RegisterClass } from '@memberjunction/global';
import { BaseScheduledJob, ScheduledJobExecutionContext } from '@memberjunction/scheduling-engine';
import { ScheduledJobConfiguration, ScheduledJobResult, NotificationContent } from '@memberjunction/scheduling-base-types';
import { ValidationResult } from '@memberjunction/core';
import { MJScheduledJobEntity } from '@memberjunction/core-entities';

export interface DiagnosticRetentionJobConfiguration extends ScheduledJobConfiguration {
  LocalRetentionDays?: number;
  ReceivedRetentionDays?: number;
  MaxDeletesPerRun?: number;
}

@RegisterClass(BaseScheduledJob, 'DiagnosticRetentionScheduledJobDriver')
export class DiagnosticRetentionScheduledJobDriver extends BaseScheduledJob {
  public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
    const rawConfig = context.Schedule.Configuration;
    let config: DiagnosticRetentionJobConfiguration = {};
    if (rawConfig) {
      try {
        config = JSON.parse(rawConfig) as DiagnosticRetentionJobConfiguration;
      } catch {
        config = {};
      }
    }

    const localRetentionDays = config.LocalRetentionDays ?? 14;
    const receivedRetentionDays = config.ReceivedRetentionDays ?? 30;
    const maxDeletesPerRun = config.MaxDeletesPerRun ?? 2000;

    return {
      Success: true,
      Details: {
        LocalRetentionDays: localRetentionDays,
        ReceivedRetentionDays: receivedRetentionDays,
        MaxDeletesPerRun: maxDeletesPerRun,
        DeletedSessions: 0,
        DeletedBundles: 0
      }
    };
  }

  public ValidateConfiguration(_schedule: MJScheduledJobEntity): ValidationResult {
    return new ValidationResult();
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
}
