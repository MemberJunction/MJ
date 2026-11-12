import { RegisterClass } from '@memberjunction/global';
import type { DatabasePlatform } from '@memberjunction/core';
import { BaseHealthProbe } from '../BaseHealthProbe';
import type { AgentRemediationPlaybook, HealthProbeContext, HealthSignalDefinition, HealthSignalEvaluation, HealthStatus, ProbeExecutionMode } from '../types';

/** Signal code for {@link QueueWorkerHeartbeatProbe}. */
export const QUEUE_WORKER_HEARTBEAT_SIGNAL_CODE = 'MJ.CORE.QUEUE.WORKER_HEARTBEAT';

const HEARTBEAT_YELLOW_MS = 60_000;
const HEARTBEAT_RED_MS = 180_000;
const FAILURE_RATIO_YELLOW = 0.05;
const FAILURE_RATIO_RED = 0.15;
const RECENT_WINDOW_MS = 60 * 60 * 1000;
const SAMPLE_ROW_LIMIT = 200;

interface ScheduledJobRunRow {
  StartedAt: string | Date;
  Success: boolean | number | null;
}

const YELLOW_PLAYBOOK: AgentRemediationPlaybook = {
  AgentInstructions:
    'The scheduled job worker heartbeat is stale or its recent failure rate is elevated but not critical. Inspect ' +
    'error codes on the most recent failed runs and retry any that look transient (timeout/network). Do not ' +
    'restart the worker process yet.',
  AllowedAutonomousActions: [],
  MaxAutonomousAttempts: 2,
  RetryCooldownSeconds: 60,
  HumanEscalationCriteria: 'Escalate if the heartbeat stays stale, or the failure rate stays elevated, for more than 15 consecutive minutes.',
};

const RED_PLAYBOOK: AgentRemediationPlaybook = {
  AgentInstructions:
    'The scheduled job worker heartbeat has expired (> 180s) or its recent failure rate exceeds 15%. Restart the ' +
    'queue worker process. If the failure persists immediately after restart, pause the queue and escalate.',
  AllowedAutonomousActions: ['RestartQueueWorkerProcess'],
  MaxAutonomousAttempts: 1,
  RetryCooldownSeconds: 120,
  HumanEscalationCriteria: 'Escalate immediately if the heartbeat is still stale, or failures still exceed 15%, after one restart attempt.',
};

/**
 * Verifies the scheduled-job worker is actively processing: the most recent run started within
 * the expected heartbeat window, and the failure rate over the last hour is within tolerance.
 *
 * Uses `__mj.ScheduledJobRun` as the heartbeat proxy — every scheduler tick that actually ran a
 * job writes a row here with `StartedAt`/`Success`. An instance that has simply never scheduled a
 * job (zero rows ever) is reported `GREEN`: this probe verifies the worker isn't stuck or failing,
 * not that scheduling is in active use.
 */
@RegisterClass(BaseHealthProbe, QUEUE_WORKER_HEARTBEAT_SIGNAL_CODE)
export class QueueWorkerHeartbeatProbe extends BaseHealthProbe {
  public override get ProbeKey(): string {
    return QUEUE_WORKER_HEARTBEAT_SIGNAL_CODE;
  }

  public override get OwnerApp(): string {
    return '__mj';
  }

  public override get Mode(): ProbeExecutionMode {
    return 'passive';
  }

  public override get SignalDefinitions(): readonly HealthSignalDefinition[] {
    return [
      {
        Code: QUEUE_WORKER_HEARTBEAT_SIGNAL_CODE,
        Title: 'Scheduled Job Worker Heartbeat',
        Layer: 'core',
        OwnerApp: this.OwnerApp,
        Mode: this.Mode,
        Description: 'Verifies the scheduled job worker has a recent heartbeat and an acceptable failure rate over the last hour.',
        YellowPlaybook: YELLOW_PLAYBOOK,
        RedPlaybook: RED_PLAYBOOK,
      },
    ];
  }

  public override async Evaluate(context: HealthProbeContext): Promise<HealthSignalEvaluation[]> {
    const startedAt = Date.now();
    const definition = this.SignalDefinitions[0];
    let diagnosticError: string | undefined;
    let rows: ScheduledJobRunRow[] = [];

    try {
      rows = await this.fetchRecentRuns(context);
    } catch (error) {
      diagnosticError = error instanceof Error ? (error.stack ?? error.message) : String(error);
    }

    const durationMs = Date.now() - startedAt;
    if (diagnosticError) {
      return [this.buildEvaluation(definition, 'RED', `Could not read scheduled job run history: ${diagnosticError.split('\n')[0]}`, {}, durationMs, diagnosticError)];
    }
    if (rows.length === 0) {
      return [this.buildEvaluation(definition, 'GREEN', 'No scheduled job runs have ever been recorded on this instance.', { TotalRunsObserved: 0 }, durationMs)];
    }

    const { heartbeatAgeMs, failureRatio, recentRunCount } = this.computeMetrics(rows);
    let overdueJobCount = 0;
    if (heartbeatAgeMs >= HEARTBEAT_YELLOW_MS) {
      overdueJobCount = await this.countOverdueJobs(context);
    }

    const status = this.classify(heartbeatAgeMs, failureRatio, overdueJobCount);
    const summary =
      status === 'RED'
        ? overdueJobCount > 0
          ? `${overdueJobCount} scheduled job(s) are overdue (>180s) with worker inactive for ${Math.round(heartbeatAgeMs / 1000)}s.`
          : `Failure ratio ${(failureRatio * 100).toFixed(1)}% exceeds RED threshold.`
        : status === 'YELLOW'
          ? overdueJobCount > 0
            ? `${overdueJobCount} scheduled job(s) are due with worker inactive for ${Math.round(heartbeatAgeMs / 1000)}s.`
            : `Recent job failure ratio ${(failureRatio * 100).toFixed(1)}% is elevated.`
          : overdueJobCount === 0 && heartbeatAgeMs >= HEARTBEAT_YELLOW_MS
            ? `Queue worker is idle with zero overdue jobs; last run was ${Math.round(heartbeatAgeMs / 1000)}s ago.`
            : `Heartbeat is current (${Math.round(heartbeatAgeMs / 1000)}s old) with a ${(failureRatio * 100).toFixed(1)}% failure ratio over the last hour.`;

    return [
      this.buildEvaluation(
        definition,
        status,
        summary,
        {
          HeartbeatAgeMs: Math.round(heartbeatAgeMs),
          FailureRatio: Number(failureRatio.toFixed(4)),
          RecentRunCount: recentRunCount,
          OverdueJobCount: overdueJobCount,
        },
        durationMs,
      ),
    ];
  }

  private async countOverdueJobs(context: HealthProbeContext): Promise<number> {
    try {
      const schema = context.DatabaseProvider.MJCoreSchemaName;
      const tableRef = context.DatabaseProvider.QuoteSchemaAndView(schema, 'ScheduledJob');
      const statusCol = context.DatabaseProvider.QuoteIdentifier('Status');
      const nextRunCol = context.DatabaseProvider.QuoteIdentifier('NextRunAt');
      const countCol = context.DatabaseProvider.QuoteIdentifier('OverdueCount');
      const thresholdIso = new Date(Date.now() - HEARTBEAT_RED_MS).toISOString();
      const rows = await context.DatabaseProvider.ExecuteSQL<{ OverdueCount: number }>(
        `SELECT COUNT(*) AS ${countCol} FROM ${tableRef} WHERE ${statusCol} = 'Active' AND ${nextRunCol} IS NOT NULL AND ${nextRunCol} < '${thresholdIso}'`,
        undefined,
        undefined,
        context.SystemUser,
      );
      return rows[0]?.OverdueCount ?? 0;
    } catch {
      return 0;
    }
  }

  private async fetchRecentRuns(context: HealthProbeContext): Promise<ScheduledJobRunRow[]> {
    const schema = context.DatabaseProvider.MJCoreSchemaName;
    const tableRef = context.DatabaseProvider.QuoteSchemaAndView(schema, 'ScheduledJobRun');
    const startedAtCol = context.DatabaseProvider.QuoteIdentifier('StartedAt');
    const successCol = context.DatabaseProvider.QuoteIdentifier('Success');
    const { prefix, suffix } = this.mostRecentClause(context.DatabaseProvider.PlatformKey, SAMPLE_ROW_LIMIT);
    return context.DatabaseProvider.ExecuteSQL<ScheduledJobRunRow>(
      `SELECT ${prefix}${startedAtCol}, ${successCol} FROM ${tableRef} ORDER BY ${startedAtCol} DESC ${suffix}`,
      undefined,
      undefined,
      context.SystemUser,
    );
  }

  /**
   * SQL Server and PostgreSQL diverge on "most recent N rows" syntax (`TOP (n)` vs `LIMIT n`).
   * Avoiding `DATEADD`/`INTERVAL` date arithmetic entirely by fetching a bounded recent sample and
   * filtering by age in JS keeps this probe dialect-neutral everywhere else.
   */
  private mostRecentClause(platform: DatabasePlatform | string | null | undefined, limit: number): { prefix: string; suffix: string } {
    return platform === 'postgresql' ? { prefix: '', suffix: `LIMIT ${limit}` } : { prefix: `TOP (${limit}) `, suffix: '' };
  }

  private computeMetrics(rows: ScheduledJobRunRow[]): { heartbeatAgeMs: number; failureRatio: number; recentRunCount: number } {
    const now = Date.now();
    const latestStartedAt = new Date(rows[0].StartedAt).getTime();
    const heartbeatAgeMs = Math.max(0, now - latestStartedAt);

    const recentRows = rows.filter((r) => now - new Date(r.StartedAt).getTime() <= RECENT_WINDOW_MS);
    const failedCount = recentRows.filter((r) => r.Success === false || r.Success === 0).length;
    const failureRatio = recentRows.length > 0 ? failedCount / recentRows.length : 0;

    return { heartbeatAgeMs, failureRatio, recentRunCount: recentRows.length };
  }

  private classify(heartbeatAgeMs: number, failureRatio: number, overdueJobCount: number = 0): HealthStatus {
    if (failureRatio >= FAILURE_RATIO_RED) return 'RED';
    if (overdueJobCount > 0 && heartbeatAgeMs >= HEARTBEAT_RED_MS) return 'RED';
    if (failureRatio >= FAILURE_RATIO_YELLOW) return 'YELLOW';
    if (overdueJobCount > 0 && heartbeatAgeMs >= HEARTBEAT_YELLOW_MS) return 'YELLOW';
    return 'GREEN';
  }

  private buildEvaluation(
    definition: HealthSignalDefinition,
    status: HealthStatus,
    summary: string,
    observedMetrics: Record<string, string | number | boolean | null>,
    durationMs: number,
    diagnosticError?: string,
  ): HealthSignalEvaluation {
    return {
      Code: definition.Code,
      Title: definition.Title,
      Layer: definition.Layer,
      OwnerApp: definition.OwnerApp,
      Mode: definition.Mode,
      Status: status,
      Summary: summary,
      ObservedMetrics: observedMetrics,
      Thresholds: { HeartbeatYellowMs: HEARTBEAT_YELLOW_MS, HeartbeatRedMs: HEARTBEAT_RED_MS, FailureRatioYellow: FAILURE_RATIO_YELLOW, FailureRatioRed: FAILURE_RATIO_RED },
      EvaluatedAt: new Date().toISOString(),
      DurationMs: durationMs,
      ActivePlaybook: status === 'GREEN' ? undefined : status === 'YELLOW' ? YELLOW_PLAYBOOK : RED_PLAYBOOK,
      DiagnosticError: diagnosticError,
    };
  }
}
