import { Component } from '@angular/core';
import { Router } from '@angular/router'
import { SharedService } from '@memberjunction/ng-shared';
import { Item } from '../../generic/Item.types';
import { PathData } from '../../generic/PathData.types';
import { BaseBrowserComponent } from '../base-browser-component/base-browser-component';
import { DashboardEntity } from '@memberjunction/core-entities';
import { BaseEvent } from '../../generic/Events.types';

@Component({
  selector: 'app-dashboard-browser',
  templateUrl: './dashboard-browser.component.html',
  styleUrls: ['./dashboard-browser.component.css', '../../shared/first-tab-styles.css']
})

export class DashboardBrowserComponent extends BaseBrowserComponent{

  constructor(private router: Router, private sharedService: SharedService) {
    super();

    this.pageName = "Dashboards";
    this.routeName = "dashboards";
    this.routeNameSingular = "dashboard";
    this.itemEntityName = "Dashboards";
    this.categoryEntityName = "Dashboard Categories";

    const params = this.router.getCurrentNavigation()?.extractedUrl.queryParams
    this.InitPathData(params);
  }

  async ngOnInit(): Promise<void> {
    const categoryEntityFilter: string = "ParentID IS NULL";
    await super.LoadData({categoryItemFilter: categoryEntityFilter});
  }

  public itemClick(item: Item) {
    let dataID: string = "";

    if(item.Type === "Entity"){
      let dashboard: DashboardEntity = item.Data as DashboardEntity;
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
      this.router.navigate(['dashboards'], {queryParams: {folderID: pathData.ID}});
      this.selectedFolderID = pathData.ID;
      this.LoadData();
      
    }
    else if(this.parentFolderID || !this.parentFolderID && this.selectedFolderID){
      this.router.navigate(['dashboards'], {queryParams: {folderID: this.parentFolderID}});
      this.selectedFolderID = this.parentFolderID;
      this.parentFolderID = null;
      this.LoadData();
    }
    else{
      //no parent path, so just go home
      this.router.navigate(['']);
    }
    this.showLoader = false;
  }

  public onEvent(event: BaseEvent): void {
    super.onEvent(event);    
  }
}
