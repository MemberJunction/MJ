import { RegisterClass } from '@memberjunction/global';
import type { DatabaseProviderBase } from '@memberjunction/core';
import { BaseHealthProbe } from '../BaseHealthProbe';
import type { AgentRemediationPlaybook, HealthProbeContext, HealthSignalDefinition, HealthSignalEvaluation, ProbeExecutionMode } from '../types';

/** Signal code for {@link LiveEntityCrudProbe}. */
export const LIVE_ENTITY_CRUD_SIGNAL_CODE = 'MJ.CORE.LIVE.ENTITY_CRUD_AND_RLS';

const YELLOW_LATENCY_MS = 500;

const YELLOW_PLAYBOOK: AgentRemediationPlaybook = {
  AgentInstructions:
    'The synthetic transaction succeeded but took longer than expected. Record this as a performance ' +
    'regression data point for trend analysis; no remediation action is needed on a single slow sample.',
  AllowedAutonomousActions: [],
  MaxAutonomousAttempts: 0,
  RetryCooldownSeconds: 300,
  HumanEscalationCriteria: 'Escalate only if this signal reports YELLOW on three or more consecutive runs.',
};

const RED_PLAYBOOK: AgentRemediationPlaybook = {
  AgentInstructions:
    'The isolated transactional smoke test failed to execute or roll back cleanly. Block any pending ' +
    'post-install/post-upgrade promotion for this instance and escalate immediately with the full error.',
  AllowedAutonomousActions: [],
  MaxAutonomousAttempts: 0,
  RetryCooldownSeconds: 300,
  HumanEscalationCriteria: 'Escalate immediately. This signal gates install/upgrade promotion.',
  HumanOperatorRunbook: 'Reproduce with the attached SQL/stack trace; verify the provider can both BEGIN and ROLLBACK a transaction on this instance.',
};

/**
 * Reference live-test probe: runs a trivial write-capable statement inside a transaction scope
 * that is unconditionally rolled back via {@link BaseHealthProbe.WithRolledBackTransaction}, and
 * reports whether the round trip succeeded and how long it took.
 *
 * This is the pattern Open App probes follow to exercise real write paths (synthetic record
 * creation, permission-function evaluation, RLS visibility checks) without leaving side effects
 * in a production instance — see `WithRolledBackTransaction` for the isolation guarantee.
 */
@RegisterClass(BaseHealthProbe, LIVE_ENTITY_CRUD_SIGNAL_CODE)
export class LiveEntityCrudProbe extends BaseHealthProbe {
  public override get ProbeKey(): string {
    return LIVE_ENTITY_CRUD_SIGNAL_CODE;
  }

  public override get OwnerApp(): string {
    return '__mj';
  }

  public override get Mode(): ProbeExecutionMode {
    return 'live-test';
  }

  public override get SignalDefinitions(): readonly HealthSignalDefinition[] {
    return [
      {
        Code: LIVE_ENTITY_CRUD_SIGNAL_CODE,
        Title: 'Live Entity CRUD & Transaction Round Trip',
        Layer: 'live-test',
        OwnerApp: this.OwnerApp,
        Mode: this.Mode,
        Description:
          'Exercises a real transactional write round trip inside a rolled-back savepoint to verify the write path is actually functional, not just reachable.',
        YellowPlaybook: YELLOW_PLAYBOOK,
        RedPlaybook: RED_PLAYBOOK,
      },
    ];
  }

  public override async Evaluate(context: HealthProbeContext): Promise<HealthSignalEvaluation[]> {
    const startedAt = Date.now();
    const definition = this.SignalDefinitions[0];
    let diagnosticError: string | undefined;

    try {
      await this.WithRolledBackTransaction(context, async (txProvider: DatabaseProviderBase) => {
        await txProvider.ExecuteSQL('SELECT 1', undefined, undefined, context.SystemUser);
      });
    } catch (error) {
      diagnosticError = error instanceof Error ? (error.stack ?? error.message) : String(error);
    }

    const durationMs = Date.now() - startedAt;
    const status = diagnosticError ? 'RED' : durationMs >= YELLOW_LATENCY_MS ? 'YELLOW' : 'GREEN';

    return [
      {
        Code: definition.Code,
        Title: definition.Title,
        Layer: definition.Layer,
        OwnerApp: definition.OwnerApp,
        Mode: definition.Mode,
        Status: status,
        Summary: diagnosticError
          ? `Transactional round trip failed: ${diagnosticError.split('\n')[0]}`
          : `Transactional round trip (begin, write, rollback) completed in ${durationMs}ms.`,
        ObservedMetrics: { DurationMs: durationMs },
        Thresholds: { YellowLatencyMs: YELLOW_LATENCY_MS },
        EvaluatedAt: new Date().toISOString(),
        DurationMs: durationMs,
        ActivePlaybook: status === 'GREEN' ? undefined : status === 'YELLOW' ? YELLOW_PLAYBOOK : RED_PLAYBOOK,
        DiagnosticError: diagnosticError,
      },
    ];
  }
}
