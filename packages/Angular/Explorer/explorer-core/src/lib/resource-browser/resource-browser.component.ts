import { Component, EventEmitter, Input, output, Output } from '@angular/core';
import { Folder, Item, ItemType, NewItemOption } from '../../generic/Item.types';
import { ResourceTypeEntity, UserViewEntityType } from '@memberjunction/core-entities';
import { Subject, debounceTime } from 'rxjs';
import { BaseEntity, CompositeKey, EntityField, EntityFieldInfo, EntityInfo, KeyValuePair, LogError, Metadata, RunView, RunViewResult } from '@memberjunction/core';
import { CellClickEvent } from '@progress/kendo-angular-grid';
import { SharedService } from '@memberjunction/ng-shared';
import { BeforeDeleteItemEvent, BeforeUpdateItemEvent } from '../../generic/Events.types';

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
   * Whether or not to enable categories. If enabled, Categories will be displayed
   * and the option to create new categories will be available. Default is true.
   */
  @Input() EnableCategories: boolean = true;

  /**
   * If Categories are enabled, then the categories fetched will be filtered to return only those whoses EntityID
   * matches this value. 
   */
  @Input() CategoryEntityID: string | null | undefined = null;

  /**
   * If set, this will set the current Category/Folder for the display. Not all Resource Types support Categories, so if the Resource Type in question does not have a CategoryEntityID specified, this property will be ignored.
   */
  @Input() CurrentCategoryID: string | null = null;

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
  @Input() NewItemOptions: NewItemOption[] = [];

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
   * Fires whenever the user clicks the back button to view the parent folder
   */
  @Output() public NavigateToParentEvent: EventEmitter<void> = new EventEmitter<void>();  

  /**
   * Fires whenever the users clicks to edit an Item that is not a folder
   */
  @Output() public EditItemEvent: EventEmitter<BeforeUpdateItemEvent> = new EventEmitter<BeforeUpdateItemEvent>();

  /**
   * Fires whenever the users clicks to edit an Item that is not a folder
   */
  @Output() public DeleteItemEvent: EventEmitter<BeforeDeleteItemEvent> = new EventEmitter<BeforeDeleteItemEvent>();

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

  private _DefaultNewItemOptions: NewItemOption[] = [
    {
      Text: 'New Folder',
      Description: 'Create a new Folder',
      Icon: 'folder',
      Action: () => {
        if(this.EnableCategories){
          this.toggleUpsertFolderView(true, true);
        }
      }}
  ];

  public get ItemOptions(): NewItemOption[] {
    return this._DefaultNewItemOptions;
  }

  public upsertNewFolderName: string = "";
  public upsertNewFolderDescription: string = "";
  public selectedFolder: Folder | null = null;
  

  // JS code here and below from old component....
  private _filterDebounceTime: number = 250;
  private filterItemsSubject: Subject<any> = new Subject();
  private filter: string = '';
  private sourceItems: Item[] | null = null;
  public selectedItem: Item | null = null;
  public deleteDialogOpened: boolean = false;
  public copyFromDialogOpened: boolean = false;
  public upsertFolderDialogVisible: boolean = false;
  private _allResourceTypes: ResourceTypeEntity[] = [];
  public entityObjectName: string = "";

  constructor(public sharedService: SharedService) {
    this.filterItemsSubject
        .pipe(debounceTime(this._filterDebounceTime))
        .subscribe(() => this.filterItems(this.filter));
  }

  public async ngOnInit(): Promise<void> {

    /**
     * Hide the create folder option is EnableCategories is false
     */
    if(this.EnableCategories){
      this._DefaultNewItemOptions.push(...this.NewItemOptions);
    }
    else{
      this._DefaultNewItemOptions = this.NewItemOptions;
    }

    this._allResourceTypes = this.sharedService.ResourceTypes;
    const resourceType: ResourceTypeEntity | undefined = this._allResourceTypes.find(rt => {
      return rt.Entity === this.ResourceTypeName;
    });

    if (!resourceType){
      throw new Error(`Resource Type ${this.ResourceTypeName} not found`);
    }

    this.ResourceType = resourceType;
    if (!this.ResourceType.EntityID){
      throw new Error(`Resource Type ${this.ResourceTypeName} does not have an EntityID specified. EntityID is required for any Resource Type to be used with this component.`);
    }
    
    // now get the entity info for the resource type and for its category entity, if one is specified. 
    const md = new Metadata();
    const resourceTypeEntity = md.EntityByID(this.ResourceType.EntityID);  
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
    const views: Item[] = await this.LoadResources();
    const categories: Item[] = await this.LoadCategories();

    const items = [...categories, ...views];
    const sortedItems = this.sortItems(items);
    this._items = sortedItems;
  }

  private async LoadResources(): Promise<Item[]> {
    let results: Item[] = [];

    if(!this.ResourceType || !this.ResourceType.Entity){
      return results;
    }

    const md = new Metadata();
    const rv: RunView = new RunView(); 
    // create a combined filter for the SQL query that combines the user's provided ItemFilter, if provided, with a user filter that only includes items that are OWNED by the current user
    // and finally filter on the current category, if one is set and we have a category entity
    let filter: string = "";
    if(this.ItemFilter){
      filter += `(${this.ItemFilter})`;
    }
    if(this.UserIDFieldName){
      let base: string = this.ItemFilter ? "AND": "";
      filter += `${base}([${this.UserIDFieldName}] = '${md.CurrentUser.ID}')`;
    }
    if(this.CurrentCategoryID && this.CategoryIDFieldName){
      let base: string = (this.ItemFilter || this.UserIDFieldName) ? "AND": "";
      filter += `${base}([${this.CategoryIDFieldName}] = '${this.CurrentCategoryID}')`;
    }
    
    const itemResult = await rv.RunView<BaseEntity>({
        EntityName: this.ResourceType.Entity,
        ExtraFilter: filter,
        OrderBy: this.OrderBy,
        ResultType: 'entity_object'
      }
    );

    if(!itemResult.Success){
      LogError(`Unable to load views for ${this.ResourceType.Entity}. Reason: ${itemResult.ErrorMessage}`);
      return results;;
    }

    const views: BaseEntity[] = itemResult.Results;
    const items: Item[] = views.map(view => new Item(view, ItemType.Resource));
    return items;
  }

  private async LoadCategories(): Promise<Item[]> {
    if(!this.EnableCategories){
      return [];
    }

    if(!this.ResourceType || !this.ResourceType.CategoryEntity){
      return [];
    }

    const md = new Metadata();
    const categoryEntity: EntityInfo = md.EntityByName(this.ResourceType.CategoryEntity);
    if(!categoryEntity){
      LogError(`Category Entity ${this.ResourceType.CategoryEntity} not found`);
      return [];
    }

    const hasEntityIDField: boolean = categoryEntity.Fields.some(field => field.Name === "EntityID");
    
    let filter: string = `UserID = '${md.CurrentUser.ID}'`;
    filter += this.CurrentCategoryID ? ` AND ParentID = '${this.CurrentCategoryID}' ` : " AND ParentID IS NULL ";
    filter += hasEntityIDField ? ` AND EntityID = '${this.ResourceType.EntityID}'` : "";

    const rv: RunView = new RunView();
    const rvResult: RunViewResult<BaseEntity> = await rv.RunView<BaseEntity>({
      EntityName: this.ResourceType.CategoryEntity,
      ExtraFilter: filter,
      ResultType: 'entity_object'
    });

    if(!rvResult.Success){
      LogError(`Unable to load categories for ${this.ResourceType.CategoryEntity}. Reason: ${rvResult.ErrorMessage}`);
      return [];
    }

    const categories: BaseEntity[]  = rvResult.Results;
    const folders: Folder[] = categories.map((category: BaseEntity) => {
      const folderID: string = category.FirstPrimaryKey.Value;
      const NameEntityField: EntityField | undefined = category.Fields.find(field => field.EntityFieldInfo.IsNameField);
      const folderName: string = NameEntityField ? NameEntityField.Value : "Folder";

      const folder: Folder = new Folder(folderID, folderName);
      folder.CategoryEntity = category;
      folder.Description = category.Get("Description");
      return folder;
    });

    const items: Item[] = folders.map(folder => new Item(folder, ItemType.Folder));
    return items;
  }

  //maybe pass in a sort function for custom sorting?
  protected sortItems(items: Item[]): Item[] {
    items.sort(function(a, b){
        const aName: string = a.Name.toLowerCase();
        const bName: string = b.Name.toLowerCase();
        if(aName < bName) { return -1; }
        if(aName > bName) { return 1; }
        return 0;
    });

    return items;
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

  public async updateFolder(): Promise<void> {
    const folder: Folder | null = this.selectedFolder;
    if(!folder || !folder.CategoryEntity){
      LogError("Folder or CategoryEntity is not set, cannot update folder");
      this.sharedService.CreateSimpleNotification("Unable to update folder", "error", 2500);
      return;
    }

    const categoryEntity = folder.CategoryEntity;
    categoryEntity.Set("Name", this.upsertNewFolderName);
    categoryEntity.Set("Description", this.upsertNewFolderDescription);

    const saveResult: boolean = await categoryEntity.Save();
    if(!saveResult){
      LogError(`Unable to update folder ${folder.Name}`, undefined, categoryEntity.LatestResult);
      this.sharedService.CreateSimpleNotification(`Unable to update folder ${folder.Name}`, "error", 2500);
    }
    else{
      this.sharedService.CreateSimpleNotification(`Successfully updated folder ${folder.Name}`, "info", 2500);
      await this.Refresh();
    }

    this.toggleUpsertFolderView(false, false);
  }

  public async createFolder(): Promise<void> {
    if(!this.ResourceType.CategoryEntity){
      LogError("ResourceType.CategoryEntity is not set, cannot create folder");
      this.sharedService.CreateSimpleNotification("Unable to create folder", "error", 1500);
      return;
    }
    
    const md: Metadata = new Metadata();
    const folderEntity: BaseEntity = await md.GetEntityObject<BaseEntity>(this.ResourceType.CategoryEntity);

    folderEntity.NewRecord();
    folderEntity.Set("Name", this.upsertNewFolderName);
    folderEntity.Set("Description", this.upsertNewFolderDescription);
    folderEntity.Set("ParentID", this.CurrentCategoryID);
    folderEntity.Set("UserID", md.CurrentUser.ID);
    folderEntity.Set("EntityID", this.CategoryEntityID);

    let saveResult: boolean = await folderEntity.Save();
    if(!saveResult){
      this.sharedService.CreateSimpleNotification(`Unable to create folder ${this.upsertNewFolderName}`, "error", 1500);
      LogError(`Unable to create folder ${this.upsertNewFolderName}`, undefined, folderEntity.LatestResult);
    }

    this.toggleUpsertFolderView(false, false);

    this.sharedService.CreateSimpleNotification(`successfully created folder ${this.upsertNewFolderName}`, 'success', 1500);
    let folder: Folder = new Folder(folderEntity.Get("ID"), folderEntity.Get("Name"));
    folder.ParentFolderID = folderEntity.Get("ParentID");
    folder.Description = folderEntity.Get("Description");

    let item: Item = new Item(folder, ItemType.Folder);

    //navigate to the newly created folder
    //by raising an item click event
    this.itemClick(item);    
  }

  public async unlinkItem(item: Item){
    await this.deleteOrUnlink(item, false);
  }

  private _currentDeleteOrUnlinkState: boolean = false;
  public async deleteOrUnlink(item: Item, bDelete: boolean){
    if(!item){
      return;
    }

    this._currentDeleteOrUnlinkState = bDelete;
    this.selectedItem = item;

    if(item.Type === ItemType.Folder && bDelete){
      this.deleteDialogOpened = true;
    }
    else if(item.Type === ItemType.Resource && bDelete){
      this.deleteDialogOpened = true;
    }
    else if (item.Type === ItemType.Resource && !bDelete) {
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
    if(!this.selectedItem || !shouldDelete){
      LogError("Selected item is not set or shouldDelete is false");
      return;
    }

    this.deleteDialogOpened = false;
    let item: Item = this.selectedItem;
    let success: boolean = false;
    if(item.Type === ItemType.Folder && this._currentDeleteOrUnlinkState){
      success = await this.deleteFolder(item);
    }
    else if(item.Type === ItemType.Resource && this._currentDeleteOrUnlinkState){
      success = await this.deleteResource(item);
    }
    else if(item.Type === ItemType.Resource && !this._currentDeleteOrUnlinkState){
      success = await this.unlinkResource(item);
    }

    this.selectedItem = null;
    if(success){
      await this.Refresh();
    }
  }

  private async deleteFolder(item: Item): Promise<boolean>{
    const folder: Folder = <Folder>item.Data;
    if(!folder || !folder.CategoryEntity){
      LogError("Folder or CategoryEntity is not set, cannot delete folder");
      this.sharedService.CreateSimpleNotification("Unable to delete folder", "error", 2500);
      return false;
    }

    const hasChildren: boolean = await this.doesFolderHaveChildren(folder.ID);
    if(hasChildren){
      this.sharedService.CreateSimpleNotification(`Unable to delete Folder ${folder.Name} because it has children`, "error", 2500);
      return false;
    }

    const categoryEntity = folder.CategoryEntity;
    const deleteResult: boolean = await categoryEntity.Delete();
    if(!deleteResult){
      LogError(`Unable to delete folder ${folder.Name}`, undefined, categoryEntity.LatestResult);
      this.sharedService.CreateSimpleNotification(`unable to delete folder ${folder.Name}.`, "error", 2500);
      return false;
    }

    this.sharedService.CreateSimpleNotification(`Successfully deleted folder ${folder.Name}`, "info", 2500);
    return true;
  }

  private async deleteResource(item: Item): Promise<boolean> {
    let genericEntity: BaseEntity = <BaseEntity>item.Data;
    if(!genericEntity){
      LogError("Item Data is not set, cannot delete resource");
      return false;
    }

    const deleteEvent: BeforeDeleteItemEvent = new BeforeDeleteItemEvent(item);
    this.DeleteItemEvent.emit(deleteEvent);

    if(deleteEvent.Cancel){
      //parent will handle deletion, so we can return early
      return true;
    }

    const entity: BaseEntity = item.Data;
    const deleteResult: boolean = await entity.Delete();
    if(!deleteResult){
      LogError(`Unable to delete ${item.Name}`, undefined, entity.LatestResult);
      this.sharedService.CreateSimpleNotification(`Unable to delete ${item.Name}`, "error", 2500);
      return false;
    }

    return true;
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
    if(!this.ResourceType.CategoryEntity){
      throw new Error("ResourceType.CategoryEntity is not set, cannot check for children");
    }

    const rv: RunView = new RunView();
    const folderResult = await rv.RunView({
      EntityName: this.ResourceType.CategoryEntity,
      ExtraFilter: `ParentID ='${folderID}'`
    });

    if(!folderResult.Success){
      throw new Error(`Unable to fetch children for folder ${folderID}. Reason: ${folderResult.ErrorMessage}`);
    }

    return folderResult.Results.length > 0;
  }

  public changeViewMode(mode: "List" | "Tree" | "Tile"): void {
    this.DisplayMode = mode;
  }

  public onKeyup(Value: any): void {
    this.filter = Value;
    this.filterItemsSubject.next(true);
  }

  public onUpsertFolderNameKeyup(value: string): void {
    this.upsertNewFolderName = value;
  }

  public onUpsertFolderDescriptionKeyup(value: string): void {
    this.upsertNewFolderDescription = value;
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

  public editItem(item: Item): void {
    if(!item || !item.Data){
      LogError("Item or item data is not set");
      this.sharedService.CreateSimpleNotification("Unable to edit item", "error", 2500);
      return;
    }

    if(item.Type === ItemType.Folder){
      const folder = <Folder>item.Data
      this.selectedFolder = folder;
      this.toggleUpsertFolderView(true, false);
    }
    else{
      const event: BeforeUpdateItemEvent = new BeforeUpdateItemEvent(item);
      this.EditItemEvent.emit(event);
    }
  }

  public async onDropdownItemClick(dropdownItem: NewItemOption): Promise<void>{
    if(!dropdownItem || !dropdownItem.Action){
      LogError("Dropdown item or action is not set");
      return;
    }

    dropdownItem.Action();
  }

  public toggleCopyFromView(): void {
    this.copyFromDialogOpened = !this.copyFromDialogOpened;
  }

  public getCopyFromTitle(): string {
    return `Select ${this.ResourceTypeName} to Copy`;
  }

  public toggleUpsertFolderView(visible: boolean, createNew: boolean): void {
    this.upsertFolderDialogVisible = visible;

    if(createNew){
      this.upsertNewFolderName = "";
      this.upsertNewFolderDescription = "";
      this.selectedFolder = null;
    }
    else if(visible && this.selectedFolder){
      this.upsertNewFolderName = this.selectedFolder.Name;
      this.upsertNewFolderDescription = this.selectedFolder.Description || "";
    }
  }

  public getIconForResourceType(item: Item): string {
    if(!item){
      return "";
    }

    const LargeClass: string = "fa-3x ";
    if(item.Type === ItemType.Folder){  
      return LargeClass + "fa-regular fa-folder";
    }

    const resourceType: ResourceTypeEntity | undefined = this._allResourceTypes.find(rt => rt.ID === this.ResourceType.ID);
    if(resourceType){
      return LargeClass + resourceType.Icon;// + rotateStyle;
    }

    return "";
  }
}