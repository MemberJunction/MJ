import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { TileLayoutReorderEvent, TileLayoutResizeEvent } from "@progress/kendo-angular-layout";
import { ResourceData } from '@memberjunction/core-entities';
import { DashboardEntityExtended, ResourceTypeEntity } from '@memberjunction/core-entities';
import { Metadata } from '@memberjunction/core';
import { SharedService, RecentAccessService } from '@memberjunction/ng-shared';
import { ResourceContainerComponent } from '../generic/resource-container-component';
import { Subject, debounceTime } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { BaseDashboard } from '@memberjunction/ng-shared';

@Component({
  standalone: false,
  selector: 'mj-single-dashboard',
  templateUrl: './single-dashboard.component.html',
  styleUrls: ['./single-dashboard.component.css']
})
export class SingleDashboardComponent extends BaseDashboard implements OnInit {

  @ViewChild('dashboardNameInput') dashboardNameInput!: ElementRef<HTMLInputElement>

  @Input() public ResourceData!: ResourceData;
  @Output() public dashboardSaved: EventEmitter<DashboardEntityExtended> = new EventEmitter<DashboardEntityExtended>();
  @Output() public loadComplete: EventEmitter<any> = new EventEmitter<any>();
  @Output() public loadStarted: EventEmitter<any> = new EventEmitter<any>();

  public items: DashboardItem[] = [];
  public dashboardEntity!: DashboardEntityExtended;
  public config: DashboardConfigDetails = new DashboardConfigDetails();
  public isItemDialogOpened: boolean = false;
  public isEditDialogOpened: boolean = false;
  public isEditDashboardNameDialogOpened: boolean = false;
  public isDeletingDashboardItem: boolean = false;
  public allowResize: boolean = false;
  public allowReorder: boolean = false;
  public isEditingDashboard: boolean = false;
  public selectedResource!: ResourceTypeEntity | null;
  public selectedDashboardItem!: DashboardItem | null;
  private saveChangesSubject: Subject<any> = new Subject();
  private selectedComponent: SingleDashboardComponent | null = null;
  private editOnLoad: boolean = false;
  private recentAccessService: RecentAccessService;

  public get contentLoading(): boolean {
    for (const item of this.items) {
      if (item.contentLoading) {
        return true;
      }
    }
    return false;
  }

  protected initDashboard(): void {
    
  }
  protected loadData(): void {
    
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return "Dashboard"
  }

  constructor(private route: ActivatedRoute, public sharedService: SharedService) {
    super();
    this.recentAccessService = new RecentAccessService();

    this.saveChangesSubject
    .pipe(debounceTime(500))
    .subscribe(() => {
      this.SaveDashboard();
    });

    let edit = this.route.snapshot.queryParamMap.get('edit');
    if(edit){
      this.editOnLoad = true;
    }
  }

  async ngOnInit(): Promise<void> {
    // load up the dashboard
    const d = this.ResourceData;
    const config = this.ResourceData.Configuration;
    if (this.ResourceData) {
      const md = new Metadata();
      let uiConfig: any = {items:[]};
      this.dashboardEntity = await md.GetEntityObject<DashboardEntityExtended>('Dashboards');
      if (this.ResourceData.ResourceRecordID && this.ResourceData.ResourceRecordID.length > 0) {
        await this.dashboardEntity.Load(this.ResourceData.ResourceRecordID);
        // Log access to dashboard (fire-and-forget, don't await)
        this.recentAccessService.logAccess('Dashboards', this.ResourceData.ResourceRecordID, 'dashboard');

        // now we have loaded and we need to get the UIConfigDetails
        const raw = this.dashboardEntity.UIConfigDetails;
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
          this.toggleEditDashboard(true);
        }
      }
      else {
        this.dashboardEntity.NewRecord(); // creating a new dashboard
        this.dashboardEntity.UserID = md.CurrentUser.ID;
        
        // We should never get here now because dashboard creation is handled in dashboard-browser
        // But just in case, set a better default name
        this.dashboardEntity.Name = 'My Dashboard';
        
        // Set default configuration
        this.config.columns = 4;  // 4-column layout
        this.config.rowHeight = 150;
        this.config.resizable = true;
        this.config.reorderable = true;
        
        // Automatically show edit mode for new dashboards to encourage adding items
        setTimeout(() => {
          this.toggleEditDashboard(true);
        }, 500);
      }

      // now we need to load up the items
      this.items = [];
      //const tempItems = uiConfig.items.sort((a: any, b: any) => a.order - b.order);
      for (const item of uiConfig.items) {
        const dashboardItem = this.CreateDashboardItem(item);
        this.items.push(dashboardItem);
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

  public loadingStarted(resourceComponent: ResourceContainerComponent) {
    // look up the copmonent in the 
    const item = this.items.find(i => i.ResourceData === resourceComponent.Data);
    if (item) {
      item.contentLoading = true;
      this.loadStarted.emit();
    }
  }

  public loadingComplete(resourceComponent: ResourceContainerComponent) {
    // look up the copmonent in the 
    const item = this.items.find(i => i.ResourceData === resourceComponent.Data);
    if (item) {
      item.contentLoading = false;
      if (!this.contentLoading) {
        this.loadComplete.emit();
      }
    }
  }

  public addItem(resourceType: any = null): void {
    this.selectedResource = resourceType;
    this.isItemDialogOpened = true;
    this.isEditDialogOpened = false;
  }

  public closeDialog(data: any): void {
    if(data) {
      const dashboardItem = this.CreateDashboardItem(data);
      this.items.push(dashboardItem);
      console.log(dashboardItem);
        this.saveChangesSubject.next(true);
    }
    this.selectedResource = null;
    this.isItemDialogOpened = false;
  }

  public toggleEditDashboard(allowEdit: boolean): void {
    this.allowReorder = allowEdit;
    this.allowResize = allowEdit;
    this.isEditingDashboard = allowEdit;
    this.toggleInlineNameEdit(false);
  }

  public async onClickSaveDashboard(): Promise<void> {
    this.toggleEditDashboard(false);
    let result = await this.SaveDashboard();
    if(result){
      this.sharedService.CreateSimpleNotification("Dashboard changes have been saved.", "success", 1000);
      await this.ngOnInit();
    }
    else{
      this.sharedService.CreateSimpleNotification("An error occured saving the dashboard changes", "error", 1000);
    }
  }

  public async onclickCancelChanges(): Promise<void> {
    this.toggleEditDashboard(false);
    await this.ngOnInit();
  }

  public closeDashboardDialog(data: any = null){
    this.isEditDialogOpened = false;
  }

  saveChanges(data: any): void {
    if(data.config){
      this.config = data.config;
    }
    if(data.itemsChanged && data.items){
      this.items = data.items;
      this.sharedService.InvokeManualResize();
    }
    this.SaveDashboard();
    this.closeDashboardDialog();
  }

  public async SaveDashboard(): Promise<boolean> {
    if (this.dashboardEntity) {
      const configData = {
        columns: this.config.columns,
        rowHeight: this.config.rowHeight,
        resizable: this.config.resizable,
        reorderable: this.config.reorderable,
        items: this.items
      }
      const configJSON = JSON.stringify(configData);
      this.dashboardEntity.UIConfigDetails = configJSON;
      const result = await this.dashboardEntity.Save();
      
      return result;
    }
    else  
      return false;
  }

  public dashboardSaveComplete(entity: DashboardEntityExtended): void {
    this.dashboardSaved.emit(entity);
  }

  public toggleInlineNameEdit(visible: boolean): void {
    this.isEditDashboardNameDialogOpened = visible;
    if(this.isEditDashboardNameDialogOpened){
      this.dashboardNameInput?.nativeElement?.focus();
    }
  }

  public saveDashboardName(): void {
    this.toggleInlineNameEdit(true);
    const inputValue = this.dashboardNameInput.nativeElement.value;
    if(inputValue && inputValue.length > 3){
      this.dashboardEntity.Name = inputValue;
      this.SaveDashboard();
    }
    else {
      this.sharedService.CreateSimpleNotification('Invalid dashboard name: Must be at least 3 characters.','warning', 1000);
    }
  }

  public cancelNameChange(): void {
    this.toggleInlineNameEdit(false);
  }

  public closeDeleteItemComponent(): void {
    this.selectedDashboardItem = null;
    this.isDeletingDashboardItem = false;
  }

  public showConfirmDeleteDashboardItem(item: DashboardItem): void {
    this.selectedDashboardItem = item;
    this.isDeletingDashboardItem = true;
  }

  public async deleteDashboardItem(item: DashboardItem): Promise<void> {
    this.items = this.items.filter(i => i.uniqueId != item.uniqueId);
    let result = await this.SaveDashboard();
    if(result){
      this.sharedService.CreateSimpleNotification(`Dashboard item ${item.uniqueId} deleted successfully`, "success", 1000);
    }
    else{
      this.sharedService.CreateSimpleNotification(`Unable to delete dashboard item ${item.uniqueId}`, "error", 1000);
    }
    this.selectedDashboardItem = null;
    this.isDeletingDashboardItem = false;
  }

  public getIsEditingItemBodyStyle(): string {
    return this.isEditingDashboard ? "bg-light-grey" : "";
  }

  public getIsEditingItemHeaderStyle(): string {
    return this.isEditingDashboard ? "bg-dark-grey" : "bg-blue";
  }

  onReorder(e: TileLayoutReorderEvent): void {
    const item = this.items.find(i => i.uniqueId === parseInt(e.item.elem.nativeElement.id));
    if (item) {
      // move the item in our config state to the new index
      if (e.oldIndex !== e.newIndex) {
        this.items.splice(e.oldIndex, 1);
        this.items.splice(e.newIndex, 0, item);  
      }
      //item.order = e.item.order;
      item.col = e.newCol ? e.newCol : item.col;
      item.row = e.newRow ? e.newRow : item.row;
    }
  }
  
  onResize(e: TileLayoutResizeEvent): void {
    const item = this.items.find(i => i.uniqueId === parseInt(e.item.elem.nativeElement.id));
    if (item) {      
      item.colSpan = e.newColSpan;
      item.rowSpan = e.newRowSpan;
    }
  }

  onMouseEnter(e: MouseEvent): void {
    this.selectedComponent = <SingleDashboardComponent>(e.target as any);
  }

  onMouseOut(e: MouseEvent): void {
    this.selectedComponent = null;
  }

  //Apply this style to the component we're hovering over
  //so that it is not offset by a wide margin when we click/drag it
  //https://github.com/telerik/kendo-angular/issues/3492
  getSelectedComponentStyle(component: SingleDashboardComponent): string {
    return this.selectedComponent === component ? "position: unset" : "";
  }

  /**
   * Get the appropriate icon for a resource type
   * @param resourceType The type of resource
   * @returns FontAwesome icon class
   */
  getResourceIcon(resourceType: string | undefined): string {
    // Default to a cube icon if type is undefined
    if (!resourceType) return 'fa-solid fa-cube';
    
    // Map resource types to appropriate FontAwesome icons
    const iconMap: {[key: string]: string} = {
      'Reports': 'fa-solid fa-chart-line',
      'UserViews': 'fa-solid fa-table',
      'Dashboards': 'fa-solid fa-grip',
      'Lists': 'fa-solid fa-list',
      'default': 'fa-solid fa-cube'
    };
    
    return iconMap[resourceType] || iconMap['default'];
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
    this.uniqueId = this.getNextUniqueID();
  }
  uniqueId!: number;
  title!: string;
  col!: number;
  row!: number;
  rowSpan!: number;
  colSpan!: number;
  order!: number;
  ResourceData!: ResourceData;
  contentLoading: boolean = false;
}