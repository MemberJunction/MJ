import { Component, Input, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { BaseEntity, CompositeKey, LogError, LogErrorEx, LogStatus, Metadata, RunView, RunViewResult } from '@memberjunction/core';
import { MJListDetailEntity, MJListDetailEntityExtended, MJListEntity, MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';
import { ListDetailGridComponent, ListGridRowClickedEvent } from '@memberjunction/ng-list-detail-grid';
import { GridToolbarConfig } from '@memberjunction/ng-entity-viewer';
import { Subject, debounceTime } from 'rxjs';
import { NewItemOption } from '../../generic/Item.types';

/**
 * Represents a record that can be added to a list
 */
interface AddableRecord {
  ID: string;
  Name: string;
  isInList: boolean;
  isSelected: boolean;
}

@Component({
  standalone: false,
  selector: 'mj-list-detail',
  templateUrl: './single-list-detail.component.html',
  styleUrls: ['./single-list-detail.component.css', '../../shared/first-tab-styles.css']
})
export class SingleListDetailComponent implements OnInit {

  @Input() public ListID: string = "";

  @ViewChild('listDetailGrid') listDetailGrid: ListDetailGridComponent | undefined;

  // List record
  public listRecord: MJListEntity | null = null;
  public showLoader: boolean = false;

  // Grid state
  public selectedKeys: string[] = [];
  public rowCount: number = 0;

  // Toolbar config - hide EDG toolbar, we'll use our own
  public gridToolbarConfig: GridToolbarConfig = {
    showSearch: false,
    showRefresh: false,
    showAdd: false,
    showDelete: false,
    showExport: false,
    showRowCount: false,
    showSelectionCount: false
  };

  // Remove from list dialog
  public showRemoveDialog: boolean = false;
  public isRemoving: boolean = false;
  public removeProgress: number = 0;
  public removeTotal: number = 0;

  // Add records dialog
  public showAddRecordsDialog: boolean = false;
  public addDialogLoading: boolean = false;
  public addDialogSaving: boolean = false;
  public addableRecords: AddableRecord[] = [];
  public addRecordsSearchFilter: string = "";
  public existingListDetailIds: Set<string> = new Set();
  public addProgress: number = 0;
  public addTotal: number = 0;
  private searchSubject: Subject<string> = new Subject();

  // Add from view dialog (existing)
  public showAddFromViewDialog: boolean = false;
  public showAddFromViewLoader: boolean = false;
  public userViews: MJUserViewEntityExtended[] | null = null;
  public userViewsToAdd: MJUserViewEntityExtended[] = [];
  public addFromViewProgress: number = 0;
  public addFromViewTotal: number = 0;
  public fetchingRecordsToSave: boolean = false;

  // Dropdown menu options
  public addOptions: NewItemOption[] = [
    {
      Text: 'Add Records',
      Description: 'Search and add specific records to this list',
      Icon: 'search',
      Action: () => this.openAddRecordsDialog()
    },
    {
      Text: 'Add From View',
      Description: 'Add all records from a saved view',
      Icon: 'folder',
      Action: () => this.openAddFromViewDialog()
    }
  ];

  constructor(
    private sharedService: SharedService,
    private cdr: ChangeDetectorRef
  ) {
    // Debounce search input
    this.searchSubject
      .pipe(debounceTime(300))
      .subscribe((searchText) => this.searchRecords(searchText));
  }

  public async ngOnInit(): Promise<void> {
    if (this.ListID) {
      await this.loadListRecord();
    }
  }

  /**
   * Load the list entity record
   */
  private async loadListRecord(): Promise<void> {
    if (!this.ListID) return;

    this.showLoader = true;

    try {
      const md = new Metadata();
      this.listRecord = await md.GetEntityObject<MJListEntity>("MJ: Lists");
      const loadResult = await this.listRecord.Load(this.ListID);

      if (!loadResult) {
        LogError("Error loading list with ID " + this.ListID, undefined, this.listRecord.LatestResult);
        this.listRecord = null;
      }
    } catch (error) {
      LogError("Error loading list", undefined, error);
      this.listRecord = null;
    } finally {
      this.showLoader = false;
      this.cdr.detectChanges();
    }
  }

  // ==========================================
  // Grid Event Handlers
  // ==========================================

  onRowClicked(_event: ListGridRowClickedEvent): void {
    // Selection is handled by the grid
  }

  onRowDoubleClicked(_event: ListGridRowClickedEvent): void {
    // Navigation is handled by mj-list-detail-grid
  }

  onSelectionChange(keys: string[]): void {
    this.selectedKeys = keys;
  }

  onDataLoaded(event: { totalCount: number }): void {
    this.rowCount = event.totalCount;
  }

  refreshGrid(): void {
    if (this.listDetailGrid) {
      this.listDetailGrid.refresh();
    }
  }

  // ==========================================
  // Toolbar Actions
  // ==========================================

  onRefreshClick(): void {
    this.refreshGrid();
  }

  onExportClick(): void {
    // Trigger export on the underlying grid
    if (this.listDetailGrid) {
      this.listDetailGrid.export();
    }
  }

  onDropdownItemClick(item: NewItemOption): void {
    if (item.Action) {
      item.Action();
    }
  }

  // ==========================================
  // Remove from List Dialog
  // ==========================================

  openRemoveDialog(): void {
    if (this.selectedKeys.length === 0) {
      this.sharedService.CreateSimpleNotification("Please select records to remove", 'warning', 2500);
      return;
    }
    this.showRemoveDialog = true;
  }

  closeRemoveDialog(): void {
    this.showRemoveDialog = false;
    this.isRemoving = false;
    this.removeProgress = 0;
    this.removeTotal = 0;
  }

  async confirmRemoveFromList(): Promise<void> {
    if (!this.listRecord || this.selectedKeys.length === 0) return;

    this.isRemoving = true;
    this.removeTotal = this.selectedKeys.length;
    this.removeProgress = 0;

    const md = new Metadata();
    const rv = new RunView();
    const entityInfo = md.EntityByID(this.listRecord.EntityID);

    // selectedKeys from grid are in concatenated format (ID|value)
    // For single PK entities, RecordID in DB is just the raw value
    // For composite PK entities, RecordID in DB is the concatenated format
    // Extract the appropriate format for the query
    const selectedRecordIds = this.selectedKeys.map(key => {
      if (entityInfo && entityInfo.PrimaryKeys.length === 1) {
        // Single PK: extract just the value from concatenated format
        const compositeKey = new CompositeKey();
        compositeKey.LoadFromConcatenatedString(key);
        return compositeKey.KeyValuePairs[0]?.Value || key;
      } else {
        // Composite PK: use full concatenated format as-is
        return key;
      }
    });

    const listDetailsFilter = `ListID = '${this.listRecord.ID}' AND RecordID IN (${selectedRecordIds.map(id => `'${id}'`).join(',')})`;

    const listDetailsResult = await rv.RunView<MJListDetailEntity>({
      EntityName: 'MJ: List Details',
      ExtraFilter: listDetailsFilter,
      ResultType: 'entity_object'
    }, md.CurrentUser);

    if (!listDetailsResult.Success) {
      LogError("Error loading list details for removal", undefined, listDetailsResult.ErrorMessage);
      this.sharedService.CreateSimpleNotification("Failed to remove records", 'error', 2500);
      this.isRemoving = false;
      return;
    }

    // Use transaction group for bulk delete
    const tg = await md.CreateTransactionGroup();
    const listDetails = listDetailsResult.Results;

    for (const listDetail of listDetails) {
      listDetail.TransactionGroup = tg;
      await listDetail.Delete();
    }

    const success = await tg.Submit();

    if (success) {
      this.removeProgress = this.removeTotal;
      this.sharedService.CreateSimpleNotification(
        `Removed ${listDetails.length} record${listDetails.length !== 1 ? 's' : ''} from list`,
        'success',
        2500
      );
      this.closeRemoveDialog();
      this.listDetailGrid?.clearSelection();
      this.refreshGrid();
    } else {
      LogError("Error removing records from list");
      this.sharedService.CreateSimpleNotification("Failed to remove some records", 'error', 2500);
      this.isRemoving = false;
    }
  }

  // ==========================================
  // Add Records Dialog
  // ==========================================

  async openAddRecordsDialog(): Promise<void> {
    this.showAddRecordsDialog = true;
    this.addableRecords = [];
    this.addRecordsSearchFilter = "";
    this.addDialogLoading = true;
    this.addDialogSaving = false;

    // Load existing list detail IDs to mark which records are already in the list
    await this.loadExistingListDetailIds();
    this.addDialogLoading = false;
  }

  closeAddRecordsDialog(): void {
    this.showAddRecordsDialog = false;
    this.addableRecords = [];
    this.addRecordsSearchFilter = "";
    this.existingListDetailIds.clear();
    this.addDialogSaving = false;
    this.addProgress = 0;
    this.addTotal = 0;
  }

  private async loadExistingListDetailIds(): Promise<void> {
    if (!this.listRecord) return;

    const md = new Metadata();
    const rv = new RunView();

    const result = await rv.RunView<{ RecordID: string }>({
      EntityName: 'MJ: List Details',
      ExtraFilter: `ListID = '${this.listRecord.ID}'`,
      Fields: ['RecordID'],
      ResultType: 'simple'
    }, md.CurrentUser);

    if (result.Success) {
      this.existingListDetailIds = new Set(result.Results.map(r => r.RecordID));
    }
  }

  onAddRecordsSearchChange(value: string): void {
    this.addRecordsSearchFilter = value;
    this.searchSubject.next(value);
  }

  private async searchRecords(searchText: string): Promise<void> {
    if (!this.listRecord || !searchText || searchText.length < 2) {
      this.addableRecords = [];
      return;
    }

    this.addDialogLoading = true;

    const md = new Metadata();
    const sourceEntityInfo = md.EntityByID(this.listRecord.EntityID);
    if (!sourceEntityInfo) {
      this.addDialogLoading = false;
      return;
    }

    const nameField = sourceEntityInfo.Fields.find(field => field.IsNameField);
    const pkField = sourceEntityInfo.FirstPrimaryKey?.Name || 'ID';

    let filter: string | undefined;
    if (nameField) {
      filter = `${nameField.Name} LIKE '%${searchText}%'`;
    }

    const rv = new RunView();
    const result: RunViewResult = await rv.RunView({
      EntityName: this.listRecord.Entity,
      ExtraFilter: filter,
      MaxRows: 100,
      ResultType: 'simple'
    });

    if (result.Success) {
      this.addableRecords = result.Results.map((record: Record<string, unknown>) => {
        const recordId = String(record[pkField]);
        return {
          ID: recordId,
          Name: nameField ? String(record[nameField.Name]) : recordId,
          isInList: this.existingListDetailIds.has(recordId),
          isSelected: false
        };
      });
    }

    this.addDialogLoading = false;
    this.cdr.detectChanges();
  }

  toggleRecordSelection(record: AddableRecord): void {
    if (record.isInList) return; // Can't select records already in list
    record.isSelected = !record.isSelected;
  }

  get selectedAddableRecords(): AddableRecord[] {
    return this.addableRecords.filter(r => r.isSelected);
  }

  selectAllAddable(): void {
    this.addableRecords.forEach(r => {
      if (!r.isInList) r.isSelected = true;
    });
  }

  deselectAllAddable(): void {
    this.addableRecords.forEach(r => r.isSelected = false);
  }

  async confirmAddRecords(): Promise<void> {
    const recordsToAdd = this.selectedAddableRecords;
    if (recordsToAdd.length === 0 || !this.listRecord) return;

    this.addDialogSaving = true;
    // Reserve 20% of progress for tg.Submit()
    this.addTotal = recordsToAdd.length;
    this.addProgress = 0;
    const progressPerRecord = 0.8 / recordsToAdd.length; // 80% for individual saves

    const md = new Metadata();

    // Use transaction group for bulk insert
    const tg = await md.CreateTransactionGroup();

    for (let i = 0; i < recordsToAdd.length; i++) {
      const record = recordsToAdd[i];
      const listDetail = await md.GetEntityObject<MJListDetailEntityExtended>("MJ: List Details", md.CurrentUser);
      listDetail.ListID = this.listRecord.ID;
      listDetail.RecordID = record.ID;
      listDetail.TransactionGroup = tg;
      const result = await listDetail.Save();
      if (!result) {
        LogErrorEx({
          message: listDetail.LatestResult?.CompleteMessage
        });
      }
      // Update progress (0-80%)
      this.addProgress = Math.round((i + 1) * progressPerRecord * this.addTotal);
    }

    // Show 80% complete before submit
    this.addProgress = Math.round(this.addTotal * 0.8);

    const success = await tg.Submit();

    if (success) {
      this.addProgress = this.addTotal;
      this.sharedService.CreateSimpleNotification(
        `Added ${recordsToAdd.length} record${recordsToAdd.length !== 1 ? 's' : ''} to list`,
        'success',
        2500
      );
      this.closeAddRecordsDialog();
      this.refreshGrid();
    } else {
      LogError("Error adding records to list");
      this.sharedService.CreateSimpleNotification("Failed to add some records", 'error', 2500);
      this.addDialogSaving = false;
    }
  }

  // ==========================================
  // Add From View Dialog (existing functionality, cleaned up)
  // ==========================================

  async openAddFromViewDialog(): Promise<void> {
    this.showAddFromViewDialog = true;
    this.userViewsToAdd = [];

    if (!this.userViews) {
      await this.loadEntityViews();
    }
  }

  closeAddFromViewDialog(): void {
    this.showAddFromViewDialog = false;
    this.userViewsToAdd = [];
    this.showAddFromViewLoader = false;
    this.addFromViewProgress = 0;
    this.addFromViewTotal = 0;
  }

  private async loadEntityViews(): Promise<void> {
    if (!this.listRecord || !this.listRecord.Entity) return;

    this.showAddFromViewLoader = true;

    const rv = new RunView();
    const md = new Metadata();

    const runViewResult = await rv.RunView<MJUserViewEntityExtended>({
      EntityName: "MJ: User Views",
      ExtraFilter: `UserID = '${md.CurrentUser.ID}' AND EntityID = '${this.listRecord.EntityID}'`,
      ResultType: 'entity_object'
    }, md.CurrentUser);

    if (!runViewResult.Success) {
      LogError(`Error loading User Views for entity ${this.listRecord.Entity}`);
    } else {
      this.userViews = runViewResult.Results;
    }

    this.showAddFromViewLoader = false;
  }

  toggleViewSelection(view: MJUserViewEntityExtended): void {
    const index = this.userViewsToAdd.findIndex(v => v.ID === view.ID);
    if (index >= 0) {
      this.userViewsToAdd.splice(index, 1);
    } else {
      this.userViewsToAdd.push(view);
    }
  }

  isViewSelected(view: MJUserViewEntityExtended): boolean {
    return this.userViewsToAdd.some(v => v.ID === view.ID);
  }

  async confirmAddFromView(): Promise<void> {
    if (!this.listRecord || this.userViewsToAdd.length === 0) return;

    this.showAddFromViewLoader = true;
    this.fetchingRecordsToSave = true;

    const rv = new RunView();
    const md = new Metadata();

    // Collect all unique record IDs from selected views
    const recordIdSet = new Set<string>();

    for (const userView of this.userViewsToAdd) {
      const runViewResult = await rv.RunView({
        EntityName: "MJ: User Views",
        ViewEntity: userView,
        Fields: ["ID"]
      }, md.CurrentUser);

      if (runViewResult.Success) {
        const records = runViewResult.Results as Array<{ ID: string }>;
        records.forEach(r => recordIdSet.add(r.ID));
      }
    }

    // Filter out records already in the list
    await this.loadExistingListDetailIds();
    const recordsToAdd = [...recordIdSet].filter(id => !this.existingListDetailIds.has(id));

    this.addFromViewTotal = recordsToAdd.length;
    this.addFromViewProgress = 0;
    this.fetchingRecordsToSave = false;
    const progressPerRecord = 0.8 / Math.max(recordsToAdd.length, 1); // 80% for individual saves

    if (recordsToAdd.length === 0) {
      this.sharedService.CreateSimpleNotification("All records already in list", 'info', 2500);
      this.showAddFromViewLoader = false;
      return;
    }

    LogStatus(`Adding ${recordsToAdd.length} records to list`);

    // Use transaction group for bulk insert
    const tg = await md.CreateTransactionGroup();

    for (let i = 0; i < recordsToAdd.length; i++) {
      const recordID = recordsToAdd[i];
      const listDetail = await md.GetEntityObject<MJListDetailEntityExtended>("MJ: List Details", md.CurrentUser);
      listDetail.ListID = this.listRecord.ID;
      listDetail.RecordID = recordID;
      listDetail.TransactionGroup = tg;
      const result = await listDetail.Save();
      if (!result) {
        LogErrorEx({
          message: listDetail.LatestResult?.CompleteMessage
        });
      }
      // Update progress (0-80%)
      this.addFromViewProgress = Math.round((i + 1) * progressPerRecord * this.addFromViewTotal);
    }

    // Show 80% complete before submit
    this.addFromViewProgress = Math.round(this.addFromViewTotal * 0.8);

    const success = await tg.Submit();

    if (success) {
      this.addFromViewProgress = this.addFromViewTotal;
      this.sharedService.CreateSimpleNotification(
        `Added ${recordsToAdd.length} record${recordsToAdd.length !== 1 ? 's' : ''} to list`,
        'success',
        2500
      );
      this.closeAddFromViewDialog();
      this.refreshGrid();
    } else {
      LogError("Error adding records from view to list");
      this.sharedService.CreateSimpleNotification("Failed to add some records", 'error', 2500);
      this.showAddFromViewLoader = false;
    }
  }
}
