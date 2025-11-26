import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { EntityInfo, CompositeKey } from '@memberjunction/core';
import { BaseEntity } from '@memberjunction/core';

/**
 * Grid View wrapper component that integrates with UserViewGridComponent
 * Provides a standardized interface for the Data Explorer
 */
@Component({
  selector: 'mj-explorer-grid-view',
  templateUrl: './grid-view.component.html',
  styleUrls: ['./grid-view.component.scss']
})
export class GridViewComponent implements OnChanges {
  @Input() entity: EntityInfo | null = null;
  @Input() viewId: string | null = null;
  @Input() extraFilter: string = '';

  @Output() recordSelected = new EventEmitter<BaseEntity>();
  @Output() recordOpened = new EventEmitter<BaseEntity>();

  // Parameters for UserViewGridComponent
  public viewParams: { EntityName?: string; ViewID?: string; ExtraFilter?: string } = {};

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
   * Handle row click from grid
   */
  onRowClick(event: { record: BaseEntity }): void {
    this.recordSelected.emit(event.record);
  }

  /**
   * Handle row double-click from grid
   */
  onRowDoubleClick(event: { record: BaseEntity }): void {
    this.recordOpened.emit(event.record);
  }

  /**
   * Handle record open from grid's context menu or action buttons
   */
  onRecordOpen(event: { EntityName: string; RecordPKey: CompositeKey }): void {
    // The grid emits EntityName and PKey, but we need the actual record
    // For now, emit with what we have - parent will need to handle
    // TODO: Consider fetching the full record or adjusting the interface
  }
}
