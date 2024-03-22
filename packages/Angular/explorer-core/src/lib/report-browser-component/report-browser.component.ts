import { Component } from '@angular/core';
import { Router } from '@angular/router'
import { ReportEntity } from '@memberjunction/core-entities';
import { BaseBrowserComponent } from '../base-browser-component/base-browser-component';
import { SharedService } from '@memberjunction/ng-shared';
import { PathData } from '../../generic/PathData.types';
import { BaseEvent } from '../../generic/Events.types';

@Component({
  selector: 'app-report-browser',
  templateUrl: './report-browser.component.html',
  styleUrls: ['./report-browser.component.css', '../../shared/first-tab-styles.css']
})
export class ReportBrowserComponent extends BaseBrowserComponent{
  public reports: ReportEntity[] = [];
  public showLoader: boolean = false;

  constructor(private router: Router, private sharedService: SharedService) {
    super();

    this.pageName = "Reports";
    this.routeName = "reports";
    this.routeNameSingular = "report";
    this.itemEntityName = "Reports";
    this.categoryEntityName = "Report Categories";

    const params = this.router.getCurrentNavigation()?.extractedUrl.queryParams
    this.InitPathData(params);
  }

  async ngOnInit(): Promise<void> {
    const categoryEntityFilter: string = "ParentID IS NULL";
    await super.LoadData({categoryItemFilter: categoryEntityFilter});
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
    this.showLoader = false;
  }

  public itemClick(item: ReportEntity) {
    if (item) {
      this.router.navigate(['resource', 'report', item.ID])
    }
  }

  public onEvent(event: BaseEvent): void {
    super.onEvent(event);    
  }
}
