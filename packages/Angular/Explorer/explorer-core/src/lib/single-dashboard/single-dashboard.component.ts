import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { MJDashboardEntityExtended, MJResourceTypeEntity } from '@memberjunction/core-entities';
import { Metadata } from '@memberjunction/core';
import { SharedService, RecentAccessService } from '@memberjunction/ng-shared';
import { ResourceContainerComponent } from '../generic/resource-container-component';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { BaseDashboard } from '@memberjunction/ng-shared';

@Component({
  standalone: false,
  selector: 'mj-single-dashboard',
  templateUrl: './single-dashboard.component.html',
  styleUrls: ['./single-dashboard.component.css']
})
export class SingleDashboardComponent extends BaseDashboard implements OnInit {

  @ViewChild('dashboardNameInput') DashboardNameInput!: ElementRef<HTMLInputElement>

  /** @deprecated Use {@link DashboardNameInput}. */
  get dashboardNameInput(): ElementRef<HTMLInputElement> {
    return this.DashboardNameInput;
  }
  /** @deprecated Use {@link DashboardNameInput}. */
  set dashboardNameInput(value: ElementRef<HTMLInputElement>) {
    this.DashboardNameInput = value;
  }

  @Input() public ResourceData!: ResourceData;
  @Output() public DashboardSaved: EventEmitter<MJDashboardEntityExtended> = new EventEmitter<MJDashboardEntityExtended>();

  /**
   * @deprecated Use {@link DashboardSaved}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (dashboardSaved) keeps working. Must stay AFTER DashboardSaved: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public dashboardSaved = this.DashboardSaved;
  @Output() public loadComplete: EventEmitter<any> = new EventEmitter<any>();
  @Output() public loadStarted: EventEmitter<any> = new EventEmitter<any>();

  public Items: DashboardItem[] = [];

  /** @deprecated Use {@link Items}. */
  public get items(): DashboardItem[] {
    return this.Items;
  }
  /** @deprecated Use {@link Items}. */
  public set items(value: DashboardItem[]) {
    this.Items = value;
  }
  public DashboardEntity!: MJDashboardEntityExtended;

  /** @deprecated Use {@link DashboardEntity}. */
  public get dashboardEntity(): MJDashboardEntityExtended {
    return this.DashboardEntity;
  }
  /** @deprecated Use {@link DashboardEntity}. */
  public set dashboardEntity(value: MJDashboardEntityExtended) {
    this.DashboardEntity = value;
  }
  public config: DashboardConfigDetails = new DashboardConfigDetails();
  public IsItemDialogOpened: boolean = false;

  /** @deprecated Use {@link IsItemDialogOpened}. */
  public get isItemDialogOpened(): boolean {
    return this.IsItemDialogOpened;
  }
  /** @deprecated Use {@link IsItemDialogOpened}. */
  public set isItemDialogOpened(value: boolean) {
    this.IsItemDialogOpened = value;
  }
  public IsEditDialogOpened: boolean = false;

  /** @deprecated Use {@link IsEditDialogOpened}. */
  public get isEditDialogOpened(): boolean {
    return this.IsEditDialogOpened;
  }
  /** @deprecated Use {@link IsEditDialogOpened}. */
  public set isEditDialogOpened(value: boolean) {
    this.IsEditDialogOpened = value;
  }
  public IsEditDashboardNameDialogOpened: boolean = false;

  /** @deprecated Use {@link IsEditDashboardNameDialogOpened}. */
  public get isEditDashboardNameDialogOpened(): boolean {
    return this.IsEditDashboardNameDialogOpened;
  }
  /** @deprecated Use {@link IsEditDashboardNameDialogOpened}. */
  public set isEditDashboardNameDialogOpened(value: boolean) {
    this.IsEditDashboardNameDialogOpened = value;
  }
  public IsDeletingDashboardItem: boolean = false;

  /** @deprecated Use {@link IsDeletingDashboardItem}. */
  public get isDeletingDashboardItem(): boolean {
    return this.IsDeletingDashboardItem;
  }
  /** @deprecated Use {@link IsDeletingDashboardItem}. */
  public set isDeletingDashboardItem(value: boolean) {
    this.IsDeletingDashboardItem = value;
  }
  public AllowResize: boolean = false;

  /** @deprecated Use {@link AllowResize}. */
  public get allowResize(): boolean {
    return this.AllowResize;
  }
  /** @deprecated Use {@link AllowResize}. */
  public set allowResize(value: boolean) {
    this.AllowResize = value;
  }
  public AllowReorder: boolean = false;

  /** @deprecated Use {@link AllowReorder}. */
  public get allowReorder(): boolean {
    return this.AllowReorder;
  }
  /** @deprecated Use {@link AllowReorder}. */
  public set allowReorder(value: boolean) {
    this.AllowReorder = value;
  }
  public IsEditingDashboard: boolean = false;

  /** @deprecated Use {@link IsEditingDashboard}. */
  public get isEditingDashboard(): boolean {
    return this.IsEditingDashboard;
  }
  /** @deprecated Use {@link IsEditingDashboard}. */
  public set isEditingDashboard(value: boolean) {
    this.IsEditingDashboard = value;
  }
  public SelectedResource!: MJResourceTypeEntity | null;

  /** @deprecated Use {@link SelectedResource}. */
  public get selectedResource(): MJResourceTypeEntity | null {
    return this.SelectedResource;
  }
  /** @deprecated Use {@link SelectedResource}. */
  public set selectedResource(value: MJResourceTypeEntity | null) {
    this.SelectedResource = value;
  }
  public SelectedDashboardItem!: DashboardItem | null;

  /** @deprecated Use {@link SelectedDashboardItem}. */
  public get selectedDashboardItem(): DashboardItem | null {
    return this.SelectedDashboardItem;
  }
  /** @deprecated Use {@link SelectedDashboardItem}. */
  public set selectedDashboardItem(value: DashboardItem | null) {
    this.SelectedDashboardItem = value;
  }
  private saveChangesSubject: Subject<any> = new Subject();
  private editOnLoad: boolean = false;
  private recentAccessService: RecentAccessService;

  public get ContentLoading(): boolean {
    for (const item of this.Items) {
      if (item.contentLoading) {
        return true;
      }
    }
    return false;
  }

  /** @deprecated Use {@link ContentLoading}. */
  public get contentLoading(): boolean {
    return this.ContentLoading;
  }

  protected initDashboard(): void {
    
  }
  protected loadData(): void {
    
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return "Dashboard"
  }

  constructor(private route: ActivatedRoute, public SharedService: SharedService) {
    super();
    this.recentAccessService = new RecentAccessService();

    this.saveChangesSubject
    .pipe(debounceTime(500), takeUntil(this.destroy$))
    .subscribe(() => {
      this.SaveDashboard();
    });

    let edit = this.route.snapshot.queryParamMap.get('edit');
    if(edit){
      this.editOnLoad = true;
    }
  }

  /** @deprecated Use {@link SharedService}. */
  public get sharedService(): SharedService {
    return this.SharedService;
  }
  /** @deprecated Use {@link SharedService}. */
  public set sharedService(value: SharedService) {
    this.SharedService = value;
  }

  async ngOnInit(): Promise<void> {
    super.ngOnInit();
    // load up the dashboard
    const d = this.ResourceData;
    const config = this.ResourceData.Configuration;
    if (this.ResourceData) {
      const md = this.ProviderToUse;
      let uiConfig: any = {items:[]};
      this.DashboardEntity = await md.GetEntityObject<MJDashboardEntityExtended>('MJ: Dashboards');
      if (this.ResourceData.ResourceRecordID && this.ResourceData.ResourceRecordID.length > 0) {
        await this.DashboardEntity.Load(this.ResourceData.ResourceRecordID);
        // Log access to dashboard (fire-and-forget, don't await)
        this.recentAccessService.logAccess('Dashboards', this.ResourceData.ResourceRecordID, 'dashboard');

        // now we have loaded and we need to get the UIConfigDetails
        const raw = this.DashboardEntity.UIConfigDetails;
        if (raw) {
          uiConfig = JSON.parse(raw);
          this.config.columns = uiConfig.columns;
          this.config.rowHeight = uiConfig.rowHeight;
          this.config.resizable = uiConfig.resizable;
          this.config.reorderable = uiConfig.reorderable;
        }

        //the save and canel functions call this function
        //and we only want to show the edit view once
        if(this.editOnLoad){
          this.editOnLoad = false;
          this.ToggleEditDashboard(true);
        }
      }
      else {
        this.DashboardEntity.NewRecord(); // creating a new dashboard
        this.DashboardEntity.UserID = md.CurrentUser.ID;
        
        // We should never get here now because dashboard creation is handled in dashboard-browser
        // But just in case, set a better default name
        this.DashboardEntity.Name = 'My Dashboard';
        
        // Set default configuration
        this.config.columns = 4;  // 4-column layout
        this.config.rowHeight = 150;
        this.config.resizable = true;
        this.config.reorderable = true;
        
        // Automatically show edit mode for new dashboards to encourage adding items
        setTimeout(() => {
          this.ToggleEditDashboard(true);
        }, 500);
      }

      // now we need to load up the items
      this.Items = [];
      //const tempItems = uiConfig.items.sort((a: any, b: any) => a.order - b.order);
      for (const item of uiConfig.items) {
        const dashboardItem = this.CreateDashboardItem(item);
        this.Items.push(dashboardItem);
      }
    }

    this.NotifyLoadComplete();
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

  public LoadingStarted(resourceComponent: ResourceContainerComponent) {
    // look up the copmonent in the 
    const item = this.Items.find(i => i.ResourceData === resourceComponent.Data);
    if (item) {
      item.contentLoading = true;
      this.loadStarted.emit();
    }
  }

  /** @deprecated Use {@link LoadingStarted}. */
  public loadingStarted(resourceComponent: ResourceContainerComponent) {
    return this.LoadingStarted(resourceComponent);
  }

  public LoadingComplete(resourceComponent: ResourceContainerComponent) {
    // look up the copmonent in the 
    const item = this.Items.find(i => i.ResourceData === resourceComponent.Data);
    if (item) {
      item.contentLoading = false;
      if (!this.ContentLoading) {
        this.loadComplete.emit();
      }
    }
  }

  /** @deprecated Use {@link LoadingComplete}. */
  public loadingComplete(resourceComponent: ResourceContainerComponent) {
    return this.LoadingComplete(resourceComponent);
  }

  public AddItem(resourceType: any = null): void {
    this.SelectedResource = resourceType;
    this.IsItemDialogOpened = true;
    this.IsEditDialogOpened = false;
  }

  /** @deprecated Use {@link AddItem}. */
  public addItem(resourceType: any = null): void {
    return this.AddItem(resourceType);
  }

  public CloseDialog(data: any): void {
    if(data) {
      const dashboardItem = this.CreateDashboardItem(data);
      this.Items.push(dashboardItem);
      console.log(dashboardItem);
        this.saveChangesSubject.next(true);
    }
    this.SelectedResource = null;
    this.IsItemDialogOpened = false;
  }

  /** @deprecated Use {@link CloseDialog}. */
  public closeDialog(data: any): void {
    return this.CloseDialog(data);
  }

  public ToggleEditDashboard(allowEdit: boolean): void {
    this.AllowReorder = allowEdit;
    this.AllowResize = allowEdit;
    this.IsEditingDashboard = allowEdit;
    this.ToggleInlineNameEdit(false);
  }

  /** @deprecated Use {@link ToggleEditDashboard}. */
  public toggleEditDashboard(allowEdit: boolean): void {
    return this.ToggleEditDashboard(allowEdit);
  }

  public async OnClickSaveDashboard(): Promise<void> {
    this.ToggleEditDashboard(false);
    let result = await this.SaveDashboard();
    if(result){
      this.SharedService.CreateSimpleNotification("Dashboard changes have been saved.", "success", 1000);
      await this.ngOnInit();
    }
    else{
      this.SharedService.CreateSimpleNotification("An error occured saving the dashboard changes", "error", 1000);
    }
  }

  /** @deprecated Use {@link OnClickSaveDashboard}. */
  public async onClickSaveDashboard(): Promise<void> {
    return this.OnClickSaveDashboard();
  }

  public async OnclickCancelChanges(): Promise<void> {
    this.ToggleEditDashboard(false);
    await this.ngOnInit();
  }

  /** @deprecated Use {@link OnclickCancelChanges}. */
  public async onclickCancelChanges(): Promise<void> {
    return this.OnclickCancelChanges();
  }

  public CloseDashboardDialog(data: any = null){
    this.IsEditDialogOpened = false;
  }

  /** @deprecated Use {@link CloseDashboardDialog}. */
  public closeDashboardDialog(data: any = null) {
    return this.CloseDashboardDialog(data);
  }

  SaveChanges(data: any): void {
    if(data.config){
      this.config = data.config;
    }
    if(data.itemsChanged && data.items){
      this.Items = data.items;
      this.SharedService.InvokeManualResize();
    }
    this.SaveDashboard();
    this.CloseDashboardDialog();
  }

  /** @deprecated Use {@link SaveChanges}. */
  saveChanges(data: any): void {
    return this.SaveChanges(data);
  }

  public async SaveDashboard(): Promise<boolean> {
    if (this.DashboardEntity) {
      const configData = {
        columns: this.config.columns,
        rowHeight: this.config.rowHeight,
        resizable: this.config.resizable,
        reorderable: this.config.reorderable,
        items: this.Items
      }
      const configJSON = JSON.stringify(configData);
      this.DashboardEntity.UIConfigDetails = configJSON;
      const result = await this.DashboardEntity.Save();
      
      return result;
    }
    else  
      return false;
  }

  public DashboardSaveComplete(entity: MJDashboardEntityExtended): void {
    this.DashboardSaved.emit(entity);
  }

  /** @deprecated Use {@link DashboardSaveComplete}. */
  public dashboardSaveComplete(entity: MJDashboardEntityExtended): void {
    return this.DashboardSaveComplete(entity);
  }

  public ToggleInlineNameEdit(visible: boolean): void {
    this.IsEditDashboardNameDialogOpened = visible;
    if(this.IsEditDashboardNameDialogOpened){
      this.DashboardNameInput?.nativeElement?.focus();
    }
  }

  /** @deprecated Use {@link ToggleInlineNameEdit}. */
  public toggleInlineNameEdit(visible: boolean): void {
    return this.ToggleInlineNameEdit(visible);
  }

  public SaveDashboardName(): void {
    this.ToggleInlineNameEdit(true);
    const inputValue = this.DashboardNameInput.nativeElement.value;
    if(inputValue && inputValue.length > 3){
      this.DashboardEntity.Name = inputValue;
      this.SaveDashboard();
    }
    else {
      this.SharedService.CreateSimpleNotification('Invalid dashboard name: Must be at least 3 characters.','warning', 1000);
    }
  }

  /** @deprecated Use {@link SaveDashboardName}. */
  public saveDashboardName(): void {
    return this.SaveDashboardName();
  }

  public CancelNameChange(): void {
    this.ToggleInlineNameEdit(false);
  }

  /** @deprecated Use {@link CancelNameChange}. */
  public cancelNameChange(): void {
    return this.CancelNameChange();
  }

  public CloseDeleteItemComponent(): void {
    this.SelectedDashboardItem = null;
    this.IsDeletingDashboardItem = false;
  }

  /** @deprecated Use {@link CloseDeleteItemComponent}. */
  public closeDeleteItemComponent(): void {
    return this.CloseDeleteItemComponent();
  }

  public ShowConfirmDeleteDashboardItem(item: DashboardItem): void {
    this.SelectedDashboardItem = item;
    this.IsDeletingDashboardItem = true;
  }

  /** @deprecated Use {@link ShowConfirmDeleteDashboardItem}. */
  public showConfirmDeleteDashboardItem(item: DashboardItem): void {
    return this.ShowConfirmDeleteDashboardItem(item);
  }

  public async DeleteDashboardItem(item: DashboardItem): Promise<void> {
    this.Items = this.Items.filter(i => i.uniqueId != item.uniqueId);
    let result = await this.SaveDashboard();
    if(result){
      this.SharedService.CreateSimpleNotification(`Dashboard item ${item.uniqueId} deleted successfully`, "success", 1000);
    }
    else{
      this.SharedService.CreateSimpleNotification(`Unable to delete dashboard item ${item.uniqueId}`, "error", 1000);
    }
    this.SelectedDashboardItem = null;
    this.IsDeletingDashboardItem = false;
  }

  /** @deprecated Use {@link DeleteDashboardItem}. */
  public async deleteDashboardItem(item: DashboardItem): Promise<void> {
    return this.DeleteDashboardItem(item);
  }

  public GetIsEditingItemBodyStyle(): string {
    return this.IsEditingDashboard ? "bg-light-grey" : "";
  }

  /** @deprecated Use {@link GetIsEditingItemBodyStyle}. */
  public getIsEditingItemBodyStyle(): string {
    return this.GetIsEditingItemBodyStyle();
  }

  public GetIsEditingItemHeaderStyle(): string {
    return this.IsEditingDashboard ? "bg-dark-grey" : "bg-blue";
  }

  /** @deprecated Use {@link GetIsEditingItemHeaderStyle}. */
  public getIsEditingItemHeaderStyle(): string {
    return this.GetIsEditingItemHeaderStyle();
  }

  OnReorder(e: { oldIndex: number; newIndex: number; newCol?: number; newRow?: number; uniqueId?: number }): void {
    const item = e.uniqueId != null ? this.Items.find(i => i.uniqueId === e.uniqueId) : this.Items[e.oldIndex];
    if (item) {
      if (e.oldIndex !== e.newIndex) {
        this.Items.splice(e.oldIndex, 1);
        this.Items.splice(e.newIndex, 0, item);
      }
      item.col = e.newCol ?? item.col;
      item.row = e.newRow ?? item.row;
    }
  }

  /** @deprecated Use {@link OnReorder}. */
  onReorder(e: { oldIndex: number; newIndex: number; newCol?: number; newRow?: number; uniqueId?: number }): void {
    return this.OnReorder(e);
  }

  OnResize(e: { newColSpan: number; newRowSpan: number; uniqueId?: number }): void {
    const item = e.uniqueId != null ? this.Items.find(i => i.uniqueId === e.uniqueId) : undefined;
    if (item) {
      item.colSpan = e.newColSpan;
      item.rowSpan = e.newRowSpan;
    }
  }

  /** @deprecated Use {@link OnResize}. */
  onResize(e: { newColSpan: number; newRowSpan: number; uniqueId?: number }): void {
    return this.OnResize(e);
  }

  OnMouseEnter(e: MouseEvent): void {
    // Available for future drag-and-drop support
  }

  /** @deprecated Use {@link OnMouseEnter}. */
  onMouseEnter(e: MouseEvent): void {
    return this.OnMouseEnter(e);
  }

  OnMouseOut(e: MouseEvent): void {
    // Available for future drag-and-drop support
  }

  /** @deprecated Use {@link OnMouseOut}. */
  onMouseOut(e: MouseEvent): void {
    return this.OnMouseOut(e);
  }

  /**
   * Get the appropriate icon for a resource type
   * @param resourceType The type of resource
   * @returns FontAwesome icon class
   */
  GetResourceIcon(resourceType: string | undefined): string {
    // Default to a cube icon if type is undefined
    if (!resourceType) return 'fa-solid fa-cube';
    
    // Map resource types to appropriate FontAwesome icons
    const iconMap: {[key: string]: string} = {
      'UserViews': 'fa-solid fa-table',
      'Dashboards': 'fa-solid fa-grip',
      'Lists': 'fa-solid fa-list',
      'default': 'fa-solid fa-cube'
    };
    
    return iconMap[resourceType] || iconMap['default'];
  }

  /** @deprecated Use {@link GetResourceIcon}. */
  getResourceIcon(resourceType: string | undefined): string {
    return this.GetResourceIcon(resourceType);
  }
}

export class DashboardConfigDetails {
  columns: number = 4;
  rowHeight: number = 150;
  resizable: boolean = true;
  reorderable: boolean = true;
}

export class DashboardItem {
  private static nextUniqueId: number = 1;
  private getNextUniqueID(): number {
    return DashboardItem.nextUniqueId++;
  }
  constructor() {
    this.UniqueId = this.getNextUniqueID();
  }
  UniqueId!: number;

  /** @deprecated Use {@link UniqueId}. */
  get uniqueId(): number {
    return this.UniqueId;
  }
  /** @deprecated Use {@link UniqueId}. */
  set uniqueId(value: number) {
    this.UniqueId = value;
  }
  Title!: string;

  /** @deprecated Use {@link Title}. */
  get title(): string {
    return this.Title;
  }
  /** @deprecated Use {@link Title}. */
  set title(value: string) {
    this.Title = value;
  }
  Col!: number;

  /** @deprecated Use {@link Col}. */
  get col(): number {
    return this.Col;
  }
  /** @deprecated Use {@link Col}. */
  set col(value: number) {
    this.Col = value;
  }
  Row!: number;

  /** @deprecated Use {@link Row}. */
  get row(): number {
    return this.Row;
  }
  /** @deprecated Use {@link Row}. */
  set row(value: number) {
    this.Row = value;
  }
  RowSpan!: number;

  /** @deprecated Use {@link RowSpan}. */
  get rowSpan(): number {
    return this.RowSpan;
  }
  /** @deprecated Use {@link RowSpan}. */
  set rowSpan(value: number) {
    this.RowSpan = value;
  }
  ColSpan!: number;

  /** @deprecated Use {@link ColSpan}. */
  get colSpan(): number {
    return this.ColSpan;
  }
  /** @deprecated Use {@link ColSpan}. */
  set colSpan(value: number) {
    this.ColSpan = value;
  }
  Order!: number;

  /** @deprecated Use {@link Order}. */
  get order(): number {
    return this.Order;
  }
  /** @deprecated Use {@link Order}. */
  set order(value: number) {
    this.Order = value;
  }
  ResourceData!: ResourceData;
  ContentLoading: boolean = false;

  /** @deprecated Use {@link ContentLoading}. */
  get contentLoading(): boolean {
    return this.ContentLoading;
  }
  /** @deprecated Use {@link ContentLoading}. */
  set contentLoading(value: boolean) {
    this.ContentLoading = value;
  }
}