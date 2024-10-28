import { Component, Input, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { BaseEntity, EntityFieldInfo, EntityFieldTSType, EntityInfo, LogError, LogStatus, Metadata, RunView, RunViewResult } from '@memberjunction/core';
import { ListDetailEntity, ListEntity, UserViewEntity, ViewColumnInfo } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';
import { PageChangeEvent } from '@progress/kendo-angular-grid';
import { Subject, debounceTime } from 'rxjs';
import { NewItemOption } from '../../generic/Item.types';

@Component({
  selector: 'mj-list-detail',
  templateUrl: './single-list-detail.component.html',
  styleUrls: ['./single-list-detail.component.css', '../../shared/first-tab-styles.css']
})
export class SingleListDetailComponent implements OnInit {

    @Input() public ListID: string = "";

    public listRecord: ListEntity | null = null;
    public showLoader: boolean = false;
    public sourceGridData: BaseEntity[] = [];
    public filteredGridData: BaseEntity[] = [];
    public showAddDialog: boolean = false;
    public showAddLoader: boolean = false;
    public showDialogLoader: boolean = false;
    public userViews: UserViewEntity[] | null = null;

    private filterDebounceTime: number = 250;
    private filterItemsSubject: Subject<any> = new Subject();
    private filter: string = '';

    public userViewsToAdd: UserViewEntity[] = [];

    public page: number = 0;
    public pageSize: number = 50;
    public gridHeight: number = 750;
    public sortSettings: any[] = [];
    public selectedKeys: any[] = [];
    public selectModeEnabled: boolean = false;
    public viewColumns: Partial<ViewColumnInfo>[] = [];
    public visibleColumns: Partial<ViewColumnInfo>[] = [];
    public totalRowCount: number = 0;
    public viewExecutionTime: number = 0;

    public recordsToSave: number = 0;
    public recordsSaved: number = 0;
    public fetchingRecordsToSave: boolean = false;

    public showAddSingleRecordsDialog: boolean = false;
    public fetchingListRecords: boolean = false;
    public listRecords: Record<'ID' | 'Name', string>[] = [];
    public selectedListRecords: Record<'ID' | 'Name', string>[] = [];
    public searchFilter: string = "";
    private filterListrecordsSubject: Subject<any> = new Subject();

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
    ]
    
    constructor (private router: Router, private route: ActivatedRoute, private sharedService: SharedService)
    {
        this.filterItemsSubject
        .pipe(debounceTime(this.filterDebounceTime))
        .subscribe(() => this.filterItems(this.filter));

        this.filterListrecordsSubject
        .pipe(debounceTime(this.filterDebounceTime))
        .subscribe(() => this.loadListRecords());
    }

    public async ngOnInit(): Promise<void> {
        if(this.ListID){
            await this.loadList(this.ListID);
        }
    }

    private async loadList(listID: string): Promise<void> {
        const startTime: number = new Date().getTime();
        if(listID){
            this.ListID = listID;
            this.showLoader = true;

            const md: Metadata = new Metadata();
            const rv: RunView = new RunView();

            const listEntity: ListEntity = await md.GetEntityObject("Lists");
            const loadResult = await listEntity.Load(listID);
            if(!loadResult){
                LogError("Error loading list with ID " + listID, undefined, listEntity.LatestResult);
                return;
            }

            const rvEntityFields = await rv.RunView({
                EntityName: "Entity Fields",
                ExtraFilter: `EntityID = '${listEntity.EntityID}' AND DefaultInView = 1`,
                ResultType: 'entity_object'
            }, md.CurrentUser);

            if(!rvEntityFields.Success){
                LogError(`Error loading entity fields for list ${listEntity.Name}`, undefined, rvEntityFields.ErrorMessage);
                return;
            }

            this.listRecord = listEntity;
            
            this.viewColumns = listEntity.EntityInfo.Fields.filter((field: EntityFieldInfo) => field.DefaultInView).map((field: EntityFieldInfo) => {
                return {
                  ID: field.ID,
                  Name: field.CodeName,
                  DisplayName: field.DisplayName,
                  EntityField: field,
                  hidden: false,
                  orderIndex: field.Sequence,
                  width: field.DefaultColumnWidth || 100,
                } as ViewColumnInfo
            });

                                                            /*make sure there is an entity field linked*/
            this.visibleColumns = this.viewColumns.filter(x => x.hidden === false && x.EntityField).sort((a,b) => {
                const aOrder = a.orderIndex != null ? a.orderIndex : 9999;
                const bOrder = b.orderIndex != null ? b.orderIndex : 9999;
                return aOrder - bOrder;
            });

            const primaryKeyName: string = this.listRecord.EntityInfo.FirstPrimaryKey.Name;
            const rvResult: RunViewResult = await rv.RunView({
                EntityName: listEntity.Entity,
                ExtraFilter: `${primaryKeyName} IN (SELECT [RecordID] FROM ${md.ConfigData.MJCoreSchemaName}.[vwListDetails] WHERE ListID = '${listEntity.ID}')`
            }, md.CurrentUser);

            if(!rvResult.Success){
                LogError(`Error loading ${listEntity.Entity} records: ${rvResult.ErrorMessage}`);
                return;
            }

            LogStatus(`Found ${rvResult.Results.length} records for list ${listEntity.Name}`);
            this.sourceGridData = this.filteredGridData = rvResult.Results;
            this.viewExecutionTime = (new Date().getTime() - startTime) / 1000; // in seconds

            this.showLoader = false;
        }
    }

    public pageChange(event: PageChangeEvent): void {
        this.page = event.skip;
        this.loadList(this.ListID);
    }

    GetColumnTitle(col: Partial<ViewColumnInfo>): string {
        if (col.DisplayName){
            // use view's display name first if it exists
            return col.DisplayName;
        }
        else if (col.EntityField && col.EntityField.DisplayName){
            // then use entity display name, if that exist
            return col.EntityField.DisplayName; 
        }
        else{
            // otherwise just use the column name
            return col.Name || '';
        }
    }

    public getEditor(ef: EntityFieldInfo | undefined): "boolean" | "text" | "numeric" | "date" {
        if (!ef) {
            return "text";
        }

        switch (ef.TSType) {  
          case EntityFieldTSType.Boolean:
            return "boolean";
          case EntityFieldTSType.Date:
            return "date";
          case EntityFieldTSType.Number:
            return "numeric";
          default:
            return "text";
        }          
    }

    GetColumnCellStyle(col: Partial<ViewColumnInfo>): Record<'text-align' | 'vertical-align', string> {
        if (!col || !col.EntityField) {
            return {'text-align': 'left', 'vertical-align': 'top'};
        }

        const fieldType: string = col.EntityField.Type.trim().toLowerCase();
        switch (fieldType) {
            case "money":
            case 'decimal':
            case 'real':
            case 'float':
            case 'int':
                // right align numbers,
                return {'text-align': 'right', 'vertical-align': 'top'};
            default:
                // left align everything else
                return {'text-align': 'left', 'vertical-align': 'top'};
        }
    }

    public async toggleAddFromViewDialog(show: boolean): Promise<void> {
        this.showAddDialog = show;

        if(show && !this.userViews){  
            await this.loadEntityViews();
        }
    }

    private async loadEntityViews(): Promise<void> {
        this.showAddLoader = true;

        if(!this.listRecord || !this.listRecord.Entity){
            return;
        }

        const rv: RunView = new RunView();
        const md: Metadata = new Metadata();

        const runViewResult: RunViewResult = await rv.RunView<UserViewEntity>({
            EntityName: "User Views",
            ExtraFilter: `UserID = '${md.CurrentUser.ID}' AND EntityID = '${this.listRecord.EntityID}'`,
            ResultType: 'entity_object'
        }, md.CurrentUser);

        if(!runViewResult.Success){
            this.showAddLoader = false;
            LogError(`Error loading ${this.listRecord.Entity} User View records for user ${md.CurrentUser.ID}`);
            return;
        }

        this.userViews = runViewResult.Results;
        this.showAddLoader = false;
    }

    public async addTolist(): Promise<void> {
        if(!this.listRecord){
            return;
        }

        if(!this.listRecord.Entity){
            return;
        }

        this.showAddLoader = true;
        this.fetchingRecordsToSave = true;

        const rv: RunView = new RunView();
        const md: Metadata = new Metadata();

        const hashMap: Map<string, {ID: string}> = new Map();
        await Promise.all(this.userViewsToAdd.map(async (userView: UserViewEntity) => {
            const runViewResult: RunViewResult = await rv.RunView({
                EntityName: "User Views",
                ViewEntity: userView,
                Fields: ["ID"]
            }, md.CurrentUser);

            if(!runViewResult.Success){
                LogError(`Error loading view ${userView.Name} for user ${md.CurrentUser.ID}`);
                return;
            }

            const records: {ID: string }[] = runViewResult.Results;
            for(const record of records){
                hashMap.set(record.ID, record);
            }
        }));

        this.recordsToSave = hashMap.size;
        this.recordsSaved = 0;
        this.fetchingRecordsToSave = false;

        LogStatus(`Adding ${hashMap.size} records to list ${this.listRecord!.ID}`);

        //now add the records to the list
        const recordIDs: string[] = [...hashMap.keys()];
        const chunkSize: number = 100;
        for(let i = 0; i < recordIDs.length; i += chunkSize){
            const chunk: string[] = recordIDs.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async (recordID: string) => {
                const listDetail: ListDetailEntity = await md.GetEntityObject("List Details");
                listDetail.ListID = this.listRecord!.ID;
                listDetail.RecordID = recordID.toString();
                listDetail.ContextCurrentUser = md.CurrentUser;

                const saveResult: boolean = await listDetail.Save();
                if(!saveResult){
                    LogError(`Error adding record ${recordID} to list ${this.listRecord!.ID}`, undefined, listDetail.LatestResult);
                }

                this.recordsSaved++;
            }));
        }

        this.showAddLoader = false;
        this.toggleAddFromViewDialog(false);
        this.loadList(this.listRecord!.ID);
    }

    public onKeyup(Value: string): void {
        this.filter = Value;
        this.filterItemsSubject.next(true);
    }

    public onListRecordKeyup(Value: string): void {
        this.searchFilter = Value;
        this.filterListrecordsSubject.next(true);
    }

    private filterItems(filter: string): void {

        if(!filter){
            return;
        }

        if(!this.sourceGridData){
          this.sourceGridData = [];
        }
    
        const toLower: string = filter.toLowerCase();
        this.filteredGridData = this.sourceGridData.filter((data: BaseEntity) => {
            const name: string = data.Get("Name") || '';
            return name.toLowerCase().includes(toLower);
        });
    }

    public addViewToSelectedList(view: UserViewEntity): void {
        this.userViewsToAdd.push(view);
    }

    public removeViewFromSelectedList(view: UserViewEntity): void {
        this.userViewsToAdd.filter((userView: UserViewEntity) => userView.ID !== view.ID);
    }

    public onDropdownItemClick(item: NewItemOption): void {
        if(!item.Action){
            return;
        }

        item.Action();
    }

    public async toggleAddRecordsDialog(show: boolean): Promise<void> {
        this.showAddSingleRecordsDialog = show;

        if(show){
            this.listRecords = [];
            this.searchFilter = "";
            await this.loadListRecords();
        }
    }

    private async loadListRecords(): Promise<void> {
        if(!this.listRecord){
            LogError("Error loading list records. List record is null");
            return;
        }

        this.fetchingListRecords = true;

        const primaryKeyName: string = this.listRecord.EntityInfo.FirstPrimaryKey.Name;

        let filter: string | undefined = undefined;
        const nameField: EntityFieldInfo | undefined = this.listRecord.EntityInfo.Fields.find((field: EntityFieldInfo) => field.IsNameField);
        if(nameField && this.searchFilter){
            filter = `${nameField.Name} LIKE '%${this.searchFilter}%'`;
        }

        const rv: RunView = new RunView();
        const rvResult: RunViewResult = await rv.RunView({
            EntityName: this.listRecord.Entity,
            ExtraFilter: filter,
            MaxRows: 50
        });

        if(!rvResult.Success){
            LogError(`Error loading list records for list ${this.listRecord.ID}`, undefined, rvResult.ErrorMessage);
            this.fetchingListRecords = false;
            return;
        }

        this.listRecords = rvResult.Results.map((record: Record<string, any>) => {
            let result = { ID: record[primaryKeyName], Name: record[nameField!.Name] };
            return result;
        });

        this.fetchingListRecords = false;
    }

    public addListRecord(listRecord: Record<'ID' | 'Name', string>): void {
        
    }
}























