import { Component, ViewChild, ElementRef, Output, EventEmitter, OnInit, Input, AfterViewInit } from '@angular/core';

import { Metadata, RunView } from '@memberjunction/core';
import { kendoSVGIcon } from '@memberjunction/ng-shared'
import { EntityPermissionEntity } from '@memberjunction/core-entities';

import { CellClickEvent, CreateFormGroupArgs, GridComponent} from "@progress/kendo-angular-grid";
import { FormBuilder, FormGroup } from '@angular/forms';


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
export class EntityPermissionsGridComponent implements OnInit {
  @Input() EntityName!: string;
  @Input() BottomMargin: number = 0;

  @Output() PermissionChanged = new EventEmitter<EntityPermissionChangedEvent>();

  @ViewChild('kendoGrid', { read: GridComponent }) kendoGridElement: GridComponent | null = null;
  @ViewChild('kendoGrid', { read: ElementRef }) kendoGridElementRef: ElementRef | null = null;

  public permissions: EntityPermissionEntity[] = [];
  public gridHeight: number = 750;
  public isLoading: boolean = false;


  public kendoSVGIcon = kendoSVGIcon

  //public formGroup!: FormGroup;

  constructor() {//private formBuilder: FormBuilder) {
    //this.createFormGroup = this.createFormGroup.bind(this);
  } 

  public async cellClickHandler(args: CellClickEvent) {
    // to do implement click handler for a query based on the entity field data
    // bubble up the event to the parent component
    this.PermissionChanged.emit(
      args.dataItem
    );
  } 
     
  ngOnInit(): void {
    this.Refresh()
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
        ExtraFilter: 'Entity = \'' + this.EntityName + '\'',
        OrderBy: 'RoleName ASC',
        ResultType: 'entity_object'
      })
      if (result.Success) {
        this.permissions = <EntityPermissionEntity[]>result.Results;
        // the above results in the grid binding
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
      if (p.Dirty) {
        p.TransactionGroup = tg;
        itemCount++;
        p.Save(); // don't await since we are using a tg
      }
    })
    if (itemCount > 0)
      await tg.Submit();
  }
  public get NumDirtyPermissions(): number {
    return this.permissions.filter(p => p.Dirty).length;
  }
}
