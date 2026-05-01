/**
 * @module database-modify.component
 * @description Slide-over view for modifying an existing Database Designer entity.
 *
 * Rendered inside an `mj-slide-panel` by the dashboard when the user clicks Edit.
 * Presents three tabs:
 *   1. Fields  — EntityFieldsGridComponent in modify mode (existing + new columns)
 *   2. Review  — EntityReviewPanelComponent showing diff (new cols highlighted)
 *   3. Apply   — EntityPipelinePanelComponent for running the alter pipeline
 *
 * On tab 3 ("Apply"), clicking "Apply Changes" calls `pipelinePanel.StartExecution()`.
 * The pipeline panel then calls `DatabaseDesignerService.modifyEntity()`.
 */

import {
    Component, Input, Output, EventEmitter, OnInit, OnDestroy,
    ChangeDetectionStrategy, ChangeDetectorRef, inject, ViewChild,
} from '@angular/core';
import { DatabaseDesignerService } from '../../services/database-designer.service.js';
import { DatabaseDesignerEngine } from '../../services/database-designer.engine.js';
import { EntityPipelinePanelComponent } from '../shared/entity-pipeline-panel.component.js';
import type { AccessibleEntityDetail, ColumnSpec, EntityTableSpec, EntityPipelineResult } from '../../database-designer.types.js';

type ModifyTab = 'fields' | 'review' | 'apply';

@Component({
    standalone: false,
    selector: 'mj-database-modify',
    templateUrl: './database-modify.component.html',
    styleUrls: ['./database-modify.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatabaseModifyComponent implements OnInit, OnDestroy {

    // ─── Injected ──────────────────────────────────────────────────────────

    private readonly cdr = inject(ChangeDetectorRef);

    // ─── Inputs / Outputs ──────────────────────────────────────────────────

    @Input() public set EntityId(v: string) {
        if (v && v !== this._entityId) {
            this._entityId = v;
            if (this._initialized) this.loadEntityDetail();
        }
    }
    public get EntityId(): string { return this._entityId; }
    private _entityId = '';
    private _initialized = false;

    @Output() public readonly EntityModified = new EventEmitter<EntityPipelineResult>();
    @Output() public readonly Cancelled = new EventEmitter<void>();

    // ─── View state ────────────────────────────────────────────────────────

    public ActiveTab: ModifyTab = 'fields';
    public IsLoading = false;
    public LoadError: string | null = null;
    public EntityDetail: AccessibleEntityDetail | null = null;

    /** Columns being edited — starts from existing entity fields + user additions. */
    public EditedColumns: ColumnSpec[] = [];

    public IsPipelineRunning = false;
    public CanApplyChanges = false;

    @ViewChild(EntityPipelinePanelComponent)
    private pipelinePanel?: EntityPipelinePanelComponent;

    // ─── Lifecycle ─────────────────────────────────────────────────────────

    async ngOnInit(): Promise<void> {
        this._initialized = true;
        await this.loadEntityDetail();
    }

    ngOnDestroy(): void {
        // Cleanup not needed — no subscriptions beyond the load promise
    }

    // ─── Tab navigation ────────────────────────────────────────────────────

    public SetTab(tab: ModifyTab): void {
        // Don't allow switching away from 'apply' once pipeline has started
        if (this.IsPipelineRunning && tab !== 'apply') return;
        this.ActiveTab = tab;
        this.cdr.markForCheck();
    }

    // ─── Column change handler ─────────────────────────────────────────────

    public OnColumnsChanged(columns: ColumnSpec[]): void {
        this.EditedColumns = columns;
        this.CanApplyChanges = this.hasChanges();
        this.cdr.markForCheck();
    }

    // ─── Apply / Pipeline ──────────────────────────────────────────────────

    public OnApplyChanges(): void {
        if (!this.EntityDetail || !this.CanApplyChanges) return;
        this.IsPipelineRunning = true;
        this.SetTab('apply');
        setTimeout(() => this.pipelinePanel?.StartExecution(), 0);
    }

    public OnPipelineCompleted(result: EntityPipelineResult): void {
        this.IsPipelineRunning = false;
        DatabaseDesignerEngine.Instance.invalidateCache();
        this.EntityModified.emit(result);
        this.cdr.markForCheck();
    }

    public OnPipelineErrored(_msg: string): void {
        this.IsPipelineRunning = false;
        this.cdr.markForCheck();
    }

    public OnCancel(): void {
        if (this.IsPipelineRunning) {
            // Use native confirm so the guard stays synchronous — required by MjSlidePanelComponent.CanClose.
            // The pipeline continues on the server regardless; we're only hiding the progress UI.
            const confirmed = window.confirm(
                'A pipeline operation is in progress. Closing will hide the progress panel ' +
                'but the operation will continue running on the server.\n\nAre you sure?'
            );
            if (!confirmed) return;
        }
        this.Cancelled.emit();
    }

    // ─── Template helpers ──────────────────────────────────────────────────

    public get CurrentTableSpec(): EntityTableSpec | null {
        if (!this.EntityDetail) return null;
        return {
            EntityName: this.EntityDetail.entityName,
            TableName:  this.EntityDetail.tableName,
            SchemaName: this.EntityDetail.schemaName,
            Description: this.EntityDetail.description,
            Columns: this.EditedColumns,
        };
    }

    public get ExistingColumns(): ColumnSpec[] {
        return this.EntityDetail?.columns ?? [];
    }

    // ─── Private helpers ───────────────────────────────────────────────────

    private async loadEntityDetail(): Promise<void> {
        if (!this._entityId) return;

        this.IsLoading = true;
        this.LoadError = null;
        this.cdr.markForCheck();

        try {
            this.EntityDetail = await DatabaseDesignerEngine.Instance.loadEntityDetail(this._entityId);
            if (this.EntityDetail) {
                this.EditedColumns = [...this.EntityDetail.columns];
            }
        } catch (err) {
            this.LoadError = err instanceof Error ? err.message : String(err);
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    /** True if the user added new columns or changed any existing column. */
    private hasChanges(): boolean {
        const original = this.EntityDetail?.columns ?? [];
        if (this.EditedColumns.length !== original.length) return true;
        return this.EditedColumns.some((col, i) =>
            col.Name         !== original[i]?.Name         ||
            col.Type         !== original[i]?.Type         ||
            col.IsNullable   !== original[i]?.IsNullable   ||
            col.MaxLength    !== original[i]?.MaxLength     ||
            col.Precision    !== original[i]?.Precision     ||
            col.Scale        !== original[i]?.Scale         ||
            col.DefaultValue !== original[i]?.DefaultValue  ||
            col.Description  !== original[i]?.Description
        );
    }
}
