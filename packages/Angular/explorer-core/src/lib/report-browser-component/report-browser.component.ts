import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'
import { ReportEntity } from '@memberjunction/core-entities';
import { BaseBrowserComponent } from '../base-browser-component/base-browser-component';
import { SharedService } from '@memberjunction/ng-shared';
import { Item } from '../../generic/Item.types';
import { BeforeUpdateItemEvent } from '../../generic/Events.types';

@Component({
  selector: 'mj-report-browser',
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
    super.InitForResource(this.route);
  }

   //this could exist in the BaseBrowserComponent class, but 
  //the class would need a reference or dependency on the router
  //which i dont think is needed
  public itemClick(item: Item) {
    let dataID: string = "";

    if(item.Type === "Entity"){
      let report: ReportEntity = item.Data as ReportEntity;
      dataID = report.ID.toString();
    }

    super.Navigate(item, this.router, dataID);
  }

  public onBeforeUpdateItemEvent(event: BeforeUpdateItemEvent): void {
    event.Cancel = true;

    let item: Item = event.Item;
    let report: ReportEntity = item.Data;

    this.router.navigate(['resource', this.routeNameSingular, report.ID], {queryParams: {edit: true}});
  }
}