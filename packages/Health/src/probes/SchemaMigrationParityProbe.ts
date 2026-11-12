import { RegisterClass } from '@memberjunction/global';
import { BaseHealthProbe } from '../BaseHealthProbe';
import type { AgentRemediationPlaybook, HealthProbeContext, HealthSignalDefinition, HealthSignalEvaluation, ProbeExecutionMode } from '../types';

/** Signal code for {@link SchemaMigrationParityProbe}. */
export const SCHEMA_MIGRATION_PARITY_SIGNAL_CODE = 'MJ.CORE.SCHEMA.MIGRATION_PARITY';

/** The Skyway/Flyway migration history table, always provisioned in the MJ system schema. */
const MIGRATION_HISTORY_TABLE = 'flyway_schema_history';

interface MigrationHistoryRow {
  version: string | null;
  success: boolean | number;
}

const YELLOW_PLAYBOOK: AgentRemediationPlaybook = {
  AgentInstructions:
    'A historical migration attempt failed but a later attempt at the same or a subsequent version succeeded. ' +
    'Inspect the migration history table for the failed row and verify the schema it targeted is not left in a ' +
    'partial state. Do not run any auto-mutation.',
  AllowedAutonomousActions: [],
  MaxAutonomousAttempts: 0,
  RetryCooldownSeconds: 300,
  HumanEscalationCriteria: 'Escalate if the same version has more than one failed attempt, or if any failed row is the most recent entry.',
  HumanOperatorRunbook: 'Review the failed row\'s script and checksum against the currently deployed migration file; confirm no partial DDL was left uncommitted.',
};

const RED_PLAYBOOK: AgentRemediationPlaybook = {
  AgentInstructions:
    'The most recent migration attempt failed, or no migration history could be read at all. Halt traffic and do ' +
    'not run any auto-mutations against this schema. Escalate immediately with the full migration history.',
  AllowedAutonomousActions: [],
  MaxAutonomousAttempts: 0,
  RetryCooldownSeconds: 120,
  HumanEscalationCriteria: 'Escalate immediately. A RED here means the schema may be mid-migration or unreadable.',
  HumanOperatorRunbook: `Query ${MIGRATION_HISTORY_TABLE} directly, resolve the failed migration (resume or repair), and re-run the migration tool before resuming traffic.`,
};

/**
 * Verifies the Skyway/Flyway migration history shows a clean, fully-applied schema: the most
 * recent migration attempt succeeded, and no earlier attempt failed and was silently left behind.
 * `flyway_schema_history` never deletes a failed row on retry — it appends a new one — so a prior
 * failure is still visible even after a successful resume.
 */
@RegisterClass(BaseHealthProbe, SCHEMA_MIGRATION_PARITY_SIGNAL_CODE)
export class SchemaMigrationParityProbe extends BaseHealthProbe {
  public override get ProbeKey(): string {
    return SCHEMA_MIGRATION_PARITY_SIGNAL_CODE;
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
        Code: SCHEMA_MIGRATION_PARITY_SIGNAL_CODE,
        Title: 'Schema Migration Parity',
        Layer: 'core',
        OwnerApp: this.OwnerApp,
        Mode: this.Mode,
        Description: 'Verifies the applied Skyway/Flyway migration history has no failed attempt at or after the most recent successful version.',
        YellowPlaybook: YELLOW_PLAYBOOK,
        RedPlaybook: RED_PLAYBOOK,
      },
    ];
  }

  public override async Evaluate(context: HealthProbeContext): Promise<HealthSignalEvaluation[]> {
    const startedAt = Date.now();
    const definition = this.SignalDefinitions[0];
    let diagnosticError: string | undefined;
    let rows: MigrationHistoryRow[] = [];

    try {
      const schema = context.DatabaseProvider.MJCoreSchemaName;
      const tableRef = context.DatabaseProvider.QuoteSchemaAndView(schema, MIGRATION_HISTORY_TABLE);
      const versionCol = context.DatabaseProvider.QuoteIdentifier('version');
      const successCol = context.DatabaseProvider.QuoteIdentifier('success');
      const rankCol = context.DatabaseProvider.QuoteIdentifier('installed_rank');
      rows = await context.DatabaseProvider.ExecuteSQL<MigrationHistoryRow>(
        `SELECT ${versionCol}, ${successCol} FROM ${tableRef} ORDER BY ${rankCol} ASC`,
        undefined,
        undefined,
        context.SystemUser,
      );
    } catch (error) {
      diagnosticError = error instanceof Error ? (error.stack ?? error.message) : String(error);
    }

    const durationMs = Date.now() - startedAt;
    if (diagnosticError) {
      return [this.buildEvaluation(definition, 'RED', `Could not read the migration history: ${diagnosticError.split('\n')[0]}`, {}, durationMs, diagnosticError)];
    }
    if (rows.length === 0) {
      return [this.buildEvaluation(definition, 'RED', 'No migration history found — this instance may not have been migrated.', { AppliedMigrationCount: 0 }, durationMs)];
    }

    const latestSuccessByVersion = new Map<string, boolean>();
    let historicalFailedAttempts = 0;
    for (const r of rows) {
      const v = r.version ?? 'unknown';
      if (!r.success) {
        historicalFailedAttempts++;
      }
      latestSuccessByVersion.set(v, Boolean(r.success));
    }

    const unrepairedVersions: string[] = [];
    for (const [v, success] of latestSuccessByVersion) {
      if (!success) {
        unrepairedVersions.push(v);
      }
    }

    const lastRow = rows[rows.length - 1];
    const status = !lastRow.success
      ? 'RED'
      : unrepairedVersions.length > 0
        ? 'YELLOW'
        : 'GREEN';

    const summary =
      status === 'RED'
        ? `The most recent migration attempt (version ${lastRow.version ?? 'unknown'}) failed.`
        : status === 'YELLOW'
          ? `Unrepaired migration failure(s) detected: ${unrepairedVersions.join(', ')}.`
          : historicalFailedAttempts > 0
            ? `All ${latestSuccessByVersion.size} migrations are currently applied successfully (${historicalFailedAttempts} historical attempt(s) were repaired).`
            : `All ${rows.length} applied migrations succeeded with no historical failures.`;

    return [
      this.buildEvaluation(
        definition,
        status,
        summary,
        {
          AppliedMigrationCount: rows.length,
          UnrepairedCount: unrepairedVersions.length,
          HistoricalFailedAttempts: historicalFailedAttempts,
          LatestVersion: lastRow.version ?? 'unknown',
        },
        durationMs,
      ),
    ];
  }

  private buildEvaluation(
    definition: HealthSignalDefinition,
    status: HealthSignalEvaluation['Status'],
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
      EvaluatedAt: new Date().toISOString(),
      DurationMs: durationMs,
      ActivePlaybook: status === 'GREEN' ? undefined : status === 'YELLOW' ? YELLOW_PLAYBOOK : RED_PLAYBOOK,
      DiagnosticError: diagnosticError,
    };
  }
}
