import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router'
import { SharedService } from '@memberjunction/ng-shared';
import { Folder, Item, ItemType, UpdateItemEvent, UpdateItemEventType } from '../../generic/Item.types';
import { DashboardCategoryEntity, DashboardEntity } from '@memberjunction/core-entities';
import { BaseEntity, Metadata, RunView } from '@memberjunction/core';

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
  @Input() public showAddButton: boolean = false;
  @Input() public addText: string = 'Create New';
  @Input() public backText: string = 'Go Back';
  @Input() public EntityName: string = '';
  @Input() public CategoryName: string = '';
  @Input() public selectedFolderID: number | null = null;

  @Input() public parentWillHandleAddResource: boolean = false;
  @Input() public parentWillHandleDeleteResource: boolean = false;
  @Input() public parentWillHandleAddFolder: boolean = false;
  @Input() public parentWillHandleDeleteFolder: boolean = false;

  @Output() public addButtonClickEvent: EventEmitter<any> = new EventEmitter<any>();
  @Output() public deleteButtonClickEvent: EventEmitter<any> = new EventEmitter<any>();
  @Output() public itemClickEvent: EventEmitter<any> = new EventEmitter<any>();
  @Output() public createFolderClickEvent: EventEmitter<string> = new EventEmitter<string>();
  @Output() public createResourceClickEvent: EventEmitter<any> = new EventEmitter<any>();
  @Output() public backButtonClickEvent: EventEmitter<void> = new EventEmitter<void>();
  @Output() public UpdateItemEvent: EventEmitter<UpdateItemEvent> = new EventEmitter<UpdateItemEvent>();
  constructor(public sharedService: SharedService, private router: Router) {
    this.router = router;
  }

  public itemClick(item: Item<any | Folder>) {
    if (item) {
      this.itemClickEvent.emit(item);
    }
  }

  public async deleteItem(item: Item<any | Folder>){
    if(item && this.parentWillHandleDeleteResource){
      this.deleteButtonClickEvent.emit(item);
    }
    else{
      //No special handling of the folder, so we can delete it 
      //as normal
      await this.deleteFolder(item);
    }
  }

  //todo - show a modal asking the user for a name to give the resource
  public async addResourceButtonClicked() {
    if(this.parentWillHandleAddResource){
      this.createResourceClickEvent.emit();
      return;
    }


    const resourceName: string = "Sample" + this.EntityName;
    const md: Metadata = new Metadata();
    const entity: BaseEntity = await md.GetEntityObject<BaseEntity>(this.EntityName);

    entity.NewRecord();
    entity.Set("Name", resourceName);

    let saveResult: boolean = await entity.Save();
    if(saveResult){
      this.sharedService.CreateSimpleNotification(`successfully created ${resourceName}`, "info");

      let item: Item<BaseEntity> = new Item(entity, ItemType.Resource);
      item.Name = resourceName;
      const updateItemEvent: UpdateItemEvent = new UpdateItemEvent(item, UpdateItemEventType.Add);
      this.UpdateItemEvent.emit(updateItemEvent);
    }
    else{
      this.sharedService.CreateSimpleNotification(`Unable to create folder ${resourceName}`, "error");
    }

  }

  //todo - show a modal asking the user for a name to give the folder
  public async createFolder(){
    if(this.parentWillHandleAddFolder){
      this.createFolderClickEvent.emit();
      return;
    }

    let folderName: string = "sample new folder";
    const md: Metadata = new Metadata();
    const folderEntity: BaseEntity = await md.GetEntityObject<BaseEntity>(this.CategoryName);

    folderEntity.NewRecord();
    folderEntity.Set("Name", folderName);
    folderEntity.Set("ParentID", this.selectedFolderID);
    folderEntity.Set("Description", "Sample Description");

    let saveResult: boolean = await folderEntity.Save();
    if(saveResult){
      this.sharedService.CreateSimpleNotification(`successfully created folder ${folderName}`, "info");

      let folder: Folder = new Folder(folderEntity.Get("ID"), folderEntity.Get("Name"));
      let item: Item<Folder> = new Item(folder, ItemType.Folder);
      item.Description = folderEntity.Get("Description");
      const updateItemEvent: UpdateItemEvent = new UpdateItemEvent(item, UpdateItemEventType.Add);
      this.UpdateItemEvent.emit(updateItemEvent);
    }
    else{
      this.sharedService.CreateSimpleNotification(`Unable to create folder ${folderName}`, "error");
    }
  }

  public goHomeButtonClicked(){
    this.backButtonClickEvent.emit();
  }

  private async deleteFolder(item: Item<any | Folder>){
    if(item && item.Type === ItemType.Folder && this.parentWillHandleDeleteFolder){
      this.deleteButtonClickEvent.emit(item);
      return;
    }
    else if(item && item.Type === ItemType.Resource && !this.parentWillHandleDeleteResource){
      this.deleteButtonClickEvent.emit(item);
      return;
    }

    const folder: Folder = item.Data;

    //the DB will throw an error if we attempt to delete a folder that has children
    //i.e. sub folders or resources
    //so the default behavior is to notify the user that the delete operation cannot
    //go through 
    const folderHasChildren: boolean = await this.doesFolderHaveChildren(folder.ID);
    if(folderHasChildren){
      this.sharedService.CreateSimpleNotification(`unable to delete folder ${folder.Name} because it has children`, "error");
      return;
    }

    this.showLoader = true;
    const md = new Metadata();
    let folderEntity: BaseEntity = await md.GetEntityObject<BaseEntity>(this.CategoryName);
    //@ts-ignore
    let loadResult = await folderEntity.Load(folder.ID);
    if(!loadResult){
      this.sharedService.CreateSimpleNotification(`unable to fetch folder ${folder.Name}`, "error");
      this.showLoader = false;
      return;
    }

    let deleteResult = await folderEntity.Delete();
    if(!deleteResult){
      this.sharedService.CreateSimpleNotification(`unable to delete folder ${folder.Name}`, "error");
      this.showLoader = false;
      return;
    }
    else{
      this.sharedService.CreateSimpleNotification(`successfully deleted folder ${folder.Name}`, "info");
      const updateItemEvent: UpdateItemEvent = new UpdateItemEvent(item, UpdateItemEventType.Delete);
      this.UpdateItemEvent.emit(updateItemEvent);
      this.showLoader = false;
    }
  }

  private async doesFolderHaveChildren(folderID: number): Promise<boolean>{
    const md: Metadata = new Metadata();
    const rv: RunView = new RunView();
    const folderResult = await rv.RunView({
      EntityName:this.CategoryName,
      ExtraFilter: "ParentID = " + folderID
    });

    return folderResult && folderResult.Success && folderResult.Results.length > 0;
  }
}
