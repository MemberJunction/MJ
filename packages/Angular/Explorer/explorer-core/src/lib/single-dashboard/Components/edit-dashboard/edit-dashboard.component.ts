import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { TileLayoutReorderEvent, TileLayoutResizeEvent } from '@progress/kendo-angular-layout';
import { SharedService } from '@memberjunction/ng-shared';
import { DashboardConfigDetails, DashboardItem } from '../../single-dashboard.component';

@Component({
  standalone: false,
  selector: 'app-edit-dashboard',
  templateUrl: './edit-dashboard.component.html',
  styleUrls: ['./edit-dashboard.component.css']
})
export class EditDashboardComponent {
  @Output() onSave = new EventEmitter<any>();
  @Output() onClose = new EventEmitter<any>();
  @Output() triggerAddItem = new EventEmitter<any>();
  @Input() public editMode: boolean = false;
  @Input() public config: DashboardConfigDetails = new DashboardConfigDetails();
  @Input() public items: DashboardItem[] = [];
  public _items: DashboardItem[] = [];
  public itemsChanged: boolean = false;

  public get ResourceTypes(): any[] {
    return SharedService.Instance.ResourceTypes.filter((rt: any) => rt.Name !== 'Dashboards' && rt.Name !== 'Records');
  }
  public resourceType: any = null;

  async ngOnInit(): Promise<void> {
      this._items = [];
      for (const item of this.items) {
        const dashboardItem = this.CreateDashboardItem(item);
        this._items.push(dashboardItem);
      }
  }

  protected CreateDashboardItem(item: any): DashboardItem {
    const dashboardItem = new DashboardItem();
    if (item) {
      dashboardItem.title = item.title;
      dashboardItem.order = item.order ? item.order : 0;
      dashboardItem.col = item.col;
      dashboardItem.row = item.row;
      dashboardItem.rowSpan = item.rowSpan;
      dashboardItem.colSpan = item.colSpan;
      dashboardItem.ResourceData = new ResourceData(item.ResourceData);  
    }
    return dashboardItem;
  }

  removeItem(e: any): void {
    // remove the selected item from the dashboard
    const index = this._items.indexOf(e);
    if (index >= 0) {
      this._items.splice(index, 1);
      this.itemsChanged = true;
    }
  }

  onReorder(e: TileLayoutReorderEvent): void {
    const item = this._items.find(i => i.uniqueId === parseInt(e.item.elem.nativeElement.id));
    if (item) {
      // move the item in our config state to the new index
      if (e.oldIndex !== e.newIndex) {
        this._items.splice(e.oldIndex, 1);
        this._items.splice(e.newIndex, 0, item);  
      }
      //item.order = e.item.order;
      item.col = e.newCol ? e.newCol : item.col;
      item.row = e.newRow ? e.newRow : item.row;
      this.itemsChanged = true;
    }
  }
  
  onResize(e: TileLayoutResizeEvent): void {
    const item = this._items.find(i => i.uniqueId === parseInt(e.item.elem.nativeElement.id));
    if (item) {
      item.colSpan = e.newColSpan;
      item.rowSpan = e.newRowSpan;
      this.itemsChanged = true;
    }
  }

  closeDialog(event: any = null): void {
    this.onClose.emit();
  }

  saveChanges() {
    this.onSave.emit({
      itemsChanged: this.itemsChanged,
      items: this._items,
      config: this.config,
    });
  }

  onItemSelect(event: any) {
    if(event.ID){
      this.triggerAddItem.emit(event);
    }
  }
}