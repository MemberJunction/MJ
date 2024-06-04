import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from "@angular/router";
import { ApplicationEntityInfo, ApplicationInfo, Metadata, RunView } from "@memberjunction/core";
import { SharedService } from "@memberjunction/ng-shared";
import { Folder, Item, ItemType, TreeFolder, TreeItem } from '../../generic/Item.types';
import { UserViewCategoryEntity, UserViewEntity } from '@memberjunction/core-entities';

@Component({
    selector: 'expansion-panel-component',
    templateUrl: './expansion-panel-component.html',
    styleUrls: ['./expansion-panel-component.css']
  })
export class ExpansionPanelComponent {

    @Input() public items: TreeItem[] = [];

    constructor(public sharedService: SharedService, private router: Router) {}

    ngOnInit(): void {
    }

    public async onTreeNodeSelect(event: any): Promise<void> {
        let selectedItem = this.getTreeItem(event.index);
        if(!selectedItem){
            return;
        }

        if(selectedItem.Type === ItemType.Application){
            let application: ApplicationInfo = selectedItem.Data;
            this.router.navigate(["app", application.Name]);
        }
        else if(selectedItem.Type === ItemType.Entity){
            //we need to get the root item to get the applicationName
            const keys: string[] = event.index.split("_");
            let rootItem: TreeItem = this.items[parseInt(keys[0])];
            let application: ApplicationInfo = rootItem.Data;

            let entity: ApplicationEntityInfo = selectedItem.Data;
            this.router.navigate(["app", application.Name, entity.Entity]);
        }
        else if(selectedItem.Type === ItemType.UserView){
            let userView: UserViewEntity = selectedItem.Data;
            this.router.navigate(["resource", "view", userView.ID]);
        }
        else if(selectedItem.Type === ItemType.Folder){
            //we need to get the root item to get the applicationName
            const keys: string[] = event.index.split("_");
            let rootItem: TreeItem = this.items[parseInt(keys[0])];
            let application: ApplicationInfo = rootItem.Data;

            let folder: TreeFolder = selectedItem.Data;
            this.router.navigate(["app", application.Name, folder.ID]);
        }
    }

    public async onTreeNodeExpand(event: any): Promise<void> {
        let selectedItem = this.getTreeItem(event.index);
        if(!selectedItem){
            return;
        }

        if(selectedItem.Type === ItemType.Application){
            return;
        }

        if(selectedItem.Type === ItemType.Entity){
            selectedItem.ChildItems = [];
            let data: ApplicationEntityInfo = selectedItem.Data;
            let treeNodeFolders: TreeItem[] = await this.getFoldersForTreeNode(data.EntityID, null);
            let treeNodeUserViews: TreeItem[] = await this.getUserViewsForTreeNode(data.EntityID, null);
            
            selectedItem.ChildItems.push(...treeNodeFolders);
            selectedItem.ChildItems.push(...treeNodeUserViews);
        }
        else if(selectedItem.Type === ItemType.Folder){
            selectedItem.ChildItems = [];
            let data: TreeFolder = selectedItem.Data;
            
            let parentFolderID: string | null = data.ParentFolderID ? data.ParentFolderID.toString() : null;
            let treeNodeFolders: TreeItem[] = await this.getFoldersForTreeNode(data.EntityID, parentFolderID);
            let treeNodeUserViews: TreeItem[] = await this.getUserViewsForTreeNode(data.EntityID, data.ID.toString());
            
            selectedItem.ChildItems.push(...treeNodeFolders);
            selectedItem.ChildItems.push(...treeNodeUserViews);
        }

        this.sortItems(selectedItem.ChildItems);
        //this is to simply refresh the treeview and show the new items
        this.items = [...this.items];
    }

    private async getFoldersForTreeNode(entityID: number, selectedFolderID: string | null): Promise<TreeItem[]> {
        const md = new Metadata();

        const categoryIDFilter: string = selectedFolderID ? `ParentID=${selectedFolderID}` : 'ParentID IS NULL';
        const userViewFilter: string = `EntityID = ${entityID} AND ` + categoryIDFilter;

        const viewResults: UserViewCategoryEntity[] = await this.RunView('User View Categories', userViewFilter);
        return viewResults.map((result: UserViewCategoryEntity) => {
            let treeFolder:TreeFolder = new TreeFolder(result.EntityID, result.ID, result.Name);
            treeFolder.ParentFolderID = result.ID;
            let child = new TreeItem(treeFolder, ItemType.Folder);
            //we need a dummy child node so that the expand arrow appears
            child.ChildItems.push(new TreeItem({ Name: 'Stub Node' }, ItemType.StubData));
            return child;
        });
    }

    private async getUserViewsForTreeNode(entityID: number, selectedFolderID: string | null): Promise<TreeItem[]> {
        const md = new Metadata();

        const categoryIDFilter: string = selectedFolderID ? `CategoryID=${selectedFolderID}` : 'CategoryID IS NULL';
        const userViewFilter: string = `UserID = ${md.CurrentUser.ID} AND EntityID = ${entityID} AND ` + categoryIDFilter;

        const viewResults: UserViewEntity[] = await this.RunView('User Views', userViewFilter);
        return viewResults.map((result: UserViewEntity) => {
            let treeItem:TreeItem = new TreeItem(result, ItemType.UserView);
            return treeItem;
        });
    }

    private async RunView(entityName: string, extraFilter?: string | undefined): Promise<any[]> {
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

    //maybe pass in a sort function for custom sorting?
    private sortItems(items: TreeItem[]): void {
        items.sort(function(a, b){
            if(a.Name < b.Name) { return -1; }
            if(a.Name > b.Name) { return 1; }
            return 0;
        });
    }

    //not very robust and can easily break but
    //this works for the common path
    private getTreeItem(index: string): TreeItem | null {
        const keys: string[] = index.split("_");
        let selectedItem: TreeItem | null = null;
        for(const key of keys){
            if(!selectedItem){
                selectedItem = this.items[parseInt(key)];
            }
            else{
                selectedItem = selectedItem.ChildItems[parseInt(key)];
            }
        }

        return selectedItem;
    }
}
