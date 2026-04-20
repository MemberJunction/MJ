/**
 * @module entity-pipeline-panel.component
 * @description Displays pipeline execution progress and results for entity
 * creation/modification. Used in wizard Step 5 and the Modify "Apply" tab.
 *
 * ### Lifecycle
 * The component does NOT start the pipeline automatically on mount — the parent
 * must call `StartExecution()` explicitly.  This keeps "panel visible" and
 * "pipeline running" as separate events, which simplifies the host wizard logic.
 *
 * ### States
 *  - `idle`      → waiting for StartExecution() call
 *  - `running`   → action in flight, spinner shown
 *  - `success`   → pipeline returned Success=true, success card shown
 *  - `failed`    → pipeline returned Success=false, error card shown
 */

import {
    Component, Input, Output, EventEmitter, AfterViewInit,
    ChangeDetectionStrategy, ChangeDetectorRef, inject,
} from '@angular/core';
import { DatabaseDesignerService } from '../../services/database-designer.service.js';
import type {
    EntityTableSpec,
    EntityPipelineResult,
    PipelineStepSummary,
} from '../../database-designer.types.js';

type PanelState = 'idle' | 'running' | 'success' | 'failed';

@Component({
    standalone: false,
    selector: 'mj-database-pipeline-panel',
    templateUrl: './entity-pipeline-panel.component.html',
    styleUrls: ['./entity-pipeline-panel.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntityPipelinePanelComponent implements AfterViewInit {

    // ─── Injected ──────────────────────────────────────────────────────────

    private readonly service = inject(DatabaseDesignerService);
    private readonly cdr = inject(ChangeDetectorRef);

    // ─── Inputs ────────────────────────────────────────────────────────────

    /** Table spec to create or modify. */
    @Input() public TableDefinition: EntityTableSpec | null = null;

    /** Whether this panel is creating a new entity or altering an existing one. */
    @Input() public ModificationType: 'create' | 'alter' = 'create';

    /** Required only in 'alter' mode — ID of the entity being modified. */
    @Input() public ExistingEntityId: string | null = null;

    /** When true, `StartExecution()` is called automatically on mount. */
    @Input() public AutoStart = false;

    // ─── Outputs ───────────────────────────────────────────────────────────

    /** Emitted when the pipeline completes successfully. */
    @Output() public readonly Completed = new EventEmitter<EntityPipelineResult>();

    /** Emitted when the pipeline fails or throws. */
    @Output() public readonly Errored = new EventEmitter<string>();

    // ─── View state ────────────────────────────────────────────────────────

    public State: PanelState = 'idle';
    public PipelineResult: EntityPipelineResult | null = null;
    public ErrorMessage = '';
    public Steps: PipelineStepSummary[] = [];

    // ─── Public API ────────────────────────────────────────────────────────

    /**
     * Kick off the pipeline.  Idempotent — calling while already running is a no-op.
     * Called by the parent (wizard step 5 or modify "Apply" tab).
     */
    ngAfterViewInit(): void {
        if (this.AutoStart) {
            // Defer to next microtask so Angular's current CD cycle finishes before
            // we transition to 'running' (avoids ExpressionChangedAfterItHasBeenCheckedError).
            Promise.resolve().then(() => this.StartExecution());
        }
    }

    public async StartExecution(): Promise<void> {
        if (this.State === 'running') return;
        if (!this.TableDefinition) {
            this.State = 'failed';
            this.ErrorMessage = 'Entity definition is incomplete — required fields (EntityName, TableName, SchemaName) are missing. Go back and complete all steps.';
            this.cdr.detectChanges();
            this.Errored.emit(this.ErrorMessage);
            return;
        }

        this.State = 'running';
        this.ErrorMessage = '';
        this.Steps = [];
        this.PipelineResult = null;
        this.cdr.detectChanges();

        try {
            // SkipRestart: true prevents the server from restarting MJAPI mid-request.
            // The Angular client communicates over a long-lived HTTP connection; a server
            // restart would drop the connection before the response arrives.  The agent path
            // (EntitySchemaBuilder) uses the same flag for the same reason.
            const result = this.ModificationType === 'create'
                ? await this.service.createEntity(this.TableDefinition, { skipRestart: true })
                : await this.service.modifyEntity(this.TableDefinition, {
                    existingEntityId: this.ExistingEntityId ?? '',
                    skipRestart: true,
                });

            this.PipelineResult = result;
            this.Steps = result.PipelineSteps ?? [];

            if (result.Success) {
                this.State = 'success';
                this.Completed.emit(result);
            } else {
                this.State = 'failed';
                this.ErrorMessage = result.ErrorMessage ?? 'An unknown error occurred.';
                this.Errored.emit(this.ErrorMessage);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.State = 'failed';
            this.ErrorMessage = msg;
            this.Errored.emit(msg);
        } finally {
            this.cdr.detectChanges();
        }
    }

    /** Reset to idle so the panel can be reused (e.g., "Try Again"). */
    public Reset(): void {
        this.State = 'idle';
        this.PipelineResult = null;
        this.ErrorMessage = '';
        this.Steps = [];
        this.cdr.detectChanges();
    }

    // ─── Template helpers ──────────────────────────────────────────────────

    public TrackByStep(_: number, step: PipelineStepSummary): string {
        return step.Name;
    }

    public StepIcon(step: PipelineStepSummary): string {
        switch (step.Status) {
            case 'success': return 'fa-solid fa-circle-check step-success';
            case 'failed':  return 'fa-solid fa-circle-xmark step-failed';
            case 'skipped': return 'fa-solid fa-circle-minus step-skipped';
            default:        return 'fa-solid fa-circle step-unknown';
        }
    }

    public FormatDuration(ms: number): string {
        return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
    }

    /** Summary line for the success card: "4 custom columns + 3 auto-managed". */
    public get SuccessColumnSummary(): string {
        const custom = this.TableDefinition?.Columns.length ?? 0;
        return `${custom} custom column${custom !== 1 ? 's' : ''} + 3 auto-managed`;
    }

    public get FullTablePath(): string {
        if (!this.PipelineResult) return '';
        return `${this.PipelineResult.SchemaName}.${this.PipelineResult.TableName}`;
    }
}
