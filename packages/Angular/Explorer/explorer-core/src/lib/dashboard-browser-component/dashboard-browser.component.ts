import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'
import { BaseNavigationComponent, SharedService } from '@memberjunction/ng-shared';
import { Item } from '../../generic/Item.types';
import { BaseBrowserComponent } from '../base-browser-component/base-browser-component';
import { DashboardEntity } from '@memberjunction/core-entities';
import { BeforeUpdateItemEvent } from '../../generic/Events.types';
import { RegisterClass } from '@memberjunction/global';

@Component({
  selector: 'app-dashboard-browser',
  templateUrl: './dashboard-browser.component.html',
  styleUrls: ['./dashboard-browser.component.css', '../../shared/first-tab-styles.css']
})
@RegisterClass(BaseNavigationComponent, 'Dashboards')
export class DashboardBrowserComponent extends BaseBrowserComponent {
  public extraDropdownOptions:  {text: string}[] = [
    {text: 'Dashboard'},
    {text: 'View'}
  ];

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
  public itemClick(item: Item) {
    let dataID: string = "";

    if(item.Type === "Entity"){
      let dashboard: DashboardEntity = item.Data as DashboardEntity;
      dataID = dashboard.ID.toString();
    }

    super.Navigate(item, this.router, dataID);
  }

  public onBeforeUpdateItemEvent(event: BeforeUpdateItemEvent): void {
    event.Cancel = true;

    let item: Item = event.Item;
    let dashboard: DashboardEntity = item.Data;

    this.router.navigate(['resource', this.routeNameSingular, dashboard.ID], {queryParams: {edit: true}});
  }
}