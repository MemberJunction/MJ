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
  @Output() OnSave = new EventEmitter<{ itemsChanged: boolean; items: DashboardItem[]; config: DashboardConfigDetails }>();

  /**
   * @deprecated Use {@link OnSave}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (onSave) keeps working. Must stay AFTER OnSave: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() onSave = this.OnSave;
  @Output() OnClose = new EventEmitter<void>();

  /**
   * @deprecated Use {@link OnClose}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (onClose) keeps working. Must stay AFTER OnClose: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() onClose = this.OnClose;
  @Output() TriggerAddItem = new EventEmitter<{ ID: string; DisplayName: string }>();

  /**
   * @deprecated Use {@link TriggerAddItem}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (triggerAddItem) keeps working. Must stay AFTER TriggerAddItem: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() triggerAddItem = this.TriggerAddItem;
  @Input() public EditMode: boolean = false;

  /** @deprecated Use {@link EditMode}. */
  @Input() public set editMode(value: boolean) {
    this.EditMode = value;
  }
  /** @deprecated Use {@link EditMode}. */
  public get editMode(): boolean {
    return this.EditMode;
  }
  @Input() public Config: DashboardConfigDetails = new DashboardConfigDetails();

  /** @deprecated Use {@link Config}. */
  @Input() public set config(value: DashboardConfigDetails) {
    this.Config = value;
  }
  /** @deprecated Use {@link Config}. */
  public get config(): DashboardConfigDetails {
    return this.Config;
  }
  @Input() public Items: DashboardItem[] = [];

  /** @deprecated Use {@link Items}. */
  @Input() public set items(value: DashboardItem[]) {
    this.Items = value;
  }
  /** @deprecated Use {@link Items}. */
  public get items(): DashboardItem[] {
    return this.Items;
  }
  public _items: DashboardItem[] = [];  // case-violation-ok-legacy-back-compat: the PascalCase name is already taken in this scope
  public ItemsChanged: boolean = false;

  /** @deprecated Use {@link ItemsChanged}. */
  public get itemsChanged(): boolean {
    return this.ItemsChanged;
  }
  /** @deprecated Use {@link ItemsChanged}. */
  public set itemsChanged(value: boolean) {
    this.ItemsChanged = value;
  }
  public ShowAddMenu: boolean = false;

  /** @deprecated Use {@link ShowAddMenu}. */
  public get showAddMenu(): boolean {
    return this.ShowAddMenu;
  }
  /** @deprecated Use {@link ShowAddMenu}. */
  public set showAddMenu(value: boolean) {
    this.ShowAddMenu = value;
  }

  public get ResourceTypes(): { ID: string; Name: string; DisplayName: string }[] {
    return SharedService.Instance.ResourceTypes.filter((rt: { Name: string }) => rt.Name !== 'Dashboards' && rt.Name !== 'Records');
  }

  async ngOnInit(): Promise<void> {
      this._items = [];
      for (const item of this.Items) {
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

  RemoveItem(item: DashboardItem): void {
    const index = this._items.indexOf(item);
    if (index >= 0) {
      this._items.splice(index, 1);
      this.ItemsChanged = true;
    }
  }

  /** @deprecated Use {@link RemoveItem}. */
  removeItem(item: DashboardItem): void {
    return this.RemoveItem(item);
  }

  ToggleAddMenu(): void {
    this.ShowAddMenu = !this.ShowAddMenu;
  }

  /** @deprecated Use {@link ToggleAddMenu}. */
  toggleAddMenu(): void {
    return this.ToggleAddMenu();
  }

  OnReorder(e: { oldIndex: number; newIndex: number; newCol?: number; newRow?: number; uniqueId?: number }): void {
    const item = e.uniqueId != null ? this._items.find(i => i.uniqueId === e.uniqueId) : this._items[e.oldIndex];
    if (item) {
      if (e.oldIndex !== e.newIndex) {
        this._items.splice(e.oldIndex, 1);
        this._items.splice(e.newIndex, 0, item);
      }
      item.col = e.newCol ?? item.col;
      item.row = e.newRow ?? item.row;
      this.ItemsChanged = true;
    }
  }

  /** @deprecated Use {@link OnReorder}. */
  onReorder(e: { oldIndex: number; newIndex: number; newCol?: number; newRow?: number; uniqueId?: number }): void {
    return this.OnReorder(e);
  }

  OnResize(e: { newColSpan: number; newRowSpan: number; uniqueId?: number }): void {
    const item = e.uniqueId != null ? this._items.find(i => i.uniqueId === e.uniqueId) : undefined;
    if (item) {
      item.colSpan = e.newColSpan;
      item.rowSpan = e.newRowSpan;
      this.ItemsChanged = true;
    }
  }

  /** @deprecated Use {@link OnResize}. */
  onResize(e: { newColSpan: number; newRowSpan: number; uniqueId?: number }): void {
    return this.OnResize(e);
  }

  CloseDialog(): void {
    this.ShowAddMenu = false;
    this.OnClose.emit();
  }

  /** @deprecated Use {@link CloseDialog}. */
  closeDialog(): void {
    return this.CloseDialog();
  }

  SaveChanges(): void {
    this.ShowAddMenu = false;
    this.OnSave.emit({
      itemsChanged: this.ItemsChanged,
      items: this._items,
      config: this.Config,
    });
  }

  /** @deprecated Use {@link SaveChanges}. */
  saveChanges(): void {
    return this.SaveChanges();
  }

  OnItemSelect(event: { ID: string; DisplayName: string }): void {
    this.ShowAddMenu = false;
    if (event.ID) {
      this.TriggerAddItem.emit(event);
    }
  }

  /** @deprecated Use {@link OnItemSelect}. */
  onItemSelect(event: { ID: string; DisplayName: string }): void {
    return this.OnItemSelect(event);
  }
}