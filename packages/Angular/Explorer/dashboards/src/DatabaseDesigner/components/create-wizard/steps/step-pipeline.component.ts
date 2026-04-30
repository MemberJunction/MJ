/**
 * @module step-pipeline.component
 * @description Step 5 wrapper — hosts EntityPipelinePanelComponent.
 * Starts pipeline execution on init and surfaces success/retry CTAs.
 */

import {
    Component, Input, Output, EventEmitter, AfterViewInit,
    ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, inject,
} from '@angular/core';
import { EntityPipelinePanelComponent } from '../../shared/entity-pipeline-panel.component.js';
import type { EntityTableSpec, EntityPipelineResult } from '../../../database-designer.types.js';

@Component({
    standalone: false,
    selector: 'mj-entity-step-pipeline',
    templateUrl: './step-pipeline.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StepPipelineComponent implements AfterViewInit {

    private readonly cdr = inject(ChangeDetectorRef);

    @Input() public TableDefinition: Partial<EntityTableSpec> = {};
    @Output() public readonly PipelineCompleted = new EventEmitter<EntityPipelineResult>();
    @Output() public readonly CreateAnother = new EventEmitter<void>();

    @ViewChild(EntityPipelinePanelComponent)
    private pipelinePanel!: EntityPipelinePanelComponent;

    public PipelineResult: EntityPipelineResult | null = null;

    ngAfterViewInit(): void {
        // Kick off the pipeline immediately once the view is ready
        this.pipelinePanel?.StartExecution();
    }

    /** Backup trigger called by the wizard after the @if block renders the step. */
    public StartPipeline(): void {
        this.pipelinePanel?.StartExecution();
    }

    public OnCompleted(result: EntityPipelineResult): void {
        this.PipelineResult = result;
        this.PipelineCompleted.emit(result);
    }

    public get AsEntityTableSpec(): EntityTableSpec | null {
        const td = this.TableDefinition;
        if (!td.EntityName || !td.TableName || !td.SchemaName) return null;
        return td as EntityTableSpec;
    }
}
