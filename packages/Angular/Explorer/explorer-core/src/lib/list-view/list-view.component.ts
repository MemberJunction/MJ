import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'
import { ListEntity } from '@memberjunction/core-entities';
import { BaseBrowserComponent } from '../base-browser-component/base-browser-component';
import { BaseNavigationComponent, EventCodes, ResourceData, SharedService } from '@memberjunction/ng-shared';
import { Item, ItemType, NewItemOption } from '../../generic/Item.types';
import { BeforeAddItemEvent, BeforeDeleteItemEvent, BeforeUpdateItemEvent, DropdownOptionClickEvent } from '../../generic/Events.types';
import { BaseEntity, EntityInfo, LogError, Metadata, RunView, RunViewResult } from '@memberjunction/core';
import { MJEventType, MJGlobal, RegisterClass } from '@memberjunction/global';
import { ResourceBrowserComponent } from '../resource-browser/resource-browser.component';

@Component({
  selector: 'mj-list-view',
  templateUrl: './list-view.component.html',
  styleUrls: ['./list-view.component.css', '../../shared/first-tab-styles.css']
})
@RegisterClass(BaseNavigationComponent, 'Lists')
export class ListViewComponent extends BaseBrowserComponent implements OnInit {

    @ViewChild('resourceBrowserLists') resourceBrowser: ResourceBrowserComponent | null = null;
    
    public showLoader :boolean = false;
    public showCreateLoader: boolean = false;
    public lists: ListEntity[] = [];
    public showCreateDialog: boolean = false;
    public entities: EntityInfo[] = [];
    public sourceEntityNames: string[] = [];
    public entityNames: string[] = [];
    public dropdownItems: Record<'text', string>[] = [{text: "List"}];

    public NewItemOptions: NewItemOption[] = [
        {
            Text: 'New List',
            Description: 'Create a new List',
            Icon: 'folder',
            Action: () => {
                this.toggleCreateDialog(true);
            }
        }];
    

    //create dialog properties
    public listName: string = "";
    public listDescription: string = "";
    public selectedEntity: EntityInfo | null = null;

    constructor (private router: Router, private route: ActivatedRoute, private sharedService: SharedService)
    {
        super();

        this.pageName = "Lists";
        this.routeName = "lists";
        this.routeNameSingular = "list";
        this.itemEntityName = "Lists";
        this.categoryEntityName = "List Categories";

        const params = this.router.getCurrentNavigation()?.extractedUrl.queryParams;
        super.InitPathAndQueryData(params, this.route);
    }

    async ngOnInit(): Promise<void> {
        const md: Metadata = new Metadata();
        this.entities = md.Entities;
        this.sourceEntityNames = this.entities.map(e => e.Name);
        this.sourceEntityNames = this.entityNames = this.sourceEntityNames.sort(function(a, b){
            const aName: string = a.toLowerCase();
            const bName: string = b.toLowerCase();
            if(aName < bName) { return -1; }
            if(aName > bName) { return 1; }
            return 0;
        });

        super.InitForResource(this.route);
    }

    public itemClick(item: Item) {
        let dataID: string = "";
    
        if(item.Type === ItemType.Resource){
            let list: ListEntity = <ListEntity>item.Data;
            dataID = list.FirstPrimaryKey.Value;
        }
    
        ///this.router.navigate(["listdetails", dataID]);
        this.router.navigate(['resource', 'list', dataID]);
    }
    
    public onBeforeUpdateItemEvent(event: BeforeUpdateItemEvent): void {}

    public onBeforeAddItemEvent(event: BeforeAddItemEvent): void {
        event.Cancel = true;
        this.toggleCreateDialog(true);
    }

    public async deleteList(event: BeforeDeleteItemEvent): Promise<void> {
        event.Cancel = true;

        this.showLoader = true;
        const deleteListDetailsResult: boolean = await this.DeleteListDetails(event.Item.Data.FirstPrimaryKey.Value);
        if(!deleteListDetailsResult){
            this.sharedService.CreateSimpleNotification("Unable to delete list", "error", 2500);
            this.showLoader = false;
            return;
        }

        const listEntity: ListEntity = <ListEntity>event.Item.Data;
        const deleteResult: boolean = await listEntity.Delete();
        if(!deleteResult){
            this.sharedService.CreateSimpleNotification("Error deleting list", "error", 2500);
        }
        else{
            this.sharedService.CreateSimpleNotification("List deleted successfully", "success", 2500);
        }

        if(this.resourceBrowser && deleteResult){
            this.resourceBrowser.Refresh();
        }

        this.showLoader = false;
    }

    private async DeleteListDetails(listID: string): Promise<boolean> {
        const rv: RunView = new RunView();
        const rvResult: RunViewResult = await rv.RunView({
            EntityName: 'List Details',
            ExtraFilter: `ListID = '${listID}'`,
            ResultType: 'entity_object'
        });

        if(!rvResult.Success){
            LogError("Error running view to delete list details", undefined, rvResult.ErrorMessage);
            return false;
        }

        let success: boolean = true;
        for(const entity of rvResult.Results){
            const deleteResult: boolean = await entity.Delete();
            if(!deleteResult){
                LogError(`Error deleting list detail record ${entity.ID}`, undefined, entity.LatestResult);
                success = false;
            }
        }

        return success;
    }

    public toggleCreateDialog(show: boolean): void {
        this.showCreateDialog = show;

        if(!show){
            this.listName = "";
            this.listDescription = "";
            this.selectedEntity = null;
        }
    }

    public async createList(): Promise<void> {
        this.showCreateLoader = true;

        if(!this.selectedEntity){
            this.showCreateLoader = false;
            return;
        }

        const md: Metadata = new Metadata();
        let listEntity: ListEntity = await md.GetEntityObject("Lists");
        listEntity.Name = this.listName;
        listEntity.Description = this.listDescription;
        listEntity.EntityID = this.selectedEntity.ID;
        listEntity.UserID = md.CurrentUser.ID;

        const saveResult: boolean = await listEntity.Save();
        this.showCreateLoader = false;

        if(!saveResult){
            this.sharedService.CreateSimpleNotification("Error creating list", "error", 2000);
            return;
        }

        this.sharedService.CreateSimpleNotification("List created successfully", "success", 2000);
        this.router.navigate(["listdetails", listEntity.ID]);

        MJGlobal.Instance.RaiseEvent({
            event: MJEventType.ComponentEvent,
            eventCode: EventCodes.ListCreated,
            args: new ResourceData({ 
                                    ResourceTypeID: this.sharedService.ListResourceType.ID,
                                    ResourceRecordID: listEntity.FirstPrimaryKey.Value
                                  }),
            component: this
          });
    }

    public onFilterChange(value: string): void {
        this.entityNames = this.sourceEntityNames.filter(e => e.toLowerCase().includes(value.toLowerCase()));
    }

    public onSelectionChange(value: string): void {
        this.selectedEntity = this.entities.find(e => e.Name === value) || null;
    }

    public onDropdownOptionClick(option: DropdownOptionClickEvent): void {
        if(option.Text === "Create List"){
            this.toggleCreateDialog(true);
        }
    }
} 

