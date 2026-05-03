/**
 * @module database-create-wizard.component
 * @description Multi-step wizard for creating a new Database Designer entity.
 *
 * Rendered inside an `mj-slide-panel` by the dashboard.  Manages step routing
 * and owns one `EntityWizardStateService` instance for the duration the panel
 * is open.
 *
 * Wizard steps:
 *   1  Basics       — entity name, table name, schema, description
 *   2  Fields       — column definitions (EntityFieldsGridComponent)
 *   3  Relationships — optional foreign keys
 *   4  Review       — read-only schema preview + server-side validation
 *   5  Create       — pipeline execution + result (EntityPipelinePanelComponent)
 *
 * Step 5 is terminal — once the pipeline starts there is no Back navigation.
 */

import {
    Component, Output, EventEmitter, OnDestroy,
    ChangeDetectionStrategy, ChangeDetectorRef, inject, ViewChild,
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { DatabaseDesignerService } from '../../services/database-designer.service.js';
import { EntityWizardStateService } from '../../services/entity-wizard-state.service.js';
import { DatabaseDesignerEngine } from '../../services/database-designer.engine.js';
import { StepPipelineComponent } from './steps/step-pipeline.component.js';
import type {
    WizardStep, WizardStepDef, BasicsStepValue,
    ColumnSpec, ForeignKeySpec, EntityPipelineResult, SchemaOption,
} from '../../database-designer.types.js';

const WIZARD_STEP_DEFS: Omit<WizardStepDef, 'isComplete' | 'isActive'>[] = [
    { id: 'basics',        label: 'Basics' },
    { id: 'fields',        label: 'Fields' },
    { id: 'relationships', label: 'Relationships' },
    { id: 'review',        label: 'Review & Create' },
];

const STEP_ORDER: WizardStep[] = ['basics', 'fields', 'relationships', 'review'];

@Component({
    standalone: false,
    selector: 'mj-database-create-wizard',
    templateUrl: './database-create-wizard.component.html',
    styleUrls: ['./database-create-wizard.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatabaseCreateWizardComponent implements OnDestroy {

    // ─── Injected ──────────────────────────────────────────────────────────

    private readonly designerService = inject(DatabaseDesignerService);
    private readonly cdr = inject(ChangeDetectorRef);

    // ─── Per-instance wizard state service ────────────────────────────────

    public readonly WizardState = new EntityWizardStateService(this.designerService);

    // ─── Outputs ───────────────────────────────────────────────────────────

    /** Emitted when the wizard completes successfully. */
    @Output() public readonly EntityCreated = new EventEmitter<EntityPipelineResult>();

    /** Emitted when the user cancels or clicks "Create Another". */
    @Output() public readonly Cancelled = new EventEmitter<void>();

    // ─── Pipeline step ref ─────────────────────────────────────────────────

    // StepPipelineComponent is rendered directly in the wizard's own template
    // (via <mj-entity-step-pipeline>) so this ViewChild resolves correctly,
    // unlike @ViewChild(EntityPipelinePanelComponent) which lives one level
    // deeper inside StepPipelineComponent's own view.
    @ViewChild(StepPipelineComponent)
    private stepPipelineRef?: StepPipelineComponent;

    // ─── View state ────────────────────────────────────────────────────────

    public CurrentStep: WizardStep = 'basics';
    public StepDefs: WizardStepDef[] = [];
    public IsValidating = false;
    public ValidationErrors: string[] = [];
    /** True once the user has clicked "Create Entity" — pipeline runs inline on the review step. */
    public IsExecuting = false;

    public get StepIndex(): number {
        return STEP_ORDER.indexOf(this.CurrentStep);
    }

    public get IsFirstStep(): boolean { return this.StepIndex === 0; }
    public get IsLastStep(): boolean  { return this.CurrentStep === 'review'; }

    // ─── Lifecycle ─────────────────────────────────────────────────────────

    private readonly destroy$ = new Subject<void>();

    public AvailableSchemas: SchemaOption[] = [];

    constructor() {
        this.WizardState.currentStep$
            .pipe(takeUntil(this.destroy$))
            .subscribe(step => {
                this.CurrentStep = step;
                this.rebuildStepDefs(step);
                this.cdr.markForCheck();
            });

        this.WizardState.isValidating$
            .pipe(takeUntil(this.destroy$))
            .subscribe(v => { this.IsValidating = v; this.cdr.markForCheck(); });

        this.WizardState.stepErrors$
            .pipe(takeUntil(this.destroy$))
            .subscribe(errors => {
                this.ValidationErrors = Object.values(errors);
                this.cdr.markForCheck();
            });

        // Build initial step defs
        this.rebuildStepDefs('basics');

        // Load available schemas asynchronously — wizard renders synchronously but
        // the schema dropdown populates when the async result arrives
        DatabaseDesignerEngine.Instance.loadAvailableSchemas().then(schemas => {
            this.AvailableSchemas = schemas;
            this.cdr.markForCheck();
        });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        this.WizardState.Destroy();
    }

    // ─── Step data handlers (called by child step components) ─────────────

    public OnBasicsChanged(value: BasicsStepValue): void {
        this.WizardState.UpdateBasics(value);
    }

    public OnFieldsChanged(columns: ColumnSpec[]): void {
        this.WizardState.UpdateFields(columns);
    }

    public OnRelationshipsChanged(fks: ForeignKeySpec[]): void {
        this.WizardState.UpdateRelationshipsAndAutoColumns(fks);
    }

    // ─── Navigation ────────────────────────────────────────────────────────

    public async OnNext(): Promise<void> {
        const currentStep = this.CurrentStep;

        // Synchronous validation for the current step
        if (!this.WizardState.ValidateStep(currentStep)) return;

        // Entering Review (step 4): run server-side validation first
        if (currentStep === 'relationships') {
            const result = await this.WizardState.ValidateSchema();
            if (!result.Valid) return;
        }

        // Review is the last step — "Create Entity" button triggers inline pipeline execution.
        if (currentStep === 'review') {
            this.IsExecuting = true;
            this.cdr.markForCheck();
            // @ViewChild(StepPipelineComponent) resolves after the @if block renders on the
            // next CD cycle. The setTimeout gives Angular that cycle before we call StartPipeline().
            // StepPipelineComponent.ngAfterViewInit() is also wired up as a belt-and-suspenders
            // trigger — if it fires first, StartPipeline() is a no-op (idempotent guard inside).
            setTimeout(() => this.stepPipelineRef?.StartPipeline());
            return;
        }

        this.advanceToStep(STEP_ORDER[this.StepIndex + 1]);
    }

    public OnBack(): void {
        if (this.IsFirstStep || this.IsExecuting) return;
        this.advanceToStep(STEP_ORDER[this.StepIndex - 1]);
    }

    public OnCancel(): void {
        this.Cancelled.emit();
    }

    /** Re-run server-side schema validation without advancing the step. */
    public async OnRetryValidation(): Promise<void> {
        await this.WizardState.ValidateSchema();
    }

    /** Clear the current validation errors without re-running validation. */
    public OnDismissErrors(): void {
        this.ValidationErrors = [];
        this.cdr.markForCheck();
    }

    // ─── Pipeline events ───────────────────────────────────────────────────

    public OnPipelineCompleted(result: EntityPipelineResult): void {
        DatabaseDesignerEngine.Instance.invalidateCache();
        this.EntityCreated.emit(result);
    }

    public OnPipelineErrored(_msg: string): void {
        // Panel handles the error UI inline — nothing extra needed here
        this.cdr.markForCheck();
    }

    public OnCreateAnother(): void {
        this.Cancelled.emit(); // Parent will re-open a fresh wizard if needed
    }

    // ─── Template helpers ──────────────────────────────────────────────────

    public get TableDefinition() { return this.WizardState.TableDefinition; }

    public TrackByStep(_: number, def: WizardStepDef): string { return def.id; }

    // ─── Private helpers ───────────────────────────────────────────────────

    private advanceToStep(step: WizardStep): void {
        this.ValidationErrors = [];
        this.WizardState.GoToStep(step);
    }

    private rebuildStepDefs(activeStep: WizardStep): void {
        const activeIndex = STEP_ORDER.indexOf(activeStep);
        this.StepDefs = WIZARD_STEP_DEFS.map((def, i) => ({
            ...def,
            isActive: def.id === activeStep,
            isComplete: i < activeIndex,
        }));
    }
}
