import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'
import { SharedService } from '@memberjunction/ng-shared';
import { Item } from '../../generic/Item.types';
import { BaseBrowserComponent } from '../base-browser-component/base-browser-component';
import { BaseEntity } from '@memberjunction/core';

@Component({
  selector: 'app-dashboard-browser',
  templateUrl: './dashboard-browser.component.html',
  styleUrls: ['./dashboard-browser.component.css', '../../shared/first-tab-styles.css']
})

export class DashboardBrowserComponent extends BaseBrowserComponent{

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

  //this could exist in the BaseBrowserComponent class, but 
  //the class would need a reference or dependency on the router
  //which i dont think is needed
  public itemClick(item: Item) {
    let dataID: string = "";

    if(item.Type === "Entity"){
      let dashboard: BaseEntity = item.Data as BaseEntity;
      dataID = dashboard.Get("ID").toString();
    }

    super.Navigate(item, this.router, dataID);
  }
}