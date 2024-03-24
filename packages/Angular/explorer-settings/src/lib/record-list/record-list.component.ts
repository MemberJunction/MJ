import { Component, OnInit, Input, SimpleChanges, OnChanges, EventEmitter, Output } from '@angular/core';

import { BaseEntity, EntityFieldInfo, Metadata, RunView } from '@memberjunction/core';
import { SharedService, kendoSVGIcon } from '@memberjunction/ng-shared'
import { Router } from '@angular/router';
 
 
@Component({
  selector: 'mj-record-list',
  templateUrl: './record-list.component.html',
  styleUrls: ['./record-list.component.css']
})
export class RecordListComponent implements OnInit {
  @Input() EntityName: string = '';
  @Input() Columns: string[] = [];
  @Input() SortBy: string = '';
  @Input() AllowDelete: boolean = true;
  @Input() AllowNew: boolean = true;
  @Input() AllowEdit: boolean = true;
  /**
   * If AllowEdit or AllowNew is true, this is the section name to display for editing a new or existing record.
   */
  @Input() EditSectionName: string = 'details';

  @Output() RecordSelected = new EventEmitter<BaseEntity>();
  @Output() RecordEdited = new EventEmitter<BaseEntity>();
  @Output() RecordCreated = new EventEmitter<BaseEntity>();

  public isLoading: boolean = false;
  public records: BaseEntity[] = [];


  public kendoSVGIcon = kendoSVGIcon

  constructor(private router: Router) { 
  } 
      
  ngOnInit(): void {
    this.Refresh()
  }

  async Refresh() { 
    this.isLoading = true

    const md = new Metadata();
    if (this.Columns.length === 0) {
      // populate this by default by taking all columns if entity has < 10 columns, otherwise include columns that have DefaultInView=1, and if we have no columns with DefaultInView=1, then include the first 10 columns
      const e = md.Entities.find(e => e.Name === this.EntityName);
      if (e) {
        if (e.Fields.length < 10)
          this.Columns = e.Fields.map(f => f.Name);
        else {
          const defaultInViewColumns = e.Fields.filter(c => c.DefaultInView);
          if (defaultInViewColumns.length > 0)
            this.Columns = defaultInViewColumns.map(f => f.Name);
          else
            this.Columns = e.Fields.slice(0, 10).map(f => f.Name);
        }
      }
    }
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: this.EntityName,
      ResultType: 'entity_object'
    })
    if (result.Success) {
      this.records = result.Results;
      if (this.SortBy && this.SortBy.trim().length > 0) {
        this.records.sort((a, b) => a.Get(this.SortBy).localeCompare(b.Get(this.SortBy)));
      }
    }
    else {
      throw new Error("Error loading records: " + result.ErrorMessage)
    }
    this.isLoading = false
  }

  public selectRecord(event: MouseEvent | undefined, r: BaseEntity) {
    if (event)
      event.stopPropagation(); // prevent row from getting click

    this.RecordSelected.emit(r);
  }

  public deleteRecordDialogVisible: boolean = false;
  public deleteRecordItem!: BaseEntity | null;
  public async deleteRecord(event: MouseEvent, r: BaseEntity) {
    // confirm with the user first
    this.deleteRecordItem = r;
    this.deleteRecordDialogVisible = true;
    if (event)
      event.stopPropagation(); // prevent row from getting click
  }

  public async closeDeleteDialog(result: 'Yes' | 'No') {
    // if the user confirms, delete the record
    this.deleteRecordDialogVisible = false;
    if (result === 'Yes') {
      if (!await this.deleteRecordItem!.Delete()) {
        // show an error message
        SharedService.Instance.CreateSimpleNotification('Error deleting record', 'error', 3000);
      }
      else 
        this.Refresh(); // refresh the list
    }
    this.deleteRecordItem = null;
  }

  public editOrNewRecord!: BaseEntity;
  public showEditOrNewRecordForm: boolean = false;
  public recordMode: 'new' | 'edit' = 'new';
  public async createNewRecord() {
    // attempt to create a new record and if success, navigate to the new record
    const md = new Metadata();
    this.editOrNewRecord = await md.GetEntityObject(this.EntityName);
    if (this.editOrNewRecord) {
      this.editOrNewRecord.NewRecord();
      this.recordMode = 'new';
      this.showEditOrNewRecordForm = true;
    }
  }

  public async editRecord(event: MouseEvent, r: BaseEntity) {
    this.editOrNewRecord = r;
    this.recordMode = 'edit';
    this.showEditOrNewRecordForm = true;
    if (event)
      event.stopPropagation(); // prevent row from getting click
  }

  public async onEditOrNewRecordFormClosed(result: 'Save' | 'Cancel') {
    this.showEditOrNewRecordForm = false;
    if (result === 'Save') {
      // the dialog already saved the record, just check to make sure it was saved and if so, navigate
      if (this.editOrNewRecord.IsSaved) {
        if (this.recordMode === 'edit')
          this.RecordEdited.emit(this.editOrNewRecord);
        else
          this.RecordCreated.emit(this.editOrNewRecord);

        // refresh our grid now
        await this.Refresh();
      }
      else
        throw new Error('Record was not saved');
    }
  }

  public getRecordName(r: BaseEntity): string {
    // check to see if we have any columns in the entity that have IsNameField = 1, the fall back from there is to look for a column named "Name", and if that doesn't work we return the primary key(s)
    const md = new Metadata();
    const e = md.Entities.find(e => e.Name === this.EntityName);
    if (!e)
      throw new Error('Entity not found: ' + this.EntityName);

    const nameField = e.Fields.find(c => c.IsNameField);
    if (nameField)
      return r.Get(nameField.Name);
    else {
      const nameField = e.Fields.find(c => c.Name === 'Name');
      if (nameField)
        return r.Get("Name");
      else {
        // iterate through all primary keys and form a comma separated list
        const pkString = r.PrimaryKeys.map(pk => r.Get(pk.Name)).join(', ');
        return "Record: " + pkString;
      }
    }
  }
}
