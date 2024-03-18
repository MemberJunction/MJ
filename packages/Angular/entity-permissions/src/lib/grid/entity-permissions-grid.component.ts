import { Component, Output, EventEmitter, OnInit, Input, SimpleChanges, OnChanges } from '@angular/core';

import { Metadata, RunView } from '@memberjunction/core';
import { kendoSVGIcon } from '@memberjunction/ng-shared'
import { EntityPermissionEntity } from '@memberjunction/core-entities';


export type EntityPermissionChangedEvent = {
  EntityName: string,
  RoleName: string
  PermissionTypeChanged: 'Read' | 'Create' | 'Update' | 'Delete'
  Value: boolean
  Cancel: boolean
}
 
@Component({
  selector: 'mj-entity-permissions-grid',
  templateUrl: './entity-permissions-grid.component.html',
  styleUrls: ['./entity-permissions-grid.component.css']
})
export class EntityPermissionsGridComponent implements OnInit, OnChanges {
  @Input() EntityName!: string;
  @Input() BottomMargin: number = 0;

  @Output() PermissionChanged = new EventEmitter<EntityPermissionChangedEvent>();

  public permissions: EntityPermissionEntity[] = [];
  public gridHeight: number = 750;
  public isLoading: boolean = false;


  public kendoSVGIcon = kendoSVGIcon 

  constructor() { 
  } 

  ngOnInit(): void {
    this.Refresh()
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.EntityName && !changes.EntityName.isFirstChange()) {
      // If EntityName has changed and it's not the first change (initialization)
      this.Refresh();
    }
  }

  async Refresh() { 
    if (this.EntityName && this.EntityName.length > 0) {
      const startTime = new Date().getTime();
      this.isLoading = true

      const md = new Metadata();
      const e = md.Entities.find(e => e.Name === this.EntityName);
      if (!e)
        throw new Error("Entity not found: " + this.EntityName)

      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'Entity Permissions',
        ExtraFilter: 'EntityID=' + e.ID,
        OrderBy: 'RoleName ASC',
        ResultType: 'entity_object'
      })
      if (result.Success) {
        // we have all of the saved permissions now
        // the post-process we need to do now is to see if there are any roles that don't have any existing permissions and if so, we need to create 
        // new permission records for them. We won't actually consider those "Dirty" and save those unless the user actually selects one or more
        // to turn on, we are just doing this to make the grid easy to manage from the user perspective.
        const existingPermissions = <EntityPermissionEntity[]>result.Results;
        const roles = md.Roles;

        const rolesWithNoPermissions = roles.filter(r => !existingPermissions.some(p => p.RoleName === r.Name));
        for (const r of rolesWithNoPermissions) {
          const p = await md.GetEntityObject<EntityPermissionEntity>('Entity Permissions')
          p.NewRecord();
          p.EntityID = e.ID;
          p.RoleName = r.Name;
          p.CanRead = false;
          p.CanCreate = false;
          p.CanUpdate = false;
          p.CanDelete = false;
          existingPermissions.push(p);
        }
        this.permissions = existingPermissions.sort((a, b) => a.RoleName!.localeCompare(b.RoleName!));
      }
      else {
        throw new Error("Error loading entity permissions: " + result.ErrorMessage)
      }
      this.isLoading = false
    }
  }
    
  public async savePermissions() {
    // iterate through each permisison and for the ones that are dirty, add to transaction group then commit at once
    const md = new Metadata();
    const tg = await md.CreateTransactionGroup();
    let itemCount: number = 0;
    this.permissions.forEach(p => {
      if (this.IsPermissionReallyDirty(p)) {
        p.TransactionGroup = tg;
        itemCount++;
        p.Save(); // don't await since we are using a tg
      }
    })
    if (itemCount > 0)
      await tg.Submit();
  }
  public get NumDirtyPermissions(): number {
    return this.permissions.filter(p => this.IsPermissionReallyDirty(p)).length;
  }

  protected IsPermissionReallyDirty(p: EntityPermissionEntity): boolean {
    if (!p.Dirty)
      return false;
    else if (p.ID > 0)
      return true;
    else
      return p.CanRead || p.CanCreate || p.CanUpdate || p.CanDelete; // if we have a new record, only consider it dirty if at least one permission is true
  }

  public flipPermission(event: MouseEvent, permission: EntityPermissionEntity, type: 'Read' | 'Create' | 'Update' | 'Delete', flipPermission: boolean) {
    if (flipPermission) {
      switch (type) {
        case 'Read':
          permission.CanRead = !permission.CanRead;
          break;
        case 'Create':
          permission.CanCreate = !permission.CanCreate;
          break;
        case 'Update':
          permission.CanUpdate = !permission.CanUpdate;
          break;
        case 'Delete':
          permission.CanDelete = !permission.CanDelete;
          break;
      }
    }
    // always fire the event
    const value = type === 'Read' ? permission.CanRead : type === 'Create' ? permission.CanCreate : type === 'Update' ? permission.CanUpdate : permission.CanDelete;
    this.PermissionChanged.emit({
      EntityName: this.EntityName,
      RoleName: permission.RoleName!,
      PermissionTypeChanged: type,
      Value: value,
      Cancel: false
    })

    if (!flipPermission)
      event.stopPropagation();
  }
}
