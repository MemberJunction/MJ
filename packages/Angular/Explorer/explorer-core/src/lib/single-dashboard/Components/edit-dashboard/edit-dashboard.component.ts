import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';
import { DashboardConfigDetails, DashboardItem } from '../../single-dashboard.component';

@Component({
  standalone: false,
  selector: 'app-edit-dashboard',
  templateUrl: './edit-dashboard.component.html',
  styleUrls: ['./edit-dashboard.component.css']
})
export class EditDashboardComponent {
  @Output() onSave = new EventEmitter<{ itemsChanged: boolean; items: DashboardItem[]; config: DashboardConfigDetails }>();
  @Output() onClose = new EventEmitter<void>();
  @Output() triggerAddItem = new EventEmitter<{ ID: string; DisplayName: string }>();
  @Input() public editMode: boolean = false;
  @Input() public config: DashboardConfigDetails = new DashboardConfigDetails();
  @Input() public items: DashboardItem[] = [];
  public _items: DashboardItem[] = [];
  public itemsChanged: boolean = false;
  public showAddMenu: boolean = false;

  public get ResourceTypes(): { ID: string; Name: string; DisplayName: string }[] {
    return SharedService.Instance.ResourceTypes.filter((rt: { Name: string }) => rt.Name !== 'Dashboards' && rt.Name !== 'Records');
  }

  async ngOnInit(): Promise<void> {
      this._items = [];
      for (const item of this.items) {
        const dashboardItem = this.CreateDashboardItem(item);
        this._items.push(dashboardItem);
      }
  }

  protected CreateDashboardItem(item: DashboardItem): DashboardItem {
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

  removeItem(item: DashboardItem): void {
    const index = this._items.indexOf(item);
    if (index >= 0) {
      this._items.splice(index, 1);
      this.itemsChanged = true;
    }
  }

  toggleAddMenu(): void {
    this.showAddMenu = !this.showAddMenu;
  }

  onReorder(e: { oldIndex: number; newIndex: number; newCol?: number; newRow?: number; uniqueId?: number }): void {
    const item = e.uniqueId != null ? this._items.find(i => i.uniqueId === e.uniqueId) : this._items[e.oldIndex];
    if (item) {
      if (e.oldIndex !== e.newIndex) {
        this._items.splice(e.oldIndex, 1);
        this._items.splice(e.newIndex, 0, item);
      }
      item.col = e.newCol ?? item.col;
      item.row = e.newRow ?? item.row;
      this.itemsChanged = true;
    }
  }

  onResize(e: { newColSpan: number; newRowSpan: number; uniqueId?: number }): void {
    const item = e.uniqueId != null ? this._items.find(i => i.uniqueId === e.uniqueId) : undefined;
    if (item) {
      item.colSpan = e.newColSpan;
      item.rowSpan = e.newRowSpan;
      this.itemsChanged = true;
    }
  }

  closeDialog(): void {
    this.showAddMenu = false;
    this.onClose.emit();
  }

  saveChanges(): void {
    this.showAddMenu = false;
    this.onSave.emit({
      itemsChanged: this.itemsChanged,
      items: this._items,
      config: this.config,
    });
  }

  onItemSelect(event: { ID: string; DisplayName: string }): void {
    this.showAddMenu = false;
    if (event.ID) {
      this.triggerAddItem.emit(event);
    }
  }
}