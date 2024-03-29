import { Component, EventEmitter, Input, OnInit, Output, input } from '@angular/core';
import { Router } from '@angular/router'
import { SharedService } from '@memberjunction/ng-shared';
import { Folder, Item, ItemType  } from '../../generic/Item.types';
import { BaseEntity, Metadata, PrimaryKeyValue, RunView } from '@memberjunction/core';
import { AfterAddFolderEvent, AfterAddItemEvent, AfterDeleteFolderEvent, AfterDeleteItemEvent, AfterUpdateFolderEvent, AfterUpdateItemEvent, BaseEvent, BeforeAddFolderEvent, BeforeAddItemEvent, BeforeDeleteFolderEvent, BeforeDeleteItemEvent, BeforeUpdateFolderEvent, BeforeUpdateItemEvent, EventTypes } from '../../generic/Events.types';
import { Subscription, Subject, debounceTime } from 'rxjs';
import { CellClickEvent } from '@progress/kendo-angular-grid';

@Component({
  selector: 'app-generic-browser-list',
  templateUrl: './generic-browser-list.component.html',
  styleUrls: ['./generic-browser-list.component.css', '../../shared/first-tab-styles.css']
})
export class GenericBrowserListComponent {
  @Input() public showLoader: boolean = true;
  @Input() public itemType: string = '';
  @Input() public title: string = '';
  @Input() public items: any[] = [];
  @Input() public iconName: string = 'view';
  @Input() public disableAddButton: boolean = false;
  @Input() public addText: string = 'Create New';
  @Input() public backText: string = 'Go Back';
  @Input() public ItemEntityName: string = '';
  @Input() public CategoryEntityName: string = '';
  @Input() public selectedFolderID: number | null = null;
  @Input() public showNotifications: boolean = true;
  @Input() public categoryEntityID: number | null = null;
  @Input() public displayAsGrid: boolean = false;
  /**
   * If we are viewing a reesource, such as dashboards, reports, queries, etc
   * then the UI will need to change abit to accomodate this like 
   * showing the name of the resouce as a header
   */
  @Input() public viewingResource: boolean = false;
  /**
   * Indicates if the items should be displayed as a list
   * or as a grid of icons
   */
  @Input() public displayItemsAsList: boolean = false;


  //Before Evewnts
  @Output() public BeforeAddFolderEvent: EventEmitter<BeforeAddFolderEvent> = new EventEmitter<BeforeAddFolderEvent>();
  @Output() public BeforeAddItemEvent: EventEmitter<BeforeAddItemEvent> = new EventEmitter<BeforeAddItemEvent>();
  @Output() public BeforeDeleteFolderEvent: EventEmitter<BeforeDeleteFolderEvent> = new EventEmitter<BeforeDeleteFolderEvent>();
  @Output() public BeforeDeleteItemEvent: EventEmitter<BeforeDeleteItemEvent> = new EventEmitter<BeforeDeleteItemEvent>();  
  @Output() public BeforeUpdateFolderEvent: EventEmitter<BeforeUpdateFolderEvent> = new EventEmitter<BeforeUpdateFolderEvent>();
  @Output() public BeforeUpdateItemEvent: EventEmitter<BeforeUpdateItemEvent> = new EventEmitter<BeforeUpdateItemEvent>();

  //After Events
  @Output() public AfterAddFolderEvent: EventEmitter<AfterAddFolderEvent> = new EventEmitter<AfterAddFolderEvent>();
  @Output() public AfterAddItemEvent: EventEmitter<AfterAddItemEvent> = new EventEmitter<AfterAddItemEvent>();
  @Output() public AfterDeleteFolderEvent: EventEmitter<AfterDeleteFolderEvent> = new EventEmitter<AfterDeleteFolderEvent>();
  @Output() public AfterDeleteItemEvent: EventEmitter<AfterDeleteItemEvent> = new EventEmitter<AfterDeleteItemEvent>();  
  @Output() public AfterUpdateFolderEvent: EventEmitter<AfterUpdateFolderEvent> = new EventEmitter<AfterUpdateFolderEvent>();
  @Output() public AfterUpdateItemEvent: EventEmitter<AfterUpdateItemEvent> = new EventEmitter<AfterUpdateItemEvent>();
  
  @Output() public itemClickEvent: EventEmitter<any> = new EventEmitter<any>();
  @Output() public backButtonClickEvent: EventEmitter<void> = new EventEmitter<void>();

  @Output() public viewModeChangeEvent: EventEmitter<'grid' | 'list'> = new EventEmitter<'grid' | 'list'>();

  private _resizeDebounceTime: number = 250;
  private _resizeEndDebounceTime: number = 500;
  private saveChangesSubject: Subject<any> = new Subject();
  private filter: string = '';
  private sourceItems: Item[] | null = null;

  data = [
    { text: "Folder" },
    { text: "Report with Skip" },
  ];

  constructor(public sharedService: SharedService, private router: Router) {
    this.router = router;

    this.saveChangesSubject
        .pipe(debounceTime(this._resizeDebounceTime))
        .subscribe(() => this.filterItems(this.filter));
  }

  //wrapper function for the grid view
  public onCellItemClicked(event: CellClickEvent): void {
    console.log("onCellItemClicked: ", event);
    this.itemClick(event.dataItem);
  }

  public itemClick(item: any): void {
    if (!item) {
      return;
    }

    this.itemClickEvent.emit(item);
  }

  public backButtonClicked(){
    this.backButtonClickEvent.emit();
  }

  //todo - show a modal asking the user for a name to give the resource
  public async addResourceButtonClicked() {

    const resourceName: string = "Sample";
    const md: Metadata = new Metadata();
    const entity: BaseEntity = await md.GetEntityObject<BaseEntity>(this.ItemEntityName);

    entity.NewRecord();
    entity.Set("Name", resourceName);

    let saveResult: boolean = await entity.Save();
    if(saveResult){
      this.showNotification(`successfully created ${resourceName}`, "info");

      let item: Item = new Item(entity, ItemType.Entity);
      item.Name = resourceName;
      this.AfterAddItemEvent.emit(new AfterAddItemEvent(item));
    }
    else{
      this.showNotification(`Unable to create folder ${resourceName}`, "error");
    }

  }

  //todo - show a modal asking the user for a name to give the folder
  public async createFolder(): Promise<void> {
    let event: BeforeAddFolderEvent = new BeforeAddFolderEvent("Sample Folder");
    if(event.Cancel){
    }

    let folderName: string = "Sample Folder " + this.ItemEntityName;
    let description: string = `Sub folder of ${(this.selectedFolderID ? this.selectedFolderID : "root")} inside ${this.ItemEntityName}`;
    
    const md: Metadata = new Metadata();
    const folderEntity: BaseEntity = await md.GetEntityObject<BaseEntity>(this.CategoryEntityName);

    folderEntity.NewRecord();
    folderEntity.Set("Name", folderName);
    folderEntity.Set("ParentID", this.selectedFolderID);
    folderEntity.Set("Description", description);
    
    if(this.categoryEntityID){
      folderEntity.Set("EntityID", this.categoryEntityID);
    }

    let saveResult: boolean = await folderEntity.Save();
    if(saveResult){
      this.showNotification(`successfully created folder ${folderName}`, "info");

      let folder: Folder = new Folder(folderEntity.Get("ID"), folderEntity.Get("Name"));
      folder.Description = folderEntity.Get("Description");

      let item: Item = new Item(folder, ItemType.Folder);
      this.AfterAddFolderEvent.emit(new AfterAddFolderEvent(item));
    }
    else{
      this.sharedService.CreateSimpleNotification(`Unable to create folder ${folderName}`, "error");
    }
  }

  public async deleteItem(item: Item){
    if(!item){
      return;
    }

    if(item.Type === ItemType.Folder){
      let event: BeforeDeleteFolderEvent = new BeforeDeleteFolderEvent(item);
      this.BeforeDeleteFolderEvent.emit(event);
      
      if(event.Cancel){
        return;
      }

      let deleteResult = await this.deleteFolder(item);
      if(deleteResult){
        let deleteFolderEvent: AfterDeleteFolderEvent = new AfterDeleteFolderEvent(item);
        this.AfterDeleteFolderEvent.emit(deleteFolderEvent);
      }

    }
    else if(item.Type === ItemType.Entity){
      let event: BeforeDeleteItemEvent = new BeforeDeleteItemEvent(item);
      this.BeforeDeleteItemEvent.emit(event);
      
      if(event.Cancel){
        return;
      }

      await this.deleteResource(item);
      let deleteItemEvent: AfterDeleteItemEvent = new AfterDeleteItemEvent(item);
      this.AfterDeleteItemEvent.emit(deleteItemEvent);
    }
  }

  private async deleteFolder(item: Item): Promise<boolean>{

    const folder: Folder = <Folder>item.Data;

    //the DB will throw an error if we attempt to delete a folder that has children
    //i.e. sub folders or resources
    //so the default behavior is to notify the user that the delete operation cannot
    //go through 
    const folderHasChildren: boolean = await this.doesFolderHaveChildren(folder.ID);
    if(folderHasChildren){
      this.showNotification(`unable to delete folder ${folder.Name} because it has children`, "error");
      return false;
    }

    this.showLoader = true;
    const md = new Metadata();
    let folderEntity: BaseEntity = await md.GetEntityObject<BaseEntity>(this.CategoryEntityName);
    let pkv: PrimaryKeyValue = new PrimaryKeyValue();
    pkv.FieldName = "ID";
    pkv.Value = folder.ID;
    //create view browser component - this will be used to display views
    //then create a new component for applications that wraps around the view browser component 
    let loadResult = await folderEntity.InnerLoad([pkv]);
    if(!loadResult){
      this.sharedService.CreateSimpleNotification(`unable to fetch folder ${folder.Name}`, "error");
      this.showLoader = false;
      return false;
    }

    let deleteResult = await folderEntity.Delete();
    if(!deleteResult){
      this.sharedService.CreateSimpleNotification(`unable to delete folder ${folder.Name}`, "error");
      this.showLoader = false;
      return false;
    }
    else{
      this.sharedService.CreateSimpleNotification(`successfully deleted folder ${folder.Name}`, "info");
      this.showLoader = false;
    }
    return true;
  }

  private async deleteResource(item: Item): Promise<boolean> {
    let genericEntity: BaseEntity = <BaseEntity>item.Data;

    if(!genericEntity){
      return false;
    }

    //the only assumption we are making here is that the entityID
    //is a number
    const entityID: number = this.TryGetID(genericEntity);
    if (entityID && entityID > 0) {
      
      const md = new Metadata();
      
      let entityObject = await md.GetEntityObject(this.ItemEntityName);
      let pkv: PrimaryKeyValue = new PrimaryKeyValue();
      pkv.FieldName = "ID";
      pkv.Value = entityID;
      let loadResult = await entityObject.InnerLoad([pkv]);

      if(loadResult){
        let deleteResult = await entityObject.Delete();
        if(deleteResult){
          this.showNotification(`successfully deleted dashboard`, "info");
          return true;
        }
        else{
          this.showNotification(`Unable to delete dashboard`, "error");
        }
      }
      else{
        this.showNotification(`unable to fetch dashboard`, "error");
      }
    }

    return false;
  }

  private async doesFolderHaveChildren(folderID: number): Promise<boolean>{
    const md: Metadata = new Metadata();
    const rv: RunView = new RunView();
    const folderResult = await rv.RunView({
      EntityName:this.CategoryEntityName,
      ExtraFilter: "ParentID = " + folderID
    });

    return folderResult && folderResult.Success && folderResult.Results.length > 0;
  }

  private showNotification(message: string, type: "none" | "success" | "error" | "warning" | "info" | undefined): void {
    if(this.showNotifications){
      this.sharedService.CreateSimpleNotification(message, type);
    }
  }

  private TryGetID(data: any): any{
    if(data && data.ID){
        return data.ID;
    }
    else if(typeof data.Get === "function"){
        return data.Get("ID");
    }
  }

  public changeViewMode(mode: 'grid' | 'list'){
    this.displayAsGrid = mode === 'grid';
    this.viewModeChangeEvent.emit(mode);
  }

  public onKeyup(Value: any): void {
    this.filter = Value;
    this.saveChangesSubject.next(true);
  }

  private filterItems(filter: string): void {
    console.log("filtering items");

    if(!this.sourceItems){
      this.sourceItems = [...this.items];
    }

    if (!filter) {
      this.items = [...this.sourceItems];
      return;
    }

    this.items = this.sourceItems.filter(item => {
      return item.Name.toLowerCase().includes(filter.toLowerCase());
    });
  }

  public async SetFavoriteStatus(item: any) {
    if(!item){
      return;
    }

    console.log("????");
    console.log(item);
    console.log("setting favorite status for item: ", item.Name);
    item.Favorite = !item.Favorite;
    const md: Metadata = new Metadata();
    let entityName: string = item.Type === ItemType.Folder ? this.CategoryEntityName : this.ItemEntityName;
    let pkv: PrimaryKeyValue[] = [{FieldName: "ID", Value: item.Data.ID}];
    await md.SetRecordFavoriteStatus(md.CurrentUser.ID, entityName, pkv, item.Favorite);
    console.log("favorite status set for item: ", item.Favorite);
  }

  public editItem(item: Item): void {
    if(!item){
      return;
    }

    console.log("on edit item clicked: ", item.Name);

    if(item.Type === ItemType.Folder){
      let event: BeforeUpdateFolderEvent = new BeforeUpdateFolderEvent(item);
      this.BeforeUpdateFolderEvent.emit(event);
      
      if(event.Cancel){
        return;
      }
    }
    else{
      let event: BeforeUpdateItemEvent = new BeforeUpdateItemEvent(item);
      this.BeforeUpdateItemEvent.emit(event);
      
      if(event.Cancel){
        return;
      }
    }
  }

  public async onDropdownItemClick(data: {text: string}): Promise<void>{
    console.log("onDropdownItemClick: ", data.text);

    if(data.text === "Folder"){
      await this.createFolder();
    }
  }
}
