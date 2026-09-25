/**
 * @fileoverview Embeddable record clone panel.
 *
 * Implements §12.2 and §12.3 of the record cloning plan. Hosts the full clone wizard
 * (loading, scope, values, review, executing, done, failed, not cloneable) inline, with no
 * overlay of its own, so it can sit in a slide-in, a dialog, a dashboard or a test harness.
 * {@link RecordCloneSlideInComponent} wraps it in MJ's generic slide panel.
 *
 * The panel never navigates. It reports what happened through outputs and the host decides:
 * `NavigateToRecord` carries the record to open, `CloseRequested` asks the host to dismiss it.
 */

import {
    Component,
    ChangeDetectionStrategy,
    Input,
    Output,
    EventEmitter,
    ChangeDetectorRef,
    inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseEntity, BaseEntityEvent, CompositeKey } from '@memberjunction/core';
import { MJGlobal, MJEventType } from '@memberjunction/global';
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
    CloneFailedEvent,
    CloneNavigationEvent,
    CloneProgressUpdate,
    ClonePromptFieldItem,
    CloneRetargetFieldItem,
    CloneEdgePolicyChange,
} from './record-clone-types';
import type { CloneScopeValues } from './clone-scope-controls.component';
import {
    EntityToRecordCloneKey,
    CompositeKeyToRecordCloneKey,
} from './record-clone-types';

/** Plan options the scope step edits. */
type ScopeOptionKey = 'MaxDepth' | 'MaxRecords' | 'Subtypes' | 'Hierarchy' | 'SoftLinks' | 'EntityActions';
const SCOPE_OPTION_KEYS: readonly ScopeOptionKey[] = ['MaxDepth', 'MaxRecords', 'Subtypes', 'Hierarchy', 'SoftLinks', 'EntityActions'];

/**
 * Embeddable clone wizard for one source record.
 *
 * Give it a source with either {@link Record} or {@link EntityName} plus {@link RecordKey}.
 * With {@link AutoStart} on (the default) it describes the record and computes the first plan
 * as soon as it has a source; otherwise call {@link Start}.
 *
 * @example
 * ```html
 * <mj-record-clone-panel
 *     [Record]="record"
 *     (CloneCompleted)="OnCloned($event)"
 *     (NavigateToRecord)="OpenRecord($event)"
 *     (CloseRequested)="HidePanel()">
 * </mj-record-clone-panel>
 * ```
 */
@Component({
    standalone: true,
    selector: 'mj-record-clone-panel',
    template: `
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
                            [MaxDepth]="DisplayedScope.MaxDepth"
                            [Subtypes]="DisplayedScope.Subtypes"
                            [Hierarchy]="DisplayedScope.Hierarchy"
                            [SoftLinks]="DisplayedScope.SoftLinks"
                            [EntityActions]="DisplayedScope.EntityActions"
                            [MaxRecords]="DisplayedScope.MaxRecords"
                            [ConfiguredScope]="ConfiguredScope"
                            [EntityName]="EffectiveEntityName"
                            [CanOverrideScope]="CanOverrideScope"
                            [CanFireHooks]="CanFireHooks"
                            (ScopeChanged)="OnScopeOptionsChanged($event)"
                            (ResetToDefaults)="OnResetScopeToDefaults()">
                        </mj-clone-scope-controls>

                        <div class="tree-section">
                            <h4 class="section-heading">Planned Record Graph</h4>
                            <mj-clone-plan-tree
                                [Plan]="ActivePlan"
                                [AllowNarrowing]="CanNarrowScope"
                                [AllowWidening]="CanOverrideScope"
                                (NodeSelected)="OnNodeSelected($event)"
                                (EdgePolicyChanged)="OnEdgePolicyChanged($event)">
                            </mj-clone-plan-tree>
                            @if (EdgeOverrides.length > 0) {
                                <div class="branch-overrides">
                                    @for (o of EdgeOverrides; track o.RelationshipID) {
                                        <span class="branch-override">
                                            {{ o.Policy === 'Skip' ? 'Skipping' : 'Copying' }} {{ o.RelatedEntityName || 'a relationship' }}
                                            <button type="button" class="undo-btn" (click)="OnUndoEdgeOverride(o.RelationshipID)"
                                                [attr.aria-label]="'Undo: ' + (o.Policy === 'Skip' ? 'copy ' : 'skip ') + (o.RelatedEntityName || 'this relationship') + ' again'">Undo</button>
                                        </span>
                                    }
                                </div>
                            }
                            @if (CanNarrowScope) {
                                <p class="tree-hint">Click Deep on a branch to skip all of its rows.{{ CanOverrideScope ? ' Click Skip to copy a branch the configuration leaves out.' : '' }}</p>
                            }
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
                            (CloneAnother)="Reset()"
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
    `,
    styles: [`
        .clone-panel-content {
            display: flex;
            flex-direction: column;
            height: 100%;
            background: var(--mj-bg-surface);
        }

        .panel-tabs-wrapper {
            padding: var(--mj-space-2) var(--mj-space-4);
            background: var(--mj-bg-surface-card);
            border-bottom: 1px solid var(--mj-border-default);
        }

        .panel-body {
            flex: 1;
            overflow-y: auto;
            padding: var(--mj-space-4);
            display: flex;
            flex-direction: column;
        }

        .step-container {
            display: flex;
            flex-direction: column;
            gap: var(--mj-space-4);
        }

        .step-hidden {
            display: none !important;
        }

        .tree-section {
            display: flex;
            flex-direction: column;
            gap: var(--mj-space-1-5);
            margin-top: var(--mj-space-1);
        }

        .branch-overrides {
            display: flex;
            flex-wrap: wrap;
            gap: var(--mj-space-2);
        }

        .branch-override {
            display: inline-flex;
            align-items: center;
            gap: var(--mj-space-2);
            padding: 2px 4px 2px var(--mj-space-2-5);
            border: 1px solid var(--mj-status-warning-border);
            border-radius: var(--mj-radius-full);
            background: var(--mj-status-warning-bg);
            color: var(--mj-status-warning-text);
            font-size: var(--mj-text-xs);
        }

        .undo-btn {
            border: 0;
            border-radius: var(--mj-radius-full);
            background: var(--mj-bg-surface);
            color: var(--mj-brand-primary);
            font-family: inherit;
            font-size: var(--mj-text-xs);
            padding: 1px var(--mj-space-2);
            cursor: pointer;
        }

        .undo-btn:focus-visible {
            outline: 2px solid var(--mj-border-focus);
        }

        .tree-hint {
            margin: 0;
            font-size: var(--mj-text-xs);
            color: var(--mj-text-muted);
        }

        .section-heading {
            margin: 0;
            font-size: var(--mj-text-sm);
            font-weight: 600;
            color: var(--mj-text-primary);
        }

        .step-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-top: var(--mj-space-4);
            border-top: 1px solid var(--mj-border-default);
            margin-top: var(--mj-space-4);
        }

        .panel-state-center {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: var(--mj-space-12) var(--mj-space-6);
            gap: var(--mj-space-3);
        }

        .loading-icon {
            font-size: 28px;
            color: var(--mj-brand-primary);
        }

        .loading-text {
            font-size: var(--mj-text-sm);
            color: var(--mj-text-secondary);
        }

        .not-cloneable-icon {
            font-size: 36px;
            color: var(--mj-status-warning-text);
        }

        .failed-icon {
            font-size: 36px;
            color: var(--mj-status-error-text);
        }

        .state-title {
            margin: 0;
            font-size: var(--mj-text-base);
            font-weight: 700;
            color: var(--mj-text-primary);
        }

        .failed-text {
            color: var(--mj-status-error-text);
        }

        .state-description {
            margin: 0;
            font-size: var(--mj-text-sm);
            color: var(--mj-text-secondary);
            max-width: 400px;
        }

        .state-actions {
            display: flex;
            gap: var(--mj-space-2);
            margin-top: var(--mj-space-2);
        }
    `],
    imports: [
        CommonModule,
        MJButtonDirective,
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
export class RecordClonePanelComponent extends BaseAngularComponent {
    private cloneService = inject(RecordCloneService);
    private cdr = inject(ChangeDetectorRef);

    // ── Inputs ───────────────────────────────────────────────────────────

    /**
     * The record to clone. Takes precedence for the key when {@link RecordKey} is not set,
     * and supplies the entity name when {@link EntityName} is not set.
     */
    @Input()
    set Record(value: BaseEntity | null) {
        this._record = value;
        this.queueAutoStart();
    }
    get Record(): BaseEntity | null {
        return this._record;
    }
    private _record: BaseEntity | null = null;

    /** Entity of the source record, e.g. `'MJ: Users'`. Needed when {@link Record} is not set. */
    @Input()
    set EntityName(value: string | undefined) {
        this._entityName = value;
        this.queueAutoStart();
    }
    get EntityName(): string | undefined {
        return this._entityName;
    }
    private _entityName?: string;

    /**
     * Key of the source record: a {@link RecordCloneKey}, or a record-id string in the
     * compact URL-segment form (`'<value>'` for a single-column key, `'F1|V1||F2|V2'` for a
     * composite one), parsed with `CompositeKey.FromURLSegment` against the entity's metadata.
     */
    @Input()
    set RecordKey(value: RecordCloneKey | string | undefined) {
        this._recordKey = value;
        this.queueAutoStart();
    }
    get RecordKey(): RecordCloneKey | string | undefined {
        return this._recordKey;
    }
    private _recordKey?: RecordCloneKey | string;

    /** Start describing and planning as soon as a source is set. Default true. */
    @Input() AutoStart = true;

    /** Show the Scope / Values / Review step tabs. Default true. */
    @Input() ShowStepTabs = true;

    // ── Outputs ──────────────────────────────────────────────────────────

    /** Fires whenever {@link CurrentState} changes. */
    @Output() StateChange = new EventEmitter<RecordClonePanelState>();

    /** Fires whenever the active wizard step changes. */
    @Output() StepChange = new EventEmitter<RecordCloneStep>();

    /** Fires after every successful plan computation with the fresh plan. */
    @Output() PlanChanged = new EventEmitter<RecordClonePlanDetails>();

    /** Fires once the clone commits. The panel also raises the standard BaseEntity `save` event so open grids refresh. */
    @Output() CloneCompleted = new EventEmitter<CloneCompletedEvent>();

    /** Fires when describe, plan or execute fails, with the message the panel shows. */
    @Output() CloneFailed = new EventEmitter<CloneFailedEvent>();

    /** Asks the host to open a record (the new clone, or a record linked from the result). The panel never routes itself. */
    @Output() NavigateToRecord = new EventEmitter<CloneNavigationEvent>();

    /** Asks the host to dismiss the panel (Close, Cancel, or after a navigation request). */
    @Output() CloseRequested = new EventEmitter<void>();

    // ── Public state (read by the template and by hosts) ─────────────────

    /** Current wizard state. Setting it emits {@link StateChange}. */
    public get CurrentState(): RecordClonePanelState {
        return this._currentState;
    }
    public set CurrentState(value: RecordClonePanelState) {
        if (value === this._currentState) return;
        this._currentState = value;
        this.StateChange.emit(value);
    }
    private _currentState: RecordClonePanelState = 'loading';

    /** Active authoring step. Setting it emits {@link StepChange}. */
    public get CurrentStep(): RecordCloneStep {
        return this._currentStep;
    }
    public set CurrentStep(value: RecordCloneStep) {
        if (value === this._currentStep) return;
        this._currentStep = value;
        this.StepChange.emit(value);
    }
    private _currentStep: RecordCloneStep = 'scope';

    /** True while the panel is describing, planning for the first time, or executing. Hosts use it to block closing. */
    public get IsBusy(): boolean {
        return this.CurrentState === 'loading' || this.CurrentState === 'executing';
    }

    public LoadingMessage = 'Analyzing record and dependencies...';
    public NotCloneableReason = 'This entity or record type does not permit cloning.';
    public ExecutionErrorMessage = '';

    /** Describe answer for the source entity, once loaded. */
    public DescribeDetails: RecordCloneDescribeOutput | null = null;
    /** Latest plan computed by the server. */
    public ActivePlan: RecordClonePlanDetails | null = null;
    /** Result of the last execute call. */
    public ExecutionResult: RecordCloneExecuteOutput | null = null;
    public ExecutionProgress: CloneProgressUpdate | null = null;

    /**
     * Plan options sent with every plan and execute request. Holds only what the user changed (plus
     * the preset and entered values); everything else comes from the entity's clone configuration.
     */
    public ScopeOptions: RecordClonePlanOptions = {};
    public AvailablePresets: string[] = [];
    public SelectedPreset?: string;
    /**
     * Whether the Run Entity Actions toggle is offered: `RecordClone.Describe` reports whether the user
     * holds `Clone Records: Fire Hooks` (plan §9). Without it the server runs hooks as configured.
     */
    public CanFireHooks = false;

    /**
     * Whether the developer scope overrides are offered: `RecordClone.Describe` reports whether the
     * user holds `Clone Records: Override Scope`. The server applies the same rule to every request.
     */
    public CanOverrideScope = false;

    /** Branch policies the user changed in the plan tree, sent with every plan and execute. */
    public EdgeOverrides: CloneEdgePolicyChange[] = [];

    /** Whether the user may skip branches: the entity's UserEditable allows scope changes, or they hold Override Scope. */
    public get CanNarrowScope(): boolean {
        const editable = this.DescribeDetails?.UserEditable ?? 'all';
        return editable === 'scope' || editable === 'all' || this.CanOverrideScope;
    }

    /** The entity's configured scope (its `Configuration.Clone`, else the engine defaults), for the summary. */
    public get ConfiguredScope(): CloneScopeValues {
        const entityCfg = this.ProviderToUse?.EntityByName(this.EffectiveEntityName)?.CloneConfig;
        const presetOptions = RecordClonePanelComponent.presetOptions(entityCfg?.Presets, this.SelectedPreset);
        const cfg = { ...(entityCfg ?? {}), ...presetOptions } as typeof entityCfg;
        const builtIn = RecordClonePanelComponent.builtInScope();
        return {
            MaxDepth: cfg?.MaxDepth ?? builtIn.MaxDepth,
            MaxRecords: cfg?.MaxRecords ?? builtIn.MaxRecords,
            Subtypes: cfg?.Subtypes ?? builtIn.Subtypes,
            Hierarchy: cfg?.Hierarchy ?? builtIn.Hierarchy,
            SoftLinks: cfg?.SoftLinks ?? builtIn.SoftLinks,
            EntityActions: cfg?.Hooks?.EntityActions ?? builtIn.EntityActions,
        };
    }

    public RootRecordName = '';
    public NamingStrategyReason?: string;
    public PromptedFields: ClonePromptFieldItem[] = [];
    public PromptedValues: Record<string, string | number | boolean | null> = {};
    public RetargetFields: CloneRetargetFieldItem[] = [];
    public CloneReason = '';
    public IsValuesValid = true;
    public HasUserEditedRootName = false;

    public WizardTabs: TabConfig[] = [
        { key: 'scope', label: '1. Scope & Graph', icon: 'fa-solid fa-diagram-project' },
        { key: 'values', label: '2. Values & Retarget', icon: 'fa-solid fa-pen-to-square' },
        { key: 'review', label: '3. Review & Execute', icon: 'fa-solid fa-clipboard-check' },
    ];

    /** The promise of the most recent {@link Start}; tests and hosts can await it. */
    public InitializationPromise?: Promise<void>;

    /** Entity name the panel is cloning, from {@link EntityName} or {@link Record}. */
    public get EffectiveEntityName(): string {
        return this.EntityName || this.Record?.EntityInfo?.Name || 'Record';
    }

    /** Source key resolved against the entity's primary key columns. */
    public get EffectiveRecordKey(): RecordCloneKey | undefined {
        if (this.RecordKey) {
            if (typeof this.RecordKey !== 'string') return this.RecordKey;
            const entityInfo = this.ProviderToUse?.EntityByName(this.EffectiveEntityName);
            return CompositeKeyToRecordCloneKey(CompositeKey.FromURLSegment(entityInfo, this.RecordKey));
        }
        if (this.Record) {
            return EntityToRecordCloneKey(this.Record);
        }
        return undefined;
    }

    /** Default title for hosts that show one, e.g. `Clone MJ: Users`. */
    public get PanelTitle(): string {
        return `Clone ${this.EffectiveEntityName}`;
    }

    public get ShowWizardTabs(): boolean {
        return (
            this.ShowStepTabs &&
            (this.CurrentState === 'scope' ||
                this.CurrentState === 'values' ||
                this.CurrentState === 'review' ||
                this.CurrentState === 'plan_changed')
        );
    }

    // ── Public methods ───────────────────────────────────────────────────

    /**
     * Describes the source, computes the first plan and lands on the Scope step.
     * Safe to call again; each call starts the wizard over.
     */
    public Start(): Promise<void> {
        this.InitializationPromise = this.initialize();
        return this.InitializationPromise;
    }

    /** Clears the values entered so far and starts over (used by "Clone another"). */
    public Reset(): Promise<void> {
        // Values folded into the options on the way to Review belong to the previous run.
        this.ScopeOptions = {};
        this.EdgeOverrides = [];
        this.SelectedPreset = undefined;
        this.ActivePlan = null;
        this.ExecutionResult = null;
        this.ExecutionProgress = null;
        this.PromptedValues = {};
        this.PromptedFields = [];
        this.RetargetFields = [];
        this.CloneReason = '';
        this.RootRecordName = '';
        return this.Start();
    }

    /** Re-runs the plan with the current {@link ScopeOptions}, e.g. after a host changes them. */
    public async Replan(): Promise<void> {
        const planOutput = await this.cloneService.PlanClone(
            {
                EntityName: this.EffectiveEntityName,
                SourceRecordKey: this.EffectiveRecordKey,
                Options: this.ScopeOptions,
                EdgeOverrides: this.wireEdgeOverrides(),
                ExpectedPlanHash: this.ActivePlan?.Hash,
            },
            this.ProviderToUse
        );

        this.ActivePlan = planOutput.Plan;
        if (planOutput.Plan) {
            this.PlanChanged.emit(planOutput.Plan);
        }
        this.cdr.markForCheck();
    }

    /**
     * Moves to a wizard step. Review is refused while prompted values are invalid; entering
     * Review folds the entered values into the options and re-plans so the diff is current.
     */
    public GoToStep(step: RecordCloneStep): void {
        if (step === 'review' && !this.IsValuesValid) {
            return;
        }

        this.CurrentStep = step;
        this.CurrentState = step;
        this.cdr.markForCheck();

        if (step === 'review' && (this.RootRecordName || Object.keys(this.PromptedValues).length > 0)) {
            this.ScopeOptions = this.buildOptionsWithValues();
            void this.replanOrFail();
        }
    }

    /** Executes the reviewed plan. The server refuses with `PLAN_CHANGED` if the plan hash moved. */
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
            const result = await this.cloneService.ExecuteClone(
                {
                    EntityName: this.EffectiveEntityName,
                    SourceRecordKey: this.EffectiveRecordKey,
                    ExpectedPlanHash: this.ActivePlan.Hash,
                    Options: this.buildOptionsWithValues(),
                    EdgeOverrides: this.wireEdgeOverrides(),
                },
                this.ProviderToUse
            );

            this.ExecutionResult = result;

            if (result.Success) {
                this.CurrentState = 'done';
                const completed: CloneCompletedEvent = {
                    EntityName: this.EffectiveEntityName,
                    TargetKey: this.TargetRecordKey || '',
                    CloneLogID: result.CloneLogID,
                    CreatedRecordsCount: result.Created?.length || result.Counts?.Create || 1,
                    Result: result,
                };
                this.raiseRecordCreatedEvent(completed);
                this.CloneCompleted.emit(completed);
            } else {
                this.fail(result.ErrorMessage || 'Clone execution failed.', result.ResultCode);
            }
        } catch (err) {
            this.fail(err instanceof Error ? err.message : String(err));
        } finally {
            this.cdr.markForCheck();
        }
    }

    /** Key of the root clone once execution succeeded, as a record-id string. */
    public get TargetRecordKey(): string | null {
        const raw = this.ExecutionResult?.Roots?.[0]?.TargetKey;
        if (!raw) return null;
        return typeof raw === 'string'
            ? raw
            : (raw as CompositeKey)?.ToURLSegment?.() ?? (raw as CompositeKey)?.ToConcatenatedString?.() ?? String(raw);
    }

    // ── Template handlers ────────────────────────────────────────────────

    /** Scope values the controls show: the server's effective options once a plan exists. */
    public get DisplayedScope(): Required<Pick<RecordClonePlanOptions, ScopeOptionKey>> {
        return { ...RecordClonePanelComponent.builtInScope(), ...(this.ActivePlan?.EffectiveOptions ?? {}) };
    }

    /**
     * Keeps only the scope values the user changed from what is displayed, so the entity's
     * configured defaults (and a preset's options) are not overwritten by values nobody chose.
     * Picking a preset clears earlier scope changes so the preset's options apply.
     */
    public OnScopeOptionsChanged(options: RecordClonePlanOptions): void {
        const next: RecordClonePlanOptions = { ...this.ScopeOptions };
        if (options.Preset !== this.SelectedPreset) {
            for (const k of SCOPE_OPTION_KEYS) delete next[k];
            next.Preset = options.Preset;
        } else {
            const shown = this.DisplayedScope;
            for (const k of SCOPE_OPTION_KEYS) {
                if (options[k] !== undefined && options[k] !== shown[k]) {
                    (next as Record<ScopeOptionKey, unknown>)[k] = options[k];
                }
            }
        }
        this.ScopeOptions = next;
        this.SelectedPreset = options.Preset;
        void this.replanOrFail();
    }

    /**
     * A branch was switched in the plan tree. Switching a branch the user already changed drops that
     * override (back to the configured policy); otherwise the change is remembered. Then re-plan.
     */
    public OnEdgePolicyChanged(change: CloneEdgePolicyChange): void {
        const others = this.EdgeOverrides.filter((o) => o.RelationshipID !== change.RelationshipID);
        const hadOverride = others.length !== this.EdgeOverrides.length;
        this.EdgeOverrides = hadOverride ? others : [...others, change];
        void this.replanOrFail();
    }

    /** Drops one branch override so that relationship follows its configured policy again. */
    public OnUndoEdgeOverride(relationshipID: string): void {
        this.EdgeOverrides = this.EdgeOverrides.filter((o) => o.RelationshipID !== relationshipID);
        void this.replanOrFail();
    }

    /** Drops every scope and branch override so the entity's configured scope applies again. */
    public OnResetScopeToDefaults(): void {
        const next: RecordClonePlanOptions = { ...this.ScopeOptions };
        for (const k of SCOPE_OPTION_KEYS) delete next[k];
        this.ScopeOptions = next;
        this.EdgeOverrides = [];
        void this.replanOrFail();
    }

    public OnStepChange(stepKey: string): void {
        this.GoToStep(stepKey as RecordCloneStep);
    }

    public OnRootNameChange(name: string): void {
        this.RootRecordName = name;
        this.HasUserEditedRootName = true;
    }

    /**
     * Keeps the root name in step with a prompted value while the user has not typed a name.
     * Which prompted field drives it comes from the entity's `Clone.Naming.Fields` (for MJ: Users
     * that is Email), falling back to the entity's name field.
     */
    public OnPromptedValuesChange(values: Record<string, string | number | boolean | null>): void {
        this.PromptedValues = values;
        if (this.HasUserEditedRootName) return;

        const drivingField = this.namingDrivenFields().find((f) => {
            const v = values[f];
            return typeof v === 'string' && v.trim().length > 0;
        });
        if (drivingField) {
            this.RootRecordName = values[drivingField] as string;
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

    public OnNodeSelected(_node: RecordClonePlanNode): void {
        // Reserved for a node detail pane.
    }

    public OnReviewNodeClicked(_nodeKey: string): void {
        this.GoToStep('scope');
    }

    public OnNavigateToRecord(event: CloneNavigationEvent): void {
        this.NavigateToRecord.emit(event);
        this.CloseRequested.emit();
    }

    public OnClose(): void {
        this.CloseRequested.emit();
    }

    // ── Internals ────────────────────────────────────────────────────────

    /** Options of the named preset, from `Clone.Presets` in array or legacy keyed form. */
    private static presetOptions(presets: unknown, key: string | undefined): Record<string, unknown> {
        if (!key || !presets || typeof presets !== 'object') return {};
        const found = Array.isArray(presets)
            ? presets.find((p) => (p as { Key?: string })?.Key === key)
            : (presets as Record<string, unknown>)[key];
        const options = (found as { Options?: unknown } | undefined)?.Options;
        return options && typeof options === 'object' ? (options as Record<string, unknown>) : {};
    }

    /** Branch overrides in the shape the operation accepts (labels stripped), or undefined when there are none. */
    private wireEdgeOverrides(): Array<{ RelationshipID: string; Policy: 'Deep' | 'Reference' | 'Skip' }> | undefined {
        return this.EdgeOverrides.length > 0 ? this.EdgeOverrides.map(({ RelationshipID, Policy }) => ({ RelationshipID, Policy })) : undefined;
    }

    /** What the controls show before the first plan arrives; the server's effective options replace it. */
    private static builtInScope(): Required<Pick<RecordClonePlanOptions, ScopeOptionKey>> {
        return {
            MaxDepth: 3,
            MaxRecords: 500,
            Subtypes: 'include',
            Hierarchy: 'subtree',
            SoftLinks: 'skip',
            EntityActions: 'fire',
        };
    }

    /** Re-plan from a UI event; a failure moves the wizard to Failed instead of leaving a stale plan up. */
    private async replanOrFail(): Promise<void> {
        try {
            await this.Replan();
        } catch (err) {
            this.fail(err instanceof Error ? err.message : String(err));
            this.cdr.markForCheck();
        }
    }

    private autoStartQueued = false;

    /** Coalesces the Record / EntityName / RecordKey setters into one start per change batch. */
    private queueAutoStart(): void {
        if (!this.AutoStart || this.autoStartQueued) return;
        this.autoStartQueued = true;
        queueMicrotask(() => {
            this.autoStartQueued = false;
            if (this.AutoStart && this.EffectiveRecordKey) {
                void this.Start();
            }
        });
    }

    private async initialize(): Promise<void> {
        this.HasUserEditedRootName = false;
        this.CurrentState = 'loading';
        this.CurrentStep = 'scope';
        this.LoadingMessage = 'Inspecting entity cloning policy...';
        this.cdr.markForCheck();

        try {
            const describe = await this.cloneService.DescribeRecord(
                {
                    EntityName: this.EffectiveEntityName,
                    Key: this.EffectiveRecordKey,
                },
                this.ProviderToUse
            );
            this.DescribeDetails = describe;

            if (!describe.CanClone) {
                this.CurrentState = 'not_cloneable';
                this.NotCloneableReason = describe.Reason || 'Cloning is disabled for this entity.';
                this.cdr.markForCheck();
                return;
            }

            this.AvailablePresets = describe.Presets || [];
            this.CanFireHooks = describe.CanFireHooks === true;
            this.CanOverrideScope = describe.CanOverrideScope === true;

            this.LoadingMessage = 'Computing dependency graph and plan...';
            this.cdr.markForCheck();

            await this.Replan();
            this.setupInitialValues();

            this.CurrentState = 'scope';
            this.cdr.markForCheck();
        } catch (err) {
            this.fail(err instanceof Error ? err.message : String(err));
            this.cdr.markForCheck();
        }
    }

    private setupInitialValues(): void {
        if (!this.ActivePlan) return;

        const rootNode = this.ActivePlan.Nodes.find((n) => n.Depth === 0 || n.ParentKey === null);
        if (rootNode) {
            const nameChange = rootNode.FieldChanges.find((fc) => fc.Kind === 'naming_strategy' || fc.Field.toLowerCase() === 'name');
            if (nameChange) {
                this.RootRecordName = String(nameChange.NewValue);
                this.NamingStrategyReason = nameChange.Reason || 'Suggested by naming strategy';
            } else {
                this.RootRecordName = rootNode.DisplayName ? `${rootNode.DisplayName} (Copy)` : 'Cloned Record';
            }
        }

        const entInfo = this.ProviderToUse?.EntityByName(this.EffectiveEntityName);
        const cloneCfg = entInfo?.CloneConfig;

        const promptFor = cloneCfg?.Fields?.PromptFor;
        if (Array.isArray(promptFor) && promptFor.length > 0) {
            this.PromptedFields = promptFor.map((fName: string): ClonePromptFieldItem => {
                const fieldInfo = entInfo?.Fields.find((f) => f.Name === fName);
                const fc = rootNode?.FieldChanges.find((c) => c.Field === fName);
                // Pre-fill only a value the engine proposed. The source row's own value is exactly
                // what a prompted field (a unique Email, say) must not keep, so it is never offered.
                const proposed = fc && fc.NewValue !== fc.OldValue ? fc.NewValue : null;
                return {
                    FieldName: fName,
                    DisplayName: fieldInfo?.DisplayName || fName,
                    Type: fieldInfo?.Type || 'string',
                    IsRequired: fieldInfo ? !fieldInfo.AllowsNull : true,
                    Description: fieldInfo?.Description,
                    DefaultValue: (proposed ?? null) as string | number | boolean | null,
                };
            });

            for (const pf of this.PromptedFields) {
                if (this.PromptedValues[pf.FieldName] === undefined && pf.DefaultValue !== null && pf.DefaultValue !== undefined) {
                    this.PromptedValues[pf.FieldName] = pf.DefaultValue;
                }
            }
        }

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

    /** Prompted fields whose value names the clone: `Clone.Naming.Fields` that are prompted, else the name field. */
    private namingDrivenFields(): string[] {
        const entInfo = this.ProviderToUse?.EntityByName(this.EffectiveEntityName);
        const prompted = new Set(this.PromptedFields.map((f) => f.FieldName.toLowerCase()));
        const configured = (entInfo?.CloneConfig?.Naming?.Fields ?? []).filter((f) => prompted.has(f.toLowerCase()));
        if (configured.length > 0) return configured;
        const nameField = entInfo?.NameField?.Name;
        return nameField && prompted.has(nameField.toLowerCase()) ? [nameField] : [];
    }

    /** Current options plus the root name, prompted values and reason the user entered. */
    private buildOptionsWithValues(): RecordClonePlanOptions {
        const entInfo = this.ProviderToUse?.EntityByName(this.EffectiveEntityName);
        const nameField = entInfo?.NameField?.Name || 'Name';
        return {
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
        };
    }

    private fail(message: string, resultCode?: string): void {
        this.CurrentState = 'failed';
        this.ExecutionErrorMessage = message;
        this.CloneFailed.emit({ EntityName: this.EffectiveEntityName, Message: message, ResultCode: resultCode });
    }

    /**
     * The clone's rows were saved on the server, so no client-side BaseEntity raised a save.
     * Announce each written entity the way the provider announces a server-side write
     * (`remote-invalidate`, no `baseEntity`), so cached engines and open views reload it.
     */
    private raiseRecordCreatedEvent(completed: CloneCompletedEvent): void {
        const written = new Set<string>([completed.EntityName, ...(completed.Result?.Created ?? []).map((c) => c.EntityName)]);
        const timestamp = new Date().toISOString();
        for (const entityName of written) {
            const args: BaseEntityEvent = {
                type: 'remote-invalidate',
                entityName,
                baseEntity: null,
                provider: this.ProviderToUse,
                payload: { primaryKeyValues: null, action: 'save', sourceServerId: '', timestamp },
            };
            MJGlobal.Instance.RaiseEvent({ component: this, event: MJEventType.ComponentEvent, eventCode: BaseEntity.BaseEventCode, args });
        }
    }
}
