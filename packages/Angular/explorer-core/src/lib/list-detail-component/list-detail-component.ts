import { Component, OnInit } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { Metadata, RunView, RunViewParams } from "@memberjunction/core";
import { ListDetailEntity, ListEntity } from "@memberjunction/core-entities";

export class ListDetail {
    ID: number = 0;
    Name: string = '';
    Description: string = '';
    Entity: string = '';
    BaseView: string = '';
    SchemaName: string = '';
    IncludeInAPI: boolean = false;
    AllowAllRowsAPI: boolean = false;
    AllowUpdateAPI: boolean = false;
    AllowCreateAPI: boolean = false;
    AllowDeleteAPI: boolean = false;
} 

@Component({
    selector: 'mj-list-detail-component',
    templateUrl: './list-detail-component.html',
    styleUrls: ['./list-detail-component.css', '../../shared/first-tab-styles.css'],
  })

export class ListDetailComponent implements OnInit {

    private entityId: string = '';
    public loader: boolean = false;
    public listDetail = new ListDetail();
    public Params: RunViewParams | undefined;

    constructor(private route: ActivatedRoute) {
        this.route.params.subscribe(params => {
            // Access the 'entityId' parameter value
             this.entityId = params.entityId
          });
    }
    async ngOnInit(): Promise<void> {
        if(this.entityId) {
            this.loader = true
            const md = new Metadata();
            let view:RunView = new RunView();
            let result = await view.RunView({EntityName: 'List Details', ExtraFilter: "ListID = " + this.entityId, ResultType: 'entity_object'}, md.CurrentUser); 
            const listObj: ListEntity = <ListEntity>await md.GetEntityObject('Lists');
            await listObj.Load(JSON.parse(this.entityId) ); // load the view to be deleted
            
            let entityName = listObj.Entity
            let extraFilter: string = "ID in (" + result.Results.map((listDetail: ListDetailEntity) => {
                return listDetail.RecordID.toString() + " ";
            }) + ")";

            this.Params = {
                EntityName: entityName!, 
                ExtraFilter: extraFilter,
            }
            this.loader = false;
        }
    }
}