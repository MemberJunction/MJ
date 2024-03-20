import { Component, OnInit, Input, SimpleChanges, OnChanges } from '@angular/core';

import { BaseEntity, Metadata, RunView } from '@memberjunction/core';
import { kendoSVGIcon } from '@memberjunction/ng-shared'
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

  public selectRole(r: RoleEntity) {
    // change the route to point to the /settings/role/{r.Name} route
    this.router.navigate(['/settings/role', r.Name]);
  }
}
