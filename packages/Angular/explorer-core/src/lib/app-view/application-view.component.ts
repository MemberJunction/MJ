import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'
import { ApplicationEntityInfo, Metadata } from '@memberjunction/core';
import { UserFavoriteEntity } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';
import { Folder, Item, ItemType } from '../../generic/Item.types';
import { ViewInfo, UserViewEntity } from '@memberjunction/core-entities';
import { BaseBrowserComponent } from '../base-browser-component/base-browser-component';
import { BaseEvent } from '../../generic/Events.types';

@Component({
  selector: 'application-view',
  templateUrl: './application-view.component.html',
  styleUrls: ['./application-view.component.css', '../../shared/first-tab-styles.css']
})
export class ApplicationViewComponent extends BaseBrowserComponent implements OnInit {

    public appName: string = ''
    public appDescription: string = ''
    public appEntities: ApplicationEntityInfo[] = [];
    public AppEntityButtons: ApplicationEntityButton[] = []
    private selectedAppEntity: ApplicationEntityInfo | null = null;
    public categoryEntityID: number | null = null;

    constructor (private router: Router, private route: ActivatedRoute, private sharedService: SharedService){
        super();
        this.categoryEntityName = "User View Categories";
    }

    async ngOnInit(): Promise<void> {
        this.route.paramMap.subscribe(async (params) => {
            const appName = params.get('appName'); 
            // Perform any necessary actions with the ViewID, such as fetching data
            if (appName) {
                this.appName = appName;
                const md = new Metadata()
                const app = md.Applications.find(a => a.Name == appName)
                if (app)  {
                this.appDescription = app.Description
                this.appEntities = app.ApplicationEntities 
                }

                this.AppEntityButtons = this.appEntities.map(entity => new ApplicationEntityButton(entity));

                if(this.AppEntityButtons.length > 0){
                    const selectedAppEntity = this.AppEntityButtons[0]; 
                    selectedAppEntity.Selected = true;
                    await this.onAppEntityButtonClicked(selectedAppEntity);
                }
            }
        });    
    }

    public async onAppEntityButtonClicked(appEntityButton: ApplicationEntityButton): Promise<void> {
        if(!appEntityButton){
            return;
        }

        this.showLoader = true;
        this.appName = appEntityButton.Name;
        this.selectedAppEntity = appEntityButton.Data;
        this.categoryEntityID = this.selectedAppEntity.EntityID;

        const parentFolderIDFilter: string = this.selectedFolderID ? `ParentFolderID=${this.selectedFolderID}` : 'ParentID IS NULL';
        const categoryFilter: string = `EntityID=${this.selectedAppEntity.EntityID} AND ` + parentFolderIDFilter;
        
        await super.LoadData({skiploadEntityData: true, sortItemsAfterLoad: false, categoryItemFilter: categoryFilter, showLoader: true});
        await this.GetViewsForUser(appEntityButton.Data);
        super.sortItems();
        setTimeout(() => {
            this.showLoader = false;
        }, 250);
    }

    private async GetViewsForUser(entityInfo: ApplicationEntityInfo): Promise<void> {
        if(!entityInfo){
            return;
        }

        const md = new Metadata()
        const entity = md.Entities.find(e => e.Name == entityInfo.Entity)
        if (entity) {
            const entityViews = <UserViewEntity[]>await ViewInfo.GetViewsForUser(entity.ID);
            for(const view of entityViews){
                this.items.push(new Item(view, ItemType.Entity));
            }
        }
    }

    public itemClick(item: Item) {
        console.log("item click");
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
} 

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
