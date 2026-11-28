import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CompositeKey, RunView } from '@memberjunction/core';
import { MJAIAgentEntity, MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ActionEngineBase } from '@memberjunction/actions-base';
import { RegisterClassEx } from '@memberjunction/global';
import {
    BaseFormPanel,
    DETAILS_SECTION_KEY,
    FormChromeCoordinator,
    MjRecordFormContainerComponent,
} from '@memberjunction/ng-base-forms';
import { SharedService } from '@memberjunction/ng-shared';
import type { MJAIAgentFormComponentExtended } from '../../custom/AIAgents/ai-agent-form.component';
import {
    AGENT_SECTION_KEYS,
    AgentRunTelemetryRow,
    AgentStudioDescriptor,
    AgentTelemetrySummary,
    BuildUnifiedSubAgents,
    ComputeAgentTelemetry,
    DefaultAgentIcon,
    EffectiveAgentDisplayValues,
    FlowStepPreviewRow,
    FlowStepTypeIcon,
    FormatCostUsd,
    FormatDurationMs,
    FormatTokenCount,
    OrderFlowStepsForPreview,
    ResolveAgentStudioDescriptor,
    ResolveEffectiveDisplayValues,
    ResolveLinkedPromptsAndActions,
} from './agent-form-helpers';

/**
 * Option B Overview Cockpit (`BaseFormPanel` — `before-fields`, `inclusion: 'Primary'`, `sortKey: 250`).
 *
 * Gives users an immediate, high-signal understanding of any AI Agent:
 * - Identity hero (with inline editing for Name, Status, and Description in EditMode)
 * - 4 non-blocking KPI cards (30-day runs, success rate, avg duration, avg cost vs cap)
 * - Dynamic Agent-Type Architecture Preview (Flow step topology, Loop reasoning cycle,
 *   Realtime voice pipeline, or generic/custom AgentType blueprint)
 * - 3-column clickable capability bento (Prompts & Models, Capabilities, Guardrail Headroom)
 *
 * Also hosts `<mj-agent-permissions-dialog>` when triggered from the toolbar or hero.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'ai-agents:overview',
    skipNullKeyWarning: true,
    metadata: {
        entity: 'MJ: AI Agents',
        slot: 'before-fields',
        sortKey: 250,
        contributionKey: AGENT_SECTION_KEYS.Overview,
        sectionKey: AGENT_SECTION_KEYS.Overview,
        inclusion: 'Primary',
        count: false,
    },
})
@Component({
    standalone: false,
    selector: 'mj-ai-agent-overview-panel',
    templateUrl: './agent-overview.panel.html',
    styleUrls: ['./agent-overview.panel.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentOverviewPanel extends BaseFormPanel<MJAIAgentEntity> implements OnInit, OnDestroy {
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly chrome = inject(FormChromeCoordinator, { optional: true });
    private readonly container = inject(MjRecordFormContainerComponent, { optional: true });
    private readonly destroy$ = new Subject<void>();

    public readonly SectionKeys = AGENT_SECTION_KEYS;
    public readonly StatusOptions: ReadonlyArray<MJAIAgentEntity['Status']> = ['Active', 'Disabled', 'Pending'];

    public LoadingTelemetry = false;
    public Telemetry: AgentTelemetrySummary = ComputeAgentTelemetry([]);
    public FlowSteps: FlowStepPreviewRow[] = [];
    public TotalFlowStepCount = 0;
    public TopPrompts: MJAIPromptEntityExtended[] = [];
    public PromptCount = 0;
    public ActionCount = 0;
    public SubAgentCount = 0;
    public SkillCount = 0;
    public SearchScopeCount = 0;
    public CoAgentPairingCount = 0;
    public BridgeIdentityCount = 0;

    public get HostForm(): MJAIAgentFormComponentExtended | null {
        return (this.FormComponent as unknown as MJAIAgentFormComponentExtended) ?? null;
    }

    /** Effective operational properties resolved across local Configuration edits and 3-table cascade. */
    public get Effective(): EffectiveAgentDisplayValues {
        return ResolveEffectiveDisplayValues(this.Record, this.HostForm?.EffectiveProperties);
    }

    public get ReasonStageCaption(): string {
        if (this.Effective.RequirePlanMode) return 'Plan Mode REQUIRED';
        if (this.Effective.SupportsPlanMode) return 'Plan Mode ON';
        return this.Effective.ModelSelectionMode || 'Agent Type';
    }

    public get AgentType(): MJAIAgentTypeEntity | null {
        return this.HostForm?.AgentType ?? null;
    }

    public get Studio(): AgentStudioDescriptor {
        return ResolveAgentStudioDescriptor(this.AgentType, Boolean(this.Record?.ID));
    }

    public get AgentIcon(): string {
        return DefaultAgentIcon(this.Record?.IconClass, this.Record?.Type ?? this.AgentType?.Name);
    }

    public get HasLogoURL(): boolean {
        return Boolean(this.Record?.LogoURL?.trim());
    }

    public get AgentKind(): 'flow' | 'loop' | 'realtime' | 'other' {
        const name = (this.AgentType?.Name ?? this.Record?.Type ?? '').trim().toLowerCase();
        if (name === 'flow') return 'flow';
        if (name === 'realtime') return 'realtime';
        if (name === 'loop') return 'loop';
        return 'other';
    }

    public get IsOpenToEveryone(): boolean {
        return this.HostForm?.IsOpenToEveryone ?? true;
    }

    public get ShowPermissionsDialog(): boolean {
        return this.HostForm?.ShowPermissionsDialog === true;
    }

    public get FormattedSuccessRate(): string {
        return this.Telemetry.SuccessRatePct != null ? `${this.Telemetry.SuccessRatePct}%` : '—';
    }

    public get FormattedAvgDuration(): string {
        return FormatDurationMs(this.Telemetry.AvgDurationMs);
    }

    public get FormattedAvgCost(): string {
        return this.Telemetry.AvgCost != null ? FormatCostUsd(this.Telemetry.AvgCost) : '—';
    }

    public get FormattedCostCap(): string {
        return this.Record?.MaxCostPerRun != null ? FormatCostUsd(this.Record.MaxCostPerRun) : 'No cap';
    }

    public get FormattedP95Tokens(): string {
        return this.Telemetry.P95Tokens != null ? FormatTokenCount(this.Telemetry.P95Tokens) : '—';
    }

    public get FormattedTokenCap(): string {
        return this.Record?.MaxTokensPerRun != null ? FormatTokenCount(this.Record.MaxTokensPerRun) : 'No cap';
    }

    public StepIcon(step: FlowStepPreviewRow): string {
        return FlowStepTypeIcon(step.StepType, step.StartingStep);
    }

    public async ngOnInit(): Promise<void> {
        this.HostForm?.AgentTypeChanged$
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => {
                this.cdr.markForCheck();
            });
        await this.loadOverviewData();
    }

    public ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    public override OnRecordRefreshed(_record: MJAIAgentEntity): void {
        void this.loadOverviewData();
    }

    /** Jumps directly to a rail section via RecordFormContainerComponent so DOM visibility updates cleanly. */
    public NavigateToSection(sectionKey: string): void {
        let targetKey = sectionKey;
        const spec = this.chrome?.Spec;
        if (spec) {
            const owner = spec.Groups.find((g) => g.Key === sectionKey || g.SectionKeys.includes(sectionKey));
            if (owner) {
                targetKey = owner.Key;
            } else if (sectionKey === AGENT_SECTION_KEYS.Guardrails) {
                targetKey = DETAILS_SECTION_KEY;
            }
        }
        if (this.container) {
            this.container.OnChromeGroupActivate(targetKey);
        } else {
            this.chrome?.SetActiveGroup(targetKey);
        }
    }

    /** Opens the parent agent record in Explorer. */
    public OpenParentAgent(): void {
        if (!this.Record?.ParentID) return;
        SharedService.Instance.OpenEntityRecord('MJ: AI Agents', CompositeKey.FromID(this.Record.ParentID));
    }

    /** Opens the prototype base agent record (`BaseAgentID`) in Explorer. */
    public OpenBaseAgent(): void {
        if (!this.Record?.BaseAgentID) return;
        SharedService.Instance.OpenEntityRecord('MJ: AI Agents', CompositeKey.FromID(this.Record.BaseAgentID));
    }

    /** Opens the Permissions dialog on the host form. */
    public OpenPermissions(): void {
        this.HostForm?.OpenPermissionsDialog();
    }

    public async OnPermissionsClosed(): Promise<void> {
        await this.HostForm?.OnPermissionsDialogClosed();
        this.cdr.markForCheck();
    }

    public async OnPermissionsChanged(): Promise<void> {
        await this.HostForm?.RefreshPermissionState();
        this.cdr.markForCheck();
    }

    private async loadOverviewData(): Promise<void> {
        const agentId = this.Record?.ID;
        if (!agentId) {
            this.cdr.markForCheck();
            return;
        }

        // 1. Instant cached metadata from AIEngineBase + ActionEngineBase
        try {
            await Promise.all([AIEngineBase.Instance.Config(false), ActionEngineBase.Instance.Config(false)]);
            const linked = ResolveLinkedPromptsAndActions(
                agentId,
                AIEngineBase.Instance.Prompts ?? [],
                AIEngineBase.Instance.AgentPrompts ?? [],
                ActionEngineBase.Instance.Actions ?? [],
                AIEngineBase.Instance.AgentActions ?? [],
            );
            this.PromptCount = linked.Prompts.length;
            this.TopPrompts = linked.Prompts.slice(0, 3);
            this.ActionCount = linked.Actions.length;

            const subAgents = BuildUnifiedSubAgents(
                agentId,
                (AIEngineBase.Instance.Agents ?? []) as MJAIAgentEntityExtended[],
                AIEngineBase.Instance.AgentRelationships ?? [],
            );
            this.SubAgentCount = subAgents.length;
            this.cdr.markForCheck();
        } catch {
            // Non-blocking: fall back to RunViews below
        }

        // 2. Non-blocking batched RunViews for recent runs telemetry, Flow steps, skills, scopes, and realtime counts
        this.LoadingTelemetry = true;
        this.cdr.markForCheck();
        try {
            const rv = RunView.FromMetadataProvider(this.FormComponent.ProviderToUse);
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const results = await rv.RunViews([
                {
                    EntityName: 'MJ: AI Agent Runs',
                    Fields: ['ID', 'Status', 'StartedAt', 'CompletedAt', 'TotalTokensUsed', 'TotalTokensUsedRollup', 'TotalCost', 'TotalCostRollup', '__mj_CreatedAt'],
                    ExtraFilter: `AgentID='${agentId}' AND __mj_CreatedAt >= '${thirtyDaysAgo}'`,
                    OrderBy: '__mj_CreatedAt DESC',
                    MaxRows: 100,
                    ResultType: 'simple',
                },
                {
                    EntityName: 'MJ: AI Agent Steps',
                    Fields: ['ID', 'Name', 'StepType', 'StartingStep', 'Status'],
                    ExtraFilter: `AgentID='${agentId}'`,
                    OrderBy: 'StartingStep DESC, Name ASC',
                    MaxRows: 50,
                    ResultType: 'simple',
                },
                {
                    EntityName: 'MJ: AI Agent Skills',
                    ExtraFilter: `AgentID='${agentId}'`,
                    ResultType: 'count_only',
                },
                {
                    EntityName: 'MJ: AI Agent Search Scopes',
                    ExtraFilter: `AgentID='${agentId}'`,
                    ResultType: 'count_only',
                },
                {
                    EntityName: 'MJ: AI Agent Co Agents',
                    ExtraFilter: `CoAgentID='${agentId}' OR TargetAgentID='${agentId}'`,
                    ResultType: 'count_only',
                },
                {
                    EntityName: 'MJ: AI Bridge Agent Identities',
                    ExtraFilter: `AgentID='${agentId}'`,
                    ResultType: 'count_only',
                },
            ]);

            const runs = (results[0]?.Success ? results[0].Results : []) as AgentRunTelemetryRow[];
            this.Telemetry = ComputeAgentTelemetry(runs, {
                MaxCostPerRun: this.Record.MaxCostPerRun,
                MaxTokensPerRun: this.Record.MaxTokensPerRun,
            });

            const steps = (results[1]?.Success ? results[1].Results : []) as FlowStepPreviewRow[];
            this.TotalFlowStepCount = steps.length;
            this.FlowSteps = OrderFlowStepsForPreview(steps, 6);

            this.SkillCount = results[2]?.Success ? (results[2].TotalRowCount ?? 0) : 0;
            this.SearchScopeCount = results[3]?.Success ? (results[3].TotalRowCount ?? 0) : 0;
            this.CoAgentPairingCount = results[4]?.Success ? (results[4].TotalRowCount ?? 0) : 0;
            this.BridgeIdentityCount = results[5]?.Success ? (results[5].TotalRowCount ?? 0) : 0;
        } catch (err) {
            console.error('Error loading AI Agent overview telemetry:', err);
        } finally {
            this.LoadingTelemetry = false;
            this.cdr.markForCheck();
        }
    }
}

/** Tree-shake guard — invoked from module loader. */
export function LoadAgentOverviewPanel(): void {
    /* no-op marker */
}
