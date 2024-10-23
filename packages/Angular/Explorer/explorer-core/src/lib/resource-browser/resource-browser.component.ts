import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Item, ItemType } from '../../generic/Item.types';
import { ResourceTypeEntity } from '@memberjunction/core-entities';
import { Subject, debounceTime } from 'rxjs';
import { LogError, Metadata, RunView } from '@memberjunction/core';
import { CellClickEvent } from '@progress/kendo-angular-grid';
import { SharedService } from '@memberjunction/ng-shared';

export class NewItemOption {
  Text!: string;
  Description?: string;
  Icon?: string;
  Action?: () => void;
}

@Component({
  selector: 'mj-resource-browser',
  templateUrl: './resource-browser.component.html',
  styleUrls: ['./resource-browser.component.css', '../../shared/first-tab-styles.css']
})
export class ResourceBrowserComponent {
  /*******************************************************************************************
   * PROPERTIES
   *******************************************************************************************/
  private _ResourceTypeName: string | null = null;
  /**
   * The name of the type of resource to display, cannot be changed after it is initially set
   */
  @Input({required: true}) public get ResourceTypeName(): string | null {
    return this._ResourceTypeName;
  }
  public set ResourceTypeName(value: string) {
    if (this._ResourceTypeName === null) {
      this._ResourceTypeName = value;
    }
    else {
      // we do not ever want to allow an instance of this component to be "reused" where the Resource Type is changed so throw an exception here
      throw new Error('Resource Type cannot be changed after it has been set');
    }
  }

  /**
   * Whether or not to enable categories, if set to false, categories will be ignored and not displayed
   */
  @Input() EnableCategories: boolean = true;

  /**
   * This property determines if the UI will include a button on items in the display to edit. The button will only be shown if the user has edit permissions, but this is a global setting to turn on/off the button even if the user has permissions. Default is true.
   */
  @Input() EnableItemEdit: boolean = true;
  /**
   * This property determines if the UI will include a button on items in the display to delete. The button will only be shown if the user has delete permissions, but this is a global setting to turn on/off the button even if the user has permissions. Default is true.
   */
  @Input() EnableItemDelete: boolean = true;

  /**
   * This proprerty determines if the UI will include a button on items in the display to unlink/remove a link to a shared resource (owned by another user). 
   * The button will only be shown if the user has permissions, but this is a global setting to turn on/off the button even if the user has permissions. Default is true.
   */
  @Input() EnableRemoveLink: boolean = true;

  /**
   * The title to display, by default if not provided, we will use the ResourceType's Entity Name
   */
  @Input() Title?: string;

  /**
   * Optional, a SQL Where clause filter to apply to Items being loaded into the browser
   */
  @Input() ItemFilter?: string;

  /**
   * Optional, a valid expression to place into the RunView OrderBy property (don't include the keywords ORDER BY, just what is after ORDER BY)
   */
  @Input() OrderBy?: string;

  /**
   * Array of NewItemOption objects that will be displayed in the Create New dropdown. Defaults to having a single entry for creating a new folder, you can remove this or add to it.
   */
  @Input() NewItemOptions: NewItemOption[] = [{
    Text: 'New Folder',
    Description: 'Create a new folder',
    Icon: 'folder',
    Action: () => {
      console.log('New Folder');
    }
  }];

  /**
   * If set, this will set the current Category/Folder for the display. Not all Resource Types support Categories, so if the Resource Type in question does not have a CategoryEntityID specified, this property will be ignored.
   */
  @Input() CurrentCategoryID?: string;

  /**
   * The visual display mode for this component, tile will show the contents in tiles that are spaced and wrapped based on the viewport, list will show the details of the items in a list, and tree will show the items in a tree view - tree view NOT implemented yet
   */
  @Input() DisplayMode: 'Tile' | 'List' | 'Tree' = 'Tile';
  
  /**
   * Fires whenever a resource/item is selected within the component
   */
  @Output() ResourceSelected: EventEmitter<Item> = new EventEmitter<Item>();



  /*******************************************************************************************
   * EVENTS
   *******************************************************************************************/
  /**
   * Fires whenever the category (e.g. the folder) the user is currently viewing changes. This can happen when a user creates a new folder and navigates to it, navigates to an existing folder, goes "up" in the folder hierarchy, etc.
   */
  @Output() CategoryChanged: EventEmitter<string> = new EventEmitter<string>();

  /**
   * Fires whenever the user changes the display mode of the component
   */
  @Output() DisplayModeChanged: EventEmitter<'Grid' | 'List' | 'Tree'> = new EventEmitter<'Grid' | 'List' | 'Tree'>();
 



  /**
   * The current Resource Type (BaseEntity derived class), automatically is populated after init based on the ResourceType string
   */
  public ResourceType!: ResourceTypeEntity;

  private _isLoading: boolean = false;
  /**
   * This property will be true whenever the component is in the process of loading data
   */
  public get IsLoading(): boolean {
    return this._isLoading;
  }


  private _CategoryIDFieldName: string | undefined;
  /**
   * This is the field name in the Resource Type's Entity that is used to store the CategoryID (e.g. the Folder ID) for the resource. 
   * Not all entities in resource types support a CategoryID concept, so this can be null. This property is read only and
   * is auto-populated during the configuration of the component.
   */
  public get CategoryIDFieldName(): string | undefined {
    return this._CategoryIDFieldName;
  }

  private _CategoryParentIDFieldName: string | undefined = undefined;
  /**
   * This is the field name in the Resource type's Category Entity, if a Category Entity was provided, that has the recursive/self-referencing foreign key to the parent category.
   * This field is read only and is auto-populated during the configuration of the component.
   */
  public get CategoryParentIDFieldName(): string | undefined {
    return this._CategoryParentIDFieldName;
  }

  private _UserIDFieldName: string | undefined = undefined;
  /**
   * This is the field name in the Resource Type's Entity that is used to store the UserID of the user that OWNS the resource. Commonly, but not always a field called UserID, but can be 
   * any field in the Resource Type's entity that is a foreign key to the Users entity. This property is read only and is auto-populated during the configuration of the component.
   */
  public get UserIDFieldName(): string | undefined {
    return this._UserIDFieldName;
  }

  private _items: Item[] = [];
  /**
   * The current list of items being displayed in the browser, DO NOT MODIFY THIS! This is read only and is auto-populated by the component.
   */
  public get Items(): Item[] {
    return this._items;
  }
  

  // JS code here and below from old component....
  private _filterDebounceTime: number = 250;
  private filterItemsSubject: Subject<any> = new Subject();
  private filter: string = '';
  private sourceItems: Item[] | null = null;
  public selectedItem: Item | null = null;
  public deleteDialogOpened: boolean = false;
  public copyFromDialogOpened: boolean = false;
  public createFolderDialogOpened: boolean = false;
  private newFolderText: string = "Sample Folder";
  private _allResourceTypes: ResourceTypeEntity[] = [];
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
        .pipe(debounceTime(this._filterDebounceTime))
        .subscribe(() => this.filterItems(this.filter));
  }

  public async ngOnInit(): Promise<void> {
    this._allResourceTypes = this.sharedService.ResourceTypes;

    const rt = this._allResourceTypes.find(rt => rt.Entity === this.ResourceTypeName);

    if (!rt) 
      throw new Error(`Resource Type ${this.ResourceTypeName} not found`);
    else if (!rt.EntityID)
      throw new Error(`Resource Type ${this.ResourceTypeName} does not have an EntityID specified. EntityID is required for any Resource Type to be used with this component.`);
    else
      this.ResourceType = rt;

    // now get the entity info for the resource type and for its category entity, if one is specified. 
    const md = new Metadata();
    const resourceTypeEntity = md.EntityByID(this.ResourceType.EntityID!);  
    const categoryEntity = this.ResourceType.CategoryEntityID ? md.EntityByID(this.ResourceType.CategoryEntityID) : null;   
    // figure out the column inside the entity that points to the categoryEntity, if we have a category entity
    if (categoryEntity) {
      this._CategoryIDFieldName = resourceTypeEntity.Fields.find(f => f.RelatedEntityID === categoryEntity.ID)?.Name;

      const usersEntity = md.EntityByName("Users");
      this._UserIDFieldName = resourceTypeEntity.Fields.find(f => f.RelatedEntityID === usersEntity.ID)?.Name;

      this._CategoryParentIDFieldName = categoryEntity.Fields.find(f => f.RelatedEntityID === categoryEntity.ID)?.Name;
    }
    await this.Refresh();
  }

  /**
   * Refresh the component from the database based on other current state variables.
   */
  public async Refresh() {
    try {
      const md = new Metadata();
      if (!this.ResourceType || !this.ResourceType.Entity)
        throw new Error('Resource Type not set, or Resource Type does not have an Entity specified');

      const rv: RunView = new RunView(); 
      // create a combined filter for the SQL query that combines the user's provided ItemFilter, if provided, with a user filter that only includes items that are OWNED by the current user
      // and finally filter on the current category, if one is set and we have a category entity
      const combinedFilter = `${this.ItemFilter ? '(' + this.ItemFilter + ') AND' : ''}
                              ([${this.UserIDFieldName}] = '${md.CurrentUser.ID}') 
                              ${this.CurrentCategoryID && this.CategoryIDFieldName ? `AND ([${this.CategoryIDFieldName}] = '${this.CurrentCategoryID}')` : ''}`;
      const itemResult = await rv.RunView({
          EntityName: this.ResourceType.Entity!,
          ExtraFilter: combinedFilter,
          OrderBy: this.OrderBy
        }
      );
      if (!itemResult || !itemResult.Success)
        throw new Error(`Failed to load items for ${this.ResourceType.Entity}`);

      this._items = itemResult.Results.map(r => new Item(r, ItemType.Resource));
    }
    catch (error) {
      LogError(error);
      console.error(error);
    }
  }
  
  //wrapper function for the grid view
  public onCellItemClicked(event: CellClickEvent): void {
    this.itemClick(event.dataItem);
  }

  public itemClick(item: any): void {
    if (!item) {
      return;
    }

    this.ResourceSelected.emit(item);
  }

  public backButtonClicked(){
    // this.backButtonClickEvent.emit();
  }

  public async addResourceButtonClicked() {

    // let event: BeforeAddItemEvent = new BeforeAddItemEvent("");
    // this.BeforeAddItemEvent.emit(event);
    // if(event.Cancel){
    //   return;
    // }

    // const resourceName: string = `Sample ${this.ItemEntityName}`;
    // const md: Metadata = new Metadata();
    // const entity: BaseEntity = await md.GetEntityObject<BaseEntity>(this.ItemEntityName);

    // entity.NewRecord();
    // //some entities, like resources, have common fields 
    // //we can try to set here
    // entity.Set("Name", resourceName);
    // entity.Set("UserID", md.CurrentUser.ID);

    // let saveResult: boolean = await entity.Save();
    // if(saveResult){
    //   this.showNotification(`successfully created ${resourceName}`, "info");

    //   let item: Item = new Item(entity, ItemType.Entity);
    //   item.Name = resourceName;
    //   this.AfterAddItemEvent.emit(new AfterAddItemEvent(item));
    // }
    // else{
    //   this.showNotification(`Unable to create ${resourceName}`, "error");
    // }

  }

  public async createFolder(): Promise<void> {
    // this.toggleCreateFolderView(false);

    // let event: BeforeAddFolderEvent = new BeforeAddFolderEvent(this.newFolderText);
    // if(event.Cancel){
    //   return;
    // }

    // let folderName: string = this.newFolderText;
    // let description: string = "";
    
    // const md: Metadata = new Metadata();
    // const folderEntity: BaseEntity = await md.GetEntityObject<BaseEntity>(this.CategoryEntityName);

    // folderEntity.NewRecord();
    // folderEntity.Set("Name", folderName);
    // folderEntity.Set("ParentID", this.selectedFolderID);
    // folderEntity.Set("Description", description);
    // folderEntity.Set("UserID", md.CurrentUser.ID);
    
    // if(this.categoryEntityID){
    //   folderEntity.Set("EntityID", this.categoryEntityID);
    // }

    // let saveResult: boolean = await folderEntity.Save();
    // if(saveResult){
    //   this.showNotification(`successfully created folder ${folderName}`, "info");

    //   let folder: Folder = new Folder(folderEntity.Get("ID"), folderEntity.Get("Name"));
    //   folder.Description = folderEntity.Get("Description");

    //   let item: Item = new Item(folder, ItemType.Folder);
    //   let event: AfterAddFolderEvent = new AfterAddFolderEvent(item);
    //   this.AfterAddFolderEvent.emit(event);

    //   if(event.Cancel){
    //     return;
    //   }

    //   //navigate to the newly created folder
    //   //by raising an item click event
    //   this.itemClick(item);
    // }
    // else{
    //   this.sharedService.CreateSimpleNotification(`Unable to create folder ${folderName}`, "error", 3500);
    // }
    // this.newFolderText = "Sample Folder";
  }

  public async unlinkItem(item: Item){
    await this.deleteOrUnlink(item, false);
  }

  private _currentDeleteOrUnlinkState: boolean = false;
  public async deleteOrUnlink(item: Item, bDelete: boolean){
    // this._currentDeleteOrUnlinkState = bDelete;
    // if(!item){
    //   return;
    // }

    // this.selectedItem = item;

    // if(item.Type === ItemType.Folder && bDelete){
    //   let event: BeforeDeleteFolderEvent = new BeforeDeleteFolderEvent(item);
    //   this.BeforeDeleteFolderEvent.emit(event);
      
    //   if(event.Cancel){
    //     return;
    //   }

    //   this.deleteDialogOpened = true;
    // }
    // else if(item.Type === ItemType.Entity && bDelete){
    //   let event: BeforeDeleteItemEvent = new BeforeDeleteItemEvent(item);
    //   this.BeforeDeleteItemEvent.emit(event);
      
    //   if(event.Cancel){
    //     return;
    //   }

    //   this.deleteDialogOpened = true;
    // }
    // else if (item.Type === ItemType.Entity && !bDelete) {
    //   let event: BeforeUnlinkItemEvent = new BeforeUnlinkItemEvent(item);
    //   this.BeforeUnlinkItemEvent.emit(event);
      
    //   if(event.Cancel){
    //     return;
    //   }

    //   this.deleteDialogOpened = true;
    // }  
  }

  public goToParent() {
    //this.NavigateToParentEvent.emit();
  }

  public async deleteItem(item: Item) {
    await this.deleteOrUnlink(item, true);
  }

  public async onConfirmDeleteItem(shouldDelete: boolean): Promise<void> {
    // this.deleteDialogOpened = false;
    
    // if(!this.selectedItem || !shouldDelete){
    //   return;
    // }
    
    // let item: Item = this.selectedItem;

    // if(item.Type === ItemType.Folder && this._currentDeleteOrUnlinkState){
    //   let deleteResult = await this.deleteFolder(item);
    //   if(deleteResult){
    //     let deleteFolderEvent: AfterDeleteFolderEvent = new AfterDeleteFolderEvent(item);
    //     this.AfterDeleteFolderEvent.emit(deleteFolderEvent);
    //   }

    // }
    // else if(item.Type === ItemType.Entity && this._currentDeleteOrUnlinkState){
    //   await this.deleteResource(item);
    //   let deleteItemEvent: AfterDeleteItemEvent = new AfterDeleteItemEvent(item);
    //   this.AfterDeleteItemEvent.emit(deleteItemEvent);
    // }
    // else if(item.Type === ItemType.Entity && !this._currentDeleteOrUnlinkState){
    //   await this.unlinkResource(item);
    //   let unlinkItemEvent: AfterUnlinkItemEvent = new AfterUnlinkItemEvent(item);
    //   this.AfterUnlinkItemEvent.emit(unlinkItemEvent);
    // }

    // this.selectedItem = null;
  }

  private async deleteFolder(item: Item): Promise<boolean>{
    return true;

    // const folder: Folder = <Folder>item.Data;

    // //the DB will throw an error if we attempt to delete a folder that has children
    // //i.e. sub folders or resources
    // //so the default behavior is to notify the user that the delete operation cannot
    // //go through 
    // const folderHasChildren: boolean = await this.doesFolderHaveChildren(folder.ID);
    // if(folderHasChildren){
    //   this.showNotification(`unable to delete folder ${folder.Name} because it has children`, "error");
    //   return false;
    // }

    // this.showLoader = true;
    // const md = new Metadata();
    // let folderEntity: BaseEntity = await md.GetEntityObject<BaseEntity>(this.CategoryEntityName);
    // let pkv: KeyValuePair = new KeyValuePair();
    // pkv.FieldName = "ID";
    // pkv.Value = folder.ID;
    // let compositeKey: CompositeKey = new CompositeKey([pkv]);
    // //create view browser component - this will be used to display views
    // //then create a new component for applications that wraps around the view browser component 
    // let loadResult = await folderEntity.InnerLoad(compositeKey);
    // if(!loadResult){
    //   this.sharedService.CreateSimpleNotification(`Unable to fetch folder ${folder.Name}`, "error", 3500);
    //   this.showLoader = false;
    //   return false;
    // }

    // let deleteResult = await folderEntity.Delete();
    // if(!deleteResult){
    //   this.sharedService.CreateSimpleNotification(`Unable to delete folder ${folder.Name}`, "error", 3500);
    //   this.showLoader = false;
    //   return false;
    // }
    // else{
    //   this.sharedService.CreateSimpleNotification(`Successfully deleted folder ${folder.Name}`, "info", 2000);
    //   this.showLoader = false;
    // }
    // return true;
  }

  private async deleteResource(item: Item): Promise<boolean> {

    return true;

    // let genericEntity: BaseEntity = <BaseEntity>item.Data;

    // if(!genericEntity){
    //   return false;
    // }

    // //the only assumption we are making here is that the entityID
    // //is a number
    // const entityID = this.TryGetID(genericEntity);
    // if (entityID && entityID.length > 0) {
      
    //   const md = new Metadata();
      
    //   let entityObject = await md.GetEntityObject(this.ItemEntityName);
    //   let pkv: KeyValuePair = new KeyValuePair();
    //   pkv.FieldName = "ID";
    //   pkv.Value = entityID;
    //   let compositeKey: CompositeKey = new CompositeKey([pkv]);
    //   let loadResult = await entityObject.InnerLoad(compositeKey);

    //   if(loadResult){
    //     let deleteResult = await entityObject.Delete();
    //     if(deleteResult){
    //       this.showNotification(`successfully deleted`, "info");
    //       return true;
    //     }
    //     else{
    //       this.showNotification(`Unable to delete`, "error");
    //     }
    //   }
    //   else{
    //     this.showNotification(`unable to fetch`, "error");
    //   }
    // }

    // return false; 
  }

  private async unlinkResource(item: Item): Promise<boolean> {

    return true;

    // // remove the link by removing the Resource Link record
    // if (item.ResourceLinkID) {
    //   const md = new Metadata();
    //   const link = await md.GetEntityObject<ResourceLinkEntity>("Resource Links");
    //   if (await link.Load(item.ResourceLinkID))
    //     return await link.Delete();  
    //   else
    //     return false;
    // }
    // else
    //   return false;
  }

  private async doesFolderHaveChildren(folderID: string): Promise<boolean>{

    return true;

    // const md: Metadata = new Metadata();
    // const rv: RunView = new RunView();
    // const folderResult = await rv.RunView({
    //   EntityName:this.CategoryEntity,
    //   ExtraFilter: `ParentID ='${folderID}'`
    // });

    // return folderResult && folderResult.Success && folderResult.Results.length > 0;
  }

  private showNotification(message: string, type: "none" | "success" | "error" | "warning" | "info" | undefined): void {
    // if(this.showNotifications){
    //   this.sharedService.CreateSimpleNotification(message, type, 1000);
    // }
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
    // this.displayAsGrid = mode === 'grid';
    // this.viewModeChangeEvent.emit(mode);
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
      this.sourceItems = [...this._items];
    }

    if (!filter) {
      this._items = [...this.sourceItems];
      return;
    }

    this._items = this.sourceItems.filter(item => {
      return item.Name.toLowerCase().includes(filter.toLowerCase());
    });
  }

  public async SetFavoriteStatus(item: any) {
    // if(!item){
    //   return;
    // }

    // item.Favorite = !item.Favorite;
    // const md: Metadata = new Metadata();
    // let entityName: string = item.Type === ItemType.Folder ? this.CategoryEntityName : this.ItemEntityName;
    // let compositeKey: CompositeKey = new CompositeKey([{FieldName: "ID", Value: item.Data.ID}]);
    // await md.SetRecordFavoriteStatus(md.CurrentUser.ID, entityName, compositeKey, item.Favorite);
  }

  public editItem(item: Item): void {
    // if(!item){
    //   return;
    // }

    // if(item.Type === ItemType.Folder){
    //   let event: BeforeUpdateFolderEvent = new BeforeUpdateFolderEvent(item);
    //   this.BeforeUpdateFolderEvent.emit(event);
      
    //   if(event.Cancel){
    //     return;
    //   }
    // }
    // else{
    //   let event: BeforeUpdateItemEvent = new BeforeUpdateItemEvent(item);
    //   this.BeforeUpdateItemEvent.emit(event);
      
    //   if(event.Cancel){
    //     return;
    //   }
    // }
  }

  public async onDropdownItemClick(data: {text: string}): Promise<void>{
    // if(!data || !data.text){
    //   return;
    // }

    // if(data.text === "Folder"){
    //   this.toggleCreateFolderView();
    // }
    // else if(data.text === this.resourceName){
    //   this.addResourceButtonClicked();
    // }
    // else if(data.text === this.createNewRecordName){
    //   if(this.entityFormDialogRef){
    //     // create a new record for the given entity
    //     const md = new Metadata();
    //     const newRecord = await md.GetEntityObject(this.entityObjectName);  
    //     this.entityFormDialogRef.Record = newRecord;
    //     this.entityFormDialogRef.ShowForm();
    //   }
    // }
    // else{
    //   let event: DropdownOptionClickEvent = new DropdownOptionClickEvent(data.text);
    //   this.dropdownOptionClickEvent.emit(event);
    // }
  }

  public toggleCopyFromView(): void {
    this.copyFromDialogOpened = !this.copyFromDialogOpened;
  }

  public getCopyFromTitle(): string {
    return `Select ${this.ResourceTypeName} to Copy`;
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
    return "";
    // if(!item){
    //   return "";
    // }

    // const LargeClass: string = "fa-3x ";
    // if(item.Type === ItemType.Folder){  
    //   return LargeClass + "fa-regular fa-folder";
    // }

    // const resourceType = this._allResourceTypes.find(rt => rt.Entity === this.Resource);
    // if(resourceType){
    //   return LargeClass + resourceType.Icon;// + rotateStyle;
    // }

    // return "";
  }
}