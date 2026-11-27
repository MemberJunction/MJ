import {
    ChangeDetectorRef,
    Component,
    ComponentRef,
    OnDestroy,
    OnInit,
    Type,
    ViewChild,
    ViewContainerRef,
    inject,
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CompositeKey, RunView } from '@memberjunction/core';
import { MJAIAgentEntity, MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { MJGlobal, RegisterClassEx, UUIDsEqual } from '@memberjunction/global';
import {
    BaseFormPanel,
    BaseFormSectionComponent,
    FormChromeCoordinator,
    MjRecordFormContainerComponent,
    type FormSectionIndicators,
} from '@memberjunction/ng-base-forms';
import { SharedService } from '@memberjunction/ng-shared';
import type { MJAIAgentFormComponentExtended } from '../../custom/AIAgents/ai-agent-form.component';
import {
    AGENT_SECTION_KEYS,
    AgentStudioDescriptor,
    FormatDurationBetween,
    LatestRunStepOverlay,
    ResolveAgentStudioDescriptor,
} from './agent-form-helpers';

interface LatestRunSummary {
    ID: string;
    Status: string;
    StartedAt: Date | string | null;
    CompletedAt: Date | string | null;
    ErrorMessage: string | null;
}

/**
 * Dynamic Agent-Type Studio contribution (`BaseFormPanel` — `before-fields`, `sortKey: 200`, `inclusion: 'Primary'`).
 *
 * Self-gates on `AgentType.UIFormSectionKey` so:
 * - **Flow** agents get a first-class **Flow Studio** rail item wrapping `FlowAgentFormSectionComponent`.
 * - **Loop** agents (no `UIFormSectionKey`) render nothing — zero clutter on the left rail.
 * - Any **future custom Agent Type** that registers a `BaseFormSectionComponent` under
 *   `AI Agents.<UIFormSectionKey>` automatically gets its own Studio rail item with:
 *   - Persistent DOM mounting across rail switches (pan/zoom & unsaved edits preserved)
 *   - Atomic save participation via `MJAIAgentFormComponentExtended.RegisterAgentTypeSection`
 *   - Live amber dirty indicator on the left rail & collapsed 36px spine
 *   - Optional **"Overlay Latest Run"** execution trace ribbon above the canvas
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'ai-agents:type-studio',
    skipNullKeyWarning: true,
    metadata: {
        entity: 'MJ: AI Agents',
        slot: 'before-fields',
        sortKey: 200,
        contributionKey: AGENT_SECTION_KEYS.TypeStudio,
        sectionKey: AGENT_SECTION_KEYS.TypeStudio,
        inclusion: 'Primary',
        count: false,
    },
})
@Component({
    standalone: false,
    selector: 'mj-ai-agent-type-studio-panel',
    templateUrl: './agent-type-studio.panel.html',
    styleUrls: ['./agent-type-studio.panel.css'],
})
export class AgentTypeStudioPanel extends BaseFormPanel<MJAIAgentEntity> implements OnInit, OnDestroy {
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly chrome = inject(FormChromeCoordinator, { optional: true });
    private readonly container = inject(MjRecordFormContainerComponent, { optional: true });
    private readonly destroy$ = new Subject<void>();

    public readonly SectionKey = AGENT_SECTION_KEYS.TypeStudio;

    public LoadingSection = false;
    public LoadError: string | null = null;
    public ShowRunOverlay = false;
    public LoadingRunOverlay = false;
    public LatestRun: LatestRunSummary | null = null;
    public LatestRunSteps: LatestRunStepOverlay[] = [];

    private mountedRef: ComponentRef<BaseFormSectionComponent> | null = null;
    private mountedKey: string | null = null;
    private _studioAnchor: ViewContainerRef | undefined;

    @ViewChild('studioAnchor', { read: ViewContainerRef })
    public set StudioAnchor(vcr: ViewContainerRef | undefined) {
        this._studioAnchor = vcr;
        if (vcr && this.Studio.HasStudio && this.Studio.ClassFactoryKey !== this.mountedKey) {
            this.mountAgentTypeSection();
        }
    }
    public get StudioAnchor(): ViewContainerRef | undefined {
        return this._studioAnchor;
    }

    public get HostForm(): MJAIAgentFormComponentExtended | null {
        return (this.FormComponent as unknown as MJAIAgentFormComponentExtended) ?? null;
    }

    public get AgentType(): MJAIAgentTypeEntity | null {
        if (this.HostForm?.AgentType) return this.HostForm.AgentType;
        const typeId = this.Record?.TypeID;
        if (!typeId) return null;
        return AIEngineBase.Instance.AgentTypes?.find((t) => UUIDsEqual(t.ID, typeId)) ?? null;
    }

    public get Studio(): AgentStudioDescriptor {
        return ResolveAgentStudioDescriptor(this.AgentType, Boolean(this.Record?.ID));
    }

    /** Keeps the dynamically mounted section's `EditMode` aligned with the form without ngDoCheck. */
    public get SyncedEditMode(): boolean {
        const edit = this.EditMode;
        if (this.mountedRef && this.mountedRef.instance.EditMode !== edit) {
            this.mountedRef.instance.EditMode = edit;
        }
        return edit;
    }

    /** Surfaces pending canvas edits onto the MJ left rail & collapsed spine. */
    public get StudioIndicators(): FormSectionIndicators {
        const dirty = this.mountedRef?.instance?.HasPendingChanges === true ? 1 : 0;
        return { DirtyCount: dirty, ErrorCount: 0, WarningCount: 0 };
    }

    public ngOnInit(): void {
        this.HostForm?.AgentTypeChanged$
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => {
                this.handleAgentTypeChanged();
            });
        this.handleAgentTypeChanged();
    }

    public ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        this.teardownMountedSection();
    }

    public override OnRecordRefreshed(_record: MJAIAgentEntity): void {
        if (this.ShowRunOverlay) {
            void this.loadLatestRunOverlay();
        }
    }

    public BackToOverview(): void {
        if (this.container) {
            this.container.OnChromeGroupActivate(AGENT_SECTION_KEYS.Overview);
        } else {
            this.chrome?.SetActiveGroup(AGENT_SECTION_KEYS.Overview);
        }
    }

    public async ToggleRunOverlay(): Promise<void> {
        this.ShowRunOverlay = !this.ShowRunOverlay;
        if (this.ShowRunOverlay && !this.LatestRun) {
            await this.loadLatestRunOverlay();
        }
        this.cdr.markForCheck();
    }

    public OpenLatestRun(): void {
        if (!this.LatestRun?.ID) return;
        SharedService.Instance.OpenEntityRecord('MJ: AI Agent Runs', CompositeKey.FromID(this.LatestRun.ID));
    }

    public StepDuration(step: LatestRunStepOverlay): string {
        return FormatDurationBetween(step.StartedAt, step.CompletedAt);
    }

    public RunDuration(run: LatestRunSummary): string {
        return FormatDurationBetween(run.StartedAt, run.CompletedAt);
    }

    private handleAgentTypeChanged(): void {
        const descriptor = this.Studio;
        if (!descriptor.HasStudio) {
            this.teardownMountedSection();
        } else if (this._studioAnchor && descriptor.ClassFactoryKey !== this.mountedKey) {
            this.mountAgentTypeSection();
        }
        this.cdr.detectChanges();
        this.chrome?.NotifySectionsChanged();
    }

    private mountAgentTypeSection(): void {
        const anchor = this._studioAnchor;
        const key = this.Studio.ClassFactoryKey;
        if (!anchor || !key) return;

        this.teardownMountedSection();
        this.LoadingSection = true;
        this.LoadError = null;

        try {
            const reg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseFormSectionComponent, key);
            if (!reg?.SubClass) {
                this.LoadError = `No studio section registered for "${key}".`;
                return;
            }
            const ref = anchor.createComponent(reg.SubClass as Type<BaseFormSectionComponent>);
            ref.instance.record = this.Record;
            ref.instance.EditMode = this.EditMode;
            this.mountedRef = ref;
            this.mountedKey = key;
            this.HostForm?.RegisterAgentTypeSection(ref.instance);
            ref.changeDetectorRef.detectChanges();
        } catch (err) {
            console.error('Failed to mount agent-type studio section:', err);
            this.LoadError = err instanceof Error ? err.message : 'Failed to load agent type studio.';
        } finally {
            this.LoadingSection = false;
            this.cdr.markForCheck();
        }
    }

    private teardownMountedSection(): void {
        if (this.mountedRef) {
            this.HostForm?.RegisterAgentTypeSection(null);
            this.mountedRef.destroy();
            this.mountedRef = null;
        }
        this.mountedKey = null;
        this._studioAnchor?.clear();
    }

    private async loadLatestRunOverlay(): Promise<void> {
        const agentId = this.Record?.ID;
        if (!agentId) return;

        this.LoadingRunOverlay = true;
        this.cdr.markForCheck();
        try {
            const rv = RunView.FromMetadataProvider(this.FormComponent.ProviderToUse);
            const runRes = await rv.RunView<LatestRunSummary>({
                EntityName: 'MJ: AI Agent Runs',
                Fields: ['ID', 'Status', 'StartedAt', 'CompletedAt', 'ErrorMessage'],
                ExtraFilter: `AgentID='${agentId}'`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 1,
                ResultType: 'simple',
            });
            const latest = runRes.Success && runRes.Results.length > 0 ? runRes.Results[0] : null;
            this.LatestRun = latest;
            if (!latest) {
                this.LatestRunSteps = [];
                return;
            }

            const stepsRes = await rv.RunView<LatestRunStepOverlay>({
                EntityName: 'MJ: AI Agent Run Steps',
                Fields: ['ID', 'StepName', 'StepType', 'Status', 'StartedAt', 'CompletedAt', 'ErrorMessage'],
                ExtraFilter: `AgentRunID='${latest.ID}'`,
                OrderBy: 'StepNumber ASC',
                MaxRows: 50,
                ResultType: 'simple',
            });
            this.LatestRunSteps = stepsRes.Success ? stepsRes.Results : [];
        } catch (err) {
            console.error('Failed to load latest run overlay:', err);
            this.LatestRun = null;
            this.LatestRunSteps = [];
        } finally {
            this.LoadingRunOverlay = false;
            this.cdr.markForCheck();
        }
    }
}

/** Tree-shake guard — invoked from module loader. */
export function LoadAgentTypeStudioPanel(): void {
    /* no-op marker */
}
