import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { MJAIAgentEntity } from '@memberjunction/core-entities';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { MJAIAgentFormComponentExtended } from '../../custom/AIAgents/ai-agent-form.component';
import {
    AGENT_SECTION_KEYS,
    AgentRunTelemetryRow,
    AgentTelemetrySummary,
    ComputeAgentTelemetry,
    EffectiveAgentDisplayValues,
    FormatCostUsd,
    FormatStringList,
    FormatTokenCount,
    ParseStringList,
    PatchAgentConfig,
    ReadAgentConfig,
    ResolveEffectiveDisplayValues,
} from './agent-form-helpers';

/**
 * Guardrails & Configuration panel (`BaseFormPanel` — `after-fields`, `sortKey: 150`, `inclusion: 'Primary'`).
 *
 * Replaces the generated `runtimeLimitsExecutionSettings` section (keeping all 8 non-deprecated
 * physical columns bound via `<mj-form-field>` so `FormSectionIndicatorCoordinator` tracks dirty/error
 * marks) and exposes the migrated operational, planning, skills, payload, and memory settings via
 * canonical `Record.Configuration` (`IAgentConfiguration`, synced bidirectionally on save during v6.x
 * and resolved across the 3-table `AgentType → Category → BaseAgent → Agent` cascade).
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'ai-agents:guardrails-payload',
    skipNullKeyWarning: true,
    metadata: {
        entity: 'MJ: AI Agents',
        slot: 'after-fields',
        sortKey: 150,
        contributionKey: AGENT_SECTION_KEYS.Guardrails,
        sectionKey: AGENT_SECTION_KEYS.Guardrails,
        replacesSectionKeys: ['runtimeLimitsExecutionSettings'],
        inclusion: 'Primary',
        count: false,
    },
})
@Component({
    standalone: false,
    selector: 'mj-ai-agent-guardrails-payload-panel',
    templateUrl: './agent-guardrails-payload.panel.html',
    styleUrls: ['./agent-guardrails-payload.panel.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentGuardrailsPayloadPanel extends BaseFormPanel<MJAIAgentEntity> implements OnInit {
    private readonly cdr = inject(ChangeDetectorRef);

    public readonly SectionKey = AGENT_SECTION_KEYS.Guardrails;
    public Telemetry: AgentTelemetrySummary = ComputeAgentTelemetry([]);

    public readonly ChatHandlingOptions: ReadonlyArray<NonNullable<MJAIAgentEntity['ChatHandlingOption']>> = ['Consult', 'Failed', 'Retry', 'Success'];
    public readonly MessageModes: ReadonlyArray<MJAIAgentEntity['MessageMode']> = ['All', 'Bookend', 'Latest', 'None'];
    public readonly SkillActivationModes: ReadonlyArray<MJAIAgentEntity['SkillActivationMode']> = ['Auto', 'RequestedOnly'];
    public readonly ExecutionModes: ReadonlyArray<MJAIAgentEntity['ExecutionMode']> = ['Sequential', 'Parallel'];
    public readonly RecordingDefaults: ReadonlyArray<NonNullable<MJAIAgentEntity['RecordingDefault']>> = ['None', 'Audio', 'AudioVideo'];
    public readonly ArtifactCreationModes: ReadonlyArray<MJAIAgentEntity['ArtifactCreationMode']> = ['Always', 'System Only', 'Never'];
    public readonly StartingValidationModes: ReadonlyArray<MJAIAgentEntity['StartingPayloadValidationMode']> = ['Fail', 'Warn'];
    public readonly FinalValidationModes: ReadonlyArray<MJAIAgentEntity['FinalPayloadValidationMode']> = ['Fail', 'Retry', 'Warn'];
    public readonly NoteStrategies: ReadonlyArray<MJAIAgentEntity['NoteInjectionStrategy']> = ['All', 'Recent', 'Relevant'];
    public readonly ExampleStrategies: ReadonlyArray<MJAIAgentEntity['ExampleInjectionStrategy']> = ['Rated', 'Recent', 'Semantic'];

    private get hostForm(): MJAIAgentFormComponentExtended | null {
        return (this.FormComponent as unknown as MJAIAgentFormComponentExtended) ?? null;
    }

    /** Effective operational properties across local Configuration edits and 3-table cascade. */
    public get Effective(): EffectiveAgentDisplayValues {
        return ResolveEffectiveDisplayValues(this.Record, this.hostForm?.EffectiveProperties);
    }

    public get FormattedAvgCost(): string {
        return this.Telemetry.AvgCost != null ? FormatCostUsd(this.Telemetry.AvgCost) : '—';
    }

    public get FormattedP95Tokens(): string {
        return this.Telemetry.P95Tokens != null ? FormatTokenCount(this.Telemetry.P95Tokens) : '—';
    }

    public get PayloadScope(): string {
        return ReadAgentConfig(this.Record).payload?.scope ?? this.Record?.PayloadScope ?? '';
    }

    public get PayloadDownstreamPathsText(): string {
        const cfgPaths = ReadAgentConfig(this.Record).payload?.downstreamPaths;
        if (cfgPaths) return FormatStringList(cfgPaths);
        return this.parseLegacyJsonPaths(this.Record?.PayloadDownstreamPaths);
    }

    public get PayloadUpstreamPathsText(): string {
        const cfgPaths = ReadAgentConfig(this.Record).payload?.upstreamPaths;
        if (cfgPaths) return FormatStringList(cfgPaths);
        return this.parseLegacyJsonPaths(this.Record?.PayloadUpstreamPaths);
    }

    public get PayloadSelfReadPathsText(): string {
        const cfgPaths = ReadAgentConfig(this.Record).payload?.selfReadPaths;
        if (cfgPaths) return FormatStringList(cfgPaths);
        return this.parseLegacyJsonPaths(this.Record?.PayloadSelfReadPaths);
    }

    public get PayloadSelfWritePathsText(): string {
        const cfgPaths = ReadAgentConfig(this.Record).payload?.selfWritePaths;
        if (cfgPaths) return FormatStringList(cfgPaths);
        return this.parseLegacyJsonPaths(this.Record?.PayloadSelfWritePaths);
    }

    public get StartingValidationMode(): MJAIAgentEntity['StartingPayloadValidationMode'] {
        return ReadAgentConfig(this.Record).payload?.startingValidationMode ?? this.Record?.StartingPayloadValidationMode ?? 'Fail';
    }

    public get StartingValidationSchema(): string {
        return ReadAgentConfig(this.Record).payload?.startingValidationSchema ?? this.Record?.StartingPayloadValidation ?? '';
    }

    public get FinalValidationMode(): MJAIAgentEntity['FinalPayloadValidationMode'] {
        return ReadAgentConfig(this.Record).payload?.finalValidationMode ?? this.Record?.FinalPayloadValidationMode ?? 'Retry';
    }

    public get FinalValidationMaxRetries(): number | null {
        return ReadAgentConfig(this.Record).payload?.finalValidationMaxRetries ?? this.Record?.FinalPayloadValidationMaxRetries ?? 3;
    }

    public get FinalValidationSchema(): string {
        return ReadAgentConfig(this.Record).payload?.finalValidationSchema ?? this.Record?.FinalPayloadValidation ?? '';
    }

    public async ngOnInit(): Promise<void> {
        await this.loadTelemetry();
    }

    public override OnRecordRefreshed(_record: MJAIAgentEntity): void {
        void this.loadTelemetry();
    }

    // ---- Typed Configuration Mutators (write to canonical Record.Configuration JSON) ----

    public SetNumberConfig(
        section: 'execution' | 'contextWindow' | 'subAgentExecution' | 'attachments' | 'payload' | 'memory',
        field: string,
        raw: string,
    ): void {
        if (!this.EditMode || !this.Record) return;
        const trimmed = raw.trim();
        const num = trimmed === '' ? null : Number(trimmed);
        if (num !== null && !Number.isFinite(num)) return;
        PatchAgentConfig(this.Record, (cfg) => {
            const existing = (cfg[section] ?? {}) as Record<string, unknown>;
            existing[field] = num;
            (cfg as Record<string, unknown>)[section] = existing;
        });
        this.cdr.markForCheck();
    }

    public SetStringConfig(
        section: 'execution' | 'subAgentExecution' | 'attachments' | 'artifacts' | 'skills' | 'recording' | 'payload' | 'memory',
        field: string,
        value: string,
    ): void {
        if (!this.EditMode || !this.Record) return;
        const normalized = value.trim() === '' ? null : value;
        PatchAgentConfig(this.Record, (cfg) => {
            const existing = (cfg[section] ?? {}) as Record<string, unknown>;
            existing[field] = normalized;
            (cfg as Record<string, unknown>)[section] = existing;
        });
        this.cdr.markForCheck();
    }

    public SetBooleanConfig(
        section: 'execution' | 'clientTools' | 'attachments' | 'memory',
        field: string,
        event: Event,
    ): void {
        if (!this.EditMode || !this.Record) return;
        const input = event.target as HTMLInputElement | null;
        if (!input) return;
        PatchAgentConfig(this.Record, (cfg) => {
            const existing = (cfg[section] ?? {}) as Record<string, unknown>;
            existing[field] = input.checked;
            (cfg as Record<string, unknown>)[section] = existing;
        });
        this.cdr.markForCheck();
    }

    public SetPayloadPaths(
        field: 'downstreamPaths' | 'upstreamPaths' | 'selfReadPaths' | 'selfWritePaths',
        raw: string,
    ): void {
        if (!this.EditMode || !this.Record) return;
        const parsed = ParseStringList(raw);
        PatchAgentConfig(this.Record, (cfg) => {
            cfg.payload = { ...(cfg.payload ?? {}), [field]: parsed };
        });
        this.cdr.markForCheck();
    }

    public InputValue(event: Event): string {
        return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null)?.value ?? '';
    }

    private parseLegacyJsonPaths(raw: string | null | undefined): string {
        if (!raw) return '';
        try {
            const parsed: unknown = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return FormatStringList(parsed.filter((v): v is string => typeof v === 'string'));
            }
        } catch {
            // Fall back to raw text
        }
        return raw;
    }

    private async loadTelemetry(): Promise<void> {
        const agentId = this.Record?.ID;
        if (!agentId) return;
        try {
            const rv = RunView.FromMetadataProvider(this.FormComponent.ProviderToUse);
            const res = await rv.RunView<AgentRunTelemetryRow>({
                EntityName: 'MJ: AI Agent Runs',
                Fields: ['ID', 'Status', 'StartedAt', 'CompletedAt', 'TotalTokensUsed', 'TotalTokensUsedRollup', 'TotalCost', 'TotalCostRollup'],
                ExtraFilter: `AgentID='${agentId}'`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 50,
                ResultType: 'simple',
            });
            if (res.Success) {
                this.Telemetry = ComputeAgentTelemetry(res.Results, {
                    MaxCostPerRun: this.Record.MaxCostPerRun,
                    MaxTokensPerRun: this.Record.MaxTokensPerRun,
                });
                this.cdr.markForCheck();
            }
        } catch {
            // Non-blocking telemetry
        }
    }
}

export function LoadAgentGuardrailsPayloadPanel(): void {
    /* no-op marker */
}
