import { Component } from '@angular/core';
import { Router } from '@angular/router'
import { Metadata, RunView } from '@memberjunction/core';
import { DashboardEntity } from '@memberjunction/core-entities';
import { DashboardConfigDetails } from '../single-dashboard/single-dashboard.component';
import { SharedService } from '../../shared/shared.service';

@Component({
  selector: 'app-dashboard-browser',
  templateUrl: './dashboard-browser.component.html',
  styleUrls: ['./dashboard-browser.component.css', '../../shared/first-tab-styles.css']
})
export class DashboardBrowserComponent {
  public dashboards: DashboardEntity[] = [];
  public showLoader: boolean = false;

  constructor(private router: Router, private sharedService: SharedService) {}

  ngOnInit(): void {
    this.LoadData();
  }
  async LoadData() {
    this.showLoader = true;

    const md = new Metadata()
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'Dashboards',
      ExtraFilter: `UserID=${md.CurrentUser.ID}`
    })
    if (result && result.Success){
      this.dashboards = result.Results;
    }
    else{
      this.dashboards = [];
    }

    this.showLoader = false;
  }
  public itemClick(item: DashboardEntity) {
    if (item) {
      this.router.navigate(['resource', 'dashboard', item.ID])
    }
  }

  public async addNew(): Promise<void> {
    this.showLoader = true;
    const metadata: Metadata = new Metadata();
    let dashboardEntity = <DashboardEntity>await metadata.GetEntityObject('Dashboards');
    dashboardEntity.NewRecord();
    dashboardEntity.UserID = metadata.CurrentUser.ID;

    let dashboardCount: number = this.dashboards.length; 
    let nameSuffix: string = dashboardCount > 0 ? `${dashboardCount + 1}` : "";
    dashboardEntity.Name = "New Dashboard " + nameSuffix;

    let defaultConfigDetails: DashboardConfigDetails = new DashboardConfigDetails();
    const config = {
      columns: defaultConfigDetails.columns,
      rowHeight: defaultConfigDetails.rowHeight,
      resizable: defaultConfigDetails.resizable,
      reorderable: defaultConfigDetails.reorderable,
      items: []
    }
    const configJSON = JSON.stringify(config);
    dashboardEntity.UIConfigDetails = configJSON;

    const result = await dashboardEntity.Save();
    if(result){
      this.dashboards.push(dashboardEntity);
    }
    else{
      this.sharedService.CreateSimpleNotification("Error creating new dashboard entity", "error");
    }
    this.showLoader = false;
  }

  public async deleteItem(item: DashboardEntity): Promise<void> {
    this.showLoader = true;
    if (item && item.ID && item.ID > 0) {
      const md = new Metadata();
      let dashboardEntity = <DashboardEntity>await md.GetEntityObject('Dashboards');
      let loadResult = await dashboardEntity.Load(item.ID);

      if(loadResult){
        let deleteResult = await dashboardEntity.Delete();
        if(deleteResult){
          //todo - change these to use the shared
          this.sharedService.CreateSimpleNotification(`successfully deleted dashboard record ${item.ID}`, "info");
          this.dashboards = this.dashboards.filter(i => i.ID != item.ID);
        }
        else{
          this.sharedService.CreateSimpleNotification(`Unable to delete dashboard record ${item.ID}`, "error");
        }
      }
      else{
        this.sharedService.CreateSimpleNotification(`unable to fetch dashboard record ${item.ID}`, "error");
      }
    }
    this.showLoader = false;
  }
}
