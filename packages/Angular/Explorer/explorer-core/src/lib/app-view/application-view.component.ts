import { ChangeDetectorRef, Component, Input, OnInit, ViewChild, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'
import { ApplicationEntityInfo, Metadata, LogStatus, LogError, RunView, ApplicationInfo, BaseEntity } from '@memberjunction/core';
import { EntityEntity, UserApplicationEntity, UserApplicationEntityEntity, UserFavoriteEntity, UserViewEntity, UserViewEntityExtended } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';
import { Folder, Item, ItemType } from '../../generic/Item.types';
import { BaseBrowserComponent } from '../base-browser-component/base-browser-component';
import {Location} from '@angular/common'; 
import { UserViewPropertiesDialogComponent } from '@memberjunction/ng-user-view-properties';
import { BeforeAddItemEvent, BeforeUpdateItemEvent } from '../../generic/Events.types';

@Component({
  selector: 'mj-application-view',
  templateUrl: './application-view.component.html',
  styleUrls: ['./application-view.component.css', '../../shared/first-tab-styles.css']
})
export class ApplicationViewComponent extends BaseBrowserComponent implements OnInit {
    @ViewChild('entityRow') entityRowRef: Element | undefined;
    @ViewChild('userViewDialog') viewPropertiesDialog!: UserViewPropertiesDialogComponent;

    @Input() public categoryEntityID!: string;

    public currentlySelectedAppEntity: EntityEntity | undefined;

    public AppEntitySelectionDialogVisible: boolean = false;
    public AllAppEntities: EntityEntity[] = [];
    public SelectedAppEntities: EntityEntity[] = []; 
    public UnselectedAppEntities: EntityEntity[] = [];
    public app: ApplicationInfo | undefined;
    public userApp: UserApplicationEntity | undefined;

    constructor (private router: Router, private route: ActivatedRoute, private location: Location, private sharedService: SharedService, private cdr: ChangeDetectorRef){
        super();
        this.categoryEntityName = "User View Categories";
        this.itemEntityName = "User Views";
    }

    async ngOnInit(): Promise<void> {
        this.route.paramMap.subscribe(async (params) => {
            const appName = params.get('appName');
            const entityName = params.get('entityName');
            const folderID = params.get('folderID'); 
            this.showLoader = true;

            if(folderID){
                this.selectedFolderID = parseInt(folderID) || null;
            }
            
            if (appName && appName !== this.app?.Name) {
                const md = new Metadata();
                const rv = new RunView();

                this.app = md.Applications.find(a => a.Name === appName);

                // if we get here and we have a blank app, problem
                if (!this.app)
                    throw new Error(`Application ${appName} not found`);

                // next up we need to find the UserApplication record based on the app and the current user
                const userAppResult = await rv.RunView<UserApplicationEntity>({
                    EntityName: "User Applications",
                    ExtraFilter: `UserID=${md.CurrentUser.ID} AND ApplicationID=${this.app.ID}`,
                    ResultType: 'entity_object'
                })
                if (!userAppResult || userAppResult.Success === false || userAppResult.Results.length === 0)
                    throw new Error('User Application Record for current user and selected application not found')

                this.userApp = userAppResult.Results[0];

                const matches =  this.app.ApplicationEntities.map(ae => md.Entities.find(e => e.ID === ae.EntityID)).filter(e => e); // filter out null entries
                // store the entire list of POSSIBLE app entities in this list
                this.AllAppEntities = <EntityEntity[]><unknown[]>matches; // we filter out null above so this cast is safe;
            
                const userAppEntities = await rv.RunView<UserApplicationEntityEntity>({
                  EntityName: 'User Application Entities',
                  ResultType: 'entity_object',
                  ExtraFilter: `UserApplicationID = ${this.userApp!.ID}`,
                  OrderBy: 'Sequence'
                })
                if (userAppEntities && userAppEntities.Success) {
                    this.SelectedAppEntities = this.AllAppEntities.filter(e => userAppEntities.Results.some(uae => uae.EntityID === e.ID));
                    this.SelectedAppEntities = this.sortAppEntites(this.SelectedAppEntities);
                    
                    this.UnselectedAppEntities = this.AllAppEntities.filter(e => !this.SelectedAppEntities.some(sa => sa.ID === e.ID));

                    // special case - if we have NO user app entities and the application has entities that are marked as DefaultForNewUser=1 we will add them now
                    const defaultEntities = this.app.ApplicationEntities.filter(a => a.DefaultForNewUser);
                    if (this.SelectedAppEntities.length === 0 && defaultEntities.length > 0) {
                        // there are some entities that should default for a new user, so let's add them to the selected entities and remove from the Unselected
                        // app entities and then call the Save method that we use when the user dialog ends
                        this.SelectedAppEntities = <EntityEntity[]>defaultEntities.map(de => this.AllAppEntities.find(aae => de.EntityID === aae.ID)).filter(val => val);
                        // now we have the default entities in place for the app, remove them from the Unselected array
                        this.UnselectedAppEntities = this.UnselectedAppEntities.filter(e => !this.SelectedAppEntities.some(se => se.ID === e.ID));
                        // now save
                        await this.OnAppEntitySelectionDialogClosed(true);
                    }
                }
            }

            // now down here we have either loaded the app above, or already had the current app loaded. Now we move on to set the current entity and load er up
            if ( this.app && this.SelectedAppEntities.length ){
                if ( entityName ) {
                    const entityNameToLower: string = entityName.toLowerCase();
                    const selectedAppEntity = this.SelectedAppEntities.find(e => e.Name.toLocaleLowerCase() == entityNameToLower);
                    if ( selectedAppEntity ) {
                        await this.loadEntityAndFolders(selectedAppEntity);
                    }
                    else
                        await this.loadEntityAndFolders(this.SelectedAppEntities[0]);    
                }
                else {
                    await this.loadEntityAndFolders(this.SelectedAppEntities[0]);    
                }
            }
            this.showLoader = false;
        });    
    }


    public IsEntitySelected(entity: EntityEntity) {
        if (this.currentlySelectedAppEntity?.ID === entity.ID)
            return true;
        else
            return false;
    }
    public ShowAppEntitySelectionDialog() {
        this.AppEntitySelectionDialogVisible = true;
    }


    public async OnAppEntitySelectionDialogClosed(save: boolean) {
        this.AppEntitySelectionDialogVisible = false;
        // now we need to process the changes if the user hit save
        if (save) {
          // we need to basically make sure the User Application Entities entity for this user maps to the set of selected Entities within the application, in the order selected as well
          const rv = new RunView();
          const md = new Metadata();
          const userAppEntities = await rv.RunView<UserApplicationEntityEntity>({
            EntityName: 'User Application Entities',
            ResultType: 'entity_object',
            ExtraFilter: `UserApplicationID = ${this.userApp!.ID}`,
            OrderBy: 'Sequence'
          })

          // userAppEntities.results is the current DB state, we need to now compare it to the SelectedAppEntities array
          // and if there are changes either update sequence values or delete records that aren't selected anymore.  
          const existingUserAppEntities = userAppEntities.Results;
          const userAppEntitiesToSave: UserApplicationEntityEntity[] = [];
          const userAppEntitiesToDelete: UserApplicationEntityEntity[] = [];
          // first we need to update the sequence values for the selected applications
          for (let index = 0; index < this.SelectedAppEntities.length; index++) {
            const e = this.SelectedAppEntities[index];
            const existing = existingUserAppEntities.find(uae => uae.EntityID === e.ID);
            if (existing) {
              existing.Sequence = index;
              userAppEntitiesToSave.push(existing);
            } 
            else {
              // this is a new app entity that the user has selected
              const newApp = await md.GetEntityObject<UserApplicationEntityEntity>("User Application Entities");
              newApp.UserApplicationID = this.userApp!.ID;
              newApp.EntityID = e.ID;
              newApp.Sequence = index;
              userAppEntitiesToSave.push(newApp);
            }
          }
          // now we need to add the records that aren't selected anymore to a delete array
          for (let index = 0; index < existingUserAppEntities.length; index++) {
            const existing = existingUserAppEntities[index];
            if (!this.SelectedAppEntities.some(sa => sa.ID === existing.EntityID)) {
              userAppEntitiesToDelete.push(existing);
            }
          }
          // finally, we need to submit a single transaction so we have one server round trip to commit all this good stuff
          const tg = await md.CreateTransactionGroup();
          userAppEntitiesToSave.forEach(toSave => {
            toSave.TransactionGroup = tg;
            toSave.Save(); // no await since we are in a transaction group
          })
          userAppEntitiesToDelete.forEach(d => {
            d.TransactionGroup = tg;
            d.Delete(); // no await 
          })

          if (!await tg.Submit()) {
            // the data doesn't need to be updated when we are succesful because we're all bound to the same data which is cool
            // but in this case we need to notify the user it failed
            this.sharedService.CreateSimpleNotification('There was an error saving your entity selections. Please try again later or notify a system administrator.', "error", 3500);
          }
        }
    }

    public onAppEntityButtonClicked(e: EntityEntity): void {
        if (e.ID === this.currentlySelectedAppEntity?.ID) 
            return;

        this.selectedFolderID = null;
        this.currentlySelectedAppEntity = e;
        this.navigateToCurrentPage();
    }

    protected async loadEntityAndFolders(entity: EntityEntity | undefined): Promise<void> {
        if(!entity) {
            this.currentlySelectedAppEntity = undefined; // make sure our current selection is wiped out here
            return;
        }

        this.showLoader = true;
        this.currentlySelectedAppEntity = entity;
        
        if(this.selectedFolderID){
            let viewResult: Folder[] = await super.RunView(this.categoryEntityName, `ID=${this.selectedFolderID}`);
            if(viewResult.length > 0){
                this.pageTitle = viewResult[0].Name;
            }
        }
        else{
            this.pageTitle = this.currentlySelectedAppEntity.Name;
        }

        const md = new Metadata();
        const parentFolderIDFilter: string = this.selectedFolderID ? `ParentID=${this.selectedFolderID}` : 'ParentID IS NULL';
        const categoryFilter: string = `UserID=${md.CurrentUser.ID} AND EntityID=${this.currentlySelectedAppEntity.ID} AND ` + parentFolderIDFilter;
        
        const categoryIDFilter: string = this.selectedFolderID ? `CategoryID=${this.selectedFolderID}` : 'CategoryID IS NULL';
        const userViewFilter: string = `UserID = ${md.CurrentUser.ID} AND EntityID = ${this.currentlySelectedAppEntity.ID} AND ` + categoryIDFilter;

        await super.LoadData({
            sortItemsAfterLoad: true, 
            categoryItemFilter: categoryFilter, 
            entityItemFilter: userViewFilter, 
            showLoader: true
        });

        this.showLoader = false;
        this.cdr.detectChanges(); // tell Angular to detect changes as we just change the current entity so that affects some UI elements visualy like which button shows as selected
    }

    public onItemClick(item: Item) {
        if(!item){
            return;
        }

        if(item.Type == ItemType.Entity){
            this.router.navigate(['resource', 'view', item.Data.ID], {queryParams: {viewMode: this.viewMode}});
        }
        else if(item.Type == ItemType.Folder){
            this.selectedFolderID = item.Data.ID;
            this.navigateToCurrentPage();
        }
    }

    entityItemClick(info: ApplicationEntityInfo) {
        if (info) {
            const paramsArray = ['entity', info.Entity];
            this.router.navigate(paramsArray, {queryParams: {viewMode: this.viewMode}})
        }
    }

    favoriteItemClick(fav: UserFavoriteEntity) {
        if (fav) {
            if (fav.Entity === 'User Views') {
                // opening a view, different route
                this.router.navigate(['resource', 'view', fav.RecordID], {queryParams: {viewMode: this.viewMode}});
            }
            else {
                this.router.navigate(['resource', 'record', fav.RecordID], { queryParams: { Entity: fav.Entity, viewMode: this.viewMode } })
            }
        }
    }

    private navigateToCurrentPage(): void{
        if (!this.app) 
            throw new Error('Application Not Loaded')

        //we're capable of loading the data associated with the selected ApplicationEntityInfo object
        //without a page refresh, but we'd need additonal logic to handle routing, e.g. back
        //button in the browser taking you to the last selected entity.
        //so its easier if we instead navigate to this page with an updated url and leverage angular's router
        let folderID: string | null = this.selectedFolderID ? this.selectedFolderID.toString() : null;
        let url: string[] = ["/app", this.app.Name];
        let appEntityName: string | null = this.currentlySelectedAppEntity ? this.currentlySelectedAppEntity.Name : null;
        if(appEntityName){
            url.push(`${appEntityName}`);
            if(folderID){
                url.push(`${folderID}`);
            }
        }

        this.router.navigate(url, {queryParams: {viewMode: this.viewMode}});
    }

    private isOverflown(element: any) {
        let e: any = element.nativeElement;
        return e.scrollHeight > e.clientHeight || e.scrollWidth > e.clientWidth;
    }

    public onViewModeChange(viewMode: string): void {
        this.viewMode = viewMode;
    }

    createNewView(event: BeforeAddItemEvent) {
        event.Cancel = true;
        if(this.viewPropertiesDialog && this.currentlySelectedAppEntity){
            console.log("Creating new view ", this.currentlySelectedAppEntity?.Name);
            this.viewPropertiesDialog.CreateView(this.currentlySelectedAppEntity.Name);
        }
        else{
            LogError("View Properties Dialog not found");
        }
    }
    
    public async editView(event: BeforeUpdateItemEvent): Promise<void> {
        event.Cancel = true;
        if(this.viewPropertiesDialog){
            let data: UserViewEntity = event.Item.Data;
            this.viewPropertiesDialog.Open(data.ID);
        }
        else{
            LogError("View Properties Dialog not found");
        }
    }

    public async OnViewPropertiesDialogClose(args: {Saved?: boolean, ViewEntity?: UserViewEntityExtended, Cancel?: boolean, bNewRecord?: boolean}): Promise<void> {
        if(args && args.bNewRecord){
            //the component will handle redirecting to the view
            //dont need to do anything here
            return;
        }
        
        if(args && args.Saved && this.currentlySelectedAppEntity){
            args.Cancel = true;

            await this.loadEntityAndFolders(this.currentlySelectedAppEntity);
        }
    }

    async GoToApps(event: Event) {
        event.preventDefault();
        this.router.navigate(['data']);
    }

    async GoHome(event: Event) {
        event.preventDefault();
        // tell the router to go to /home
        this.router.navigate(['home']);
    }

    sortAppEntites(entities: EntityEntity[]): EntityEntity[] {
        entities.sort(function(a, b){
            const aName: string = a.Name.toLowerCase();
            const bName: string = b.Name.toLowerCase();
            if(aName < bName) { return -1; }
            if(aName > bName) { return 1; }
            return 0;
        });

        return entities;
    }
} 
 