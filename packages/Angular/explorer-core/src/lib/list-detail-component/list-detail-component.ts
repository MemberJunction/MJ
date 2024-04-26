import { Component, OnInit } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { Metadata } from "@memberjunction/core";
import { ListEntity } from "@memberjunction/core-entities";
import { List } from "../list-component/list-component";

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
    public listDetail = new ListDetail()

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
            const listObj: any = <ListEntity>await md.GetEntityObject('Lists');
            await listObj.Load(JSON.parse(this.entityId) ); // load the view to be deleted
            this.loader = false;
            const { ID, Name, Description, Entity, _EntityInfo } = listObj;
            const { BaseView, SchemaName, IncludeInAPI, AllowAllRowsAPI, AllowUpdateAPI, AllowCreateAPI, AllowDeleteAPI } = _EntityInfo;
            this.listDetail = {
                ID,
                Name,
                Description,
                Entity,
                BaseView,
                SchemaName,
                IncludeInAPI,
                AllowAllRowsAPI,
                AllowUpdateAPI,
                AllowCreateAPI,
                AllowDeleteAPI
            };
        }
      
    }

}