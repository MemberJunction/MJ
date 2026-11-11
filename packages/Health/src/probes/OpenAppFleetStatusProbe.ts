import { RegisterClass } from '@memberjunction/global';
import { BaseHealthProbe } from '../BaseHealthProbe';
import type { AgentRemediationPlaybook, HealthProbeContext, HealthSignalDefinition, HealthSignalEvaluation, HealthStatus, ProbeExecutionMode } from '../types';

/** Signal code for {@link OpenAppFleetStatusProbe}. */
export const OPEN_APP_FLEET_STATUS_SIGNAL_CODE = 'MJ.CORE.OPENAPP.FLEET_STATUS';

/** `OpenApp.Status` values that represent an in-progress lifecycle transition, per `CK_OpenApp_Status`. */
const IN_PROGRESS_STATUSES = new Set(['Installing', 'Upgrading']);

/** How long an Open App may sit in `Installing`/`Upgrading` before it is considered stuck. */
const STUCK_TRANSITION_MS = 10 * 60 * 1000;

interface OpenAppStatusRow {
  Name: string;
  Status: string;
  __mj_UpdatedAt: string | Date;
}

const YELLOW_PLAYBOOK: AgentRemediationPlaybook = {
  AgentInstructions:
    'An Open App has remained in Installing or Upgrading longer than the expected transition window. Inspect the ' +
    'InstallOrchestrator lock for this app; if the lock is orphaned (no live process holds it), resume the ' +
    'upgrade/install step once. Do not force a status change directly.',
  AllowedAutonomousActions: ['ResumeOpenAppUpgrade'],
  MaxAutonomousAttempts: 1,
  RetryCooldownSeconds: 120,
  HumanEscalationCriteria: 'Escalate if the app is still not Active after one resume attempt.',
};

const RED_PLAYBOOK: AgentRemediationPlaybook = {
  AgentInstructions:
    'An Open App is in Status = Error. Attempt one checkpoint resume; if it fails, trigger the orchestrator\'s ' +
    'snapshot rollback for that app and page the on-call SRE. Do not attempt a second autonomous resume.',
  AllowedAutonomousActions: ['ResumeOpenAppUpgrade', 'RestoreFileSnapshot'],
  MaxAutonomousAttempts: 1,
  RetryCooldownSeconds: 180,
  HumanEscalationCriteria: 'Escalate immediately if the resume attempt fails or the app remains in Error.',
};

/**
 * Verifies every installed Open App (`__mj.OpenApp`) is in a stable state: none are in `Error`,
 * and none have been stuck in `Installing`/`Upgrading` longer than the expected install/upgrade
 * transition window.
 */
@RegisterClass(BaseHealthProbe, OPEN_APP_FLEET_STATUS_SIGNAL_CODE)
export class OpenAppFleetStatusProbe extends BaseHealthProbe {
  public override get ProbeKey(): string {
    return OPEN_APP_FLEET_STATUS_SIGNAL_CODE;
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
        Code: OPEN_APP_FLEET_STATUS_SIGNAL_CODE,
        Title: 'Open App Fleet Status',
        Layer: 'core',
        OwnerApp: this.OwnerApp,
        Mode: this.Mode,
        Description: 'Verifies every installed Open App is Active, with none stuck mid-transition or in Error.',
        YellowPlaybook: YELLOW_PLAYBOOK,
        RedPlaybook: RED_PLAYBOOK,
      },
    ];
  }

  public override async Evaluate(context: HealthProbeContext): Promise<HealthSignalEvaluation[]> {
    const startedAt = Date.now();
    const definition = this.SignalDefinitions[0];
    let diagnosticError: string | undefined;
    let rows: OpenAppStatusRow[] = [];

    try {
      const tableRef = context.DatabaseProvider.QuoteSchemaAndView('__mj', 'OpenApp');
      rows = await context.DatabaseProvider.ExecuteSQL<OpenAppStatusRow>(
        `SELECT Name, Status, __mj_UpdatedAt FROM ${tableRef}`,
        undefined,
        undefined,
        context.SystemUser,
      );
    } catch (error) {
      diagnosticError = error instanceof Error ? (error.stack ?? error.message) : String(error);
    }

    const durationMs = Date.now() - startedAt;
    if (diagnosticError) {
      return [this.buildEvaluation(definition, 'RED', `Could not read the Open App fleet: ${diagnosticError.split('\n')[0]}`, {}, durationMs, diagnosticError)];
    }
    if (rows.length === 0) {
      return [this.buildEvaluation(definition, 'GREEN', 'No Open Apps are installed on this instance.', { InstalledAppCount: 0 }, durationMs)];
    }

    const erroredApps = rows.filter((r) => r.Status === 'Error').map((r) => r.Name);
    const stuckApps = rows.filter((r) => IN_PROGRESS_STATUSES.has(r.Status) && Date.now() - new Date(r.__mj_UpdatedAt).getTime() > STUCK_TRANSITION_MS).map((r) => r.Name);

    const status = this.classify(erroredApps.length, stuckApps.length);
    const summary =
      status === 'RED'
        ? `${erroredApps.length} Open App(s) in Error: ${erroredApps.join(', ')}.`
        : status === 'YELLOW'
          ? `${stuckApps.length} Open App(s) stuck mid-transition past ${STUCK_TRANSITION_MS / 60000}m: ${stuckApps.join(', ')}.`
          : `All ${rows.length} installed Open App(s) are stable.`;

    return [
      this.buildEvaluation(
        definition,
        status,
        summary,
        { InstalledAppCount: rows.length, ErroredAppCount: erroredApps.length, StuckTransitionAppCount: stuckApps.length },
        durationMs,
      ),
    ];
  }

  private classify(erroredCount: number, stuckCount: number): HealthStatus {
    if (erroredCount > 0) return 'RED';
    if (stuckCount > 0) return 'YELLOW';
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
      Thresholds: { StuckTransitionMs: STUCK_TRANSITION_MS },
      EvaluatedAt: new Date().toISOString(),
      DurationMs: durationMs,
      ActivePlaybook: status === 'GREEN' ? undefined : status === 'YELLOW' ? YELLOW_PLAYBOOK : RED_PLAYBOOK,
      DiagnosticError: diagnosticError,
    };
  }
}
