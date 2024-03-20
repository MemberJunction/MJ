import { Component } from '@angular/core';
import { Router } from '@angular/router'
import { QueryEntity } from '@memberjunction/core-entities';
import { Item } from '../../generic/Item.types';
import { PathData } from '../../generic/PathData.types';
import { SharedService } from '@memberjunction/ng-shared';
import { BaseEvent } from '../../generic/Events.types';
import { BaseBrowserComponent } from '../base-browser-component/base-browser-component';

@Component({
  selector: 'app-query-browser',
  templateUrl: './query-browser.component.html',
  styleUrls: ['./query-browser.component.css', '../../shared/first-tab-styles.css']
})
export class QueryBrowserComponent extends BaseBrowserComponent {

  constructor(private router: Router, private sharedService: SharedService) {
    super();

    this.pageName = "Queries";
    this.routeName = "queries";
    this.routeNameSingular = "query";
    this.itemEntityName = "Queries";
    this.categoryEntityName = "Query Categories";

    const params = this.router.getCurrentNavigation()?.extractedUrl.queryParams
    this.InitPathData(params);
  }

  ngOnInit(): void {

    let entityFilter: string = "ID > 0";
    this.LoadData(entityFilter, undefined);
  }

  public itemClick(item: Item) {
    let dataID: string = "";

    if(item.Type === "Entity"){
      let dashboard: QueryEntity = item.Data as QueryEntity;
      dataID = dashboard.ID.toString();
    }

    super.Navigate(item, this.router, dataID);
  }

  public onBackButtonClick(): void {
    const pathData: PathData | null = this.PathData.ParentPathData;
    if(pathData && pathData.ID > 0){
      this.PathData = pathData;
      //navigation seems like it does nothing but update the URL
      //so just reload all of the data
      this.router.navigate(['reports'], {queryParams: {folderID: pathData.ID}});
      this.selectedFolderID = pathData.ID;
      this.LoadData();
      
    }
    else if(this.parentFolderID || !this.parentFolderID && this.selectedFolderID){
      this.router.navigate(['reports'], {queryParams: {folderID: this.parentFolderID}});
      this.selectedFolderID = this.parentFolderID;
      this.parentFolderID = null;
      this.LoadData();
    }
    else{
      //no parent path, so just go home
      this.router.navigate(['']);
    }
  }

  public onEvent(event: BaseEvent): void {
    super.onEvent(event);
  }
}
