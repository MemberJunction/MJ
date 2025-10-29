import { ChangeDetectorRef, Component, Input, OnInit, ViewChild, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'
import { ApplicationEntityInfo, Metadata, LogStatus, LogError, RunView, ApplicationInfo, BaseEntity, UserInfo } from '@memberjunction/core';
import { EntityEntityExtended, ResourceLinkEntity, UserApplicationEntity, UserApplicationEntityEntity, UserFavoriteEntity, UserViewCategoryEntity, UserViewEntityExtended } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';
import { Folder, Item, ItemType, NewItemOption } from '../../generic/Item.types';
import { BaseBrowserComponent } from '../base-browser-component/base-browser-component';
import {Location} from '@angular/common'; 
import { UserViewPropertiesDialogComponent } from '@memberjunction/ng-user-view-properties';
import { BaseEvent, BeforeAddItemEvent, BeforeUpdateItemEvent, DropdownOptionClickEvent, EventTypes } from '../../generic/Events.types';
import { AvailableResourcesComponent } from '@memberjunction/ng-resource-permissions';

@Component({
  selector: 'mj-application-view',
  templateUrl: './application-view.component.html',
  styleUrls: ['./application-view.component.css', '../../shared/first-tab-styles.css']
})
export class ApplicationViewComponent extends BaseBrowserComponent implements OnInit {
    @ViewChild('entityRow') entityRowRef: Element | undefined;
    @ViewChild('userViewDialog') viewPropertiesDialog!: UserViewPropertiesDialogComponent;
    @ViewChild('availableResourcesComponent') availableResourcesComponent!: AvailableResourcesComponent;

    @Input() public categoryEntityID!: string;

    public currentlySelectedAppEntity: EntityEntityExtended | undefined;
    public ResourceItemFilter: string = "";

    public AppEntitySelectionDialogVisible: boolean = false;
    public AllAppEntities: EntityEntityExtended[] = [];
    public SelectedAppEntities: EntityEntityExtended[] = []; 
    public UnselectedAppEntities: EntityEntityExtended[] = [];
    public app: ApplicationInfo | undefined;
    public userApp: UserApplicationEntity | undefined;
    public currentUser!: UserInfo;
    public FilterOutCurrentUserViews!: string;
    
    public NewItemOptions: NewItemOption[] = [
        {
            Text: 'New View',
            Description: 'Create a new User View',
            Icon: 'folder',
            Action: () => {
                this.createNewView();
            }
        },
        {
            Text: 'New Record',
            Description: `Create a new record for the currently selected entity`,
            Icon: 'plus',
            Action: () => {
                this.createNewRecord();
            }
        }
    ];

    public ViewResourceTypeID!: string;

    constructor (private router: Router, private route: ActivatedRoute, private location: Location, private sharedService: SharedService, private cdr: ChangeDetectorRef){
        super();
        this.categoryEntityName = "User View Categories";
        this.itemEntityName = "User Views";
    }

    async ngOnInit(): Promise<void> {
        const md = new Metadata();
        this.currentUser = md.CurrentUser;
        this.ViewResourceTypeID = this.sharedService.ResourceTypeByName('User Views')?.ID || '';

        this.route.paramMap.subscribe(async (params) => {
            const appName = params.get('appName');
            const entityName = params.get('entityName');
            const folderID = params.get('folderID'); 
            this.showLoader = true;

            if (folderID) {
                this.selectedFolderID = folderID;
            }
            
            if (appName && appName !== this.app?.Name) {
                const md = new Metadata();
                const rv = new RunView();

                const appNameToLower: string = appName.toLowerCase();
                this.app = md.Applications.find(a => a.Name.toLowerCase() === appNameToLower);

                // if we get here and we have a blank app, problem
                if (!this.app){
                    throw new Error(`Application ${appName} not found`);
                }

                // next up we need to find the UserApplication record based on the app and the current user
                const userAppResult = await rv.RunView<UserApplicationEntity>({
                    EntityName: "User Applications",
                    ExtraFilter: `UserID='${md.CurrentUser.ID}' AND ApplicationID='${this.app.ID}'`,
                    ResultType: 'entity_object'
                })
                if (!userAppResult || userAppResult.Success === false || userAppResult.Results.length === 0)
                    throw new Error('User Application Record for current user and selected application not found')

                this.userApp = userAppResult.Results[0];

                const matches =  this.app.ApplicationEntities
                                     .map(ae => md.Entities.find(e => e.ID === ae.EntityID))
                                     .filter(e => e) // filter out null entries  
                                     .sort((a, b) => {
                                        if (!a || !b) {
                                            return 0;
                                        }
                                        return a.Name.localeCompare(b.Name);
                                     }); // sort by name

                // store the entire list of POSSIBLE app entities in this list
                this.AllAppEntities = <EntityEntityExtended[]><unknown[]>matches; // we filter out null above so this cast is safe;
            
                const userAppEntities = await rv.RunView<UserApplicationEntityEntity>({
                  EntityName: 'User Application Entities',
                  ResultType: 'entity_object',
                  ExtraFilter: `UserApplicationID = '${this.userApp!.ID}'`,
                  OrderBy: 'Sequence, Entity'
                })
                if (userAppEntities && userAppEntities.Success) {
                    this.SelectedAppEntities = <EntityEntityExtended[]>userAppEntities.Results.map(uae => this.AllAppEntities.find(ae => uae.EntityID === ae.ID)).filter(val => val); // now we have our selected app entities and they're sorted properly
                    this.UnselectedAppEntities = this.AllAppEntities.filter(e => !this.SelectedAppEntities.some(sa => sa.ID === e.ID));

                    // special case - if we have NO user app entities and the application has entities that are marked as DefaultForNewUser=1 we will add them now
                    const defaultEntities = this.app.ApplicationEntities.filter(a => a.DefaultForNewUser);
                    if (this.SelectedAppEntities.length === 0 && defaultEntities.length > 0) {
                        // there are some entities that should default for a new user, so let's add them to the selected entities and remove from the Unselected
                        // app entities and then call the Save method that we use when the user dialog ends
                        this.SelectedAppEntities = <EntityEntityExtended[]>defaultEntities.map(de => this.AllAppEntities.find(aae => de.EntityID === aae.ID)).filter(val => val);
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
                    // sometimes the entity name contains a ? and values after it, look for that and only grab stuff to left of ?
                    const entityNameParts = entityName.split('?');
                    const entityNameToLower: string = entityNameParts[0].toLowerCase().trim();
                    const selectedAppEntity = this.SelectedAppEntities.find(e => e.Name.toLocaleLowerCase() === entityNameToLower);
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


    public IsEntitySelected(entity: EntityEntityExtended) {
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
            ExtraFilter: `UserApplicationID = '${this.userApp!.ID}'`,
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
                if (existing.Sequence !== index) {
                    existing.Sequence = index;
                    userAppEntitiesToSave.push(existing);      
                }
            } 
            else {
              // this is a new app entity that the user has selected
              const newApp = await md.GetEntityObject<UserApplicationEntityEntity>("User Application Entities");
              newApp.UserApplicationID = this.userApp!.ID;
              newApp.Sequence = index;
              newApp.EntityID = e.ID;
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
          for (const toSave of userAppEntitiesToSave) {
            toSave.TransactionGroup = tg;
            await toSave.Save();  
          }
          for (const d of userAppEntitiesToDelete) {
            d.TransactionGroup = tg;
            await d.Delete();   
          }

          if (!await tg.Submit()) {
            // the data doesn't need to be updated when we are succesful because we're all bound to the same data which is cool
            // but in this case we need to notify the user it failed
            this.sharedService.CreateSimpleNotification('There was an error saving your entity selections. Please try again later or notify a system administrator.', "error", 3500);
          }
        }
    }

    public onAppEntityButtonClicked(e: EntityEntityExtended): void {
        if (e.ID === this.currentlySelectedAppEntity?.ID) 
            return;

        this.selectedFolderID = null;
        this.currentlySelectedAppEntity = e;
        this.navigateToCurrentPage();
    }

    protected async loadEntityAndFolders(entity: EntityEntityExtended | undefined): Promise<void> {
        if(!entity) {
            this.currentlySelectedAppEntity = undefined; // make sure our current selection is wiped out here
            return;
        }

        this.showLoader = true;
        this.currentlySelectedAppEntity = entity;
        this.categoryEntityID = entity.ID;
        this.ResourceItemFilter = `EntityID='${entity.ID}'`;

        this.FilterOutCurrentUserViews = `UserID <> '${this.currentUser.ID}' AND EntityID = '${entity.ID}'`;

        if(this.selectedFolderID){
            let viewResult: Folder[] = await super.RunView(this.categoryEntityName, `ID='${this.selectedFolderID}'`);
            if(viewResult.length > 0){
                this.pageTitle = viewResult[0].Name;
            }
        }
        else{
            this.pageTitle = this.currentlySelectedAppEntity.Name;
        }

        const md = new Metadata();
        const parentFolderIDFilter: string = this.selectedFolderID ? `ParentID='${this.selectedFolderID}'` : 'ParentID IS NULL';
        const categoryFilter: string = `UserID='${md.CurrentUser.ID}' AND EntityID='${this.currentlySelectedAppEntity.ID}' AND ` + parentFolderIDFilter;
        
        const categoryIDFilter: string = this.selectedFolderID ? `CategoryID='${this.selectedFolderID}'` : 'CategoryID IS NULL';
        const userViewFilter: string = `UserID = '${md.CurrentUser.ID}' AND EntityID='${this.currentlySelectedAppEntity.ID}' AND ` + categoryIDFilter;

        await super.LoadData({
            sortItemsAfterLoad: true, 
            categoryItemFilter: categoryFilter, 
            entityItemFilter: userViewFilter, 
            linkItemFilter: `EntityID='${this.currentlySelectedAppEntity.ID}'`,
            showLoader: true
        });

        this.showLoader = false;
        this.cdr.detectChanges(); // tell Angular to detect changes as we just change the current entity so that affects some UI elements visualy like which button shows as selected
    }

    public onItemClick(item: Item) {
        if(!item){
            return;
        }

        if(item.Type === ItemType.Resource){
            this.router.navigate(['resource', 'view', item.Data.ID], {queryParams: {viewMode: this.viewMode}});
        }
        else if(item.Type === ItemType.Folder){
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
        if (!this.app) {
            throw new Error('Application Not Loaded');
        }

        //we're capable of loading the data associated with the selected ApplicationEntityInfo object
        //without a page refresh, but we'd need additonal logic to handle routing, e.g. back
        //button in the browser taking you to the last selected entity.
        //so its easier if we instead navigate to this page with an updated url and leverage angular's router
        let folderID: string | null = this.selectedFolderID;
        let url: string[] = ["/app", this.app.Name];
        let appEntityName: string | null = this.currentlySelectedAppEntity?.Name || null;
        if(appEntityName){
            url.push(`${appEntityName}`);
            if(folderID){
                url.push(`${folderID}`);
            }
        }

        this.router.navigate(url, {queryParams: {viewMode: this.viewMode}});
    }

    public onViewModeChange(viewMode: string): void {
        this.viewMode = viewMode;
    }

    public LinkToSharedViewDialogVisible: boolean = false;
    public createItemClickedEvent(event: DropdownOptionClickEvent) {
        switch (event.Text.trim().toLowerCase()) {
            case 'link to shared view':
                this.LinkToSharedViewDialogVisible = true;
                break;
            default:
                LogError('Unknown dropdown option clicked');
                break;
        }
    }
    public async HandleLinkToSharedView(okClicked: Boolean) {
        this.LinkToSharedViewDialogVisible = false;
        if (okClicked) {
            const resources = this.availableResourcesComponent.SelectedResources;
            const md = new Metadata();
            let success = true;
            for (const r of resources) {
                const newResourceLink = await md.GetEntityObject<ResourceLinkEntity>('Resource Links');
                newResourceLink.ResourceRecordID = r.ResourceRecordID;
                newResourceLink.ResourceTypeID = r.ResourceTypeID;
                newResourceLink.UserID = this.currentUser.ID;
                newResourceLink.FolderID = this.selectedFolderID
                if (!await newResourceLink.Save()) {
                    LogError('Error saving new resource link: ' + newResourceLink.LatestResult.CompleteMessage);
                    success = false;
                }
                else {
                    await this.loadEntityAndFolders(this.currentlySelectedAppEntity); // refresh the view
                }
            }
            if (!success) {
                this.sharedService.CreateSimpleNotification('There was an error linking to the shared view(s). Please try again later or notify a system administrator.', 'error', 3500);
            }
        }
    } 


    public createNewView() {
        if(this.viewPropertiesDialog && this.currentlySelectedAppEntity){
            this.viewPropertiesDialog.CategoryID = this.selectedFolderID; // pass along a folder if we have one, if null, that's fine it saves to "root" which is the null CategoryID
            this.viewPropertiesDialog.CreateView(this.currentlySelectedAppEntity.Name);  
        }
        else{
            LogError("View Properties Dialog not found");
        }
    }
    
    public async editView(event: BeforeUpdateItemEvent): Promise<void> {
        event.Cancel = true;
        if(this.viewPropertiesDialog){
            let data: UserViewEntityExtended = event.Item.Data;
            this.viewPropertiesDialog.Open(data.ID);
        }
        else{
            LogError("View Properties Dialog not found");
        }
    }

    public async OnViewPropertiesDialogClose(args: {Saved?: boolean, ViewEntity?: UserViewEntityExtended, Cancel?: boolean, bNewRecord?: boolean}): Promise<void> {
        //user view properties dialog handles navigating to the newly created views
        //so we only need to worry about saves to existing views
        if(args && args.Saved && this.currentlySelectedAppEntity){
            args.Cancel = true;
            await this.loadEntityAndFolders(this.currentlySelectedAppEntity);
        }
    }

    public async navigateToParentFolder() {
        if (this.selectedFolderID) {
            const rv = new RunView();
            const parentResult = await rv.RunView({
                EntityName: "User View Categories",
                ExtraFilter: `ID='${this.selectedFolderID}'`,
            })
            if (parentResult && parentResult.Success && parentResult.Results.length > 0) {
                this.selectedFolderID = parentResult.Results[0].ParentID;
                this.navigateToCurrentPage();
            }
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

    public createNewRecord(): void {
        if(!this.currentlySelectedAppEntity){
            LogError("Unable to create new record: No Entity selected");
            return;
        }

        const md: Metadata = new Metadata();
        const entityInfo = md.EntityByName(this.currentlySelectedAppEntity.Name);
        if (!entityInfo.AllowCreateAPI) {
            LogError(`Unable to create new record: ${entityInfo.Name} does not allow creation`);
            return;
        }

        const permissions = entityInfo.GetUserPermisions(md.CurrentUser);
        if(!permissions.CanCreate){
            LogError(`Unable to create new record: Current User ${md.CurrentUser.Name} does not have permission to create records for ${entityInfo.Name}`);
            return;
        }

        // route to a resource/record with a blank string for the 3rd segment which is normally the pkey value
        // here we don't provide the pkey value so the record component will know to create a new record
        this.router.navigate(
            ['resource', 'record',''/*add this 3rd param that's blank so the route validates*/], 
            { queryParams: 
              { 
                Entity: entityInfo.Name,
                NewRecordValues: null
              } 
            }
          );
    }
} 
 