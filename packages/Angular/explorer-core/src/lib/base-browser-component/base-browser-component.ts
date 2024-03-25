import { RunView } from "@memberjunction/core";
import { Folder, Item, ItemType } from "../../generic/Item.types";
import { PathData } from "../../generic/PathData.types";
import { Router, Params } from '@angular/router';
import { BaseEvent, EventTypes, AfterAddFolderEvent, AfterDeleteItemEvent } from "../../generic/Events.types";

export class BaseBrowserComponent {
    public showLoader: boolean = false;
    public items: Item[];
    public folders: Folder[];
    public entityData: any[];
    public PathData: PathData;
    public selectedFolderID: number | null = null;
    protected parentFolderID: number | null = null;

    private EntityItemFilter: string | undefined;
    private CategoryItemFilter: string | undefined;

    protected pageName: string = "";
    protected routeName: string = "";
    protected routeNameSingular: string = "";
    protected itemEntityName: string = "";
    protected categoryEntityName: string = "";
    
    constructor() {
        this.items = [];
        this.folders = [];
        this.entityData = [];
        this.PathData = new PathData(0, "", "");
    }

    protected InitPathData(queryParams: Params | undefined): void {
        this.PathData = new PathData(-1, this.pageName, this.routeName);

        if(queryParams && queryParams.folderID){
            let folderID: number = Number(queryParams.folderID);
            this.PathData = new PathData(folderID, this.pageName, `/${this.routeName}?folderID=${folderID}`);
            this.selectedFolderID = folderID;
        }
    }

    protected async LoadData(params?: LoadDataParams): Promise<void> {
        
        //cache these values so that we can reused them 
        //in the Navigate function
        this.EntityItemFilter = params?.entityItemFilter || this.EntityItemFilter;
        this.CategoryItemFilter = params?.categoryItemFilter || this.CategoryItemFilter;

        if(params?.showLoader){
            this.showLoader = true;
        }
        

        this.items = [];
        if(!params?.skiploadEntityData){
            const entityData: any[] = await this.RunView(this.itemEntityName, this.EntityItemFilter);
            this.items.push(...this.createItemsFromEntityData(entityData));
            this.entityData = entityData;
        }

        if(!params?.skipLoadCategoryData){
            const categories: Folder[] = await this.RunView(this.categoryEntityName, this.CategoryItemFilter);
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

        if (result && result.Success){
            return result.Results;
        }
        else{
            return[];
        }
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
        const folder: Folder = <Folder>item.Data;
        const oldPathData: PathData = this.PathData;
        const newPathData: PathData = new PathData(folder.ID, folder.Name, `/${this.routeName}?folderID=${folder.ID}`);
        
        oldPathData.ChildPathData = newPathData;
        newPathData.ParentPathData = oldPathData;
        this.PathData = newPathData;
        
        //navigation seems like it does nothing but update the URL
        //so just reload all of the data
        router.navigate([this.routeName], {queryParams: {folderID: folder.ID}});
        this.selectedFolderID = folder.ID;
        this.LoadData({});
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
}

export type LoadDataParams = {
    entityItemFilter?: string,
    categoryItemFilter?: string,
    skiploadEntityData?: boolean,
    skipLoadCategoryData?: boolean,
    sortItemsAfterLoad?: boolean,
    showLoader?: boolean
}