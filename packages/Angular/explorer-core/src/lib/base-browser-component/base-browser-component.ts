import { Metadata, RunView } from "@memberjunction/core";
import { Folder, Item, ItemType } from "../../generic/Item.types";
import { PathData } from "../../generic/PathData.types";
import { Router, Params } from '@angular/router';

export class BaseBrowserComponent {
    public showLoader: boolean = false;
    public items: Item[];
    public folders: Folder[];
    public entityData: any[];
    public PathData: PathData;
    public selectedFolderID: number | null = null;
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

    protected async LoadData(): Promise<void> {
        this.showLoader = true;
        await this.GetCategories();
        await this.GetEntityData();
        this.CreateItemsList();
        this.showLoader = false;
    }

    protected async GetCategories(extraFilter?: string): Promise<void> {
        console.log("GetCategories");
        const rv = new RunView();

        let filterString: string = this.selectedFolderID ? `ID = ${this.selectedFolderID}` : "ParentID IS NULL"; 
        filterString += " AND Name != 'Root'";
        const folderResult = await rv.RunView({
            EntityName: this.categoryEntityName,
            ExtraFilter: extraFilter || filterString
        });

        if(folderResult && folderResult.Success){
            this.folders = folderResult.Results;
        }
        else{
            this.folders = [];
        }
    }

    protected async GetEntityData(extraFilter? :string): Promise<void> {
        const md = new Metadata()
        const rv = new RunView();

        let folderFilter: string = this.selectedFolderID ? `AND CategoryID = ${this.selectedFolderID}` : "AND CategoryID IS NULL";
        const result = await rv.RunView({
            EntityName: this.itemEntityName,
            ExtraFilter: extraFilter ||`UserID=${md.CurrentUser.ID}  ${folderFilter}`
        });

        if (result && result.Success){
            this.entityData = result.Results;
        }
    }

    protected CreateItemsList(): void {
        for(const data of this.entityData){
            let item: Item = new Item(data, ItemType.Entity);
            this.items.push(item);
        }
      
        for(const folder of this.folders){
            const dashboardFolder: Folder = new Folder(folder.ID, folder.Name);
            dashboardFolder.ParentFolderID = folder.ParentFolderID;
            dashboardFolder.Description = folder.Description;
            let item: Item = new Item(dashboardFolder, ItemType.Folder);
            this.items.push(item);
        }
      
        this.items.sort(function(a, b){
        if(a.Name < b.Name) { return -1; }
        if(a.Name > b.Name) { return 1; }
        return 0;
        });
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
        this.LoadData();
        }
    }
}