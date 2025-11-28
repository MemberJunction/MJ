import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { EntityInfo, CompositeKey, Metadata, RunViewParams } from '@memberjunction/core';
import { BaseEntity } from '@memberjunction/core';

/**
 * Event emitted when a row is clicked in the grid
 */
export interface GridRowClickedEvent {
  entityId: string;
  entityName: string;
  CompositeKey: CompositeKey;
}

/**
 * Grid View wrapper component that integrates with UserViewGridComponent
 * Provides a standardized interface for the Data Explorer
 */
@Component({
  selector: 'mj-explorer-grid-view',
  templateUrl: './grid-view.component.html',
  styleUrls: ['./grid-view.component.css']
})
export class GridViewComponent implements OnChanges {
  @Input() entity: EntityInfo | null = null;
  @Input() viewId: string | null = null;
  @Input() extraFilter: string = '';

  @Output() recordSelected = new EventEmitter<BaseEntity>();
  @Output() recordOpened = new EventEmitter<BaseEntity>();
  @Output() dataLoaded = new EventEmitter<{ totalRowCount: number; loadTime: number }>();

  // Parameters for UserViewGridComponent - grid auto-refreshes when this changes
  public viewParams: RunViewParams = {};

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entity'] || changes['viewId'] || changes['extraFilter']) {
      this.updateViewParams();
    }
  }

  /**
   * Update view parameters when inputs change
   */
  private updateViewParams(): void {
    if (!this.entity) {
      this.viewParams = {};
      return;
    }

    this.viewParams = {
      EntityName: this.entity.Name,
      ExtraFilter: this.extraFilter || ''
    };

    if (this.viewId) {
      this.viewParams.ViewID = this.viewId;
    }
  }

  /**
   * Handle row click from UserViewGridComponent
   */
  onGridRowClick(event: GridRowClickedEvent): void {
    // Load the entity object and emit
    this.loadAndEmitRecord(event.entityName, event.CompositeKey);
  }

  /**
   * Handle data loaded event from UserViewGridComponent
   */
  onDataLoaded(event: { totalRowCount: number; loadTime: number }): void {
    this.dataLoaded.emit(event);
  }

  /**
   * Load the entity record and emit the selection event
   */
  private async loadAndEmitRecord(entityName: string, compositeKey: CompositeKey): Promise<void> {
    try {
      const md = new Metadata();
      const record = await md.GetEntityObject<BaseEntity>(entityName);
      await record.InnerLoad(compositeKey);
      this.recordSelected.emit(record);
    } catch (error) {
      console.error('Error loading record:', error);
    }
  }
}
