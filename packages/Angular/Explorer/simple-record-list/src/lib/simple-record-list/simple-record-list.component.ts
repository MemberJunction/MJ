import { Component, OnInit, Input, EventEmitter, Output } from '@angular/core';

import { BaseEntity, Metadata, RunView } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
 
 
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
@Component({
  standalone: false,
  selector: 'mj-simple-record-list',
  templateUrl: './simple-record-list.component.html',
  styleUrls: ['./simple-record-list.component.css']
})
export class SimpleRecordListComponent extends BaseAngularComponent implements OnInit {
  /**
   * Name of the entity to display records for.
   */
  @Input() EntityName: string = '';
  /**
   * List of columns to display in the grid. If empty and the entity has > 10 columns, those columns marked as DefaultInView=1 will be used, otherwise the first 10 columns will be used.
   */
  @Input() Columns: string[] = [];
  /**
   * Name of the column to sort by. If empty, no sorting is done.
   */
  @Input() SortBy: string = '';
  /**
   * If true, the delete button will be shown for each record.
   */
  @Input() AllowDelete: boolean = true;
  /**
   * If true, the new button will be shown.
   */
  @Input() AllowNew: boolean = true;
  /**
   * If true, the edit button will be shown for each record.
   */
  @Input() AllowEdit: boolean = true;
  /**
   * If true, a custom action button will be shown for each record.
   */
  @Input() AllowCustomAction: boolean = false;
  /**
   * The CSS class for the custom action button icon (e.g. 'fa-user-lock')
   */
  @Input() CustomActionIcon: string = '';
  /**
   * A function that returns the appropriate icon based on the record
   * Signature: (record: BaseEntity) => string
   * If provided, overrides CustomActionIcon
   */
  @Input() CustomActionIconFunction: ((record: BaseEntity) => string) | null = null;
  /**
   * Tooltip text for the custom action button
   */
  @Input() CustomActionTooltip: string = '';
  /**
   * A function that returns the appropriate tooltip text based on the record
   * Signature: (record: BaseEntity) => string
   * If provided, overrides CustomActionTooltip
   */
  @Input() CustomActionTooltipFunction: ((record: BaseEntity) => string) | null = null;
  /**
   * Title for the custom action confirmation dialog
   */
  @Input() CustomActionDialogTitle: string = 'Confirm Action';
  /**
   * Message for the custom action confirmation dialog
   */
  @Input() CustomActionDialogMessage: string = 'Are you sure you want to perform this action?';
  /**
   * Optional additional information for the custom action confirmation dialog
   */
  @Input() CustomActionDialogInfo: string = '';
  /**
   * If AllowEdit or AllowNew is true, this is the section name to display for editing a new or existing record.
   */
  @Input() EditSectionName: string = 'details';

  @Output() RecordSelected = new EventEmitter<BaseEntity>();
  @Output() RecordEdited = new EventEmitter<BaseEntity>();
  @Output() RecordCreated = new EventEmitter<BaseEntity>();
  @Output() CustomActionClicked = new EventEmitter<BaseEntity>();
  @Output() CustomActionConfirmed = new EventEmitter<BaseEntity>();

  public isLoading: boolean = false;
  public records: BaseEntity[] = [];

  constructor() {
    super();
  }
      
  ngOnInit(): void {
    this.Refresh()
  }

  async Refresh() { 
    this.isLoading = true

    const md = this.ProviderToUse;
    if (this.Columns.length === 0) {
      // populate this by default by taking all columns if entity has < 10 columns, otherwise include columns that have DefaultInView=1, and if we have no columns with DefaultInView=1, then include the first 10 columns
      const e = md.EntityByName(this.EntityName);
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
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
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

  public SelectRecord(event: MouseEvent | undefined, r: BaseEntity) {
    if (event)
      event.stopPropagation(); // prevent row from getting click

    this.RecordSelected.emit(r);
  }

  /** @deprecated Use {@link SelectRecord}. */
  public selectRecord(event: MouseEvent | undefined, r: BaseEntity) {
    return this.SelectRecord(event, r);
  }

  public DeleteRecordDialogVisible: boolean = false;

  /** @deprecated Use {@link DeleteRecordDialogVisible}. */
  public get deleteRecordDialogVisible(): boolean {
    return this.DeleteRecordDialogVisible;
  }
  /** @deprecated Use {@link DeleteRecordDialogVisible}. */
  public set deleteRecordDialogVisible(value: boolean) {
    this.DeleteRecordDialogVisible = value;
  }
  public CustomActionDialogVisible: boolean = false;

  /** @deprecated Use {@link CustomActionDialogVisible}. */
  public get customActionDialogVisible(): boolean {
    return this.CustomActionDialogVisible;
  }
  /** @deprecated Use {@link CustomActionDialogVisible}. */
  public set customActionDialogVisible(value: boolean) {
    this.CustomActionDialogVisible = value;
  }
  public DeleteRecordItem!: BaseEntity | null;

  /** @deprecated Use {@link DeleteRecordItem}. */
  public get deleteRecordItem(): BaseEntity | null {
    return this.DeleteRecordItem;
  }
  /** @deprecated Use {@link DeleteRecordItem}. */
  public set deleteRecordItem(value: BaseEntity | null) {
    this.DeleteRecordItem = value;
  }
  public CustomActionItem!: BaseEntity | undefined;

  /** @deprecated Use {@link CustomActionItem}. */
  public get customActionItem(): BaseEntity | undefined {
    return this.CustomActionItem;
  }
  /** @deprecated Use {@link CustomActionItem}. */
  public set customActionItem(value: BaseEntity | undefined) {
    this.CustomActionItem = value;
  }
  
  public async DeleteRecord(event: MouseEvent, r: BaseEntity) {
    // confirm with the user first
    this.DeleteRecordItem = r;
    this.DeleteRecordDialogVisible = true;
    if (event)
      event.stopPropagation(); // prevent row from getting click
  }

  /** @deprecated Use {@link DeleteRecord}. */
  public async deleteRecord(event: MouseEvent, r: BaseEntity) {
    return this.DeleteRecord(event, r);
  }

  public async PerformCustomAction(event: MouseEvent, r: BaseEntity) {
    // first emit the clicked event to allow the parent to react
    this.CustomActionClicked.emit(r);
    
    // confirm with the user
    this.CustomActionItem = r;
    this.CustomActionDialogVisible = true;
    if (event)
      event.stopPropagation(); // prevent row from getting click
  }

  /** @deprecated Use {@link PerformCustomAction}. */
  public async performCustomAction(event: MouseEvent, r: BaseEntity) {
    return this.PerformCustomAction(event, r);
  }
  
  /**
   * Gets the custom action icon for a record, using the function if provided, otherwise the static icon
   */
  public GetCustomActionIcon(record: BaseEntity): string {
    if (this.CustomActionIconFunction) {
      return this.CustomActionIconFunction(record);
    }
    return this.CustomActionIcon;
  }

  /** @deprecated Use {@link GetCustomActionIcon}. */
  public getCustomActionIcon(record: BaseEntity): string {
    return this.GetCustomActionIcon(record);
  }
  
  /**
   * Gets the custom action tooltip for a record, using the function if provided, otherwise the static tooltip
   */
  public GetCustomActionTooltip(record: BaseEntity): string {
    if (this.CustomActionTooltipFunction) {
      return this.CustomActionTooltipFunction(record);
    }
    return this.CustomActionTooltip;
  }

  /** @deprecated Use {@link GetCustomActionTooltip}. */
  public getCustomActionTooltip(record: BaseEntity): string {
    return this.GetCustomActionTooltip(record);
  }

  public async CloseCustomActionDialog(result: 'Yes' | 'No') {
    this.CustomActionDialogVisible = false;
    if (result === 'Yes') {
      // emit the event so the parent can handle the action
      this.CustomActionConfirmed.emit(this.CustomActionItem);
    }
    this.CustomActionItem = undefined;
  }

  /** @deprecated Use {@link CloseCustomActionDialog}. */
  public async closeCustomActionDialog(result: 'Yes' | 'No') {
    return this.CloseCustomActionDialog(result);
  }

  public async CloseDeleteDialog(result: 'Yes' | 'No') {
    // if the user confirms, delete the record
    this.DeleteRecordDialogVisible = false;
    if (result === 'Yes') {
      if (!await this.DeleteRecordItem!.Delete()) {
        // show an error message
        const errorMessage = this.DeleteRecordItem!.LatestResult.CompleteMessage;
        MJNotificationService.Instance.CreateSimpleNotification('Error deleting record: ' + errorMessage, 'error', 3000);
      }
      else 
        this.Refresh(); // refresh the list
    }
    this.DeleteRecordItem = null;
  }

  /** @deprecated Use {@link CloseDeleteDialog}. */
  public async closeDeleteDialog(result: 'Yes' | 'No') {
    return this.CloseDeleteDialog(result);
  }

  public EditOrNewRecord!: BaseEntity;

  /** @deprecated Use {@link EditOrNewRecord}. */
  public get editOrNewRecord(): BaseEntity {
    return this.EditOrNewRecord;
  }
  /** @deprecated Use {@link EditOrNewRecord}. */
  public set editOrNewRecord(value: BaseEntity) {
    this.EditOrNewRecord = value;
  }
  public ShowEditOrNewRecordForm: boolean = false;

  /** @deprecated Use {@link ShowEditOrNewRecordForm}. */
  public get showEditOrNewRecordForm(): boolean {
    return this.ShowEditOrNewRecordForm;
  }
  /** @deprecated Use {@link ShowEditOrNewRecordForm}. */
  public set showEditOrNewRecordForm(value: boolean) {
    this.ShowEditOrNewRecordForm = value;
  }
  public RecordMode: 'new' | 'edit' = 'new';

  /** @deprecated Use {@link RecordMode}. */
  public get recordMode(): 'new' | 'edit' {
    return this.RecordMode;
  }
  /** @deprecated Use {@link RecordMode}. */
  public set recordMode(value: 'new' | 'edit') {
    this.RecordMode = value;
  }
  public async CreateNewRecord() {
    // attempt to create a new record and if success, navigate to the new record
    const md = this.ProviderToUse;
    this.EditOrNewRecord = await md.GetEntityObject(this.EntityName);
    if (this.EditOrNewRecord) {
      this.EditOrNewRecord.NewRecord();
      this.RecordMode = 'new';
      this.ShowEditOrNewRecordForm = true;
    }
  }

  /** @deprecated Use {@link CreateNewRecord}. */
  public async createNewRecord() {
    return this.CreateNewRecord();
  }

  public async EditRecord(event: MouseEvent, r: BaseEntity) {
    this.EditOrNewRecord = r;
    this.RecordMode = 'edit';
    this.ShowEditOrNewRecordForm = true;
    if (event)
      event.stopPropagation(); // prevent row from getting click
  }

  /** @deprecated Use {@link EditRecord}. */
  public async editRecord(event: MouseEvent, r: BaseEntity) {
    return this.EditRecord(event, r);
  }

  public async OnEditOrNewRecordFormClosed(result: 'Save' | 'Cancel') {
    if (!this.EditOrNewRecord)
      return; // this can happen if the user closes the form before the record is loaded

    this.ShowEditOrNewRecordForm = false;
   
    if (result === 'Save') {
      // the dialog already saved the record, just check to make sure it was saved and if so, navigate
      if (this.EditOrNewRecord.IsSaved) {
        if (this.RecordMode === 'edit')
          this.RecordEdited.emit(this.EditOrNewRecord);
        else
          this.RecordCreated.emit(this.EditOrNewRecord);

        // refresh our grid now
        await this.Refresh();
      }
      else
        throw new Error('Record was not saved');
    }
  }

  /** @deprecated Use {@link OnEditOrNewRecordFormClosed}. */
  public async onEditOrNewRecordFormClosed(result: 'Save' | 'Cancel') {
    return this.OnEditOrNewRecordFormClosed(result);
  }

  public GetRecordName(r: BaseEntity): string {
    // check to see if we have any columns in the entity that have IsNameField = 1, the fall back from there is to look for a column named "Name", and if that doesn't work we return the primary key(s)
    const md = this.ProviderToUse;
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

  /** @deprecated Use {@link GetRecordName}. */
  public getRecordName(r: BaseEntity): string {
    return this.GetRecordName(r);
  }
}
