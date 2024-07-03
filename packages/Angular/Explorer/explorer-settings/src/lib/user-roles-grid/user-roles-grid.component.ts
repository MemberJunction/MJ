import { Component, OnInit, Input, SimpleChanges, OnChanges } from '@angular/core';

import { Metadata, RunView } from '@memberjunction/core';
import { RoleEntity, UserEntity } from '@memberjunction/core-entities';
 
import { Router } from '@angular/router';
import { UserRoleEntity_Ext } from '../single-role/single-role.component';
 
 
@Component({
  selector: 'mj-user-roles-grid',
  templateUrl: './user-roles-grid.component.html',
  styleUrls: ['./user-roles-grid.component.css']
})
export class UserRolesGridComponent implements OnInit, OnChanges {
  /**
   * The name of the role we are working with, required if Mode is 'Roles'
   */
  @Input() RoleID!: string;
    /**
     * The ID of the user we are working with, required if Mode is 'Users'
     */
  @Input() UserID!: string;
  public isLoading: boolean = false;
  public userRoles: UserRoleEntity_Ext[] = [];
  @Input() public Mode: 'Users' | 'Roles' = 'Users';

  /**
   * The role record we are working with, required if Mode is 'Roles'
   */
  @Input() RoleRecord: RoleEntity | null = null;
  /**
   * The user record we are working with, required if Mode is 'Users'
   */
  @Input() UserRecord: UserEntity | null = null;

  constructor(private router: Router) { 
  } 
      
  public get RoleName(): string {
    const md = new Metadata();
    const role = md.Roles.find(r => r.ID === this.RoleID);
    return role ? role.Name : '';
  }
  ngOnInit(): void {
    this.Refresh()
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes && (changes.RoleRecord || changes.UserRecord)) 
        this.Refresh();     
  }
  async Refresh() {  
    if (this.Mode === 'Roles') 
        if (!this.RoleID || this.RoleID.length === 0 || !this.RoleRecord) 
            throw new Error("RoleID and RoleRecord are required when Mode is 'Roles'")
    if (this.Mode === 'Users')
        if (!this.UserID || !this.UserRecord) 
            throw new Error("UserID and UserRecord are required when Mode is 'Users'")

    const md = new Metadata();  
    this.isLoading = true

    const rv = new RunView();
    const filter: string = this.Mode === 'Roles' ? `RoleID='${this.RoleID}'` : `UserID='${this.UserID}'`;
    const result = await rv.RunView({
        EntityName: 'User Roles',
        ExtraFilter: filter,
        ResultType: 'entity_object'
    })
    if (result.Success) {
        // we have all of the saved permissions now
        // the post-process we need to do now is to see if there are any roles that don't have any existing permissions and if so, we need to create 
        // new permission records for them. We won't actually consider those "Dirty" and save those unless the user actually selects one or more
        // to turn on, we are just doing this to make the grid easy to manage from the user perspective.
        const existingUserRoles = <UserRoleEntity_Ext[]>result.Results;
        existingUserRoles.forEach(ur => {
            ur.Selected = true // flip this on for all records that come from the DB
            ur.SavedUserID = ur.UserID; // stash this in an extra property so we can later set it if we have a delete operation
            ur.SavedUserName = ur.User; // stash this in an extra property so we can later set it if we have a delete operation
            ur.SavedRoleID = ur.RoleID; // stash this in an extra property so we can later set it if we have a delete operation
        }); 

        if (this.Mode === 'Roles') {
            // for the mode of Roles, we want to bring in all of the possible users and then add any that are not in the existingUserRoles array
            const userResult = await rv.RunView({
                EntityName: 'Users',
                ExtraFilter: 'IsActive=1',
                ResultType: 'entity_object'
            })
            if (userResult.Success) {
                const users = <UserEntity[]>userResult.Results;
                const usersNotInRole = users.filter(u => !existingUserRoles.some(p => p.UserID === u.ID));
                for (const u of usersNotInRole) {
                    const ur = await md.GetEntityObject<UserRoleEntity_Ext>('User Roles')
                    ur.NewRecord();
                    ur.RoleID = this.RoleID;
                    ur.SavedRoleID = this.RoleID; // stash this in an extra property so we can later set it if we have a delete operation
                    ur.UserID = u.ID;
                    ur.Set('User', u.Name); // use weak typing to get around the readonly property
                    ur.SavedUserName = u.Name; // stash this in an extra property so we can later set it if we have a delete operation
                    ur.SavedUserID = u.ID; // stash this in an extra property so we can later set it if we have a delete operation
                    ur.Selected = false;
                    existingUserRoles.push(ur);
                }  
            }    
            // finally sort the array
            this.userRoles = existingUserRoles.sort((a, b) => a.User!.localeCompare(b.User!));
        }
        else {
            // for the mode of Users, we want to bring in all of the possible roles and then add any that are not in the existingUserRoles array
            const roles = md.Roles;
            const rolesNotInUser = roles.filter(r => !existingUserRoles.some(p => p.RoleID === r.ID));
            for (const r of rolesNotInUser) {
                const ur = await md.GetEntityObject<UserRoleEntity_Ext>('User Roles')
                ur.NewRecord();
                ur.RoleID = r.ID;
                ur.UserID = this.UserID;
                ur.Set('User', this.UserRecord!.Name); // use weak typing to get around the readonly property
                ur.SavedUserName = this.UserRecord!.Name; // stash this in an extra property so we can later set it if we have a delete operation
                ur.SavedUserID = this.UserID; // stash this in an extra property so we can later set it if we have a delete operation
                ur.SavedRoleID = r.ID; // stash this in an extra property so we can later set it if we have a delete operation
                ur.Selected = false;
                existingUserRoles.push(ur);
            }            
            // finally sort the array
            this.userRoles = existingUserRoles;
        }
    }
    else {
        throw new Error("Error loading user roles: " + result.ErrorMessage)
    }
    this.isLoading = false
  }
 
  public getRoleName(roleID: string): string {
    const md = new Metadata();
    const role = md.Roles.find(r => r.ID === roleID);
    return role ? role.Name : '';
  }

  public async saveUserRoles() {
    // iterate through each permisison and for the ones that are dirty, add to transaction group then commit at once
    const md = new Metadata();
    const tg = await md.CreateTransactionGroup();
    let itemCount: number = 0;
    this.userRoles.forEach(ur => {
      if (this.IsReallyDirty(ur)) {
        ur.TransactionGroup = tg;
        itemCount++;

        // now, we have to determine if we are going to save the record or delete it
        // if ur.Selected === false and we are in the database, we need to delete
        // otherwise, we need to save
        if (ur.Selected)
          ur.Save(); 
        else
          ur.Delete();  
      }
    })
    if (itemCount > 0) {
      if (await tg.Submit()) {
        // for any items in the above that were deleted, we would have had the User property wiped out so we need to go check to see if we have a null ID and if so, copy the UserName back into the User property
        this.userRoles.forEach(ur => {
          if (ur.User === null) {
            ur.Set('User', ur.SavedUserName); // get around the read-only property
            ur.UserID = ur.SavedUserID
            ur.RoleID = this.Mode === 'Roles' ? this.RoleID : ur.SavedRoleID;
          }
        })
      }
    }
  }

  public cancelEdit() {
    if (this.NumDirty > 0) {
      // go through and revert each permission that is REALLY dirty
      this.userRoles.forEach(ur => {
        if (this.IsReallyDirty(ur)) {
          ur.Selected = !ur.Selected; // flip the state so we can revert
        }
      })
    }
  }

  public flipAll() {
    // first, figure out what we have the majority of, if we have more ON, then we will flip to OFF, otherwise we will flip to ON
    let onCount = 0;
    let offCount = 0;
    this.userRoles.forEach(ur => {
      if (ur.Selected)
        onCount++;
      else
        offCount++;
    })
    const value = offCount > onCount;

    // now set the permission for each permission record
    for (const ur of this.userRoles) {
      ur.Selected = value;
      this.flipState(undefined, ur, false); // call this function but tell it to NOT actually flip the permission, just to fire the event
    }
  }

  public get NumDirty(): number {
    return this.userRoles.filter(ur => this.IsReallyDirty(ur)).length;
  }

  protected IsReallyDirty(ur: UserRoleEntity_Ext): boolean {
    // logic is simple, if we are in the database, but the checkbox is not checked (or vice versa), then we are dirty
    if (ur.Selected && ur.IsSaved)
      return false; // if we are in the database and the checkbox is checked, we are not dirty
    else if (!ur.Selected && ur.IsSaved)
      return true; // if we are in the database and the checkbox is not checked, we are dirty because we'd have to be removed
    else if (ur.Selected)
      return true; // if we are NOT in the database and the checkbox is checked, we are dirty because we'd have to be added
    else
      return false; 
  }

  public flipState($event: MouseEvent | undefined, ur: UserRoleEntity_Ext, flipState: boolean) {
    if (flipState)
      ur.Selected = !ur.Selected;
    else if ($event)
      $event.stopPropagation();
  }
}
