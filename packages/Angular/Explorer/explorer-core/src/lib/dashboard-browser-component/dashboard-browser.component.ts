import { Component, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'
import { BaseNavigationComponent, SharedService } from '@memberjunction/ng-shared';
import { Item, ItemType, NewItemOption } from '../../generic/Item.types';
import { BaseBrowserComponent } from '../base-browser-component/base-browser-component';
import { DashboardCategoryEntityType, DashboardEntity } from '@memberjunction/core-entities';
import { BeforeUpdateItemEvent } from '../../generic/Events.types';
import { RegisterClass } from '@memberjunction/global';
import { LogError, Metadata, RunView } from '@memberjunction/core';
import { ResourceBrowserComponent } from '../resource-browser/resource-browser.component';

@Component({
  selector: 'app-dashboard-browser',
  templateUrl: './dashboard-browser.component.html',
  styleUrls: ['./dashboard-browser.component.css', '../../shared/first-tab-styles.css']
})
@RegisterClass(BaseNavigationComponent, 'Dashboards')
export class DashboardBrowserComponent extends BaseBrowserComponent {

  @ViewChild('resourceBrowserDashboard') resourceBrowser: ResourceBrowserComponent | null = null;

  public upsertDashboardDialogVisible: boolean = false;
  public upsertDashboardName: string = "";
  public upsertDashboardDescription: string = "";
  public selectedDashboard: DashboardEntity | null = null;

  public NewItemOptions: NewItemOption[] = [
    {
        Text: 'New Dashboard',
        Description: 'Create a new Dashboard',
        Icon: 'dashboard',
        Action: () => {
            // Initialize a new dashboard entity for creation
            const md: Metadata = new Metadata();
            this.selectedDashboard = null; // Reset any existing selection
            this.toggleUpsertDashboardDialog(true);
            // Set focus on the name input field when dialog opens
            setTimeout(() => {
                const inputElement = document.querySelector('.dashboard-name-input input') as HTMLInputElement;
                if (inputElement) inputElement.focus();
            }, 100);
        }
    }];

  constructor(private router: Router, private route: ActivatedRoute, private sharedService: SharedService) {
    super();

    this.pageName = "Dashboards";
    this.routeName = "dashboards";
    this.routeNameSingular = "dashboard";
    this.itemEntityName = "Dashboards";
    this.categoryEntityName = "Dashboard Categories";

    const params = this.router.getCurrentNavigation()?.extractedUrl.queryParams;
    super.InitPathAndQueryData(params, this.route);
  }

  async ngOnInit(): Promise<void> {
    super.InitForResource(this.route);
  }

  //this and the onBeforeUpdateItemEvent function could exist in the 
  //BaseBrowserComponent class, but the class would need
  //a reference or dependency on the router
  //which i dont think is needed
  public onItemClick(item: Item) {
    let dataID: string = "";

    console.log(item);
    if(item.Type === ItemType.Resource){
      let dashboard: DashboardEntity = <DashboardEntity>item.Data;
      dataID = dashboard.FirstPrimaryKey.Value;
    }

    super.Navigate(item, this.router, dataID);
  }

  public async navigateToParentFolder(): Promise<void> {
    if (this.selectedFolderID) {
        const rv = new RunView();
        const parentResult = await rv.RunView<DashboardCategoryEntityType>({
            EntityName: "Dashboard Categories",
            ExtraFilter: `ID='${this.selectedFolderID}'`,
        });

        if (parentResult && parentResult.Success && parentResult.Results.length > 0) {

          const parentCategory: DashboardCategoryEntityType = parentResult.Results[0];
          if(!parentCategory.ParentID){
            return;
          }

          this.selectedFolderID = parentCategory.ParentID;
          const route: string[] = [this.routeName, this.selectedFolderID];
          this.router.navigate(route, {queryParams: {viewMode: this.viewMode}});
        }
    }
  }

  public onBeforeUpdateItemEvent(event: BeforeUpdateItemEvent): void {
    event.Cancel = true;

    let item: Item = event.Item;
    let dashboard: DashboardEntity = item.Data;
    this.selectedDashboard = dashboard;
    this.toggleUpsertDashboardDialog(true);
  }

  public toggleUpsertDashboardDialog(visible: boolean): void {
    this.upsertDashboardDialogVisible = visible;
    if(visible){
      if(this.selectedDashboard){
        this.upsertDashboardName = this.selectedDashboard.Name;
        this.upsertDashboardDescription = this.selectedDashboard.Description || "";
      }
      else{
        this.upsertDashboardName = "";
        this.upsertDashboardDescription = "";
      }
    }
  }

  public async createDashboard(): Promise<void> {
    // Validate input
    if (!this.upsertDashboardName || this.upsertDashboardName.trim() === '') {
      this.sharedService.CreateSimpleNotification('Dashboard name is required', 'warning', 2500);
      return;
    }
    
    const md: Metadata = new Metadata();
    const dashboard: DashboardEntity = await md.GetEntityObject<DashboardEntity>("Dashboards");
    
    dashboard.NewRecord();
    dashboard.Name = this.upsertDashboardName;
    dashboard.Description = this.upsertDashboardDescription;
    dashboard.CategoryID = this.selectedFolderID;

    const saveResult = await dashboard.Save();
    if(!saveResult){
      this.sharedService.CreateSimpleNotification(`Failed to create dashboard ${dashboard.Name}`, "error", 2500);
      LogError(`Failed to create dashboard ${dashboard.Name}`, undefined, dashboard.LatestResult);
      this.toggleUpsertDashboardDialog(false);
      return;
    }
    
    // Close the dialog
    this.toggleUpsertDashboardDialog(false);
    
    // Show success notification
    this.sharedService.CreateSimpleNotification(`Dashboard "${dashboard.Name}" created successfully`, "success", 2000);
    
    // Navigate to the new dashboard
    this.router.navigate(['resource', this.routeNameSingular, dashboard.ID]);
  }

  public async updateDashboard(): Promise<void> {
    if(!this.selectedDashboard){
      this.toggleUpsertDashboardDialog(false);
      return;
    }

    this.selectedDashboard.Name = this.upsertDashboardName;
    this.selectedDashboard.Description = this.upsertDashboardDescription;

    const saveResult = await this.selectedDashboard.Save();
    if(saveResult){
      this.sharedService.CreateSimpleNotification(`Successfully updated dashboard ${this.selectedDashboard.Name}`, "info", 2500);
    }
    else {
      this.sharedService.CreateSimpleNotification(`Failed to update dashboard ${this.selectedDashboard.Name}`, "error", 2500);
      LogError(`Failed to update dashboard ${this.selectedDashboard.Name}`, undefined, this.selectedDashboard.LatestResult);
    }

    this.toggleUpsertDashboardDialog(false);

    if(this.resourceBrowser){
      await this.resourceBrowser.Refresh();
    }
  }

  public onUpsertDashboardNameKeyup(value: string): void {
    this.upsertDashboardName = value;
  }

  public onUpsertDashboardDescriptionKeyup(value: string): void {
    this.upsertDashboardDescription = value;
  }
}