import { RegisterClass } from '@memberjunction/global';
import { BaseHealthProbe } from '../BaseHealthProbe';
import type { AgentRemediationPlaybook, HealthProbeContext, HealthSignalDefinition, HealthSignalEvaluation, ProbeExecutionMode } from '../types';

/** Signal code for {@link MetadataCacheParityProbe}. */
export const METADATA_CACHE_PARITY_SIGNAL_CODE = 'MJ.CORE.METADATA.CACHE_PARITY';

const YELLOW_PLAYBOOK: AgentRemediationPlaybook = {
  AgentInstructions:
    'The in-memory metadata cache looks unusually small relative to a healthy baseline. Run a metadata ' +
    'refresh on the affected provider once and re-evaluate before escalating.',
  AllowedAutonomousActions: ['RefreshOpenAppMetadata'],
  MaxAutonomousAttempts: 2,
  RetryCooldownSeconds: 60,
  HumanEscalationCriteria: 'Escalate if the entity count stays below the expected minimum after a refresh.',
  HumanOperatorRunbook:
    'Compare `Metadata.Entities.length` against `SELECT COUNT(*) FROM __mj.Entity` directly; a mismatch after refresh points at a provider that failed to reload.',
};

const RED_PLAYBOOK: AgentRemediationPlaybook = {
  AgentInstructions:
    'The metadata cache is empty. No entity lookups, permission checks, or RunView calls can succeed in ' +
    'this state. Restart the affected server process; if it recurs immediately, do not retry further and ' +
    'escalate with the restart outcome attached.',
  AllowedAutonomousActions: ['RestartServerProcess'],
  MaxAutonomousAttempts: 1,
  RetryCooldownSeconds: 120,
  HumanEscalationCriteria: 'Escalate immediately if the cache is still empty after one restart attempt.',
  HumanOperatorRunbook:
    'Check server startup logs for a metadata bootstrap failure (bad connection string, migration mismatch, or a provider.Config() exception swallowed at boot).',
};

/**
 * Verifies the configured `IMetadataProvider` has actually loaded entity metadata into memory.
 * An empty or implausibly small `Entities` array means every downstream `RunView`, permission
 * check, and entity lookup on this provider is operating blind.
 */
@RegisterClass(BaseHealthProbe, METADATA_CACHE_PARITY_SIGNAL_CODE)
export class MetadataCacheParityProbe extends BaseHealthProbe {
  public override get ProbeKey(): string {
    return METADATA_CACHE_PARITY_SIGNAL_CODE;
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
        Code: METADATA_CACHE_PARITY_SIGNAL_CODE,
        Title: 'Metadata Cache Parity',
        Layer: 'core',
        OwnerApp: this.OwnerApp,
        Mode: this.Mode,
        Description: 'Verifies the metadata provider has loaded a non-trivial entity catalog into memory.',
        YellowPlaybook: YELLOW_PLAYBOOK,
        RedPlaybook: RED_PLAYBOOK,
      },
    ];
  }

  public override async Evaluate(context: HealthProbeContext): Promise<HealthSignalEvaluation[]> {
    const startedAt = Date.now();
    const definition = this.SignalDefinitions[0];
    const entityCount = context.MetadataProvider.Entities?.length ?? 0;

    const status = entityCount === 0 ? 'RED' : entityCount < 10 ? 'YELLOW' : 'GREEN';
    return [
      {
        Code: definition.Code,
        Title: definition.Title,
        Layer: definition.Layer,
        OwnerApp: definition.OwnerApp,
        Mode: definition.Mode,
        Status: status,
        Summary:
          status === 'RED'
            ? 'Metadata provider has zero entities loaded — metadata bootstrap likely failed.'
            : `Metadata provider has ${entityCount} entities loaded.`,
        ObservedMetrics: { EntityCount: entityCount },
        Thresholds: { MinimumHealthyEntityCount: 10 },
        EvaluatedAt: new Date().toISOString(),
        DurationMs: Date.now() - startedAt,
        ActivePlaybook: status === 'GREEN' ? undefined : status === 'YELLOW' ? YELLOW_PLAYBOOK : RED_PLAYBOOK,
      },
    ];
  }
}
