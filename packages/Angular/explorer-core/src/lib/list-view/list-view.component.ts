import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'
import { ListEntity } from '@memberjunction/core-entities';
import { BaseBrowserComponent } from '../base-browser-component/base-browser-component';
import { SharedService } from '@memberjunction/ng-shared';
import { Item } from '../../generic/Item.types';
import { BeforeAddItemEvent, BeforeUpdateItemEvent } from '../../generic/Events.types';
import { EntityInfo, Metadata } from '@memberjunction/core';

@Component({
  selector: 'mj-list-view',
  templateUrl: './list-view.component.html',
  styleUrls: ['./list-view.component.css', '../../shared/first-tab-styles.css']
})
export class ListViewComponent extends BaseBrowserComponent implements OnInit {
    public showLoader :boolean = false;
    public lists: ListEntity[] = [];
    public showCreateDialog: boolean = false;
    public entities: EntityInfo[] = [];

    //create dialog properties
    public listName: string = "";
    public listDescription: string = "";
    public selectedEntity: EntityInfo | null = null;

    constructor (private router: Router, private route: ActivatedRoute, private sharedService: SharedService)
    {
        super();

        this.pageName = "Lists";
        this.routeName = "lists";
        this.routeNameSingular = "list";
        this.itemEntityName = "Lists";
        this.categoryEntityName = "List Categories";

        const params = this.router.getCurrentNavigation()?.extractedUrl.queryParams;
        super.InitPathAndQueryData(params, this.route);
    }

    async ngOnInit(): Promise<void> {
        const md: Metadata = new Metadata();
        this.entities = md.Entities;
        super.InitForResource(this.route);
    }

    public itemClick(item: Item) {
        let dataID: string = "";
    
        if(item.Type === "Entity"){
            let list: ListEntity = item.Data as ListEntity;
            dataID = list.ID.toString();
        }
    
        super.Navigate(item, this.router, dataID);
    }
    
    public onBeforeUpdateItemEvent(event: BeforeUpdateItemEvent): void {}

    public onBeforeAddItemEvent(event: BeforeAddItemEvent): void {
        event.Cancel = true;
        console.log("onBeforeAddItemEvent");
        this.toggleCreateDialog(true);
    }

    public toggleCreateDialog(show: boolean): void {
        this.showCreateDialog = show;
    }

    public createList(): void {
        console.log("createList");
        console.log(this.listName, this.listDescription, this.selectedEntity?.DisplayName);
    }
} 

