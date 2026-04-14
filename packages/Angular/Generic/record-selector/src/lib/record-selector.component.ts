import { Component, Output, EventEmitter, Input } from '@angular/core';

import { BaseEntity } from '@memberjunction/core';

@Component({
  standalone: false,
  selector: 'mj-record-selector',
  templateUrl: './record-selector.component.html',
  styleUrls: ['./record-selector.component.css']
})
export class RecordSelectorComponent {
  /**
   * The name of the entity to show records for.
   */
  @Input() EntityName: string = '';
  /**
   * The field name within the entity to show in the list items
   */
  @Input() DisplayField: string = '';

  /**
   * The field name within the entity that has a CSS class representing an icon that should be displayed in the list items
   */
  @Input() DisplayIconField: string = '';

  /**
   * The list of records that are available
   */
  @Input() AvailableRecords: BaseEntity[] = [];

  /**
   * The list of records that are selected
   */
  @Input() SelectedRecords: BaseEntity[] = [];
  /**
   * The list of records that are not selected
   */
  @Input() UnselectedRecords: BaseEntity[] = [];

  @Output() RecordSelected = new EventEmitter<BaseEntity[]>();
  @Output() RecordUnselected = new EventEmitter<BaseEntity[]>();

  /** Index of the currently highlighted item in the unselected list */
  public SelectedUnselectedIndex = -1;

  /** Index of the currently highlighted item in the selected list */
  public SelectedSelectedIndex = -1;

  /**
   * Transfers an item from unselected to selected.
   * If no index provided, uses the currently highlighted item.
   */
  TransferToSelected(index?: number): void {
    const i = index ?? this.SelectedUnselectedIndex;
    if (i < 0 || i >= this.UnselectedRecords.length) {
      return;
    }
    const item = this.UnselectedRecords.splice(i, 1)[0];
    this.SelectedRecords.push(item);
    this.SelectedUnselectedIndex = -1;
    this.RecordSelected.emit(this.SelectedRecords);
  }

  /**
   * Transfers an item from selected to unselected.
   * If no index provided, uses the currently highlighted item.
   */
  TransferToUnselected(index?: number): void {
    const i = index ?? this.SelectedSelectedIndex;
    if (i < 0 || i >= this.SelectedRecords.length) {
      return;
    }
    const item = this.SelectedRecords.splice(i, 1)[0];
    this.UnselectedRecords.push(item);
    this.SelectedSelectedIndex = -1;
    this.RecordUnselected.emit(this.SelectedRecords);
  }

  /**
   * Transfers all items from unselected to selected.
   */
  TransferAllToSelected(): void {
    while (this.UnselectedRecords.length > 0) {
      const item = this.UnselectedRecords.shift();
      if (item) {
        this.SelectedRecords.push(item);
      }
    }
    this.SelectedUnselectedIndex = -1;
    this.RecordSelected.emit(this.SelectedRecords);
  }

  /**
   * Transfers all items from selected to unselected.
   */
  TransferAllToUnselected(): void {
    while (this.SelectedRecords.length > 0) {
      const item = this.SelectedRecords.shift();
      if (item) {
        this.UnselectedRecords.push(item);
      }
    }
    this.SelectedSelectedIndex = -1;
    this.RecordUnselected.emit(this.SelectedRecords);
  }
}
