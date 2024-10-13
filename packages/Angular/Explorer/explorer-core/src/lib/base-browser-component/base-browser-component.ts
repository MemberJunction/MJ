import { LogStatus, Metadata, RunView } from "@memberjunction/core";
import { Folder, Item, ItemType } from "../../generic/Item.types";
import { Router, Params, ActivatedRoute } from '@angular/router';
import { BaseEvent, EventTypes, AfterAddFolderEvent, AfterDeleteItemEvent } from "../../generic/Events.types";
import { BaseNavigationComponent, SharedService } from "@memberjunction/ng-shared";
import { ResourceLinkEntity, ResourcePermissionEngine } from "@memberjunction/core-entities";

export class BaseBrowserComponent extends BaseNavigationComponent {
    public showLoader: boolean = false;
    public items: Item[];
    public folders: Folder[];
    public entityData: any[];
    public selectedFolderID: string | null = null;
    public pageTitle: string = '';

    protected pageName: string = "";
    protected routeName: string = "";
    protected routeNameSingular: string = "";
    protected itemEntityName: string = "";
    protected categoryEntityName: string = "";
    protected viewMode: string = "list";
    protected parentFolderID: number | null = null;
    
    constructor() {
        super();
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
        let categoryFilter: string = this.selectedFolderID ? `CategoryID = '${this.selectedFolderID}'` : `CategoryID IS NULL`;
        let resourceFilter: string = `UserID = '${md.CurrentUser.ID}' AND ${categoryFilter}`;
    
        //filter for the folders
        let resourceCategoryFilter: string = this.selectedFolderID ? `ParentID = '${this.selectedFolderID}'` : `ParentID IS NULL`;
        resourceCategoryFilter += ` AND UserID = '${md.CurrentUser.ID}'`;
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
            this.selectedFolderID = params.get('folderID') || null;
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
        if(!params?.skipLoadCategoryData && this.categoryEntityName){
            const categories: Folder[] = await this.RunView(this.categoryEntityName, categoryItemFilter);
            let folderItems: Item[] = this.createItemsFromFolders(categories);
            if(params?.sortItemsAfterLoad){
                folderItems = this.sortItems(folderItems);
            }
            this.items.push(...folderItems);
            this.folders = categories;
        }

        if(!params?.skiploadEntityData){
            const entityData: any[] = await this.RunView(this.itemEntityName, entityItemFilter);
            const itemType: ItemType = params?.entityItemType || ItemType.Entity;
            let resourceItems: Item[] = this.createItemsFromEntityData(entityData, itemType);
            if (params?.sortItemsAfterLoad) {
                resourceItems = this.sortItems(resourceItems);
            }
            this.items.push(...resourceItems);
            this.entityData = entityData;
        }

        if (!params?.skipLoadResourceLinks) {
            // load up the resource links for the current user/resource type/folder combination
            const md = new Metadata();
            const categoryFilter = this.selectedFolderID ? ` AND FolderID = '${this.selectedFolderID}'` : ` AND FolderID IS NULL`;
            const rt = SharedService.Instance.ResourceTypes.find((rt) => rt.Entity === this.itemEntityName);
            if (!rt)
                throw new Error(`Resource Type for entity ${this.itemEntityName} not found`);
            const extraFilter: string = `UserID = '${md.CurrentUser.ID}' AND ResourceTypeID ='${rt.ID}'${categoryFilter}`;
            // we now have the filter built, run the view
            const result = await this.RunView('Resource Links', extraFilter);
            if (result && result.length > 0) {
                // here, we have 1+ resource links, so we need to add them to the items array, and we need to get the items from the related entity
                // e.g. Views/Dashboards/Reports/etc, and add them to the items array, but turn on the link flag so it is displayed correctly in the UI
                const linkItemFilter = params?.linkItemFilter ? ` AND ${params.linkItemFilter}` : '';
                const resourceExtraFilter = `ID in (${result.map((r) => `'${r.ResourceRecordID}'`).join(',')})${linkItemFilter}`;
                const linkedItems = await this.RunView(this.itemEntityName, resourceExtraFilter);
                const itemType: ItemType = params?.entityItemType || ItemType.Entity;
                let linkedResourceItems: Item[] = this.createItemsFromEntityData(linkedItems, itemType);
                if (params?.sortItemsAfterLoad) {
                    linkedResourceItems = this.sortItems(linkedResourceItems);
                }
                // set the flag for each item show UI knows it is a link
                await ResourcePermissionEngine.Instance.Config(); // probably already configured, but make sure
                linkedResourceItems.forEach((i) => {
                    i.LinkPermissionLevel = ResourcePermissionEngine.Instance.GetUserResourcePermissionLevel(rt.ID, i.Data.ID, md.CurrentUser)
                    i.IsLink = true
                });
                this.items.push(...linkedResourceItems);
            }
        }

        this.showLoader = false;
    }

    //maybe pass in a sort function for custom sorting?
    protected sortItems(items: Item[]): Item[] {
        items.sort(function(a, b){
            const aName: string = a.Name.toLowerCase();
            const bName: string = b.Name.toLowerCase();
            if(aName < bName) { return -1; }
            if(aName > bName) { return 1; }
            return 0;
        });

        return items;
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

    protected createItemsFromEntityData(entityData: any[], itemType: ItemType): Item[] {
        let items: Item[] = [];
        for(const data of entityData){
            let item: Item = new Item(data, itemType);
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
    linkItemFilter?: string,
    entityItemType?: ItemType,
    categoryItemFilter?: string,
    skiploadEntityData?: boolean,
    skipLoadCategoryData?: boolean,
    skipLoadResourceLinks?: boolean,
    sortItemsAfterLoad?: boolean,
    showLoader?: boolean
}