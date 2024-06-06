import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { BaseEntity, EntityInfo, LogError, Metadata, RunView, RunViewResult } from '@memberjunction/core';
import { ListDetailEntity, ListEntity } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';

@Component({
  selector: 'mj-list-detail',
  templateUrl: './single-list-detail.component.html',
  styleUrls: ['./single-list-detail.component.css']
})
export class SingleListDetailComponent implements OnInit {
    private listRecord: ListEntity | null = null;

    public showLoader: boolean = false;
    public gridData: BaseEntity[] = [];
    public listName: string = "";
    public showAddDialog: boolean = false;
    public showAddLoader: boolean = false;
    public userViews: BaseEntity[] = [];
    public selectedUserView: BaseEntity | null = null;
    
    constructor (private router: Router, private route: ActivatedRoute, private sharedService: SharedService){}

    public async ngOnInit(): Promise<void> {
        this.showLoader = true;
        this.route.paramMap.subscribe(async (params) => {
            const listID = params.get('listID');

            if(listID){
                const md: Metadata = new Metadata();
                const rv: RunView = new RunView();

                const listRunViewResult: RunViewResult = await rv.RunView({
                    EntityName: 'Lists',
                    ResultType: 'entity_object',
                    ExtraFilter: `ID = ${listID}`
                }, md.CurrentUser);

                if(!listRunViewResult.Success || listRunViewResult.Results.length === 0){
                    LogError("Error loading list with ID " + listID);
                    return;
                }

                const listEntity: ListEntity = listRunViewResult.Results[0] as ListEntity;
                const entity: EntityInfo | null = md.EntityFromEntityID(listEntity.EntityID!);

                if(!entity){
                    LogError("Error fetching EntityInfo with ID " + listEntity.EntityID);
                    return;
                }

                this.listName = listEntity.Name;
                this.listRecord = listEntity;

                const runViewResult: RunViewResult = await rv.RunView({
                    EntityName: 'List Details',
                    ResultType: 'entity_object',
                    ExtraFilter: `ListID = ${listID}`
                }, md.CurrentUser);

                if(!runViewResult.Success){
                    LogError("Error loading list details for list with ID " + listID);
                    return;
                }

                const listDetailRecords: ListDetailEntity[] = runViewResult.Results as ListDetailEntity[];
                if(listDetailRecords.length > 0){
                    const recordIDs: string = listDetailRecords.map(ld => ld.RecordID).join(',');
                    let extraFilter: string = `ID IN (${recordIDs})`;

                    const rvResult: RunViewResult = await rv.RunView({
                        EntityName: entity.Name,
                        ExtraFilter: extraFilter
                    }, md.CurrentUser);
    
                    if(!rvResult.Success){
                        LogError(`Error loading ${entity.Name} records with extra filter ${extraFilter}`);
                        return;
                    }
    
                    this.gridData = rvResult.Results;
                } 
            }
            
            this.showLoader = false;
        });
    }

    public async toggleAddDialog(show: boolean): Promise<void> {
        return;
        this.showAddDialog = show;

        if(show && this.userViews.length === 0){  
            await this.loadEntityViews();
        }
    }

    public async addTolist(): Promise<void> {
        if(!this.selectedUserView || !this.selectedUserView.Get("ID") || !this.listRecord || !this.listRecord.Entity){
            return;
        }

        this.showAddLoader = true;
        const rv: RunView = new RunView();
        const md: Metadata = new Metadata();

        const runViewResult: RunViewResult = await rv.RunView({
            EntityName: this.listRecord.Entity,
            ExtraFilter: `UserID = ${md.CurrentUser.ID} AND EntityID = ${this.listRecord.EntityID} AND ID = ${this.selectedUserView.Get("ID")}`,
            ResultType: 'entity_object'
        }, md.CurrentUser);

        if(!runViewResult.Success){
            this.showAddLoader = true;
            LogError(`Error loading ${this.listRecord.Entity} User View record for user ${md.CurrentUser.ID}`);
            return;
        }
    }

    private async loadEntityViews(): Promise<void> {
        this.showAddLoader = true;

        if(!this.listRecord || !this.listRecord.Entity){
            return;
        }

        const rv: RunView = new RunView();
        const md: Metadata = new Metadata();

        const runViewResult: RunViewResult = await rv.RunView({
            EntityName: "User Views",
            ExtraFilter: `UserID = ${md.CurrentUser.ID} AND EntityID = ${this.listRecord.EntityID}`,
            ResultType: 'entity_object'
        }, md.CurrentUser);

        if(!runViewResult.Success){
            this.showAddLoader = true;
            LogError(`Error loading ${this.listRecord.Entity} User View records for user ${md.CurrentUser.ID}`);
            return;
        }

        this.userViews = runViewResult.Results;
        this.showAddLoader = false;
    }
}























