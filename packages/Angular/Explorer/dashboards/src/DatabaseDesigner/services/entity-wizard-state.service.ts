/**
 * @module entity-wizard-state.service
 * @description Per-wizard state management for the Database Designer create/modify flow.
 *
 * ### Lifecycle
 * NOT an Angular injectable — manually instantiated by the wizard host component so
 * each open panel has its own isolated state.  The host must call `destroy()` from
 * `ngOnDestroy()` to complete all observables and prevent leaks.
 *
 * ```typescript
 * // In the wizard component:
 * private readonly designerService = inject(DatabaseDesignerService);
 * private readonly wizardState = new EntityWizardStateService(this.designerService);
 *
 * ngOnDestroy(): void { this.wizardState.destroy(); }
 * ```
 *
 * ### Responsibility boundary
 * - Step navigation (currentStep$ BehaviorSubject)
 * - Draft TableDefinition assembly from step values
 * - Synchronous step validation (empty required fields, reserved column names)
 * - Server round-trips (validateSchema, submit) delegated to DatabaseDesignerService
 *
 * No component layout, no templates, no Angular DI lifecycle.
 */

import { BehaviorSubject, Observable } from 'rxjs';
import { DatabaseDesignerService } from './database-designer.service.js';
import type {
    EntityTableSpec,
    BasicsStepValue,
    ColumnSpec,
    ForeignKeySpec,
    ClientValidationResult,
    EntityPipelineResult,
    WizardStep,
} from '../database-designer.types.js';

export class EntityWizardStateService {

    constructor(private readonly designerService: DatabaseDesignerService) {}

    // ─── Observables ───────────────────────────────────────────────────────

    private readonly _currentStep = new BehaviorSubject<WizardStep>('basics');
    private readonly _tableDefinition = new BehaviorSubject<Partial<EntityTableSpec>>({});
    private readonly _stepErrors = new BehaviorSubject<Record<string, string>>({});
    private readonly _validationResult = new BehaviorSubject<ClientValidationResult | null>(null);
    private readonly _pipelineResult = new BehaviorSubject<EntityPipelineResult | null>(null);
    private readonly _isValidating = new BehaviorSubject<boolean>(false);
    private readonly _isSubmitting = new BehaviorSubject<boolean>(false);

    public readonly currentStep$: Observable<WizardStep>             = this._currentStep.asObservable();
    public readonly tableDefinition$: Observable<Partial<EntityTableSpec>> = this._tableDefinition.asObservable();
    public readonly stepErrors$: Observable<Record<string, string>>  = this._stepErrors.asObservable();
    public readonly validationResult$: Observable<ClientValidationResult | null> = this._validationResult.asObservable();
    public readonly pipelineResult$: Observable<EntityPipelineResult | null>  = this._pipelineResult.asObservable();
    public readonly isValidating$: Observable<boolean>               = this._isValidating.asObservable();
    public readonly isSubmitting$: Observable<boolean>               = this._isSubmitting.asObservable();

    // ─── Convenience snapshot getters ─────────────────────────────────────

    public get CurrentStep(): WizardStep { return this._currentStep.value; }
    public get TableDefinition(): Partial<EntityTableSpec> { return this._tableDefinition.value; }

    // ─── Step navigation ───────────────────────────────────────────────────

    public GoToStep(step: WizardStep): void {
        this._currentStep.next(step);
    }

    /** Returns true if the current step passes synchronous validation. */
    public ValidateStep(step: WizardStep): boolean {
        const errors: Record<string, string> = {};

        if (step === 'basics') {
            const td = this._tableDefinition.value;
            if (!td.EntityName?.trim()) errors['entityName'] = 'Entity name is required.';
            if (!td.TableName?.trim())  errors['tableName']  = 'Table name is required.';
            if (!td.SchemaName?.trim()) errors['schemaName'] = 'Schema is required.';
        }

        if (step === 'fields') {
            const reserved = (this._tableDefinition.value.Columns ?? [])
                .filter(c => /^(id|__mj_createdat|__mj_updatedat)$/i.test(c.Name));
            if (reserved.length > 0) {
                errors['reservedNames'] =
                    `Remove reserved column names: ${reserved.map(c => c.Name).join(', ')}.`;
            }
        }

        this._stepErrors.next(errors);
        return Object.keys(errors).length === 0;
    }

    // ─── Mutation helpers ──────────────────────────────────────────────────

    public UpdateBasics(basics: BasicsStepValue): void {
        this._tableDefinition.next({
            ...this._tableDefinition.value,
            EntityName: basics.entityName,
            TableName:  basics.tableName,
            SchemaName: basics.schemaName,
            Description: basics.description || undefined,
        });
    }

    public UpdateFields(columns: ColumnSpec[]): void {
        this._tableDefinition.next({ ...this._tableDefinition.value, Columns: columns });
    }

    public UpdateRelationships(fks: ForeignKeySpec[]): void {
        this._tableDefinition.next({ ...this._tableDefinition.value, ForeignKeys: fks });
    }

    /**
     * Update relationships and auto-create UUID source columns for any FK whose
     * `ColumnName` does not yet exist in `Columns`.  Fixes the "Step 3 dead-end"
     * where a user can add a relationship but has no valid UUID column to back it.
     *
     * An auto-created column is marked with `Description: 'Auto-generated FK to {Table}'`
     * so the user can tell what the wizard added for them.  The column can still
     * be renamed or deleted from Step 2.
     */
    public UpdateRelationshipsAndAutoColumns(fks: ForeignKeySpec[]): void {
        const existing = this._tableDefinition.value.Columns ?? [];
        const existingNames = new Set(existing.map(c => c.Name.toLowerCase()));

        const newColumns: ColumnSpec[] = [];
        for (const fk of fks) {
            if (!fk.ColumnName) continue;
            if (existingNames.has(fk.ColumnName.toLowerCase())) continue;
            existingNames.add(fk.ColumnName.toLowerCase());
            newColumns.push({
                Name: fk.ColumnName,
                Type: 'uuid',
                IsNullable: true,
                Description: `Auto-generated FK to ${fk.ReferencedSchema}.${fk.ReferencedTable}`,
            });
        }

        this._tableDefinition.next({
            ...this._tableDefinition.value,
            Columns: newColumns.length ? [...existing, ...newColumns] : existing,
            ForeignKeys: fks,
        });
    }

    // ─── Server round-trips ────────────────────────────────────────────────

    /**
     * Validate the current TableDefinition via `Validate Entity Schema` action.
     * Updates `validationResult$` and `stepErrors$`.
     */
    public async ValidateSchema(): Promise<ClientValidationResult> {
        const td = this.buildCompleteSpec();
        if (!td) {
            const err: ClientValidationResult = { Valid: false, Errors: ['Schema is incomplete.'], Warnings: [] };
            this._validationResult.next(err);
            return err;
        }

        this._isValidating.next(true);
        try {
            const result = await this.designerService.validateEntitySchema(td);
            this._validationResult.next(result);
            if (!result.Valid) {
                this._stepErrors.next({ serverValidation: result.Errors.join('; ') });
            } else {
                this._stepErrors.next({});
            }
            return result;
        } finally {
            this._isValidating.next(false);
        }
    }

    /**
     * Run the entity creation or modification pipeline via the appropriate action.
     * Updates `pipelineResult$` on completion.
     */
    public async Submit(
        modificationType: 'create' | 'alter',
        existingEntityId?: string,
    ): Promise<EntityPipelineResult> {
        const td = this.buildCompleteSpec();
        if (!td) {
            const err: EntityPipelineResult = { Success: false, ErrorMessage: 'Schema is incomplete.' };
            this._pipelineResult.next(err);
            return err;
        }

        this._isSubmitting.next(true);
        try {
            const result = modificationType === 'create'
                ? await this.designerService.createEntity(td)
                : await this.designerService.modifyEntity(td, {
                    existingEntityId: existingEntityId ?? '',
                });
            this._pipelineResult.next(result);
            return result;
        } finally {
            this._isSubmitting.next(false);
        }
    }

    /** Complete all subjects — call from the host component's ngOnDestroy. */
    public Destroy(): void {
        this._currentStep.complete();
        this._tableDefinition.complete();
        this._stepErrors.complete();
        this._validationResult.complete();
        this._pipelineResult.complete();
        this._isValidating.complete();
        this._isSubmitting.complete();
    }

    // ─── Private helpers ───────────────────────────────────────────────────

    /** Build a complete EntityTableSpec from the draft, or null if required fields missing. */
    private buildCompleteSpec(): EntityTableSpec | null {
        const draft = this._tableDefinition.value;
        if (!draft.EntityName || !draft.TableName || !draft.SchemaName) return null;
        return {
            EntityName: draft.EntityName,
            TableName:  draft.TableName,
            SchemaName: draft.SchemaName,
            Description: draft.Description,
            Columns:     draft.Columns ?? [],
            ForeignKeys: draft.ForeignKeys ?? [],
        };
    }
}
