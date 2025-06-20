import { Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { SharedService } from '@memberjunction/ng-shared';
import { Folder, Item, ItemType  } from '../../generic/Item.types';
import { BaseEntity, Metadata, KeyValuePair, RunView, CompositeKey, EntityInfo } from '@memberjunction/core';
import { AfterAddFolderEvent, AfterAddItemEvent, AfterDeleteFolderEvent, AfterDeleteItemEvent, AfterUnlinkItemEvent, AfterUpdateFolderEvent, AfterUpdateItemEvent, BaseEvent, BeforeAddFolderEvent, BeforeAddItemEvent, BeforeDeleteFolderEvent, BeforeDeleteItemEvent, BeforeUnlinkItemEvent, BeforeUpdateFolderEvent, BeforeUpdateItemEvent, DropdownOptionClickEvent, EventTypes } from '../../generic/Events.types';
import { Subject, debounceTime } from 'rxjs';
import { CellClickEvent } from '@progress/kendo-angular-grid';
import { ResourceLinkEntity, ResourceTypeEntity } from '@memberjunction/core-entities';
import { EntityFormDialogComponent } from '@memberjunction/ng-entity-form-dialog';

@Component({
  selector: 'app-generic-browser-list',
  templateUrl: './generic-browser-list.component.html',
  styleUrls: ['./generic-browser-list.component.css', '../../shared/first-tab-styles.css']
})
export class GenericBrowserListComponent implements OnInit{
  @ViewChild('entityFormDialog') entityFormDialogRef: EntityFormDialogComponent | undefined;

  @Input() public showLoader: boolean = true;
  @Input() public itemType: string = '';
  @Input() public title: string | undefined = '';
  @Input() public items: Item[] = [];
  @Input() public iconName: string = 'view';
  @Input() public disableEditButton: boolean = false;
  @Input() public addText: string = 'Create New';
  @Input() public backText: string = 'Go Back';
  @Input() public ItemEntityName: string = '';
  @Input() public CategoryEntityName: string = '';
  @Input() public selectedFolderID: string | null = null;
  @Input() public showNotifications: boolean = true;
  @Input() public categoryEntityID: string | null = null;
  @Input() public displayAsGrid: boolean = false;
  @Input() public resourceName: string = "Resource";
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
  @Input() public extraDropdownOptions: { text: string }[] = [];


  //Before Evewnts
  @Output() public BeforeAddFolderEvent: EventEmitter<BeforeAddFolderEvent> = new EventEmitter<BeforeAddFolderEvent>();
  @Output() public BeforeAddItemEvent: EventEmitter<BeforeAddItemEvent> = new EventEmitter<BeforeAddItemEvent>();
  @Output() public BeforeDeleteFolderEvent: EventEmitter<BeforeDeleteFolderEvent> = new EventEmitter<BeforeDeleteFolderEvent>();
  @Output() public BeforeDeleteItemEvent: EventEmitter<BeforeDeleteItemEvent> = new EventEmitter<BeforeDeleteItemEvent>();  
  @Output() public BeforeUnlinkItemEvent: EventEmitter<BeforeUnlinkItemEvent> = new EventEmitter<BeforeUnlinkItemEvent>();  
  @Output() public BeforeUpdateFolderEvent: EventEmitter<BeforeUpdateFolderEvent> = new EventEmitter<BeforeUpdateFolderEvent>();
  @Output() public BeforeUpdateItemEvent: EventEmitter<BeforeUpdateItemEvent> = new EventEmitter<BeforeUpdateItemEvent>();

  //After Events
  @Output() public AfterAddFolderEvent: EventEmitter<AfterAddFolderEvent> = new EventEmitter<AfterAddFolderEvent>();
  @Output() public AfterAddItemEvent: EventEmitter<AfterAddItemEvent> = new EventEmitter<AfterAddItemEvent>();
  @Output() public AfterDeleteFolderEvent: EventEmitter<AfterDeleteFolderEvent> = new EventEmitter<AfterDeleteFolderEvent>();
  @Output() public AfterDeleteItemEvent: EventEmitter<AfterDeleteItemEvent> = new EventEmitter<AfterDeleteItemEvent>();  
  @Output() public AfterUnlinkItemEvent: EventEmitter<AfterUnlinkItemEvent> = new EventEmitter<AfterUnlinkItemEvent>();  
  @Output() public AfterUpdateFolderEvent: EventEmitter<AfterUpdateFolderEvent> = new EventEmitter<AfterUpdateFolderEvent>();
  @Output() public AfterUpdateItemEvent: EventEmitter<AfterUpdateItemEvent> = new EventEmitter<AfterUpdateItemEvent>();

  @Output() public NavigateToParentEvent: EventEmitter<void> = new EventEmitter<void>();  
  
  @Output() public itemClickEvent: EventEmitter<any> = new EventEmitter<any>();
  @Output() public backButtonClickEvent: EventEmitter<void> = new EventEmitter<void>();
  @Output() public dropdownOptionClickEvent: EventEmitter<DropdownOptionClickEvent> = new EventEmitter<DropdownOptionClickEvent>();
  @Output() public viewModeChangeEvent: EventEmitter<'grid' | 'list'> = new EventEmitter<'grid' | 'list'>();

  private _resizeDebounceTime: number = 250;
  private _resizeEndDebounceTime: number = 500;
  private filterItemsSubject: Subject<any> = new Subject();
  private filter: string = '';
  private sourceItems: Item[] | null = null;
  public selectedItem: Item | null = null;
  public deleteDialogOpened: boolean = false;
  public copyFromDialogOpened: boolean = false;
  public createFolderDialogOpened: boolean = false;
  private newFolderText: string = "Sample Folder";
  private resourceTypes: ResourceTypeEntity[] = [];
  private createNewRecordName: string = "Record";

  public entityObjectName: string = "";

  /**
   * Options for the create button dropdown
   */
  public dropdownOptions = [
    { text: "Folder" }
  ];

  constructor(public sharedService: SharedService) {
    this.filterItemsSubject
        .pipe(debounceTime(this._resizeDebounceTime))
        .subscribe(() => this.filterItems(this.filter));
  }

  public async ngOnInit(): Promise<void> {
    const md: Metadata = new Metadata();
    if(this.extraDropdownOptions && this.extraDropdownOptions.length > 0){
      this.dropdownOptions.push(...this.extraDropdownOptions);
    }

    const view = new RunView();
    
    this.resourceTypes = SharedService.Instance.ResourceTypes;
  }
  

  //wrapper function for the grid view
  public onCellItemClicked(event: CellClickEvent): void {
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

  public async addResourceButtonClicked() {

    let event: BeforeAddItemEvent = new BeforeAddItemEvent("");
    this.BeforeAddItemEvent.emit(event);
    if(event.Cancel){
      return;
    }

    const resourceName: string = `Sample ${this.ItemEntityName}`;
    const md: Metadata = new Metadata();
    const entity: BaseEntity = await md.GetEntityObject<BaseEntity>(this.ItemEntityName);

    entity.NewRecord();
    //some entities, like resources, have common fields 
    //we can try to set here
    entity.Set("Name", resourceName);
    entity.Set("UserID", md.CurrentUser.ID);

    let saveResult: boolean = await entity.Save();
    if(saveResult){
      this.showNotification(`successfully created ${resourceName}`, "info");

      let item: Item = new Item(entity, ItemType.Resource);
      item.Name = resourceName;
      this.AfterAddItemEvent.emit(new AfterAddItemEvent(item));
    }
    else{
      this.showNotification(`Unable to create ${resourceName}`, "error");
    }

  }

  public async createFolder(): Promise<void> {
    this.toggleCreateFolderView(false);

    let event: BeforeAddFolderEvent = new BeforeAddFolderEvent(this.newFolderText);
    if(event.Cancel){
      return;
    }

    let folderName: string = this.newFolderText;
    let description: string = "";
    
    const md: Metadata = new Metadata();
    const folderEntity: BaseEntity = await md.GetEntityObject<BaseEntity>(this.CategoryEntityName);

    folderEntity.NewRecord();
    folderEntity.Set("Name", folderName);
    folderEntity.Set("ParentID", this.selectedFolderID);
    folderEntity.Set("Description", description);
    folderEntity.Set("UserID", md.CurrentUser.ID);
    
    if(this.categoryEntityID){
      folderEntity.Set("EntityID", this.categoryEntityID);
    }

    let saveResult: boolean = await folderEntity.Save();
    if(saveResult){
      this.showNotification(`successfully created folder ${folderName}`, "info");

      let folder: Folder = new Folder(folderEntity.Get("ID"), folderEntity.Get("Name"));
      folder.Description = folderEntity.Get("Description");

      let item: Item = new Item(folder, ItemType.Folder);
      let event: AfterAddFolderEvent = new AfterAddFolderEvent(item);
      this.AfterAddFolderEvent.emit(event);

      if(event.Cancel){
        return;
      }

      //navigate to the newly created folder
      //by raising an item click event
      this.itemClick(item);
    }
    else{
      this.sharedService.CreateSimpleNotification(`Unable to create folder ${folderName}`, "error", 3500);
    }
    this.newFolderText = "Sample Folder";
  }

  public async unlinkItem(item: Item){
    await this.deleteOrUnlink(item, false);
  }

  private _currentDeleteOrUnlinkState: boolean = false;
  public async deleteOrUnlink(item: Item, bDelete: boolean){
    this._currentDeleteOrUnlinkState = bDelete;
    if(!item){
      return;
    }

    this.selectedItem = item;

    if(item.Type === ItemType.Folder && bDelete){
      let event: BeforeDeleteFolderEvent = new BeforeDeleteFolderEvent(item);
      this.BeforeDeleteFolderEvent.emit(event);
      
      if(event.Cancel){
        return;
      }

      this.deleteDialogOpened = true;
    }
    else if(item.Type === ItemType.Resource && bDelete){
      let event: BeforeDeleteItemEvent = new BeforeDeleteItemEvent(item);
      this.BeforeDeleteItemEvent.emit(event);
      
      if(event.Cancel){
        return;
      }

      this.deleteDialogOpened = true;
    }
    else if (item.Type === ItemType.Resource && !bDelete) {
      let event: BeforeUnlinkItemEvent = new BeforeUnlinkItemEvent(item);
      this.BeforeUnlinkItemEvent.emit(event);
      
      if(event.Cancel){
        return;
      }

      this.deleteDialogOpened = true;
    }  
  }

  public goToParent() {
    this.NavigateToParentEvent.emit();
  }

  public async deleteItem(item: Item) {
    await this.deleteOrUnlink(item, true);
  }

  public async onConfirmDeleteItem(shouldDelete: boolean): Promise<void> {
    this.deleteDialogOpened = false;
    
    if(!this.selectedItem || !shouldDelete){
      return;
    }
    
    let item: Item = this.selectedItem;

    if(item.Type === ItemType.Folder && this._currentDeleteOrUnlinkState){
      let deleteResult = await this.deleteFolder(item);
      if(deleteResult){
        let deleteFolderEvent: AfterDeleteFolderEvent = new AfterDeleteFolderEvent(item);
        this.AfterDeleteFolderEvent.emit(deleteFolderEvent);
      }

    }
    else if(item.Type === ItemType.Resource && this._currentDeleteOrUnlinkState){
      await this.deleteResource(item);
      let deleteItemEvent: AfterDeleteItemEvent = new AfterDeleteItemEvent(item);
      this.AfterDeleteItemEvent.emit(deleteItemEvent);
    }
    else if(item.Type === ItemType.Resource && !this._currentDeleteOrUnlinkState){
      await this.unlinkResource(item);
      let unlinkItemEvent: AfterUnlinkItemEvent = new AfterUnlinkItemEvent(item);
      this.AfterUnlinkItemEvent.emit(unlinkItemEvent);
    }

    this.selectedItem = null;
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
    let pkv: KeyValuePair = new KeyValuePair();
    pkv.FieldName = "ID";
    pkv.Value = folder.ID;
    let compositeKey: CompositeKey = new CompositeKey([pkv]);
    //create view browser component - this will be used to display views
    //then create a new component for applications that wraps around the view browser component 
    let loadResult = await folderEntity.InnerLoad(compositeKey);
    if(!loadResult){
      this.sharedService.CreateSimpleNotification(`Unable to fetch folder ${folder.Name}`, "error", 3500);
      this.showLoader = false;
      return false;
    }

    let deleteResult = await folderEntity.Delete();
    if(!deleteResult){
      this.sharedService.CreateSimpleNotification(`Unable to delete folder ${folder.Name}`, "error", 3500);
      this.showLoader = false;
      return false;
    }
    else{
      this.sharedService.CreateSimpleNotification(`Successfully deleted folder ${folder.Name}`, "info", 2000);
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
    const entityID = this.TryGetID(genericEntity);
    if (entityID && entityID.length > 0) {
      
      const md = new Metadata();
      
      let entityObject = await md.GetEntityObject(this.ItemEntityName);
      let pkv: KeyValuePair = new KeyValuePair();
      pkv.FieldName = "ID";
      pkv.Value = entityID;
      let compositeKey: CompositeKey = new CompositeKey([pkv]);
      let loadResult = await entityObject.InnerLoad(compositeKey);

      if(loadResult){
        let deleteResult = await entityObject.Delete();
        if(deleteResult){
          this.showNotification(`successfully deleted`, "info");
          return true;
        }
        else{
          this.showNotification(`Unable to delete`, "error");
        }
      }
      else{
        this.showNotification(`unable to fetch`, "error");
      }
    }

    return false; 
  }

  private async unlinkResource(item: Item): Promise<boolean> {
    // remove the link by removing the Resource Link record
    if (item.ResourceLinkID) {
      const md = new Metadata();
      const link = await md.GetEntityObject<ResourceLinkEntity>("Resource Links");
      if (await link.Load(item.ResourceLinkID))
        return await link.Delete();  
      else
        return false;
    }
    else
      return false;
  }

  private async doesFolderHaveChildren(folderID: string): Promise<boolean>{
    const md: Metadata = new Metadata();
    const rv: RunView = new RunView();
    const folderResult = await rv.RunView({
      EntityName:this.CategoryEntityName,
      ExtraFilter: `ParentID ='${folderID}'`
    });

    return folderResult && folderResult.Success && folderResult.Results.length > 0;
  }

  private showNotification(message: string, type: "none" | "success" | "error" | "warning" | "info" | undefined): void {
    if(this.showNotifications){
      this.sharedService.CreateSimpleNotification(message, type, 1000);
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
    this.filterItemsSubject.next(true);
  }

  public onCreateFolderKeyup(value: string): void {
    this.newFolderText = value;
  }

  private filterItems(filter: string): void {

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

    item.Favorite = !item.Favorite;
    const md: Metadata = new Metadata();
    let entityName: string = item.Type === ItemType.Folder ? this.CategoryEntityName : this.ItemEntityName;
    let compositeKey: CompositeKey = new CompositeKey([{FieldName: "ID", Value: item.Data.ID}]);
    await md.SetRecordFavoriteStatus(md.CurrentUser.ID, entityName, compositeKey, item.Favorite);
  }

  public editItem(item: Item): void {
    if(!item){
      return;
    }

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
    if(!data || !data.text){
      return;
    }

    if(data.text === "Folder"){
      this.toggleCreateFolderView();
    }
    else if(data.text === this.resourceName){
      this.addResourceButtonClicked();
    }
    else if(data.text === this.createNewRecordName){
      if(this.entityFormDialogRef){
        // create a new record for the given entity
        const md = new Metadata();
        const newRecord = await md.GetEntityObject(this.entityObjectName);  
        this.entityFormDialogRef.Record = newRecord;
        this.entityFormDialogRef.ShowForm();
      }
    }
    else{
      let event: DropdownOptionClickEvent = new DropdownOptionClickEvent(data.text);
      this.dropdownOptionClickEvent.emit(event);
    }
  }

  public toggleCopyFromView(): void {
    this.copyFromDialogOpened = !this.copyFromDialogOpened;
  }

  public getCopyFromTitle(): string {
    return `Select ${this.resourceName} to Copy`;
  }

  public toggleCreateFolderView(visible?: boolean): void {
    if(visible !== undefined){
      this.createFolderDialogOpened = visible;
    }
    else{
      this.createFolderDialogOpened = !this.createFolderDialogOpened;
    }
  }

  public getIconForResourceType(item: Item): string {
    if(!item){
      return "";
    }

    if(item.Type === ItemType.Folder){  
      return "fa-regular fa-folder";
    }

    const resourceType = this.resourceTypes.find(rt => rt.Entity === this.ItemEntityName);
    if(resourceType && resourceType.Icon){
      return resourceType.Icon;
    }

    // Default icon if no resource type found
    return "fa-solid fa-file";
  }

  public getHeaderIconClass(): string {
    // If viewing a specific folder
    if(this.selectedFolderID) {
      return "fa-regular fa-folder-open";
    }
    
    // Try to get icon from resource type
    const resourceType = this.resourceTypes.find(rt => rt.Entity === this.ItemEntityName);
    if(resourceType && resourceType.Icon){
      return resourceType.Icon;
    }
    
    // Default icons based on common types
    switch(this.itemType?.toLowerCase()) {
      case 'dashboard':
      case 'dashboards':
        return "fa-solid fa-chart-line";
      case 'report':
      case 'reports':
        return "fa-solid fa-file-chart-column";
      case 'query':
      case 'queries':
        return "fa-solid fa-database";
      case 'view':
      case 'views':
        return "fa-solid fa-table";
      case 'application':
      case 'applications':
        return "fa-solid fa-window-restore";
      default:
        return this.iconName || "fa-solid fa-th";
    }
  }

  public getResourceTypeLabel(item: Item): string {
    if(item.Type === ItemType.Folder) {
      return "Folder";
    }
    
    const resourceType = this.resourceTypes.find(rt => rt.Entity === this.ItemEntityName);
    if(resourceType){
      return resourceType.Name;
    }
    
    // Return a formatted version of the item type or entity name
    return this.itemType || "Resource";
  }

  public getFormattedDate(date: any): string {
    if (!date) return '';
    
    const d = new Date(date);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - d.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} month${months > 1 ? 's' : ''} ago`;
    } else {
      return d.toLocaleDateString();
    }
  }

  /**
   * Safely gets a property from an item, checking both the item itself and its Data property
   */
  public getItemProperty(item: Item, propertyName: string): any {
    // First check if the property exists directly on the item
    // We need to cast to any to avoid TypeScript index signature errors
    const itemAsAny = item as any;
    if (itemAsAny && itemAsAny[propertyName] !== undefined) {
      return itemAsAny[propertyName];
    }
    
    // Then check if it exists on the Data property
    if (item && item.Data && item.Data[propertyName] !== undefined) {
      return item.Data[propertyName];
    }
    
    // If Data is a BaseEntity, try using the Get method
    if (item && item.Data && typeof item.Data.Get === 'function') {
      try {
        return item.Data.Get(propertyName);
      } catch (e) {
        // Property doesn't exist
      }
    }
    
    return null;
  }
}