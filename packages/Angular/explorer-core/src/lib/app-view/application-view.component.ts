import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'
import { ApplicationEntityInfo, Metadata, LogStatus } from '@memberjunction/core';
import { UserFavoriteEntity } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';
import { Item, ItemType } from '../../generic/Item.types';
import { BaseBrowserComponent } from '../base-browser-component/base-browser-component';
import {Location} from '@angular/common'; 

@Component({
  selector: 'application-view',
  templateUrl: './application-view.component.html',
  styleUrls: ['./application-view.component.css', '../../shared/first-tab-styles.css']
})
export class ApplicationViewComponent extends BaseBrowserComponent implements OnInit {

    private appNameFromURL: string = '';
    public appName: string = ''
    public appDescription: string = ''
    public appEntities: ApplicationEntityInfo[] = [];
    public AppEntityButtons: ApplicationEntityButton[] = []
    private selectedAppEntity: ApplicationEntityInfo | null = null;
    public categoryEntityID: number | null = null;

    constructor (private router: Router, private route: ActivatedRoute, private location: Location, private sharedService: SharedService){
        super();
        this.categoryEntityName = "User View Categories";
        this.itemEntityName = "User Views";
    }

    async ngOnInit(): Promise<void> {
        this.route.paramMap.subscribe(async (params) => {
            const appName = params.get('appName');
            const entityName = params.get('entityName');
            const folderID = params.get('folderID'); 

            LogStatus("appName: " + appName + " entityName: " + entityName + " folderID: " + folderID);
            if(folderID){
                this.selectedFolderID = parseInt(folderID) || null;
            }
            
            if (appName) {

                this.appName = this.appNameFromURL = appName;
                const md = new Metadata()
                const app = md.Applications.find(a => a.Name == appName)
                
                if (app) {
                    this.appDescription = app.Description
                    this.appEntities = app.ApplicationEntities 
                }

                this.AppEntityButtons = this.appEntities.map(entity => new ApplicationEntityButton(entity));

                if(this.AppEntityButtons.length){
                    if(entityName){
                        const entityNameToLower: string = entityName.toLowerCase();
                        const selectedAppEntity = this.AppEntityButtons.find(e => e.Name.toLocaleLowerCase() == entityNameToLower);
                        if(selectedAppEntity){
                            selectedAppEntity.Selected = true;
                            await this.loadEntitiesAndFolders(selectedAppEntity);
                            return;
                        }
                    }

                    const defaultEntity = this.AppEntityButtons[0];
                    defaultEntity.Selected = true;
                    await this.loadEntitiesAndFolders(defaultEntity);
                }
            }
        });    
    }

    public onAppEntityButtonClicked(appEntityButton: ApplicationEntityButton): void {
        if(appEntityButton.Selected){
            return;
        }

        this.selectedAppEntity = appEntityButton.Data;
        this.navigateToCurrentPage();
    }

    public async loadEntitiesAndFolders(appEntityButton: ApplicationEntityButton): Promise<void> {
        if(!appEntityButton){
            return;
        }

        this.showLoader = true;
        this.appName = appEntityButton.Name;
        this.selectedAppEntity = appEntityButton.Data;
        this.categoryEntityID = this.selectedAppEntity.EntityID;

        const parentFolderIDFilter: string = this.selectedFolderID ? `ParentID=${this.selectedFolderID}` : 'ParentID IS NULL';
        const categoryFilter: string = `EntityID=${this.selectedAppEntity.EntityID} AND ` + parentFolderIDFilter;
        
        const md = new Metadata();
        const categoryIDFilter: string = this.selectedFolderID ? `CategoryID=${this.selectedFolderID}` : 'CategoryID IS NULL';
        const userViewFilter: string = `UserID = ${md.CurrentUser.ID} AND EntityID = ${appEntityButton.Data.EntityID} AND ` + categoryIDFilter;

        LogStatus("categoryFilter: " + categoryFilter + " userViewFilter: " + userViewFilter);
        await super.LoadData({
            sortItemsAfterLoad: true, 
            categoryItemFilter: categoryFilter, 
            entityItemFilter: userViewFilter, 
            showLoader: true
        });
        this.showLoader = false;
    }

    public onItemClick(item: Item) {
        if(!item){
            return;
        }

        if(item.Type == ItemType.Entity){
            this.router.navigate(['resource', 'view', item.Data.ID]);
        }
        else if(item.Type == ItemType.Folder){
            this.selectedFolderID = item.Data.ID;
            this.navigateToCurrentPage();
        }
    }

    entityItemClick(info: ApplicationEntityInfo) {
        if (info) {
            const paramsArray = ['entity', info.Entity];
            this.router.navigate(paramsArray)  
        }
    }

    favoriteItemClick(fav: UserFavoriteEntity) {
        if (fav) {
            if (fav.Entity === 'User Views') {
                // opening a view, different route
                this.router.navigate(['resource', 'view', fav.RecordID]);
            }
            else {
                this.router.navigate(['resource', 'record', fav.RecordID], { queryParams: { Entity: fav.Entity } })
            }
        }
    }

    private navigateToCurrentPage(): void{
        //we're capable of loading the data associated with the selected ApplicationEntityInfo object
        //without a page refresh, but we'd need additonal logic to handle routing, e.g. back
        //button in the browser taking you to the last selected entity.
        //so its easier if we instead navigate to this page with an updated url and leverage angular's router
        let folderID: string | null = this.selectedFolderID ? this.selectedFolderID.toString() : null;
        let url: string[] = ["/app", this.appNameFromURL];
        let appEntityName: string | null = this.selectedAppEntity ? this.selectedAppEntity.Entity : null;
        if(appEntityName){
            url.push(`${appEntityName}`);
            if(folderID){
                url.push(`${folderID}`);
            }
        }

        this.router.navigate(url);
    }
} 

//This is a simple wrapper for the ApplicationEntityInfo class 
//that just adds a Selected property
class ApplicationEntityButton {
    public Data: ApplicationEntityInfo;
    public Name: string;
    public Selected: boolean;

    constructor(data: ApplicationEntityInfo) {
        this.Data = data;
        this.Name = data.Entity;
        this.Selected = false;
    }
}
