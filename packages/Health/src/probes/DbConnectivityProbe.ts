import { RegisterClass } from '@memberjunction/global';
import { BaseHealthProbe } from '../BaseHealthProbe';
import type { AgentRemediationPlaybook, HealthProbeContext, HealthSignalDefinition, HealthSignalEvaluation, HealthStatus, ProbeExecutionMode } from '../types';

/** Signal code for {@link DbConnectivityProbe}. */
export const DB_CONNECTIVITY_SIGNAL_CODE = 'MJ.CORE.DB.CONNECTIVITY_AND_POOL';

const YELLOW_LATENCY_MS = 50;
const RED_LATENCY_MS = 250;

const YELLOW_PLAYBOOK: AgentRemediationPlaybook = {
  AgentInstructions:
    'Database latency is elevated but the connection succeeded. Inspect the slowest currently-running ' +
    'queries on the instance and record the top 5 by duration for trend analysis. Re-evaluate after 3 ' +
    'consecutive passive polls before concluding this is a sustained regression.',
  AllowedAutonomousActions: [],
  MaxAutonomousAttempts: 0,
  RetryCooldownSeconds: 60,
  HumanEscalationCriteria: 'Escalate if latency stays above the YELLOW threshold for more than 15 consecutive minutes.',
  HumanOperatorRunbook: 'Check `pg_stat_activity` / `sys.dm_exec_requests` for long-running queries, and review recent deploys that changed query shape.',
};

const RED_PLAYBOOK: AgentRemediationPlaybook = {
  AgentInstructions:
    'The database is unreachable or responding far outside normal latency. Do NOT attempt any schema or ' +
    'data mutation. Capture the raw connection error and escalate immediately — this is a readiness-blocking ' +
    'failure.',
  AllowedAutonomousActions: [],
  MaxAutonomousAttempts: 0,
  RetryCooldownSeconds: 120,
  HumanEscalationCriteria: 'Escalate immediately. A RED here means the instance cannot serve traffic.',
  HumanOperatorRunbook:
    'Verify the database instance is running and reachable from the host network; check connection pool exhaustion and recent credential rotations.',
};

/**
 * Verifies the configured database connection actually answers a trivial query, and classifies
 * the result by round-trip latency. This is deliberately independent of the HTTP liveness probe
 * (`GET /api/healthcheck`), which only proves the Node process is listening.
 */
@RegisterClass(BaseHealthProbe, DB_CONNECTIVITY_SIGNAL_CODE)
export class DbConnectivityProbe extends BaseHealthProbe {
  public override get ProbeKey(): string {
    return DB_CONNECTIVITY_SIGNAL_CODE;
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
        Code: DB_CONNECTIVITY_SIGNAL_CODE,
        Title: 'Database Connectivity & Latency',
        Layer: 'core',
        OwnerApp: this.OwnerApp,
        Mode: this.Mode,
        Description: 'Verifies the database connection pool can execute a trivial query within normal latency bounds.',
        YellowPlaybook: YELLOW_PLAYBOOK,
        RedPlaybook: RED_PLAYBOOK,
      },
    ];
  }

  public override async Evaluate(context: HealthProbeContext): Promise<HealthSignalEvaluation[]> {
    const startedAt = Date.now();
    const definition = this.SignalDefinitions[0];

    let latencyMs: number;
    let diagnosticError: string | undefined;
    try {
      await context.DatabaseProvider.ExecuteSQL('SELECT 1', undefined, undefined, context.SystemUser);
      latencyMs = Date.now() - startedAt;
    } catch (error) {
      latencyMs = Date.now() - startedAt;
      diagnosticError = error instanceof Error ? (error.stack ?? error.message) : String(error);
    }

    const status = this.classifyLatency(latencyMs, diagnosticError);
    return [
      {
        Code: definition.Code,
        Title: definition.Title,
        Layer: definition.Layer,
        OwnerApp: definition.OwnerApp,
        Mode: definition.Mode,
        Status: status,
        Summary: diagnosticError
          ? `Connectivity check failed: ${diagnosticError.split('\n')[0]}`
          : `SELECT 1 completed in ${latencyMs}ms (thresholds: YELLOW ${YELLOW_LATENCY_MS}ms, RED ${RED_LATENCY_MS}ms).`,
        ObservedMetrics: { LatencyMs: latencyMs },
        Thresholds: { YellowLatencyMs: YELLOW_LATENCY_MS, RedLatencyMs: RED_LATENCY_MS },
        EvaluatedAt: new Date().toISOString(),
        DurationMs: Date.now() - startedAt,
        ActivePlaybook: status === 'GREEN' ? undefined : status === 'YELLOW' ? YELLOW_PLAYBOOK : RED_PLAYBOOK,
        DiagnosticError: diagnosticError,
      },
    ];
  }

  private classifyLatency(latencyMs: number, diagnosticError: string | undefined): HealthStatus {
    if (diagnosticError) return 'RED';
    if (latencyMs >= RED_LATENCY_MS) return 'RED';
    if (latencyMs >= YELLOW_LATENCY_MS) return 'YELLOW';
    return 'GREEN';
  }
}
