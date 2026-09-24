/**
 * @fileoverview Slide-in Record Clone Panel container component.
 *
 * Implements §12.2 & §12.3 of the Record Cloning architectural blueprint. Orchestrates
 * the full cloning wizard state machine (loading, scope, values, review, executing, done,
 * blocked, failed), tab navigation, remote service invocation, and host navigation routing.
 */

import {
    Component,
    ChangeDetectionStrategy,
    Input,
    Output,
    EventEmitter,
    OnInit,
    OnChanges,
    SimpleChanges,
    ChangeDetectorRef,
    inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CompositeKey, type BaseEntity } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import type {
    RecordCloneKey,
    RecordCloneDescribeOutput,
    RecordClonePlanDetails,
    RecordClonePlanOptions,
    RecordClonePlanNode,
    RecordCloneExecuteOutput,
} from '@memberjunction/core-entities';
import {
    MJButtonDirective,
    MjSlidePanelComponent,
    MJTabNavComponent,
    TabConfig,
} from '@memberjunction/ng-ui-components';

import { RecordCloneService } from './record-clone.service';
import { CloneScopeControlsComponent } from './clone-scope-controls.component';
import { ClonePlanTreeComponent } from './clone-plan-tree.component';
import { CloneValuesComponent } from './clone-values.component';
import { CloneReviewComponent } from './clone-review.component';
import { CloneProgressComponent } from './clone-progress.component';
import { CloneResultComponent } from './clone-result.component';

import type {
    RecordClonePanelState,
    RecordCloneStep,
    CloneCompletedEvent,
    FormNavigationEvent,
    CloneProgressUpdate,
    ClonePromptFieldItem,
    CloneRetargetFieldItem,
} from './record-clone-types';
import {
    EntityToRecordCloneKey,
    StringToRecordCloneKey,
} from './record-clone-types';

@Component({
    standalone: true,
    selector: 'mj-record-clone-panel',
    template: `
        <mj-slide-panel
            [Visible]="IsOpen"
            [Title]="PanelTitle"
            [WidthPx]="PanelWidth"
            (Closed)="OnClose()">

            <div class="clone-panel-content">
                <!-- Wizard Navigation Tabs (visible during authoring steps) -->
                @if (ShowWizardTabs) {
                    <div class="panel-tabs-wrapper">
                        <mj-tab-nav
                            [Tabs]="WizardTabs"
                            [ActiveKey]="CurrentStep"
                            (TabChange)="OnStepChange($event)">
                        </mj-tab-nav>
                    </div>
                }

                <!-- Step Body -->
                <div class="panel-body">
                    <!-- Loading State -->
                    @if (CurrentState === 'loading') {
                        <div class="panel-state-center">
                            <i class="fa-solid fa-spinner fa-spin loading-icon"></i>
                            <span class="loading-text">{{LoadingMessage}}</span>
                        </div>
                    }

                    <!-- Not Cloneable State -->
                    @if (CurrentState === 'not_cloneable') {
                        <div class="panel-state-center not-cloneable-card">
                            <i class="fa-solid fa-ban not-cloneable-icon"></i>
                            <h3 class="state-title">Record Cannot Be Cloned</h3>
                            <p class="state-description">{{NotCloneableReason}}</p>
                            <button
                                type="button"
                                mjButton
                                variant="outline"
                                (click)="OnClose()">
                                Close
                            </button>
                        </div>
                    }

                    <!-- Scope Step -->
                    @if (CurrentState === 'scope' || CurrentStep === 'scope') {
                        <div class="step-container" [class.step-hidden]="CurrentStep !== 'scope'">
                            <mj-clone-scope-controls
                                [Presets]="AvailablePresets"
                                [SelectedPreset]="SelectedPreset"
                                [MaxDepth]="ScopeOptions.MaxDepth ?? 3"
                                [Subtypes]="ScopeOptions.Subtypes ?? 'include'"
                                [Hierarchy]="ScopeOptions.Hierarchy ?? 'subtree'"
                                [SoftLinks]="ScopeOptions.SoftLinks ?? 'skip'"
                                [EntityActions]="ScopeOptions.EntityActions ?? 'suppress'"
                                [CanFireHooks]="CanFireHooks"
                                [MaxRecords]="ScopeOptions.MaxRecords ?? 500"
                                (ScopeChanged)="OnScopeOptionsChanged($event)">
                            </mj-clone-scope-controls>

                            <div class="tree-section">
                                <h4 class="section-heading">Planned Record Graph</h4>
                                <mj-clone-plan-tree
                                    [Plan]="ActivePlan"
                                    (NodeSelected)="OnNodeSelected($event)">
                                </mj-clone-plan-tree>
                            </div>

                            <div class="step-footer">
                                <div></div>
                                <button
                                    type="button"
                                    mjButton
                                    variant="primary"
                                    [disabled]="!ActivePlan"
                                    (click)="GoToStep('values')">
                                    Next: Values & Retarget
                                    <i class="fa-solid fa-arrow-right"></i>
                                </button>
                            </div>
                        </div>
                    }

                    <!-- Values Step -->
                    @if (CurrentState === 'values' || CurrentStep === 'values') {
                        <div class="step-container" [class.step-hidden]="CurrentStep !== 'values'">
                            <mj-clone-values
                                [EntityName]="EffectiveEntityName"
                                [RootName]="RootRecordName"
                                [NamingStrategyReason]="NamingStrategyReason"
                                [PromptedFields]="PromptedFields"
                                [PromptedValues]="PromptedValues"
                                [RetargetFields]="RetargetFields"
                                [Reason]="CloneReason"
                                (RootNameChange)="OnRootNameChange($event)"
                                (PromptedValuesChange)="OnPromptedValuesChange($event)"
                                (RetargetFieldsChange)="OnRetargetFieldsChange($event)"
                                (ReasonChange)="OnReasonChange($event)"
                                (ValidityChange)="OnValuesValidityChange($event)">
                            </mj-clone-values>

                            <div class="step-footer">
                                <button
                                    type="button"
                                    mjButton
                                    variant="outline"
                                    (click)="GoToStep('scope')">
                                    <i class="fa-solid fa-arrow-left"></i>
                                    Back to Scope
                                </button>
                                <button
                                    type="button"
                                    mjButton
                                    variant="primary"
                                    [disabled]="!IsValuesValid"
                                    (click)="GoToStep('review')">
                                    Next: Review & Execute
                                    <i class="fa-solid fa-arrow-right"></i>
                                </button>
                            </div>
                        </div>
                    }

                    <!-- Review Step -->
                    @if (CurrentState === 'review' || CurrentStep === 'review') {
                        <div class="step-container" [class.step-hidden]="CurrentStep !== 'review'">
                            <mj-clone-review
                                [Plan]="ActivePlan"
                                [RootName]="RootRecordName"
                                [Reason]="CloneReason"
                                [IsExecuting]="CurrentState === 'executing'"
                                (Confirm)="ExecuteClone()"
                                (Cancel)="OnClose()"
                                (NodeClicked)="OnReviewNodeClicked($event)">
                            </mj-clone-review>

                            @if (CurrentState !== 'executing') {
                                <div class="step-footer">
                                    <button
                                        type="button"
                                        mjButton
                                        variant="outline"
                                        (click)="GoToStep('values')">
                                        <i class="fa-solid fa-arrow-left"></i>
                                        Back to Values
                                    </button>
                                </div>
                            }
                        </div>
                    }

                    <!-- Executing State -->
                    @if (CurrentState === 'executing') {
                        <div class="step-container">
                            <mj-clone-progress
                                [Progress]="ExecutionProgress">
                            </mj-clone-progress>
                        </div>
                    }

                    <!-- Done State -->
                    @if (CurrentState === 'done') {
                        <div class="step-container">
                            <mj-clone-result
                                [Result]="ExecutionResult"
                                [EntityName]="EffectiveEntityName"
                                [TargetKey]="TargetRecordKey"
                                [RootRecordName]="RootRecordName"
                                (CloneAnother)="ResetWizard()"
                                (Close)="OnClose()"
                                (NavigateToRecord)="OnNavigateToRecord($event)">
                            </mj-clone-result>
                        </div>
                    }

                    <!-- Failed State -->
                    @if (CurrentState === 'failed') {
                        <div class="panel-state-center failed-card">
                            <i class="fa-solid fa-circle-exclamation failed-icon"></i>
                            <h3 class="state-title failed-text">Execution Error</h3>
                            <p class="state-description">{{ExecutionErrorMessage}}</p>
                            <div class="state-actions">
                                <button
                                    type="button"
                                    mjButton
                                    variant="primary"
                                    (click)="GoToStep('review')">
                                    Back to Review
                                </button>
                                <button
                                    type="button"
                                    mjButton
                                    variant="outline"
                                    (click)="OnClose()">
                                    Close
                                </button>
                            </div>
                        </div>
                    }
                </div>
            </div>
        </mj-slide-panel>
    `,
    styles: [`
        .clone-panel-content {
            display: flex;
            flex-direction: column;
            height: 100%;
            background: var(--mj-bg-surface, #ffffff);
        }

        .panel-tabs-wrapper {
            padding: var(--mj-spacing-sm, 8px) var(--mj-spacing-md, 16px);
            background: var(--mj-bg-surface-soft, #f8fafc);
            border-bottom: 1px solid var(--mj-border-color, #e2e8f0);
        }

        .panel-body {
            flex: 1;
            overflow-y: auto;
            padding: var(--mj-spacing-md, 16px);
            display: flex;
            flex-direction: column;
        }

        .step-container {
            display: flex;
            flex-direction: column;
            gap: var(--mj-spacing-md, 16px);
        }

        .step-hidden {
            display: none !important;
        }

        .tree-section {
            display: flex;
            flex-direction: column;
            gap: var(--mj-spacing-xs, 6px);
            margin-top: var(--mj-spacing-xs, 4px);
        }

        .section-heading {
            margin: 0;
            font-size: var(--mj-font-size-sm, 13px);
            font-weight: 600;
            color: var(--mj-text-primary, #1e293b);
        }

        .step-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-top: var(--mj-spacing-md, 16px);
            border-top: 1px solid var(--mj-border-color, #e2e8f0);
            margin-top: var(--mj-spacing-md, 16px);
        }

        .panel-state-center {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: var(--mj-spacing-xxl, 48px) var(--mj-spacing-lg, 24px);
            gap: var(--mj-spacing-sm, 12px);
        }

        .loading-icon {
            font-size: 28px;
            color: var(--mj-brand-primary, #2563eb);
        }

        .loading-text {
            font-size: var(--mj-font-size-sm, 13px);
            color: var(--mj-text-secondary, #475569);
        }

        .not-cloneable-icon {
            font-size: 36px;
            color: var(--mj-status-warning-text, #d97706);
        }

        .failed-icon {
            font-size: 36px;
            color: var(--mj-status-error-text, #dc2626);
        }

        .state-title {
            margin: 0;
            font-size: var(--mj-font-size-md, 16px);
            font-weight: 700;
            color: var(--mj-text-primary, #1e293b);
        }

        .failed-text {
            color: var(--mj-status-error-text, #dc2626);
        }

        .state-description {
            margin: 0;
            font-size: var(--mj-font-size-sm, 13px);
            color: var(--mj-text-secondary, #64748b);
            max-width: 400px;
        }

        .state-actions {
            display: flex;
            gap: var(--mj-spacing-sm, 8px);
            margin-top: var(--mj-spacing-sm, 8px);
        }
    `],
    imports: [
        CommonModule,
        MJButtonDirective,
        MjSlidePanelComponent,
        MJTabNavComponent,
        CloneScopeControlsComponent,
        ClonePlanTreeComponent,
        CloneValuesComponent,
        CloneReviewComponent,
        CloneProgressComponent,
        CloneResultComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordClonePanelComponent extends BaseAngularComponent implements OnInit, OnChanges {
    private cloneService = inject(RecordCloneService);
    private cdr = inject(ChangeDetectorRef);

    @Input() IsOpen = false;
    @Input() Record: BaseEntity | null = null;
    @Input() EntityName?: string;
    @Input() RecordKey?: RecordCloneKey | string;
    @Input() PanelWidth = 720;

    @Output() IsOpenChange = new EventEmitter<boolean>();
    @Output() CloseRequested = new EventEmitter<void>();
    @Output() CloneCompleted = new EventEmitter<CloneCompletedEvent>();
    @Output() NavigateToRecord = new EventEmitter<FormNavigationEvent>();

    public CurrentState: RecordClonePanelState = 'loading';
    public CurrentStep: RecordCloneStep = 'scope';
    public LoadingMessage = 'Analyzing record and dependencies...';
    public NotCloneableReason = 'This entity or record type does not permit cloning.';
    public ExecutionErrorMessage = '';

    public DescribeDetails: RecordCloneDescribeOutput | null = null;
    public ActivePlan: RecordClonePlanDetails | null = null;
    public ExecutionResult: RecordCloneExecuteOutput | null = null;
    public ExecutionProgress: CloneProgressUpdate | null = null;

    // Wizard Form State
    public ScopeOptions: RecordClonePlanOptions = {
        MaxDepth: 3,
        MaxRecords: 500,
        Subtypes: 'include',
        Hierarchy: 'subtree',
        SoftLinks: 'skip',
        EntityActions: 'suppress',
    };
    public AvailablePresets: string[] = [];
    public SelectedPreset?: string;
    public CanFireHooks = false;

    public RootRecordName = '';
    public NamingStrategyReason?: string;
    public PromptedFields: ClonePromptFieldItem[] = [];
    public PromptedValues: Record<string, string | number | boolean | null> = {};
    public RetargetFields: CloneRetargetFieldItem[] = [];
    public CloneReason = '';
    public IsValuesValid = true;

    public WizardTabs: TabConfig[] = [
        { key: 'scope', label: '1. Scope & Graph', icon: 'fa-solid fa-diagram-project' },
        { key: 'values', label: '2. Values & Retarget', icon: 'fa-solid fa-pen-to-square' },
        { key: 'review', label: '3. Review & Execute', icon: 'fa-solid fa-clipboard-check' },
    ];

    public get EffectiveEntityName(): string {
        return this.EntityName || this.Record?.EntityInfo?.Name || 'Record';
    }

    public get EffectiveRecordKey(): RecordCloneKey | undefined {
        if (this.RecordKey) {
            return typeof this.RecordKey === 'string'
                ? StringToRecordCloneKey('ID', this.RecordKey)
                : this.RecordKey;
        }
        if (this.Record) {
            return EntityToRecordCloneKey(this.Record);
        }
        return undefined;
    }

    public get PanelTitle(): string {
        return `Clone ${this.EffectiveEntityName}`;
    }

    public get ShowWizardTabs(): boolean {
        return (
            this.CurrentState === 'scope' ||
            this.CurrentState === 'values' ||
            this.CurrentState === 'review' ||
            this.CurrentState === 'plan_changed'
        );
    }

    public InitializationPromise?: Promise<void>;

    public ngOnInit(): void {
        if (this.IsOpen) {
            this.InitializationPromise = this.InitializePanel();
        }
    }

    public ngOnChanges(changes: SimpleChanges): void {
        if (changes['IsOpen'] && this.IsOpen && (!changes['IsOpen'].previousValue || this.CurrentState === 'loading')) {
            this.InitializationPromise = this.InitializePanel();
        }
    }

    public async InitializePanel(): Promise<void> {
        this.HasUserEditedRootName = false;
        this.CurrentState = 'loading';
        this.CurrentStep = 'scope';
        this.LoadingMessage = 'Inspecting entity cloning policy...';
        this.cdr.markForCheck();

        try {
            const describe = await this.cloneService.DescribeRecord({
                EntityName: this.EffectiveEntityName,
                Key: this.EffectiveRecordKey,
            });
            this.DescribeDetails = describe;

            if (!describe.CanClone) {
                this.CurrentState = 'not_cloneable';
                this.NotCloneableReason = describe.Reason || 'Cloning is disabled for this entity.';
                this.cdr.markForCheck();
                return;
            }

            // Populate capabilities and configuration
            this.AvailablePresets = describe.Presets || [];
            this.CanFireHooks = true;

            // Generate initial plan
            this.LoadingMessage = 'Computing dependency graph and plan...';
            this.cdr.markForCheck();

            await this.ComputePlan();

            // Setup initial values from plan
            this.SetupInitialValues();

            this.CurrentState = 'scope';
            this.cdr.markForCheck();
        } catch (err) {
            this.CurrentState = 'failed';
            this.ExecutionErrorMessage = err instanceof Error ? err.message : String(err);
            this.cdr.markForCheck();
        }
    }

    public async ComputePlan(): Promise<void> {
        const planOutput = await this.cloneService.PlanClone({
            EntityName: this.EffectiveEntityName,
            SourceRecordKey: this.EffectiveRecordKey,
            Options: this.ScopeOptions,
            ExpectedPlanHash: this.ActivePlan?.Hash,
        });

        this.ActivePlan = planOutput.Plan;
        this.cdr.markForCheck();
    }

    public SetupInitialValues(): void {
        if (!this.ActivePlan) return;

        // Extract root node from plan
        const rootNode = this.ActivePlan.Nodes.find(n => n.Depth === 0 || n.ParentKey === null);
        if (rootNode) {
            // Find root name change from naming strategy
            const nameChange = rootNode.FieldChanges.find(fc => fc.Kind === 'naming_strategy' || fc.Field.toLowerCase() === 'name');
            if (nameChange) {
                this.RootRecordName = String(nameChange.NewValue);
                this.NamingStrategyReason = nameChange.Reason || 'Suggested by naming strategy';
            } else {
                this.RootRecordName = rootNode.DisplayName ? `${rootNode.DisplayName} (Copy)` : 'Cloned Record';
            }
        }

        const entInfo = this.ProviderToUse?.EntityByName(this.EffectiveEntityName);
        const cloneCfg = entInfo?.CloneConfig;

        // Populate PromptedFields from entity clone configuration
        const promptFor = cloneCfg?.Fields?.PromptFor;
        if (Array.isArray(promptFor) && promptFor.length > 0) {
            this.PromptedFields = promptFor.map((fName: string): ClonePromptFieldItem => {
                const fieldInfo = entInfo?.Fields.find((f) => f.Name === fName);
                const fc = rootNode?.FieldChanges.find((c) => c.Field === fName);
                const defaultVal = (fc?.NewValue ?? fc?.OldValue ?? null) as string | number | boolean | null;
                return {
                    FieldName: fName,
                    DisplayName: fieldInfo?.DisplayName || fName,
                    Type: fieldInfo?.Type || 'string',
                    IsRequired: fieldInfo ? !fieldInfo.AllowsNull : true,
                    Description: fieldInfo?.Description,
                    DefaultValue: defaultVal,
                };
            });

            // Initialize PromptedValues if not already set by user
            for (const pf of this.PromptedFields) {
                if (this.PromptedValues[pf.FieldName] === undefined && pf.DefaultValue !== null && pf.DefaultValue !== undefined) {
                    this.PromptedValues[pf.FieldName] = pf.DefaultValue;
                }
            }
        }

        // Populate RetargetFields from entity clone configuration
        const retargetFieldNames = cloneCfg?.UI?.RetargetFields;
        if (Array.isArray(retargetFieldNames) && retargetFieldNames.length > 0) {
            this.RetargetFields = retargetFieldNames
                .map((fName: string): CloneRetargetFieldItem | null => {
                    const fieldInfo = entInfo?.Fields.find((f) => f.Name === fName);
                    if (!fieldInfo) return null;
                    const fc = rootNode?.FieldChanges.find((c) => c.Field === fName);
                    const currentVal = (fc?.OldValue ?? null) as string | null;
                    return {
                        FieldName: fName,
                        DisplayName: fieldInfo.DisplayName || fName,
                        RelatedEntity: fieldInfo.RelatedEntity || '',
                        CurrentValue: currentVal,
                        NewValue: currentVal,
                    };
                })
                .filter((item): item is CloneRetargetFieldItem => item !== null);
        }
    }

    public OnScopeOptionsChanged(options: RecordClonePlanOptions): void {
        this.ScopeOptions = { ...options };
        this.SelectedPreset = options.Preset;
        void this.ComputePlan();
    }

    public OnStepChange(stepKey: string): void {
        this.GoToStep(stepKey as RecordCloneStep);
    }

    public GoToStep(step: RecordCloneStep): void {
        if (step === 'review' && !this.IsValuesValid) {
            return;
        }

        this.CurrentStep = step;
        this.CurrentState = step;
        this.cdr.markForCheck();

        if (step === 'review' && (this.RootRecordName || Object.keys(this.PromptedValues).length > 0)) {
            const entInfo = this.ProviderToUse?.EntityByName(this.EffectiveEntityName);
            const nameField = entInfo?.NameField?.Name || 'Name';
            const fieldOverrides: Record<string, string | number | boolean | null> = {
                ...(this.ScopeOptions.FieldOverrides ?? {}),
            };
            if (this.RootRecordName) {
                fieldOverrides[nameField] = this.RootRecordName;
            }

            this.ScopeOptions = {
                ...this.ScopeOptions,
                FieldOverrides: fieldOverrides,
                PromptedValues: {
                    ...(this.ScopeOptions.PromptedValues ?? {}),
                    ...this.PromptedValues,
                },
                Reason: this.CloneReason,
            };
            void this.ComputePlan();
        }
    }

    public HasUserEditedRootName = false;

    public OnRootNameChange(name: string): void {
        this.RootRecordName = name;
        this.HasUserEditedRootName = true;
    }

    public OnPromptedValuesChange(values: Record<string, string | number | boolean | null>): void {
        this.PromptedValues = values;
        if (!this.HasUserEditedRootName) {
            const entInfo = this.ProviderToUse?.EntityByName(this.EffectiveEntityName);
            const nameField = (entInfo?.NameField?.Name || 'Name').toLowerCase();
            const keys = Object.keys(values);
            const nameMatchKey = keys.find(
                (k) =>
                    k.toLowerCase() === nameField ||
                    (k.toLowerCase() === 'email' && this.EffectiveEntityName.toLowerCase().includes('user'))
            );
            if (nameMatchKey && typeof values[nameMatchKey] === 'string' && (values[nameMatchKey] as string).trim().length > 0) {
                this.RootRecordName = values[nameMatchKey] as string;
            }
        }
    }

    public OnRetargetFieldsChange(fields: CloneRetargetFieldItem[]): void {
        this.RetargetFields = fields;
    }

    public OnReasonChange(reason: string): void {
        this.CloneReason = reason;
    }

    public OnValuesValidityChange(isValid: boolean): void {
        this.IsValuesValid = isValid;
        this.cdr.markForCheck();
    }

    public OnNodeSelected(node: RecordClonePlanNode): void {
        // Can open side details or highlight
    }

    public OnReviewNodeClicked(nodeKey: string): void {
        void this.GoToStep('scope');
    }

    public async ExecuteClone(): Promise<void> {
        if (!this.ActivePlan || this.ActivePlan.Blocked) return;

        this.CurrentState = 'executing';
        this.ExecutionProgress = {
            Percent: 10,
            Message: 'Preparing clone transaction...',
            Processed: 0,
            Total: this.ActivePlan.Counts.Create,
        };
        this.cdr.markForCheck();

        try {
            const entInfo = this.ProviderToUse?.EntityByName(this.EffectiveEntityName);
            const nameField = entInfo?.NameField?.Name || 'Name';
            const result = await this.cloneService.ExecuteClone({
                EntityName: this.EffectiveEntityName,
                SourceRecordKey: this.EffectiveRecordKey,
                ExpectedPlanHash: this.ActivePlan.Hash,
                Options: {
                    ...this.ScopeOptions,
                    FieldOverrides: {
                        ...(this.ScopeOptions.FieldOverrides ?? {}),
                        ...(this.RootRecordName ? { [nameField]: this.RootRecordName } : {}),
                    },
                    PromptedValues: {
                        ...(this.ScopeOptions.PromptedValues ?? {}),
                        ...this.PromptedValues,
                    },
                    Reason: this.CloneReason,
                },
            });

            this.ExecutionResult = result;

            if (result.Success) {
                this.CurrentState = 'done';
                const targetKey = this.TargetRecordKey || '';
                const createdCount = result.Created?.length || result.Counts?.Create || 1;
                this.CloneCompleted.emit({
                    EntityName: this.EffectiveEntityName,
                    TargetKey: targetKey,
                    CloneLogID: result.CloneLogID,
                    CreatedRecordsCount: createdCount,
                    Result: result,
                });
            } else {
                this.CurrentState = 'failed';
                this.ExecutionErrorMessage = result.ErrorMessage || 'Clone execution failed.';
            }
        } catch (err) {
            this.CurrentState = 'failed';
            this.ExecutionErrorMessage = err instanceof Error ? err.message : String(err);
        } finally {
            this.cdr.markForCheck();
        }
    }

    public get TargetRecordKey(): string | null {
        const raw = this.ExecutionResult?.Roots?.[0]?.TargetKey;
        if (!raw) return null;
        return typeof raw === 'string'
            ? raw
            : (raw as CompositeKey)?.ToURLSegment?.() ?? (raw as CompositeKey)?.ToConcatenatedString?.() ?? String(raw);
    }

    public ResetWizard(): void {
        void this.InitializePanel();
    }

    public OnOpenClone(targetKey: string): void {
        this.OnClose();
        this.NavigateToRecord.emit({
            Kind: 'record',
            EntityName: this.EffectiveEntityName,
            RecordKey: targetKey,
        });
    }

    public OnNavigateToRecord(event: FormNavigationEvent): void {
        this.OnClose();
        this.NavigateToRecord.emit(event);
    }

    public OnClose(): void {
        this.IsOpen = false;
        this.IsOpenChange.emit(false);
        this.CloseRequested.emit();
        this.cdr.markForCheck();
    }
}
