import { Component, OnInit, Input, SimpleChanges, OnChanges } from '@angular/core';

import { BaseEntity, Metadata, RunView } from '@memberjunction/core';
import { kendoSVGIcon } from '@memberjunction/ng-shared'
import { UserEntity, UserRoleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';

@RegisterClass(BaseEntity, 'User Roles', 10) // register this with a high priority so we are used here, we just need to extend it to add a property as a flag to know if it's in the database or not
export class UserRoleEntity_Ext extends UserRoleEntity {
  private _selected: boolean = false;
  public get Selected(): boolean {
    return this._selected;
  }
  public set Selected(value: boolean) {
    this._selected = value;
  }

  private _userName: string = '';
  public get SavedUserName(): string {
    return this._userName;
  }
  public set SavedUserName(value: string) {
    this._userName = value;
  }

  private _userID: number = 0;
  public get SavedUserID(): number {
    return this._userID;
  }
  public set SavedUserID(value: number) {
    this._userID = value;
  }
}
 
@Component({
  selector: 'mj-single-role',
  templateUrl: './single-role.component.html',
  styleUrls: ['./single-role.component.css']
})
export class SingleRoleComponent implements OnInit, OnChanges {
  @Input() RoleName!: string;
  @Input() BottomMargin: number = 0;

  public userRoles: UserRoleEntity_Ext[] = [];
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
    if (this.RoleName && this.RoleName.length > 0) {
      const startTime = new Date().getTime();
      this.isLoading = true

      const md = new Metadata();

      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'User Roles',
        ExtraFilter: `RoleName='${this.RoleName}'`,
        ResultType: 'entity_object'
      })
      if (result.Success) {
        // we have all of the saved permissions now
        // the post-process we need to do now is to see if there are any roles that don't have any existing permissions and if so, we need to create 
        // new permission records for them. We won't actually consider those "Dirty" and save those unless the user actually selects one or more
        // to turn on, we are just doing this to make the grid easy to manage from the user perspective.
        const existingUserRoles = <UserRoleEntity_Ext[]>result.Results;
        existingUserRoles.forEach(ur => {
          ur.Selected = true
          ur.SavedUserID = ur.UserID; // stash this in an extra property so we can later set it if we have a delete operation
          ur.SavedUserName = ur.User; // stash this in an extra property so we can later set it if we have a delete operation
        }); // flip this on for all records that come from the DB

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
            ur.RoleName = this.RoleName;
            ur.UserID = u.ID;
            ur.Set('User', u.Name); // use weak typing to get around the readonly property
            ur.SavedUserName = u.Name; // stash this in an extra property so we can later set it if we have a delete operation
            ur.SavedUserID = u.ID; // stash this in an extra property so we can later set it if we have a delete operation
            ur.Selected = false;
            existingUserRoles.push(ur);
          }  
        }
        this.userRoles = existingUserRoles.sort((a, b) => a.User!.localeCompare(b.User!));
      }
      else {
        throw new Error("Error loading user roles: " + result.ErrorMessage)
      }
      this.isLoading = false
    }
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
            ur.RoleName = this.RoleName;
          }
        })
      }
    }
  }
  public get NumDirty(): number {
    return this.userRoles.filter(ur => this.IsReallyDirty(ur)).length;
  }

  protected IsReallyDirty(ur: UserRoleEntity_Ext): boolean {
    // logic is simple, if we are in the database, but the checkbox is not checked (or vice versa), then we are dirty
    if (ur.Selected && ur.ID > 0)
      return false; // if we are in the database and the checkbox is checked, we are not dirty
    else if (!ur.Selected && ur.ID > 0)
      return true; // if we are in the database and the checkbox is not checked, we are dirty because we'd have to be removed
    else if (ur.Selected)
      return true; // if we are NOT in the database and the checkbox is checked, we are dirty because we'd have to be added
    else
      return false; 
  }

  public flipState($event: MouseEvent, ur: UserRoleEntity_Ext, flipState: boolean) {
    if (flipState)
      ur.Selected = !ur.Selected;
    else
      $event.stopPropagation();
  }
}
