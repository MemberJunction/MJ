import { RegisterClass } from '@memberjunction/global';
import { BaseHealthProbe } from '../BaseHealthProbe';
import type { AgentRemediationPlaybook, HealthProbeContext, HealthSignalDefinition, HealthSignalEvaluation, HealthStatus, ProbeExecutionMode } from '../types';

/** Signal code for {@link AiProviderReadinessProbe}. */
export const AI_PROVIDER_READINESS_SIGNAL_CODE = 'MJ.CORE.AI.PROVIDER_READINESS';

/** `MJ: AI Vendor Type Definitions` row for "Inference Provider" — see `migrations/CLAUDE.md`. */
const INFERENCE_PROVIDER_TYPE_ID = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3';

interface ActiveVendorRouteRow {
  ActiveRouteCount: number;
}

const YELLOW_PLAYBOOK: AgentRemediationPlaybook = {
  AgentInstructions:
    'Exactly one active inference-provider route is configured, so there is no fallback if it becomes rate-limited ' +
    'or unavailable. This is a configuration gap, not a live failure — do not attempt any autonomous remediation. ' +
    'Record the single configured vendor/model pairing for the escalation.',
  AllowedAutonomousActions: [],
  MaxAutonomousAttempts: 0,
  RetryCooldownSeconds: 600,
  HumanEscalationCriteria: 'Escalate as a configuration recommendation, not an incident: configure at least one fallback AIModelVendor route.',
};

const RED_PLAYBOOK: AgentRemediationPlaybook = {
  AgentInstructions:
    'No active inference-provider route is configured at all — no AI agent, prompt, or embedding operation can run ' +
    'on this instance. This is a configuration failure, not a transient outage; do not attempt autonomous remediation.',
  AllowedAutonomousActions: [],
  MaxAutonomousAttempts: 0,
  RetryCooldownSeconds: 600,
  HumanEscalationCriteria: 'Escalate immediately. Configure at least one Active AIModelVendor row before resuming AI-dependent traffic.',
  HumanOperatorRunbook: 'Verify AIModelVendor rows exist with Status = \'Active\' and TypeID = the Inference Provider AIVendorTypeDefinition, and that the corresponding credentials are present.',
};

/**
 * Verifies at least one AI model has an active, usable inference-provider route configured.
 * This is a configuration-readiness check against `__mj.AIModelVendor` — it does not make a live
 * call to any vendor endpoint (that would require a vendor SDK dependency this package
 * deliberately does not take on), so it cannot detect a vendor outage or an expired credential by
 * itself. It catches the structural failure mode: zero (or only one, single-point-of-failure)
 * active routes configured.
 */
@RegisterClass(BaseHealthProbe, AI_PROVIDER_READINESS_SIGNAL_CODE)
export class AiProviderReadinessProbe extends BaseHealthProbe {
  public override get ProbeKey(): string {
    return AI_PROVIDER_READINESS_SIGNAL_CODE;
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
        Code: AI_PROVIDER_READINESS_SIGNAL_CODE,
        Title: 'AI Provider Readiness',
        Layer: 'core',
        OwnerApp: this.OwnerApp,
        Mode: this.Mode,
        Description: 'Verifies at least one active inference-provider route is configured, with a fallback route for resilience.',
        YellowPlaybook: YELLOW_PLAYBOOK,
        RedPlaybook: RED_PLAYBOOK,
      },
    ];
  }

  public override async Evaluate(context: HealthProbeContext): Promise<HealthSignalEvaluation[]> {
    const startedAt = Date.now();
    const definition = this.SignalDefinitions[0];
    let diagnosticError: string | undefined;
    let catalogRouteCount = 0;
    let configuredCount = 0;

    try {
      catalogRouteCount = await this.countActiveInferenceRoutes(context);
      if (catalogRouteCount > 0) {
        configuredCount = this.countConfiguredEnvKeys();
        const dbCreds = await this.countDbCredentials(context);
        configuredCount += dbCreds;
      }
    } catch (error) {
      diagnosticError = error instanceof Error ? (error.stack ?? error.message) : String(error);
    }

    const durationMs = Date.now() - startedAt;
    if (diagnosticError) {
      return [this.buildEvaluation(definition, 'RED', `Could not read AI model vendor configuration: ${diagnosticError.split('\n')[0]}`, 0, 0, durationMs, diagnosticError)];
    }

    const effectiveReady = catalogRouteCount === 0 ? 0 : configuredCount;
    const status = this.classify(catalogRouteCount, configuredCount);
    const summary =
      catalogRouteCount === 0
        ? 'No active inference-provider route is in the catalog — no AI capability is defined.'
        : configuredCount === 0
          ? 'Active inference-provider catalog routes exist, but zero API keys or credentials are configured — no AI capability is ready.'
          : configuredCount === 1
            ? 'Exactly one active inference-provider route has configured credentials — no fallback if it becomes unavailable.'
            : `${configuredCount} active inference-provider routes are configured and ready.`;

    return [this.buildEvaluation(definition, status, summary, catalogRouteCount, effectiveReady, durationMs)];
  }

  private countConfiguredEnvKeys(): number {
    if (typeof process === 'undefined' || !process.env) return 0;
    const knownVendors = new Set<string>();
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 5) knownVendors.add('OpenAI');
    if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim().length > 5) knownVendors.add('Anthropic');
    if ((process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) && ((process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY)?.trim().length ?? 0) > 5) knownVendors.add('Google');
    if (process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY.trim().length > 5) knownVendors.add('Mistral');
    if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim().length > 5) knownVendors.add('Groq');
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('AI_VENDOR_API_KEY__') && (process.env[key]?.trim().length ?? 0) > 5) {
        knownVendors.add(key);
      }
    }
    return knownVendors.size;
  }

  private async countDbCredentials(context: HealthProbeContext): Promise<number> {
    try {
      const schema = context.DatabaseProvider.MJCoreSchemaName;
      const tableRef = context.DatabaseProvider.QuoteSchemaAndView(schema, 'AICredentialBinding');
      const isActiveCol = context.DatabaseProvider.QuoteIdentifier('IsActive');
      const countCol = context.DatabaseProvider.QuoteIdentifier('BindingCount');
      const rows = await context.DatabaseProvider.ExecuteSQL<{ BindingCount: number }>(
        `SELECT COUNT(*) AS ${countCol} FROM ${tableRef} WHERE ${isActiveCol} = 1`,
        undefined,
        undefined,
        context.SystemUser,
      );
      return rows[0]?.BindingCount ?? 0;
    } catch {
      return 0;
    }
  }

  private async countActiveInferenceRoutes(context: HealthProbeContext): Promise<number> {
    const schema = context.DatabaseProvider.MJCoreSchemaName;
    const tableRef = context.DatabaseProvider.QuoteSchemaAndView(schema, 'AIModelVendor');
    const statusCol = context.DatabaseProvider.QuoteIdentifier('Status');
    const typeIdCol = context.DatabaseProvider.QuoteIdentifier('TypeID');
    const countCol = context.DatabaseProvider.QuoteIdentifier('ActiveRouteCount');
    const rows = await context.DatabaseProvider.ExecuteSQL<ActiveVendorRouteRow>(
      `SELECT COUNT(*) AS ${countCol} FROM ${tableRef} WHERE ${statusCol} = 'Active' AND ${typeIdCol} = '${INFERENCE_PROVIDER_TYPE_ID}'`,
      undefined,
      undefined,
      context.SystemUser,
    );
    return rows[0]?.ActiveRouteCount ?? 0;
  }

  private classify(catalogCount: number, configuredCount: number): HealthStatus {
    if (catalogCount === 0 || configuredCount === 0) return 'RED';
    if (configuredCount === 1) return 'YELLOW';
    return 'GREEN';
  }

  private buildEvaluation(
    definition: HealthSignalDefinition,
    status: HealthStatus,
    summary: string,
    catalogRouteCount: number,
    readyCount: number,
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
      ObservedMetrics: {
        ActiveCatalogRouteCount: catalogRouteCount,
        ReadyInferenceProviderCount: readyCount,
      },
      Thresholds: { MinimumHealthyRouteCount: 2 },
      EvaluatedAt: new Date().toISOString(),
      DurationMs: durationMs,
      ActivePlaybook: status === 'GREEN' ? undefined : status === 'YELLOW' ? YELLOW_PLAYBOOK : RED_PLAYBOOK,
      DiagnosticError: diagnosticError,
    };
  }
}
