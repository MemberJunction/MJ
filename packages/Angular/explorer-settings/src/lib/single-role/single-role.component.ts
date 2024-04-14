import { Component, OnInit, Input, ViewChild, ChangeDetectorRef } from '@angular/core';

import { BaseEntity, Metadata } from '@memberjunction/core';
import { RoleEntity, UserRoleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { EntityFormDialog } from '@memberjunction/ng-entity-form-dialog';

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

  private _savedRoleName: string = '';
  public get SavedRoleName(): string {
    return this._savedRoleName;
  }
  public set SavedRoleName(value: string) {
    this._savedRoleName = value;
  }
}
 
@Component({
  selector: 'mj-single-role',
  templateUrl: './single-role.component.html',
  styleUrls: ['./single-role.component.css']
})
export class SingleRoleComponent implements OnInit {
  @Input() RoleName!: string;

  @ViewChild('entityForm') entityFormComponent!: EntityFormDialog;

  public gridHeight: number = 750;
  public isLoading: boolean = false;
  public RoleRecord: RoleEntity | null = null;


  public showEntityEditingForm: boolean = false;

  constructor(private cdRef: ChangeDetectorRef) { 
  } 
      
  ngOnInit(): void {
    this.Refresh();
  }

  protected async Refresh() {
    this.isLoading = true;
    const md = new Metadata();
    let r = md.Roles.find(r => r.Name === this.RoleName);
    if (!r) {
      // sometime we are creating a new role, so attempt to refresh our metadata
      await md.Refresh();
      r = md.Roles.find(r => r.Name === this.RoleName);
      if (!r)
        throw new Error(`Role ${this.RoleName} not found`);
    }

    this.RoleRecord = await md.GetEntityObject<RoleEntity>('Roles');
    await this.RoleRecord.Load(r.ID);  
    this.isLoading = false;
  }
 

  public async EditRecord() {
    // show the dialog
    this.showEntityEditingForm = true;
  }

  public async onEntityFormClosed(result: 'Save' | 'Cancel') {
    this.showEntityEditingForm = false;
  }    
}
