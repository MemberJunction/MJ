import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'
import { ListEntity } from '@memberjunction/core-entities';
import { BaseBrowserComponent } from '../base-browser-component/base-browser-component';
import { SharedService } from '@memberjunction/ng-shared';
import { Item } from '../../generic/Item.types';
import { BeforeAddItemEvent, BeforeUpdateItemEvent } from '../../generic/Events.types';
import { BaseEntity, EntityInfo, Metadata } from '@memberjunction/core';

@Component({
  selector: 'mj-list-view',
  templateUrl: './list-view.component.html',
  styleUrls: ['./list-view.component.css', '../../shared/first-tab-styles.css']
})
export class ListViewComponent extends BaseBrowserComponent implements OnInit {
    public showLoader :boolean = false;
    public showCreateLoader: boolean = false;
    public lists: ListEntity[] = [];
    public showCreateDialog: boolean = false;
    public entities: EntityInfo[] = [];
    public sourceEntityNames: string[] = [];
    public entityNames: string[] = [];
    

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
        this.sourceEntityNames = this.entities.map(e => `${e.SchemaName}.${e.Name}`);
        this.sourceEntityNames = this.entityNames = this.sourceEntityNames.sort(function(a, b){
            const aName: string = a.toLowerCase();
            const bName: string = b.toLowerCase();
            if(aName < bName) { return -1; }
            if(aName > bName) { return 1; }
            return 0;
        });

        super.InitForResource(this.route);
    }

    public itemClick(item: Item) {
        let dataID: string = "";
    
        if(item.Type === "Entity"){
            let list: ListEntity = item.Data as ListEntity;
            dataID = list.ID.toString();
        }
    
        this.router.navigate(["listdetails", dataID]);
        //super.Navigate(item, this.router, dataID);
    }
    
    public onBeforeUpdateItemEvent(event: BeforeUpdateItemEvent): void {}

    public onBeforeAddItemEvent(event: BeforeAddItemEvent): void {
        event.Cancel = true;
        console.log("onBeforeAddItemEvent");
        this.toggleCreateDialog(true);
    }

    public toggleCreateDialog(show: boolean): void {
        this.showCreateDialog = show;

        if(!show){
            this.listName = "";
            this.listDescription = "";
            this.selectedEntity = null;
        }
    }

    public async createList(): Promise<void> {
        this.showCreateLoader = true;

        if(!this.selectedEntity){
            this.showCreateLoader = false;
            return;
        }

        const md: Metadata = new Metadata();
        let listEntity: ListEntity = await md.GetEntityObject("Lists");
        listEntity.Name = this.listName;
        listEntity.Description = this.listDescription;
        listEntity.EntityID = this.selectedEntity.ID;
        listEntity.UserID = md.CurrentUser.ID;

        const saveResult: boolean = await listEntity.Save();
        this.showCreateLoader = false;

        if(saveResult){
            this.sharedService.CreateSimpleNotification("List created successfully", "success", 2000);
            this.router.navigate(["listdetails", listEntity.ID]);
        }
        else{
            this.sharedService.CreateSimpleNotification("Error creating list", "error", 2000);
        }
    }

    public onFilterChange(value: string): void {
        this.entityNames = this.sourceEntityNames.filter(e => e.toLowerCase().includes(value.toLowerCase()));
    }

    public onSelectionChange(value: string): void {
        this.selectedEntity = this.entities.find(e => `${e.SchemaName}.${e.Name}` === value) || null;
    }
} 

