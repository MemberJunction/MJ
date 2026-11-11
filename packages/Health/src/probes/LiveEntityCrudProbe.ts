import { RegisterClass } from '@memberjunction/global';
import type { DatabaseProviderBase } from '@memberjunction/core';
import { BaseHealthProbe, HealthProbeRollbackError } from '../BaseHealthProbe';
import { BaseLiveCrudVerifier } from '../LiveCrudVerifier';
import { MJHealthEngine } from '../MJHealthEngine';
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

/** Derives the signal code a registered {@link BaseLiveCrudVerifier} reports under. */
function verifierSignalCode(verifier: BaseLiveCrudVerifier): string {
  return `LIVE.${verifier.OwnerApp.toUpperCase()}.${verifier.VerifierKey.toUpperCase()}`;
}

/**
 * Reference live-test probe: runs a trivial write-capable statement inside a transaction scope
 * that is unconditionally rolled back via {@link BaseHealthProbe.WithRolledBackTransaction}, and
 * reports whether the round trip succeeded and how long it took.
 *
 * This is the pattern Open App probes follow to exercise real write paths (synthetic record
 * creation, permission-function evaluation, RLS visibility checks) without leaving side effects
 * in a production instance — see `WithRolledBackTransaction` for the isolation guarantee.
 *
 * Beyond its own built-in `SELECT 1` round trip, this probe discovers every registered
 * {@link BaseLiveCrudVerifier} (via the ClassFactory, the same discovery mechanism
 * `MJHealthEngine` uses for probes) and runs each one inside its own rolled-back transaction
 * scope, contributing one additional signal per verifier. This is how an Open App plugs its own
 * synthetic CRUD/permission checks (e.g. `BIZAPPS.COLLAB.LIVE.ACCESS_REACH_PROBE`) into the same
 * live-test execution path without `LiveEntityCrudProbe` knowing about it at compile time.
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

  /** Every `BaseLiveCrudVerifier` currently registered with the ClassFactory, regardless of owning app. */
  protected GetRegisteredVerifiers(): BaseLiveCrudVerifier[] {
    return MJHealthEngine.Instance.GetRegisteredLiveCrudVerifiers();
  }

  private builtInSignalDefinition(): HealthSignalDefinition {
    return {
      Code: LIVE_ENTITY_CRUD_SIGNAL_CODE,
      Title: 'Live Entity CRUD & Transaction Round Trip',
      Layer: 'live-test',
      OwnerApp: this.OwnerApp,
      Mode: this.Mode,
      Description:
        'Exercises a real transactional write round trip inside a rolled-back savepoint to verify the write path is actually functional, not just reachable.',
      YellowPlaybook: YELLOW_PLAYBOOK,
      RedPlaybook: RED_PLAYBOOK,
    };
  }

  private verifierSignalDefinition(verifier: BaseLiveCrudVerifier): HealthSignalDefinition {
    return {
      Code: verifierSignalCode(verifier),
      Title: verifier.Title,
      Layer: 'live-test',
      OwnerApp: verifier.OwnerApp,
      Mode: this.Mode,
      Description: `Open App-supplied synthetic CRUD/permission verification registered via BaseLiveCrudVerifier('${verifier.VerifierKey}').`,
      YellowPlaybook: verifier.YellowPlaybook,
      RedPlaybook: verifier.RedPlaybook,
    };
  }

  public override get SignalDefinitions(): readonly HealthSignalDefinition[] {
    return [this.builtInSignalDefinition(), ...this.GetRegisteredVerifiers().map((v) => this.verifierSignalDefinition(v))];
  }

  public override async Evaluate(context: HealthProbeContext): Promise<HealthSignalEvaluation[]> {
    const builtIn = await this.evaluateBuiltInRoundTrip(context);
    const verifiers = this.GetRegisteredVerifiers().filter((v) => !context.AppFilter || v.OwnerApp === context.AppFilter);
    const verifierResults = await Promise.all(verifiers.map((v) => this.evaluateVerifier(context, v)));
    return [builtIn, ...verifierResults];
  }

  private async evaluateBuiltInRoundTrip(context: HealthProbeContext): Promise<HealthSignalEvaluation> {
    const startedAt = Date.now();
    const definition = this.builtInSignalDefinition();
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

    return {
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
    };
  }

  private async evaluateVerifier(context: HealthProbeContext, verifier: BaseLiveCrudVerifier): Promise<HealthSignalEvaluation> {
    const startedAt = Date.now();
    const definition = this.verifierSignalDefinition(verifier);
    let diagnosticError: string | undefined;
    let summary = '';
    let observedMetrics: Record<string, string | number | boolean | null> = {};

    try {
      const result = await this.WithRolledBackTransaction(context, (txProvider) => verifier.Verify(context, txProvider));
      observedMetrics = result.ObservedMetrics ?? {};
      if (result.Success) {
        summary = result.Summary;
      } else {
        diagnosticError = result.DiagnosticError ?? result.Summary;
      }
    } catch (error) {
      // A rollback failure (HealthProbeRollbackError) is at least as serious as a verifier
      // failure — in both cases the synthetic work's guarantees did not hold, so both surface
      // identically as a RED signal with the full diagnostic attached.
      diagnosticError = error instanceof HealthProbeRollbackError ? error.message : error instanceof Error ? (error.stack ?? error.message) : String(error);
    }

    const durationMs = Date.now() - startedAt;
    const status = diagnosticError ? 'RED' : 'GREEN';

    return {
      Code: definition.Code,
      Title: definition.Title,
      Layer: definition.Layer,
      OwnerApp: definition.OwnerApp,
      Mode: definition.Mode,
      Status: status,
      Summary: diagnosticError ? `Verifier '${verifier.VerifierKey}' failed: ${diagnosticError.split('\n')[0]}` : summary,
      ObservedMetrics: observedMetrics,
      EvaluatedAt: new Date().toISOString(),
      DurationMs: durationMs,
      ActivePlaybook: status === 'GREEN' ? undefined : definition.RedPlaybook,
      DiagnosticError: diagnosticError,
    };
  }
}
