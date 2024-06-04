import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'
import { Metadata, RunView, RunViewResult } from '@memberjunction/core';
import { ListEntity } from '@memberjunction/core-entities';
import { BaseBrowserComponent } from '../base-browser-component/base-browser-component';
import { SharedService } from '@memberjunction/ng-shared';
import { Item } from '../../generic/Item.types';
import { BeforeUpdateItemEvent } from '../../generic/Events.types';

@Component({
  selector: 'mj-list-view',
  templateUrl: './list-view.component.html',
  styleUrls: ['./list-view.component.css', '../../shared/first-tab-styles.css']
})
export class ListViewComponent extends BaseBrowserComponent implements OnInit {
    public showLoader :boolean = false;
    public lists: ListEntity[] = [];

    constructor (private router: Router, private route: ActivatedRoute, private sharedService: SharedService)
    {
        super();

        this.pageName = "Lists";
        this.routeName = "lists";
        this.routeNameSingular = "list";
        this.itemEntityName = "Lists";
        this.categoryEntityName = "";

        const params = this.router.getCurrentNavigation()?.extractedUrl.queryParams;
        super.InitPathAndQueryData(params, this.route);
    }

    async ngOnInit(): Promise<void> {
        this.showLoader = true;
        await this.loadLists();
        await this.loadFolders();
        this.showLoader = false;
    }


    private async loadLists(): Promise<void> {
        const md: Metadata = new Metadata();
        const rv = new RunView();
        const RunViewResult: RunViewResult = await rv.RunView({
            EntityName: 'Lists', 
            ResultType: 'entity_object',
            ExtraFilter: `UserID = ${md.CurrentUser.ID}`
        }, md.CurrentUser);

        if(RunViewResult.Success) {
            this.lists = RunViewResult.Results as ListEntity[];
            this.items = super.createItemsFromEntityData(this.lists);
        }
    }

    private async loadFolders(): Promise<void> {}

    //this could exist in the BaseBrowserComponent class, but 
    //the class would need a reference or dependency on the router
    //which i dont think is needed
    public itemClick(item: Item) {
        let dataID: string = "";

        if(item.Type === "Entity"){
        let list: ListEntity = item.Data as ListEntity;
        dataID = list.ID.toString();
        }

        //super.Navigate(item, this.router, dataID);
        this.router.navigate(["listdetails", dataID]);
    }

    public onBeforeUpdateItemEvent(event: BeforeUpdateItemEvent): void {
        /*
        event.Cancel = true;

        let item: Item = event.Item;
        let list: ListEntity = item.Data;

        //this.router.navigate(['resource', "list detail", list.ID], {queryParams: {edit: true}});
        */
    }
} 

