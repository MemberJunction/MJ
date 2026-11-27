/**
 * @module scheduling/agent-note-sweep-job
 *
 * The scheduled-job driver of the hourly Predictive Studio agent note sweep (PR 5 A5, D5-11; `MJ: Scheduled Job Types`
 * "Predictive Studio Agent Note Sweep", one Active job every hour): `PredictiveStudioAgentNotePolicy.Sweep` activates
 * every qualifying `Pending` PS-agent note and archives every note whose source model stopped qualifying or whose
 * scope is NULL/NULL, so a note never stays injectable more than an hour after its model stops qualifying. The counts
 * go to the job run's `Details`. Its first run on a database archives the PS notes that predate the policy (DD-3).
 */
import { ValidationResult } from '@memberjunction/core';
import type { MJScheduledJobEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseScheduledJob, type ScheduledJobExecutionContext } from '@memberjunction/scheduling-engine';
import type { NotificationContent, ScheduledJobResult } from '@memberjunction/scheduling-base-types';

import { PredictiveStudioAgentNotePolicy, type NoteSweepResult } from '../agent/agent-note-policy';

/** The job run's `Details`. */
export interface AgentNoteSweepDetails {
  /** Notes moved to `Active`. */
  readonly Activated: number;
  /** Notes moved to `Archived`. */
  readonly Archived: number;
  /** Note saves that failed, each `<note id>: <message>`. */
  readonly Failed: readonly string[];
}

/** Runs the agent note sweep as the job's user on the provider the engine read the job with. */
@RegisterClass(BaseScheduledJob, 'PredictiveStudioAgentNoteSweepJobDriver')
export class PredictiveStudioAgentNoteSweepJobDriver extends BaseScheduledJob {
  /** @inheritdoc */
  public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
    try {
      const result = await this.RunSweep(context);
      return this.ResultOf(result);
    } catch (e) {
      return { Success: false, ErrorMessage: `Agent note sweep failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  /** The sweep itself (overridden in unit tests). @throws Error when a read fails */
  protected async RunSweep(context: ScheduledJobExecutionContext): Promise<NoteSweepResult> {
    return PredictiveStudioAgentNotePolicy.Sweep(context.Provider, context.ContextUser);
  }

  /** The job result of a sweep: its counts in `Details`, `Success` false when a note save failed. Pure. */
  public ResultOf(result: NoteSweepResult): ScheduledJobResult {
    const details: AgentNoteSweepDetails = { Activated: result.Activated, Archived: result.Archived, Failed: [...result.Failed] };
    return {
      Success: result.Failed.length === 0,
      ErrorMessage: result.Failed.length === 0 ? undefined : `${result.Failed.length} note save(s) failed`,
      Details: { ...details },
    };
  }

  /** @inheritdoc The job takes no configuration. */
  public ValidateConfiguration(_schedule: MJScheduledJobEntity): ValidationResult {
    const result = new ValidationResult();
    result.Success = true;
    return result;
  }

  /** @inheritdoc */
  public FormatNotification(context: ScheduledJobExecutionContext, result: ScheduledJobResult): NotificationContent {
    const activated = typeof result.Details?.['Activated'] === 'number' ? result.Details['Activated'] : 0;
    const archived = typeof result.Details?.['Archived'] === 'number' ? result.Details['Archived'] : 0;
    return result.Success
      ? {
          Subject: `Agent note sweep: ${activated} activated, ${archived} archived`,
          Body: `The scheduled agent note sweep "${context.Schedule.Name}" activated ${activated} Predictive Studio agent note(s) and archived ${archived}.`,
          Priority: 'Low',
        }
      : {
          Subject: `Agent note sweep failed: ${context.Schedule.Name}`,
          Body: `The scheduled agent note sweep "${context.Schedule.Name}" did not complete cleanly.\n\nError: ${result.ErrorMessage || 'unknown'}`,
          Priority: 'High',
        };
  }
}
