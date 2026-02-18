import { Component, Output, EventEmitter, OnInit, Input, SimpleChanges, OnChanges } from '@angular/core';

import { Metadata, RunView } from '@memberjunction/core';
import { MJEntityPermissionEntity } from '@memberjunction/core-entities';


export type EntityPermissionChangedEvent = {
  EntityName: string,
  RoleID: string
  PermissionTypeChanged: 'Read' | 'Create' | 'Update' | 'Delete'
  Value: boolean
  Cancel: boolean
}
 
@Component({
  standalone: false,
  selector: 'mj-entity-permissions-grid',
  templateUrl: './entity-permissions-grid.component.html',
  styleUrls: ['./entity-permissions-grid.component.css']
})
export class EntityPermissionsGridComponent implements OnInit, OnChanges {
  @Input() Mode: 'Entity' | 'Role' = 'Entity';
  @Input() EntityName!: string; // used when Mode is 'Entity'
  @Input() RoleName!: string; // used when Mode is 'Role'
  @Input() BottomMargin: number = 0;

  @Output() PermissionChanged = new EventEmitter<EntityPermissionChangedEvent>();

  public permissions: MJEntityPermissionEntity[] = [];
  public gridHeight: number = 750;
  public isLoading: boolean = false;

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

  ValidateInputs() {
    if (this.Mode === 'Entity' && (!this.EntityName || this.EntityName.length === 0))
      throw new Error("EntityName is required when Mode is 'Entity'")
    if (this.Mode === 'Role' && (!this.RoleName || this.RoleName.length === 0))
      throw new Error("RoleName is required when Mode is 'Role'")   
  }
  async Refresh() { 
    this.ValidateInputs();
    const startTime = new Date().getTime();
    this.isLoading = true

    const md = new Metadata();
    const entity = md.Entities.find(e => e.Name === this.EntityName);
    if (this.Mode === 'Entity' && !entity)
      throw new Error("Entity not found: " + this.EntityName)

    const r = md.Roles.find(r => r.Name === this.RoleName);
    if (this.Mode === 'Role' && !r)
      throw new Error("Role not found: " + this.RoleName)

    const rv = new RunView();
    const filter: string = this.Mode === 'Entity' ? `EntityID='${entity!.ID}'` : `RoleName='${r?.Name}'`;
    const result = await rv.RunView({
      EntityName: 'MJ: Entity Permissions',
      ExtraFilter: filter,
      OrderBy: 'RoleName ASC, Entity ASC',
      ResultType: 'entity_object'
    })
    if (result.Success) {
      // we have all of the saved permissions now
      // the post-process we need to do now is to see if there are any roles that don't have any existing permissions and if so, we need to create 
      // new permission records for them. We won't actually consider those "Dirty" and save those unless the user actually selects one or more
      // to turn on, we are just doing this to make the grid easy to manage from the user perspective.
      const existingPermissions = <MJEntityPermissionEntity[]>result.Results;
      const roles = md.Roles;

      if (this.Mode === 'Entity') {
        const rolesWithNoPermissions = roles.filter(r => !existingPermissions.some(p => p.RoleID === r.ID));
        for (const r of rolesWithNoPermissions) {
          const p = await md.GetEntityObject<MJEntityPermissionEntity>('MJ: Entity Permissions')
           
          await p.LoadFromData({
            ID: null,
            Entity: entity!.Name,
            EntityID: entity!.ID,
            RoleID: r!.ID,
            CanRead: false,
            CanCreate: false,
            CanUpdate: false,
            CanDelete: false
          });
          existingPermissions.push(p);
        }
        this.permissions = existingPermissions;
      }
      else if (this.Mode === 'Role') {
        // for the mode of Role, that means we want to show all entities and their permissions for the given role
        const entitiesWithNoPermissions = md.Entities.filter(e => !existingPermissions.some(p => p.EntityID === e.ID));
        for (const e of entitiesWithNoPermissions) {
          const p = await md.GetEntityObject<MJEntityPermissionEntity>('MJ: Entity Permissions')
          
          await p.LoadFromData({
            ID: null,
            Entity: e.Name,
            EntityID: e.ID,
            RoleName: r!.Name,
            CanRead: false,
            CanCreate: false,
            CanUpdate: false,
            CanDelete: false
          });
          existingPermissions.push(p);
        }
        this.permissions = existingPermissions.sort((a, b) => a.Entity!.localeCompare(b.Entity!));  
      }
    }
    else {
      throw new Error("Error loading entity permissions: " + result.ErrorMessage)
    }
    this.isLoading = false
  }
    

  public getRoleName(roleID: string): string {
    const md = new Metadata();
    const r = md.Roles.find(r => r.ID === roleID);
    return r ? r.Name : '';
  }
  
  public async savePermissions() {
    if (this.NumDirtyPermissions > 0) {
      // iterate through each permisison and for the ones that are dirty, add to transaction group then commit at once
      const md = new Metadata();
      const tg = await md.CreateTransactionGroup();
      let itemCount: number = 0;
      for (const p of this.permissions) {
        if (this.IsPermissionReallyDirty(p)) {
          p.TransactionGroup = tg;
          itemCount++;
          await p.Save();  
        }
      }
      if (itemCount > 0)
        await tg.Submit();
    }
  }

  public async cancelEdit() {
    if (this.NumDirtyPermissions > 0) {
      // go through and revert each permission that is REALLY dirty
      this.permissions.forEach(p => {
        if (this.IsPermissionReallyDirty(p)) {
          p.Revert();
        }
      })
    }
  }

  public get NumDirtyPermissions(): number {
    return this.permissions.filter(p => this.IsPermissionReallyDirty(p)).length;
  }

  protected IsPermissionReallyDirty(p: MJEntityPermissionEntity): boolean {
    if (!p.Dirty)
      return false;
    else if (p.IsSaved)
      return true;
    else
      return p.CanRead || p.CanCreate || p.CanUpdate || p.CanDelete; // if we have a new record, only consider it dirty if at least one permission is true
  }

  public flipAllPermissions(type: 'Read' | 'Create' | 'Update' | 'Delete') {
    // first, figure out what we have the majority of, if we have more ON, then we will flip to OFF, otherwise we will flip to ON
    let onCount = 0;
    let offCount = 0;
    this.permissions.forEach(p => {
      if (type === 'Read') {
        if (p.CanRead)
          onCount++;
        else
          offCount++;
      }
      else if (type === 'Create') {
        if (p.CanCreate)
          onCount++;
        else
          offCount++;
      }
      else if (type === 'Update') {
        if (p.CanUpdate)
          onCount++;
        else
          offCount++;
      }
      else if (type === 'Delete') {
        if (p.CanDelete)
          onCount++;
        else
          offCount++;
      }
    })
    const value = offCount > onCount;

    // now set the permission for each permission record
    for (const p of this.permissions) {
      switch (type) {
        case 'Read':
          p.CanRead = value;
          break;
        case 'Create':
          p.CanCreate = value;
          break;
        case 'Update':
          p.CanUpdate = value;
          break;
        case 'Delete':
          p.CanDelete = value;
          break;
      }
      this.flipPermission(undefined, p, type, false); // call this function but tell it to NOT actually flip the permission, just to fire the event
    }
  }

  public revertRow(event: MouseEvent, permission: MJEntityPermissionEntity) {
    if (this.IsPermissionReallyDirty(permission)) {
      permission.Revert();
      event.stopPropagation(); // don't bubble up to the parent row because that will do something else...
    }
  }

  public flipRow(permission: MJEntityPermissionEntity) {
    // if 2 or more are on, flip all to off, otherwise flip all to on
    const onCount = (permission.CanRead ? 1 : 0) + (permission.CanCreate ? 1 : 0) + (permission.CanUpdate ? 1 : 0) + (permission.CanDelete ? 1 : 0);
    const newValue = onCount < 2;

    if (permission.CanRead !== newValue) {
      permission.CanRead = newValue;
      this.flipPermission(undefined, permission, 'Read', false); // fire the event but don't actually flip the permission
    }

    if (permission.CanCreate !== newValue) {
      permission.CanCreate = newValue;
      this.flipPermission(undefined, permission, 'Create', false); // fire the event but don't actually flip the permission
    }

    if (permission.CanUpdate !== newValue) {
      permission.CanUpdate = newValue;
      this.flipPermission(undefined, permission, 'Update', false); // fire the event but don't actually flip the permission
    }

    if (permission.CanDelete !== newValue) {
      permission.CanDelete = newValue;
      this.flipPermission(undefined, permission, 'Delete', false); // fire the event but don't actually flip the permission
    }
  }

  public flipPermission(event: MouseEvent | undefined, permission: MJEntityPermissionEntity, type: 'Read' | 'Create' | 'Update' | 'Delete', flipPermission: boolean) {
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
      RoleID: permission.RoleID!,
      PermissionTypeChanged: type,
      Value: value,
      Cancel: false
    })

    if (!flipPermission && event)
      event.stopPropagation();
  }
}
