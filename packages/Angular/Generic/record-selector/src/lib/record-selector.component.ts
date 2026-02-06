import { Component, Output, EventEmitter, Input, ViewChild } from '@angular/core';

import { BaseEntity  } from '@memberjunction/core';
   
import { ListBoxComponent, ListBoxToolbarConfig } from '@progress/kendo-angular-listbox';
 
@Component({
  standalone: false,
  selector: 'mj-record-selector',
  templateUrl: './record-selector.component.html',
  styleUrls: ['./record-selector.component.css']
})
export class RecordSelectorComponent  {
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
 

  /**
   * Configurable settings for the toolbar
   */
  @Input() public ToolbarSettings: ListBoxToolbarConfig = {
    position: "right",
    tools: ["moveUp", "transferFrom", "transferAllFrom", "transferAllTo", "transferTo", "moveDown"],
  };

  @Output() RecordSelected = new EventEmitter<BaseEntity[]>();
  @Output() RecordUnselected = new EventEmitter<BaseEntity[]>();


  @ViewChild('unselected', { static: false }) unselectedListBox!: ListBoxComponent;
  @ViewChild('selected', { static: false }) selectedListBox!: ListBoxComponent;


  onDblClick(event: MouseEvent, listType: 'unselected' | 'selected'): void {
    const targetElement = event.target as HTMLElement;
    const listItemElement = targetElement.closest('.k-list-item');
    
    if (listItemElement && listItemElement.parentElement) {
      const itemIndex = Array.from(listItemElement.parentElement.children).indexOf(listItemElement);
      
      if (listType === 'unselected') {
        const item = this.UnselectedRecords[itemIndex];
        this.SelectedRecords.push(item);
        this.UnselectedRecords.splice(itemIndex, 1);
      } else {
        const item = this.SelectedRecords[itemIndex];
        this.UnselectedRecords.push(item);
        this.SelectedRecords.splice(itemIndex, 1);
      }

      if (this.unselectedListBox)
        this.unselectedListBox.clearSelection();
      if (this.selectedListBox)
        this.selectedListBox.clearSelection();
    }
  }
}
