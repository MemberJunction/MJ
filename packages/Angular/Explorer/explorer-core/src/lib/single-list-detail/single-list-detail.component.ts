import { Component, Input, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { LogError, LogStatus, Metadata, RunView, RunViewResult } from '@memberjunction/core';
import { ListDetailEntityExtended, ListEntity, UserViewEntityExtended } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';
import { ListDetailGridComponent, ListGridRowClickedEvent } from '@memberjunction/ng-list-detail-grid';
import { Subject, debounceTime } from 'rxjs';
import { NewItemOption } from '../../generic/Item.types';

@Component({
  selector: 'mj-list-detail',
  templateUrl: './single-list-detail.component.html',
  styleUrls: ['./single-list-detail.component.css', '../../shared/first-tab-styles.css']
})
export class SingleListDetailComponent implements OnInit {

  @Input() public ListID: string = "";

  @ViewChild('listDetailGrid') listDetailGrid: ListDetailGridComponent | undefined;

  public listRecord: ListEntity | null = null;
  public showLoader: boolean = false;
  public showAddDialog: boolean = false;
  public showAddLoader: boolean = false;
  public showDialogLoader: boolean = false;
  public userViews: UserViewEntityExtended[] | null = null;

  public userViewsToAdd: UserViewEntityExtended[] = [];

  public recordsToSave: number = 0;
  public recordsSaved: number = 0;
  public fetchingRecordsToSave: boolean = false;

  public showAddSingleRecordsDialog: boolean = false;
  public fetchingListRecords: boolean = false;
  public listRecords: Array<{ ID: string; Name: string }> = [];
  public searchFilter: string = "";
  private filterListrecordsSubject: Subject<boolean> = new Subject();

  public addOptions: NewItemOption[] = [
    {
      Text: 'Add From View',
      Description: 'Add all records of a view to this list',
      Icon: 'folder',
      Action: () => {
        this.toggleAddFromViewDialog(true);
      }
    },
    {
      Text: 'Add a Record',
      Description: 'Add a specific record to the list',
      Icon: 'folder',
      Action: () => {
        this.toggleAddRecordsDialog(true);
      }
    }
  ];

  constructor(
    private sharedService: SharedService,
    private cdr: ChangeDetectorRef
  ) {
    this.filterListrecordsSubject
      .pipe(debounceTime(250))
      .subscribe(() => this.loadListRecords());
  }

  public async ngOnInit(): Promise<void> {
    if (this.ListID) {
      await this.loadListRecord();
    }
  }

  /**
   * Load just the list entity record (metadata), not the grid data
   */
  private async loadListRecord(): Promise<void> {
    if (!this.ListID) {
      return;
    }

    this.showLoader = true;

    try {
      const md = new Metadata();
      this.listRecord = await md.GetEntityObject<ListEntity>("Lists");
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

  /**
   * Handle row click from the list detail grid
   */
  onRowClicked(_event: ListGridRowClickedEvent): void {
    // Could add selection behavior here if needed
  }

  /**
   * Handle row double-click from the list detail grid
   * Navigation is handled by the grid component itself when autoNavigate is true
   */
  onRowDoubleClicked(_event: ListGridRowClickedEvent): void {
    // Navigation is handled by mj-list-detail-grid
  }

  /**
   * Refresh the grid after adding items
   */
  refreshGrid(): void {
    if (this.listDetailGrid) {
      this.listDetailGrid.refresh();
    }
  }

  public async toggleAddFromViewDialog(show: boolean): Promise<void> {
    this.showAddDialog = show;

    if (show && !this.userViews) {
      await this.loadEntityViews();
    }
  }

  private async loadEntityViews(): Promise<void> {
    this.showAddLoader = true;

    if (!this.listRecord || !this.listRecord.Entity) {
      this.showAddLoader = false;
      return;
    }

    const rv = new RunView();
    const md = new Metadata();

    const runViewResult = await rv.RunView<UserViewEntityExtended>({
      EntityName: "User Views",
      ExtraFilter: `UserID = '${md.CurrentUser.ID}' AND EntityID = '${this.listRecord.EntityID}'`,
      ResultType: 'entity_object'
    }, md.CurrentUser);

    if (!runViewResult.Success) {
      this.showAddLoader = false;
      LogError(`Error loading ${this.listRecord.Entity} User View records for user ${md.CurrentUser.ID}`);
      return;
    }

    this.userViews = runViewResult.Results;
    this.showAddLoader = false;
  }

  public async addTolist(): Promise<void> {
    if (!this.listRecord || !this.listRecord.Entity) {
      return;
    }

    this.showAddLoader = true;
    this.fetchingRecordsToSave = true;

    const rv = new RunView();
    const md = new Metadata();

    const hashMap = new Map<string, { ID: string }>();
    await Promise.all(this.userViewsToAdd.map(async (userView: UserViewEntityExtended) => {
      const runViewResult = await rv.RunView({
        EntityName: "User Views",
        ViewEntity: userView,
        Fields: ["ID"]
      }, md.CurrentUser);

      if (!runViewResult.Success) {
        LogError(`Error loading view ${userView.Name} for user ${md.CurrentUser.ID}`);
        return;
      }

      const records = runViewResult.Results as Array<{ ID: string }>;
      for (const record of records) {
        hashMap.set(record.ID, record);
      }
    }));

    this.recordsToSave = hashMap.size;
    this.recordsSaved = 0;
    this.fetchingRecordsToSave = false;

    LogStatus(`Adding ${hashMap.size} records to list ${this.listRecord.ID}`);

    // Add the records to the list
    const recordIDs = [...hashMap.keys()];
    const chunkSize = 100;
    for (let i = 0; i < recordIDs.length; i += chunkSize) {
      const chunk = recordIDs.slice(i, i + chunkSize);
      await Promise.all(chunk.map(async (recordID: string) => {
        const listDetail = await md.GetEntityObject<ListDetailEntityExtended>("List Details");
        listDetail.ListID = this.listRecord!.ID;
        listDetail.RecordID = recordID.toString();
        listDetail.ContextCurrentUser = md.CurrentUser;

        const saveResult = await listDetail.Save();
        if (!saveResult) {
          LogError(`Error adding record ${recordID} to list ${this.listRecord!.ID}`, undefined, listDetail.LatestResult);
        }

        this.recordsSaved++;
      }));
    }

    this.showAddLoader = false;
    this.userViewsToAdd = [];
    this.toggleAddFromViewDialog(false);
    this.refreshGrid();
  }

  public onListRecordDialogValueChange(value: string): void {
    this.searchFilter = value;
    this.filterListrecordsSubject.next(true);
  }

  public addViewToSelectedList(view: UserViewEntityExtended): void {
    if (!this.userViewsToAdd.includes(view)) {
      this.userViewsToAdd.push(view);
    }
  }

  public removeViewFromSelectedList(view: UserViewEntityExtended): void {
    this.userViewsToAdd = this.userViewsToAdd.filter(v => v.ID !== view.ID);
  }

  public onDropdownItemClick(item: NewItemOption): void {
    if (item.Action) {
      item.Action();
    }
  }

  public async toggleAddRecordsDialog(show: boolean): Promise<void> {
    this.showAddSingleRecordsDialog = show;

    if (show) {
      this.listRecords = [];
      this.searchFilter = "";
      await this.loadListRecords();
    }
  }

  private async loadListRecords(): Promise<void> {
    if (!this.listRecord) {
      LogError("Error loading list records. List record is null");
      return;
    }

    const md = new Metadata();
    const sourceEntityInfo = md.EntityByID(this.listRecord.EntityID);
    if (!sourceEntityInfo) {
      LogError("Error loading list records. Source entity info is null");
      return;
    }

    this.fetchingListRecords = true;

    const nameField = sourceEntityInfo.Fields.find(field => field.IsNameField);
    let filter: string | undefined = undefined;
    if (nameField && this.searchFilter) {
      filter = `${nameField.Name} LIKE '%${this.searchFilter}%'`;
    }

    const rv = new RunView();
    const rvResult: RunViewResult = await rv.RunView({
      EntityName: this.listRecord.Entity,
      ExtraFilter: filter,
      MaxRows: 50
    });

    if (!rvResult.Success) {
      LogError(`Error loading list records for list ${this.listRecord.ID}`, undefined, rvResult.ErrorMessage);
      this.fetchingListRecords = false;
      return;
    }

    const primaryKeyName = sourceEntityInfo.FirstPrimaryKey.Name;

    // Filter out records already in the list
    // Note: We can't easily check this without loading current list items
    // For now, the server-side will handle duplicates
    this.listRecords = rvResult.Results.map((record: Record<string, unknown>) => ({
      ID: String(record[primaryKeyName]),
      Name: nameField ? String(record[nameField.Name]) : String(record[primaryKeyName])
    }));

    this.fetchingListRecords = false;
  }

  public async addListRecord(listRecord: { ID: string; Name: string }): Promise<void> {
    if (!this.listRecord) {
      LogError("Error adding list record. List record is null");
      this.sharedService.CreateSimpleNotification("Unable to add record to list", 'error', 2500);
      return;
    }

    const md = new Metadata();
    const listEntity = await md.GetEntityObject<ListDetailEntityExtended>("List Details", md.CurrentUser);
    listEntity.ListID = this.listRecord.ID;
    listEntity.RecordID = listRecord.ID;

    const saveResult = await listEntity.Save();
    if (!saveResult) {
      LogError(`Error adding record ${listRecord.ID} to list ${this.listRecord.ID}`, undefined, listEntity.LatestResult);

      const alreadyExists = listEntity.LatestResult?.Message?.includes("already exists");
      if (alreadyExists) {
        this.sharedService.CreateSimpleNotification("Record already exists in this list", 'error', 2500);
        return;
      }

      this.sharedService.CreateSimpleNotification("Unable to add record to list", 'error', 2500);
      return;
    }

    this.sharedService.CreateSimpleNotification("Record added to list", 'success', 2500);

    // Remove from available list
    this.listRecords = this.listRecords.filter(r => r.ID !== listRecord.ID);

    // Refresh the grid to show new item
    this.refreshGrid();
  }
}
