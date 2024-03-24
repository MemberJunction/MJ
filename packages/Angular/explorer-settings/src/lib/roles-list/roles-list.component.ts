import { Component, OnInit, Input, SimpleChanges, OnChanges } from '@angular/core';

import { BaseEntity, Metadata, RunView } from '@memberjunction/core';
import { SharedService, kendoSVGIcon } from '@memberjunction/ng-shared'
import { RoleEntity, UserEntity, UserRoleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { Router } from '@angular/router';
 
 
@Component({
  selector: 'mj-roles-list',
  templateUrl: './roles-list.component.html',
  styleUrls: ['./roles-list.component.css']
})
export class RolesListComponent implements OnInit {
  public isLoading: boolean = false;
  public roles: RoleEntity[] = [];

  public kendoSVGIcon = kendoSVGIcon

  constructor(private router: Router) { 
  } 
      
  ngOnInit(): void {
    this.Refresh()
  }

  async Refresh() { 
    const startTime = new Date().getTime();
    this.isLoading = true

    const md = new Metadata();

    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'Roles',
      ResultType: 'entity_object'
    })
    if (result.Success) {
      this.roles = <RoleEntity[]>result.Results;
      this.roles.sort((a, b) => a.Name!.localeCompare(b.Name!));
    }
    else {
      throw new Error("Error loading roles: " + result.ErrorMessage)
    }
    this.isLoading = false
  }

  public selectRole(event: MouseEvent | undefined, r: RoleEntity) {
    if (event)
      event.stopPropagation(); // prevent row from getting click

    // change the route to point to the /settings/role/{r.Name} route
    this.router.navigate(['/settings/role', r.Name]);
  }

  public deleteRoleDialogVisible: boolean = false;
  public deleteRoleRecord!: RoleEntity | null;
  public async deleteRole(event: MouseEvent, r: RoleEntity) {
    // confirm with the user first
    this.deleteRoleRecord = r;
    this.deleteRoleDialogVisible = true;
    event.stopPropagation(); // prevent row from getting click
  }

  public async closeDeleteRoleDialog(result: 'Yes' | 'No') {
    // if the user confirms, delete the role
    this.deleteRoleDialogVisible = false;
    if (result === 'Yes') {
      if (!await this.deleteRoleRecord!.Delete()) {
        // show an error message
        SharedService.Instance.CreateSimpleNotification('Error deleting role', 'error', 3000);
      }
      else 
        this.Refresh(); // refresh the list
    }
    this.deleteRoleRecord = null;
  }

  public newRoleRecord!: RoleEntity;
  public showNewRoleForm: boolean = false;
  public async createNewRole() {
    // attempt to create a new role and if success, navigate to the new role
    const md = new Metadata();
    this.newRoleRecord = await md.GetEntityObject<RoleEntity>('Roles');
    if (this.newRoleRecord) {
      this.newRoleRecord.NewRecord();
      this.showNewRoleForm = true;
    }
  }

  public async onNewRoleFormClosed(result: 'Save' | 'Cancel') {
    this.showNewRoleForm = false;
    if (result === 'Save') {
      // the dialog already saved the record, just check to make sure it was saved and if so, navigate
      if (this.newRoleRecord.ID) {
        const md = new Metadata();
        // force a refresh since we have a new role
        SharedService.Instance.CreateSimpleNotification('Role created successfully, refreshing metadata...', 'info', 3000);
        this.router.navigate(['/settings/role', this.newRoleRecord.Name]);
      }
      else
        throw new Error('New role record was not saved');
    }
  }
}
