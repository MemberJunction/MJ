import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Metadata, RunView } from '@memberjunction/core';
import { ListEntity } from '@memberjunction/core-entities'; 
import { NotificationService } from "@progress/kendo-angular-notification";

export class List {
  ID: number = 0;
  Name: string = '';
  Description: string | null = '';
  Entity: string | null = '';
  EntityID: number | null = 0;
  User: string = ''
}

interface Entity {
  id: number | null,
  name: string | null,
}

@Component({
  selector: 'mj-list-component',
  templateUrl: './list-component.html',
  styleUrls: ['./list-component.css', '../../shared/first-tab-styles.css'],
})

export class ListComponent implements OnInit {
  private md = new Metadata();
  private entities: Array<Entity> = [];
  private list: Array<List> = [];
  private selectedEntity = new List();
  private selectedRow: List | null = null;
  protected _contextUser: object | null;
  public opened: boolean = false;
  public deleteDialogOpened: boolean = false;
  public selectedEntities: Array<Entity> = [];
  public mySelection: string[] = [];
  public loader: boolean = false;
  public btnLoader: boolean = false;
  public listName: string = ''
  public listDescription: string | null = ''
  public title: string = ''

  constructor(private notificationService: NotificationService, private router: Router) {
    this._contextUser = null
   }

  get getEntities() {
    return this.entities
  }

  get getList() {
    return this.list
  }

  private appendObj(listObj: List) {
    const transformed = {
      ID: listObj.ID,
      Name: listObj.Name,
      Description: listObj.Description,
      Entity: listObj.Entity,
      EntityID: listObj.EntityID,
      User: listObj.User
    }
    if(this.selectedRow) {
      const index: number = this.list.findIndex((item) => item.ID === listObj.ID)
      Object.assign(this.list[index], transformed)
    }
    else this.list = [ ...this.list, transformed]
       
  }

  private updateList(listID: number) {
    this.list = this.list.filter((item) => item.ID !== listID)
  }

  private resetForm() {
    this.listName = ''
    this.listDescription = ''
    this.selectedEntities = []
    this.selectedRow = null
  }

  async ngOnInit(): Promise<void> {
    await this.loadLists()
    await this.loadEntities()
  }

  public async loadLists(): Promise<void> {
    this.loader = true
    const rv = new RunView();
    const models = await rv.RunView({EntityName: 'Lists', ResultType: 'entity_object'}, this.md.CurrentUser);
    this.list = models?.Results.map((entity) => {
    return {
      ID: entity.ID,
      Name: entity.Name,
      Description: entity.Description,
      Entity: entity.Entity,
      EntityID: entity.EntityID,
      User: entity.User,
      EntityInfo: entity.EntityInfo
    }
    });
    this.loader = false;
  }

  public async loadEntities(): Promise<void> {
    const rv = new RunView();
    const models = await rv.RunView({EntityName: 'Entities', ResultType: 'entity_object'}, this.md.CurrentUser);
    this.entities = models?.Results.map((entity) => {
    return {
      id: entity.ID,
      name: entity.Name
    }
  });
  }

  public async saveList(): Promise<void> {
    this.btnLoader = true
    const md = new Metadata();
    const listPromise = md.GetEntityObject<ListEntity>('Lists');
    const list = await listPromise;
    if(this.selectedRow?.ID) 
      await list.Load(this.selectedRow.ID)
    else 
      list.NewRecord();
    list.Name = this.listName;
    list.Description = this.listDescription;
    list.UserID = md.CurrentUser.ID;
    list.EntityID = this.selectedEntities[0].id;

    try {
        await list.Save();
        this.appendObj(list)
        this.btnLoader = false;
        this.opened = false
        this.resetForm()
    } catch (error) {
      console.log('Error:', error)
    }
  }

  public async deleteEntity() {
      this.btnLoader = true;
      const md = new Metadata();
      const listObj = <ListEntity>await md.GetEntityObject('Lists');
      await listObj.Load(this.selectedEntity?.ID); // load the view to be deleted
      const response = await listObj.Delete()
      if (response) { // delete the view
        this.notificationService.show({
          content: "View deleted successfully!",
          hideAfter: 800,
          position: { horizontal: "center", vertical: "top" },
          animation: { type: "fade", duration: 400 },
          type: { style: "success", icon: true },
        });
        this.btnLoader = false;
        this.deleteDialogOpened = false;
       this.updateList(this.selectedEntity.ID)
      }
      else {
        this.notificationService.show({
          content: "Error deleting view!",
          hideAfter: 800,
          position: { horizontal: "center", vertical: "top" },
          animation: { type: "fade", duration: 400 },
          type: { style: "error", icon: true },
        });
      }

  }

  public toggle(value: boolean) {
    this.resetForm()
    this.title = 'Create List'
    this.opened = value;
  }

  public openDeleteDialog(item: List) {
    this.deleteDialogOpened = true
    this.selectedEntity = item
  }

  public openEditDialog(item: List) {
    this.title = 'Update List'
    this.opened = true
    this.listName = item.Name
    this.listDescription = item.Description
    this.selectedEntities = [{ id: item.EntityID, name: item.Entity }]
    this.selectedRow = item
  }

  public onConfirmDeleteItem(value: boolean) {
    this.deleteDialogOpened = value
  }

  public viewItemClick(item: List) {
    this.router.navigate([`/list-detail/${item.ID}`]);
  }
}
