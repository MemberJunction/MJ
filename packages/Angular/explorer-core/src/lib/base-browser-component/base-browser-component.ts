import { BaseEntity, Metadata, RunView } from "@memberjunction/core";
import { Folder, Item, ItemType } from "../../generic/Item.types";
import { PathData } from "../../generic/PathData.types";

export class BaseBrowserComponent {
    public showLoader: boolean = false;
    public items: Item[];
    public folders: BaseEntity[];
    public entityData: BaseEntity[];
    public PathData: PathData;
    public selectedFolderID: number | null = null;
    protected parentFolderID: number | null = null;
    
    constructor() {
        this.items = [];
        this.folders = [];
        this.entityData = [];

        //child component must override this
        this.PathData = new PathData(0, "", "");
    }

    protected async LoadData(itemEntityName: string, categoryEntityName: string): Promise<void> {
        this.showLoader = true;
        await this.GetCategories(categoryEntityName);
        await this.GetEntityData(itemEntityName);
        this.createItemsList();
        this.showLoader = false;
    }

    protected async GetCategories(entityName: string, extraFilter?: string): Promise<void> {
        const rv = new RunView();

        let filterString: string = this.selectedFolderID ? `ID = ${this.selectedFolderID}` : "ParentID IS NULL"; 
        filterString += " AND Name != 'Root'";
        const folderResult = await rv.RunView({
            EntityName: entityName,
            ExtraFilter: filterString
        });

        if(folderResult && folderResult.Success){
            this.folders = folderResult.Results;
        }
        else{
            this.folders = [];
        }
    }

    protected async GetEntityData(entityName: string, extraFilter? :string): Promise<void> {
        const md = new Metadata()
        const rv = new RunView();

        let folderFilter: string = this.selectedFolderID ? `AND CategoryID = ${this.selectedFolderID}` : "AND CategoryID IS NULL";
        const result = await rv.RunView({
            EntityName: entityName,
            ExtraFilter: extraFilter ||`UserID=${md.CurrentUser.ID}  ${folderFilter}`
        })

        if (result && result.Success){
            this.entityData = result.Results;
        }
    }

    protected createItemsList(): void {
        for(const dashboard of this.entityData){
            let item: Item = new Item(dashboard, ItemType.Entity);
            this.items.push(item);
          }
      
          for(const folder of this.folders){
            const dashboardFolder: Folder = new Folder(folder.Get("ID"), folder.Get("Name"));
            dashboardFolder.ParentFolderID = folder.Get("ParentID");
            dashboardFolder.Description = folder.Get("Description");
            let item: Item = new Item(dashboardFolder, ItemType.Folder);
            this.items.push(item);
          }
      
          this.items.sort(function(a, b){
            if(a.Name < b.Name) { return -1; }
            if(a.Name > b.Name) { return 1; }
            return 0;
          });
    }
}