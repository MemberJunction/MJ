import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { BaseEntity, EntityFieldInfo, EntityFieldTSType, EntityInfo, LogError, LogStatus, Metadata, RunView, RunViewResult } from '@memberjunction/core';
import { ListDetailEntity, ListEntity, UserViewEntity, ViewColumnInfo } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';
import { PageChangeEvent } from '@progress/kendo-angular-grid';
import { Subject, debounceTime } from 'rxjs';

@Component({
  selector: 'mj-list-detail',
  templateUrl: './single-list-detail.component.html',
  styleUrls: ['./single-list-detail.component.css']
})
export class SingleListDetailComponent implements OnInit {
    private listRecord: ListEntity | null = null;
    private listID: string = "";

    public showLoader: boolean = false;
    public sourceGridData: BaseEntity[] = [];
    public filteredGridData: BaseEntity[] = [];
    public listName: string = "";
    public showAddDialog: boolean = false;
    public showAddLoader: boolean = false;
    public userViews: UserViewEntity[] | null = null;

    private _resizeDebounceTime: number = 250;
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
    
    constructor (private router: Router, private route: ActivatedRoute, private sharedService: SharedService)
    {
        this.filterItemsSubject
        .pipe(debounceTime(this._resizeDebounceTime))
        .subscribe(() => this.filterItems(this.filter));
    }

    public async ngOnInit(): Promise<void> {
        this.route.paramMap.subscribe(async (params) => {
            const listID = params.get('listID');
            if(listID){
                await this.loadList(listID);
            }
        });
    }

    private async loadList(listID: string): Promise<void> {
        const startTime: number = new Date().getTime();
        if(listID){
            this.listID = listID;
            this.showLoader = true;

            const md: Metadata = new Metadata();
            const rv: RunView = new RunView();

            const listRunViewResult: RunViewResult = await rv.RunView<ListEntity>({
                EntityName: 'Lists',
                ResultType: 'entity_object',
                ExtraFilter: `ID = '${listID}'`
            }, md.CurrentUser);

            if(!listRunViewResult.Success || listRunViewResult.Results.length === 0){
                LogError("Error loading list with ID " + listID);
                return;
            }

            const listEntity: ListEntity = listRunViewResult.Results[0];
            const entity: EntityInfo | null = md.EntityFromEntityID(listEntity.EntityID!);

            if(!entity){
                LogError("Error fetching EntityInfo with ID " + listEntity.EntityID);
                return;
            }

            for(const field of entity.Fields){
                if(!field.DefaultInView){
                    continue;
                }

                let column: Partial<ViewColumnInfo> = {
                    ID: field.ID,
                    Name: field.CodeName,
                    DisplayName: field.DisplayName,
                    EntityField: field,
                    hidden: false,
                    orderIndex: field.Sequence,
                    width: field.DefaultColumnWidth || 100
                };

                this.viewColumns.push(column);
            }

                                                            /*make sure there is an entity field linked*/
            this.visibleColumns = this.viewColumns.filter(x => x.hidden === false && x.EntityField).sort((a,b) => {
                const aOrder = a.orderIndex != null ? a.orderIndex : 9999;
                const bOrder = b.orderIndex != null ? b.orderIndex : 9999;
                return aOrder - bOrder;
            });

            this.listName = listEntity.Name;
            this.listRecord = listEntity;

            const runViewResult: RunViewResult = await rv.RunView<ListDetailEntity>({
                EntityName: 'List Details',
                ResultType: 'entity_object',
                ExtraFilter: `ListID = '${listID}'`,
                MaxRows: this.pageSize,
                IgnoreMaxRows: false,
                StartRow: Math.max(0, (this.page - 1) * this.pageSize)
            }, md.CurrentUser);

            if(!runViewResult.Success){
                LogError("Error loading list details for list with ID " + listID);
                return;
            }

            this.totalRowCount = runViewResult.TotalRowCount;

            const listDetailRecords: ListDetailEntity[] = runViewResult.Results;
            LogStatus(`Found ${listDetailRecords.length} records in list ${listID}`);
            if(listDetailRecords.length > 0){
                const recordIDs: string = listDetailRecords.map(ld => `'${ld.RecordID}'`).join(',');
                let extraFilter: string = `ID IN (${recordIDs})`;

                const rvResult: RunViewResult = await rv.RunView({
                    EntityName: entity.Name,
                    ExtraFilter: extraFilter
                }, md.CurrentUser);

                if(!rvResult.Success){
                    LogError(`Error loading ${entity.Name} records with extra filter ${extraFilter}`);
                    return;
                }

                LogStatus(`Found ${rvResult.Results.length} records in entity ${entity.Name}`);
                this.sourceGridData = this.filteredGridData = rvResult.Results;
                this.viewExecutionTime = (new Date().getTime() - startTime) / 1000; // in seconds
            }

            this.showLoader = false;
        }
    }

    public pageChange(event: PageChangeEvent): void {
        this.page = event.skip;
        this.loadList(this.listID);
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

    public async toggleAddDialog(show: boolean): Promise<void> {
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
        if(!this.listRecord || !this.listRecord.Entity){
            return;
        }

        this.showAddLoader = true;
        const rv: RunView = new RunView();
        const md: Metadata = new Metadata();

        const hashMap: Map<number, {ID: number}> = new Map();
        for(const userView of this.userViewsToAdd){
            const userView = this.userViewsToAdd[0];
            const runViewResult: RunViewResult = await rv.RunView({
                EntityName: "User Views",
                ViewEntity: userView,
                Fields: ["ID"]
            }, md.CurrentUser);

            if(!runViewResult.Success){
                LogError(`Error loading view ${userView.Name} for user ${md.CurrentUser.ID}`);
                return;
            }

            const records: {ID: number }[] = runViewResult.Results;
            for(const record of records){
                hashMap.set(record.ID, record);
            }
        }

        LogStatus(`Adding ${hashMap.size} records to list ${this.listRecord!.ID}`);

        //now add the records to the list
        let count: number = 0;

        for(const [recordID, record] of hashMap){
            const listDetail: ListDetailEntity = await md.GetEntityObject("List Details");
            listDetail.ListID = this.listRecord.ID;
            listDetail.RecordID = recordID.toString();
            listDetail.ContextCurrentUser = md.CurrentUser;
            listDetail.Save().then((result: boolean) => {
                if(!result){
                    LogError(`Error adding record ${recordID} to list ${this.listRecord!.ID}`, undefined, listDetail.LatestResult);
                }

                count = count + 1;
                if(count === hashMap.size){
                    this.showAddLoader = false;
                    this.toggleAddDialog(false);
                    this.loadList(this.listRecord!.ID);
                }
            });
        }
    }

    public onKeyup(Value: string): void {
        this.filter = Value;
        this.filterItemsSubject.next(true);
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
}























