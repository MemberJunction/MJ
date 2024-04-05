import { LogStatus, Metadata, RunView } from "@memberjunction/core";
import { Folder, Item, ItemType } from "../../generic/Item.types";
import { Router, Params, ActivatedRoute } from '@angular/router';
import { BaseEvent, EventTypes, AfterAddFolderEvent, AfterDeleteItemEvent } from "../../generic/Events.types";

export class BaseBrowserComponent {
    public showLoader: boolean = false;
    public items: Item[];
    public folders: Folder[];
    public entityData: any[];
    public selectedFolderID: number | null = null;
    protected viewMode: string = "list";
    protected parentFolderID: number | null = null;

    protected pageName: string = "";
    protected routeName: string = "";
    protected routeNameSingular: string = "";
    protected itemEntityName: string = "";
    protected categoryEntityName: string = "";
    
    constructor() {
        this.items = [];
        this.folders = [];
        this.entityData = [];
    }

    public get displayAsGrid(): boolean { return this.viewMode === "grid"; }

    protected InitPathAndQueryData(queryParams: Params | undefined, route: ActivatedRoute): void {
        if(queryParams && queryParams.viewMode){
            this.viewMode = queryParams.viewMode;
        }
    }

    public async buildFiltersAndLoadData(): Promise<void> {

        const md: Metadata = new Metadata();
        let categoryFilter: string = this.selectedFolderID ? `CategoryID = ${this.selectedFolderID}` : `CategoryID IS NULL`;
        let resourceFilter: string = `UserID = ${md.CurrentUser.ID} AND ${categoryFilter}`;
    
        //filter for the folders
        let resourceCategoryFilter: string = this.selectedFolderID ? `ParentID = ${this.selectedFolderID}` : `ParentID IS NULL`;
        resourceCategoryFilter += ` AND UserID = ${md.CurrentUser.ID}`;
        LogStatus("resourceFilter: " + resourceFilter + " category filter: " + resourceCategoryFilter);
        await this.LoadData({
            sortItemsAfterLoad: true, 
            categoryItemFilter: resourceCategoryFilter, 
            entityItemFilter: resourceFilter, 
            showLoader: true
        });
    }

    protected InitForResource(router: ActivatedRoute): void {
        router.paramMap.subscribe(async (params) => {
            this.selectedFolderID = Number(params.get('folderID')) || null;
            await this.buildFiltersAndLoadData();
        });
    }

    protected async LoadData(params?: LoadDataParams): Promise<void> {
        let entityItemFilter: string | undefined = params?.entityItemFilter;
        let categoryItemFilter: string | undefined = params?.categoryItemFilter;

        if(params?.showLoader){
            this.showLoader = true;
        }

        this.items = [];
        if(!params?.skiploadEntityData){
            const entityData: any[] = await this.RunView(this.itemEntityName, entityItemFilter);
            this.items.push(...this.createItemsFromEntityData(entityData));
            this.entityData = entityData;
        }

        if(!params?.skipLoadCategoryData){
            const categories: Folder[] = await this.RunView(this.categoryEntityName, categoryItemFilter);
            this.items.push(...this.createItemsFromFolders(categories));
            this.folders = categories;
        }
        
        if(params?.sortItemsAfterLoad){
            this.sortItems();
        }

        this.showLoader = false;
    }

    //maybe pass in a sort function for custom sorting?
    protected sortItems(): void {
        this.items.sort(function(a, b){
            if(a.Name < b.Name) { return -1; }
            if(a.Name > b.Name) { return 1; }
            return 0;
        });
    }

    protected async RunView(entityName: string, extraFilter: string | undefined): Promise<any[]> {
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: entityName,
            ExtraFilter: extraFilter
        });

        if(result){
            if(result.Success){
                return result.Results;
            }
            else{
                throw new Error(result.ErrorMessage);
            }
        }
        
        return [];
    }

    protected createItemsFromEntityData(entityData: any[]): Item[] {
        let items: Item[] = [];
        for(const data of entityData){
            let item: Item = new Item(data, ItemType.Entity);
            items.push(item);
        }

        return items;
    }

    protected createItemsFromFolders(folders: Folder[]): Item[] {
        let items: Item[] = [];
        for(const folder of folders){
            const dashboardFolder: Folder = new Folder(folder.ID, folder.Name);
            dashboardFolder.ParentFolderID = folder.ParentFolderID;
            dashboardFolder.Description = folder.Description;
            let item: Item = new Item(dashboardFolder, ItemType.Folder);
            items.push(item);
        }

        return items;
    }

    protected Navigate(item: Item, router: Router, dataID: string): void {
        if(!item){
            return
        }
      
        if (item.Type === ItemType.Entity) {
            router.navigate(['resource', this.routeNameSingular, dataID]);
        }
        else if(item.Type === ItemType.Folder){
            const folder: Folder = item.Data;
            const route: string[] = [this.routeName, folder.ID.toString()];
            router.navigate(route, {queryParams: {viewMode: this.viewMode}});
        }
    }

    public onEvent(event: BaseEvent): void {
        if(event.EventType === EventTypes.AfterAddFolder || event.EventType === EventTypes.AfterAddItem){
            //specific type does not matter, we just need a type that has the Item property
            let addEvent: AfterAddFolderEvent = event as AfterAddFolderEvent;
            this.items.push(addEvent.Item);
        }
        else if(event.EventType === EventTypes.AfterDeleteItem || event.EventType === EventTypes.AfterDeleteFolder){
            //specific type does not matter, we just need a type that has the Item property
            let deleteEvent: AfterDeleteItemEvent = event as AfterDeleteItemEvent;
            this.items = this.items.filter((item: Item) => item !== deleteEvent.Item);
        }
    }

    public onViewModeChange(viewMode: string): void {
        this.viewMode = viewMode;
    }
}

export type LoadDataParams = {
    entityItemFilter?: string,
    categoryItemFilter?: string,
    skiploadEntityData?: boolean,
    skipLoadCategoryData?: boolean,
    sortItemsAfterLoad?: boolean,
    showLoader?: boolean
}