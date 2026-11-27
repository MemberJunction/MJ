import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { MJAIAgentEntity } from '@memberjunction/core-entities';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import {
    AGENT_SECTION_KEYS,
    AgentRunTelemetryRow,
    AgentTelemetrySummary,
    ComputeAgentTelemetry,
    FormatCostUsd,
    FormatTokenCount,
} from './agent-form-helpers';

/**
 * Guardrails & Payload panel (`BaseFormPanel` — `after-fields`, `sortKey: 150`, `inclusion: 'Primary'`).
 *
 * Replaces the two verbose generated field sections (`runtimeLimitsExecutionSettings` and
 * `payloadDataFlow`) so `Details` has zero duplicate inputs while presenting execution limits
 * alongside live p95 headroom gauges and organized payload routing / validation controls.
 *
 * Uses native `<mj-form-field>` controls so `FormSectionIndicatorCoordinator` derives
 * unsaved dirty dots and validation error pills automatically on the left rail and spine.
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
        replacesSectionKeys: ['runtimeLimitsExecutionSettings', 'payloadDataFlow'],
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

    public get FormattedAvgCost(): string {
        return this.Telemetry.AvgCost != null ? FormatCostUsd(this.Telemetry.AvgCost) : '—';
    }

    public get FormattedP95Tokens(): string {
        return this.Telemetry.P95Tokens != null ? FormatTokenCount(this.Telemetry.P95Tokens) : '—';
    }

    public async ngOnInit(): Promise<void> {
        await this.loadTelemetry();
    }

    public override OnRecordRefreshed(_record: MJAIAgentEntity): void {
        void this.loadTelemetry();
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
