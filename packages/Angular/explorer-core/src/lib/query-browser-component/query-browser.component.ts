import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'
import { Item } from '../../generic/Item.types';
import { SharedService } from '@memberjunction/ng-shared';
import { BaseBrowserComponent } from '../base-browser-component/base-browser-component';
import { BeforeUpdateItemEvent } from '../../generic/Events.types';
import { QueryEntity } from '@memberjunction/core-entities';

@Component({
  selector: 'mj-query-browser',
  templateUrl: './query-browser.component.html',
  styleUrls: ['./query-browser.component.css', '../../shared/first-tab-styles.css']
})
export class QueryBrowserComponent extends BaseBrowserComponent {

  constructor(private router: Router, private route: ActivatedRoute, private sharedService: SharedService) {
    super();

    this.pageName = "Queries";
    this.routeName = "queries";
    this.routeNameSingular = "query";
    this.itemEntityName = "Queries";
    this.categoryEntityName = "Query Categories";

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
      let query: QueryEntity = item.Data as QueryEntity;
      dataID = query.ID.toString();
    }

    super.Navigate(item, this.router, dataID);
  }

  public onBeforeUpdateItemEvent(event: BeforeUpdateItemEvent): void {
    event.Cancel = true;

    let item: Item = event.Item;
    let query: QueryEntity = item.Data;

    this.router.navigate(['resource', this.routeNameSingular, query.ID], {queryParams: {edit: true}});
  }
}