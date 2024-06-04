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
    public showLoader: boolean = false;
    public gridData: BaseEntity[] = [];
    
    constructor (private router: Router, private route: ActivatedRoute, private sharedService: SharedService){
        
    }

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
                const recordIDs: string = listDetailRecords.map(ld => ld.RecordID).join(',');
                
                const rvResult: RunViewResult = await rv.RunView({
                    EntityName: entity.Name,
                    ExtraFilter: `ID IN (${recordIDs})`
                }, md.CurrentUser);

                if(!rvResult.Success){
                    LogError(`Error loading ${entity.Name} records with IDs in list (${recordIDs})`);
                    return;
                }

                this.gridData = rvResult.Results;
            }
            console.log("listID:", listID);
            this.showLoader = false;
        });
    }
}























