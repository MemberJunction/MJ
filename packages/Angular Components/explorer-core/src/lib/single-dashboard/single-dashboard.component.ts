import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ResourceData } from '../generic/base-resource-component';
import { DashboardEntity, ResourceTypeEntity } from '@memberjunction/core-entities';
import { Metadata } from '@memberjunction/core';
import { SharedService } from '../shared/shared.service';
import { ResourceContainerComponent } from '../generic/resource-container-component';
import { Subject, debounceTime } from 'rxjs';

@Component({
  selector: 'app-single-dashboard',
  templateUrl: './single-dashboard.component.html',
  styleUrls: ['./single-dashboard.component.css']
})
export class SingleDashboardComponent implements OnInit {
  @Input() public ResourceData!: ResourceData;
  @Output() public dashboardSaved: EventEmitter<DashboardEntity> = new EventEmitter<DashboardEntity>();
  @Output() public loadComplete: EventEmitter<any> = new EventEmitter<any>();
  @Output() public loadStarted: EventEmitter<any> = new EventEmitter<any>();

  public items: DashboardItem[] = [];
  public dashboardEntity!: DashboardEntity;
  public config: DashboardConfigDetails = new DashboardConfigDetails();
  public isItemDialogOpened: boolean = false;
  public isEditDialogOpened: boolean = false;
  public selectedResource!: ResourceTypeEntity | null;
  private saveChangesSubject: Subject<any> = new Subject();

  public get contentLoading(): boolean {
    for (const item of this.items) {
      if (item.contentLoading) {
        return true;
      }
    }
    return false;
  }

  constructor(private sharedService: SharedService) {
    this.saveChangesSubject
    .pipe(debounceTime(500))
    .subscribe(() => {
      this.SaveDashboard();
    });
  }

  async ngOnInit(): Promise<void> {
    // load up the dashboard
    const d = this.ResourceData;
    const config = this.ResourceData.Configuration;
    if (this.ResourceData) {
      const md = new Metadata();
      let uiConfig: any = {items:[]};
      this.dashboardEntity = <DashboardEntity>await md.GetEntityObject('Dashboards');
      if (this.ResourceData.ResourceRecordID && this.ResourceData.ResourceRecordID > 0) {
        await this.dashboardEntity.Load(this.ResourceData.ResourceRecordID);
        // now we have loaded and we need to get the UIConfigDetails
        const raw = this.dashboardEntity.UIConfigDetails;
        if (raw) {
          uiConfig = JSON.parse(raw);
          this.config.columns = uiConfig.columns;
          this.config.rowHeight = uiConfig.rowHeight;
          this.config.resizable = uiConfig.resizable;
          this.config.reorderable = uiConfig.reorderable;
        }
      }
      else {
        this.dashboardEntity.NewRecord(); // creating a new dashboard
        this.dashboardEntity.UserID = md.CurrentUser.ID;
        this.dashboardEntity.Name = 'New Dashboard';
        this.config.columns = this.config.columns || this.config.columns;
        this.config.rowHeight = this.config.rowHeight || this.config.rowHeight;
        this.config.resizable = this.config.resizable || this.config.resizable;
        this.config.reorderable = this.config.reorderable || this.config.reorderable;
      }

      // now we need to load up the items
      this.items = [];
      //const tempItems = uiConfig.items.sort((a: any, b: any) => a.order - b.order);
      for (const item of uiConfig.items) {
        const dashboardItem = this.CreateDashboardItem(item);
        this.items.push(dashboardItem);
      }
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
        this.saveChangesSubject.next(true);
    }
    this.selectedResource = null;
    this.isItemDialogOpened = false;
  }

  public editDashboard(): void {
    this.isEditDialogOpened = true;
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
      this.dashboardSaved.emit(this.dashboardEntity);
      return result;
    }
    else  
      return false;
  }

  public dashboardSaveComplete(entity: DashboardEntity): void {
    this.dashboardSaved.emit(entity);
  }


  // onReorder(e: TileLayoutReorderEvent): void {
  //   const item = this.items.find(i => i.uniqueId === parseInt(e.item.elem.nativeElement.id));
  //   if (item) {
  //     // move the item in our config state to the new index
  //     if (e.oldIndex !== e.newIndex) {
  //       this.items.splice(e.oldIndex, 1);
  //       this.items.splice(e.newIndex, 0, item);  
  //     }
  //     //item.order = e.item.order;
  //     item.col = e.newCol ? e.newCol : item.col;
  //     item.row = e.newRow ? e.newRow : item.row;
  //   }
  // }
  
  // onResize(e: TileLayoutResizeEvent): void {
  //   const item = this.items.find(i => i.uniqueId === parseInt(e.item.elem.nativeElement.id));
  //   if (item) {      
  //     item.colSpan = e.newColSpan;
  //     item.rowSpan = e.newRowSpan;
  //   }
  // }
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