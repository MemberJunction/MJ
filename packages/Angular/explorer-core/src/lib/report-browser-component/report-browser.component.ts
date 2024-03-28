import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'
import { ReportEntity } from '@memberjunction/core-entities';
import { BaseBrowserComponent } from '../base-browser-component/base-browser-component';
import { SharedService } from '@memberjunction/ng-shared';
import { Item } from '../../generic/Item.types';
import { BaseEntity } from '@memberjunction/core';

@Component({
  selector: 'app-report-browser',
  templateUrl: './report-browser.component.html',
  styleUrls: ['./report-browser.component.css', '../../shared/first-tab-styles.css']
})
export class ReportBrowserComponent extends BaseBrowserComponent{
  public reports: ReportEntity[] = [];
  public showLoader: boolean = false;

  constructor(private router: Router, private route: ActivatedRoute, private sharedService: SharedService) {
    super();

    this.pageName = "Reports";
    this.routeName = "reports";
    this.routeNameSingular = "report";
    this.itemEntityName = "Reports";
    this.categoryEntityName = "Report Categories";

    const params = this.router.getCurrentNavigation()?.extractedUrl.queryParams;
    super.InitPathAndQueryData(params, this.route);
  }

  async ngOnInit(): Promise<void> {
    const categoryEntityFilter: string = "ParentID IS NULL";
    await super.LoadData({categoryItemFilter: categoryEntityFilter});
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