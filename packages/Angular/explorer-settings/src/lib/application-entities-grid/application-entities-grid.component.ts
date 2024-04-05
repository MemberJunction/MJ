import { Component, OnInit, Input, SimpleChanges, OnChanges } from '@angular/core';

import { BaseEntity, Metadata, RunView } from '@memberjunction/core';
import { SharedService, kendoSVGIcon } from '@memberjunction/ng-shared'
import { ApplicationEntity, ApplicationEntityEntity, EntityEntity, RoleEntity, UserEntity, UserRoleEntity } from '@memberjunction/core-entities';
 
import { Router } from '@angular/router';
import { RegisterClass } from '@memberjunction/global';


@RegisterClass(BaseEntity, 'Application Entities', 10) // register this with a high priority so we are used here, we just need to extend it to add a property as a flag to know if it's in the database or not
export class ApplicationEntityEntity_Ext extends ApplicationEntityEntity {
  private _selected: boolean = false;
  public get Selected(): boolean {
    return this._selected;
  }
  public set Selected(value: boolean) {
    this._selected = value;
  }

  private _applicationName: string = '';
  public get SavedApplicationName(): string {
    return this._applicationName;
  }
  public set SavedApplicationName(value: string) {
    this._applicationName = value;
  }

  private _entityID: number = 0;
  public get SavedEntityID(): number {
    return this._entityID;
  }
  public set SavedEntityID(value: number) {
    this._entityID = value;
  }
}


 
@Component({
  selector: 'mj-application-entities-grid',
  templateUrl: './application-entities-grid.component.html',
  styleUrls: ['./application-entities-grid.component.css']
})
export class ApplicationEntitiesGridComponent implements OnInit, OnChanges {
  /**
   * The name of the application we are working with, required if Mode is 'Applications'
   */
  @Input() ApplicationName!: string;
    /**
     * The ID of the entity we are working with, required if Mode is 'Entities'
     */
  @Input() EntityID!: number;
  public isLoading: boolean = false;
  public rows: ApplicationEntityEntity_Ext[] = [];
  @Input() public Mode: 'Applications' | 'Entities' = 'Applications';

  /**
   * The role record we are working with, required if Mode is 'Appliations'
   */
  @Input() ApplicationRecord: ApplicationEntity | null = null;
  /**
   * The user record we are working with, required if Mode is 'Entities'
   */
  @Input() EntityRecord: EntityEntity | null = null;

  public kendoSVGIcon = kendoSVGIcon

  constructor(private router: Router) { 
  } 
      
  ngOnInit(): void {
    this.Refresh()
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes && (changes.RoleRecord || changes.UserRecord)) 
        this.Refresh();     
  }
  async Refresh() {  
    if (this.Mode === 'Applications') 
        if (!this.ApplicationName || this.ApplicationName.length === 0 || !this.ApplicationRecord) 
            throw new Error("ApplicationName and ApplicationRecord are required when Mode is 'Applications'")
    if (this.Mode === 'Entities')
        if (!this.EntityID || !this.EntityRecord) 
            throw new Error("EntityID and EntityRecord are required when Mode is 'Entities'")

    const md = new Metadata();  
    this.isLoading = true

    const rv = new RunView();
    const filter: string = this.Mode === 'Applications' ? `Application='${this.ApplicationName}'` : `EntityID=${this.EntityID}`;
    const result = await rv.RunView({
        EntityName: 'Application Entities',
        ExtraFilter: filter,
        ResultType: 'entity_object'
    })
    if (result.Success) {
        // we have all of the saved records now
        const existing = <ApplicationEntityEntity_Ext[]>result.Results;
        existing.forEach(ae => {
            ae.Selected = true // flip this on for all records that come from the DB
            ae.SavedEntityID = ae.EntityID; // stash this in an extra property so we can later set it if we have a delete operation
            ae.SavedApplicationName = ae.Application; // stash this in an extra property so we can later set it if we have a delete operation
        }); 

        if (this.Mode === 'Applications') {
            const entitiesToAdd = md.Entities.filter(e => !existing.some(ee => ee.EntityID === e.ID));
            for (const e of entitiesToAdd) {
                const ae = await md.GetEntityObject<ApplicationEntityEntity_Ext>('Application Entities');
                ae.NewRecord();
                ae.Sequence = 1000; // default value, isn't used anywhere 

                ae.DefaultForNewUser = false; // not used anywhere
                
                ae.ApplicationName = this.ApplicationName;
                ae.Set('Application', this.ApplicationName); // use weak typing to get around the readonly property
                ae.SavedApplicationName = this.ApplicationName; // stash this in an extra property so we can later set it if we have a delete operation

                ae.EntityID = e.ID;
                ae.SavedEntityID = e.ID; // stash this in an extra property so we can later set it if we have a delete operation
                ae.Set('Entity', e.Name); // use weak typing to get around the readonly property

                existing.push(ae);
            }  
            // finally sort the array
            this.rows = existing.sort((a, b) => a.Entity!.localeCompare(b.Entity!));
        }
        else {
            // for the mode of Entities, we want to bring in all of the possible applications and then add any that are not in the existing array
            const appsToAdd = md.Applications.filter(a => !existing.some(e => e.Application === a.Name));
            for (const a of appsToAdd) {
                const ae = await md.GetEntityObject<ApplicationEntityEntity_Ext>('Application Entities');
                ae.NewRecord();
                ae.Sequence = 1000; // default value, isn't used anywhere 

                ae.ApplicationName = a.Name;
                ae.Set('Application', a.Name); // use weak typing to get around the readonly property
                ae.SavedApplicationName = a.Name; // stash this in an extra property so we can later set it if we have a delete operation

                ae.EntityID = this.EntityID;
                ae.SavedEntityID = this.EntityID; // stash this in an extra property so we can later set it if we have a delete operation
                ae.Set('Entity', this.EntityRecord!.Name); // use weak typing to get around the readonly property

                existing.push(ae);
            }            
            // finally sort the array
            this.rows = existing.sort((a, b) => a.Application!.localeCompare(b.Application!));
        }
    }
    else {
        throw new Error("Error loading application entities: " + result.ErrorMessage)
    }
    this.isLoading = false
  }
 
  public async save() {
    // iterate through each permisison and for the ones that are dirty, add to transaction group then commit at once
    const md = new Metadata();
    const tg = await md.CreateTransactionGroup();
    let itemCount: number = 0;
    this.rows.forEach(r => {
      if (this.IsReallyDirty(r)) {
        r.TransactionGroup = tg;
        itemCount++;

        // now, we have to determine if we are going to save the record or delete it
        // if ur.Selected === false and we are in the database, we need to delete
        // otherwise, we need to save
        if (r.Selected)
          r.Save(); 
        else
          r.Delete();  
      }
    })
    if (itemCount > 0) {
      if (await tg.Submit()) {
        // for any items in the above that were deleted, we would have had the ApplicationName/Application and Entity property wiped out so we need to go check to see if we have a null ID and if so, copy the values back in
        this.rows.forEach(r => {
          if (r.Application === null || r.ApplicationName === null) {
            r.Set('Application', r.SavedApplicationName); // get around the read-only property
            r.ApplicationName = r.SavedApplicationName
          }
          if (r.Entity === null || r.EntityID === null) {
            r.EntityID = r.SavedEntityID; // get around the read-only property
            const e = md.Entities.find(ee => ee.ID === r.SavedEntityID);
            r.Set('Entity', e?.Name); // get around the read-only property
          }
        })
      }
    }
  }

  public cancelEdit() {
    if (this.NumDirty > 0) {
      // go through and revert each permission that is REALLY dirty
      this.rows.forEach(r => {
        if (this.IsReallyDirty(r)) {
          r.Selected = !r.Selected; // flip the state so we can revert
        }
      })
    }
  }

  public flipAll() {
    // first, figure out what we have the majority of, if we have more ON, then we will flip to OFF, otherwise we will flip to ON
    let onCount = 0;
    let offCount = 0;
    this.rows.forEach(r => {
      if (r.Selected)
        onCount++;
      else
        offCount++;
    })
    const value = offCount > onCount;

    // now set the permission for each permission record
    for (const r of this.rows) {
      r.Selected = value;
      this.flipState(undefined, r, false); // call this function but tell it to NOT actually flip the permission, just to fire the event
    }
  }

  public get NumDirty(): number {
    return this.rows.filter(r => this.IsReallyDirty(r)).length;
  }

  protected IsReallyDirty(ae: ApplicationEntityEntity_Ext): boolean {
    // logic is simple, if we are in the database, but the checkbox is not checked (or vice versa), then we are dirty
    if (ae.Selected && ae.ID > 0)
      return false; // if we are in the database and the checkbox is checked, we are not dirty
    else if (!ae.Selected && ae.ID > 0)
      return true; // if we are in the database and the checkbox is not checked, we are dirty because we'd have to be removed
    else if (ae.Selected)
      return true; // if we are NOT in the database and the checkbox is checked, we are dirty because we'd have to be added
    else
      return false; 
  }

  public flipState($event: MouseEvent | undefined, ur: ApplicationEntityEntity_Ext, flipState: boolean) {
    if (flipState)
      ur.Selected = !ur.Selected;
    else if ($event)
      $event.stopPropagation();
  }
}
