import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'
import { Item } from '../../generic/Item.types';
import { BaseNavigationComponent, SharedService } from '@memberjunction/ng-shared';
import { BaseBrowserComponent } from '../base-browser-component/base-browser-component';
import { BeforeUpdateItemEvent } from '../../generic/Events.types';
import { QueryEntity } from '@memberjunction/core-entities';
import { LogStatus, Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';

@Component({
  selector: 'mj-query-browser',
  templateUrl: './query-browser.component.html',
  styleUrls: ['./query-browser.component.css', '../../shared/first-tab-styles.css']
})
@RegisterClass(BaseNavigationComponent, 'Queries')
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
    //doing this "manually" rather than calling super.InitForResource 
    //because BaseBrowserComponent's resource filter includes a filter for UserID
    //which doesnt exist on queries
    this.route.paramMap.subscribe(async (params) => {
      this.selectedFolderID = Number(params.get('folderID')) || null;
      const md: Metadata = new Metadata();
        let categoryFilter: string = this.selectedFolderID ? `CategoryID = ${this.selectedFolderID}` : `CategoryID IS NULL`;
        let resourceFilter: string = `${categoryFilter}`;
    
        let resourceCategoryFilter: string = this.selectedFolderID ? `ParentID = ${this.selectedFolderID}` : `ParentID IS NULL`;
        LogStatus("resourceFilter: " + resourceFilter + " category filter: " + resourceCategoryFilter);
        await this.LoadData({
            sortItemsAfterLoad: true, 
            categoryItemFilter: resourceCategoryFilter, 
            entityItemFilter: resourceFilter, 
            showLoader: true
        });
    });
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