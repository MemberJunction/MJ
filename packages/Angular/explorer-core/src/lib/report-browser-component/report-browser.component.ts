import { Component } from '@angular/core';
import { Router, Params  } from '@angular/router';
import { ReportEntity } from '@memberjunction/core-entities';
import { PathData } from '../../generic/PathData.types';
import { SharedService } from '@memberjunction/ng-shared';
import { BaseBrowserComponent } from '../base-browser-component/base-browser-component';

@Component({
  selector: 'app-report-browser',
  templateUrl: './report-browser.component.html',
  styleUrls: ['./report-browser.component.css', '../../shared/first-tab-styles.css']
})
export class ReportBrowserComponent extends BaseBrowserComponent {


  constructor(private router: Router, private sharedService: SharedService) {
    super();

    this.PathData = new PathData(0, "Reports", "/reports");
    let queryParams: Params | undefined = this.router.getCurrentNavigation()?.extractedUrl.queryParams;
    if(queryParams && queryParams.folderID){
      let folderID: number = Number(queryParams.folderID);
      this.PathData = new PathData(folderID, "Reports", "/reports?folderID=" + folderID);
      this.selectedFolderID = folderID;
    }
    else{
      this.PathData = new PathData(-1, "Reports", "/reports");
    }
  }

  async ngOnInit(): Promise<void> {
    await this.GetData();
  }

  async GetData(): Promise<void> {
    this.showLoader = true;
    super.LoadData("Reports", "Report Categories");
    this.showLoader = false;
  }
  
  /*
  async LoadData() {
    this.showLoader = true;

    const md = new Metadata()
    const rv = new RunView();
    
    let folderFilter: string = this.selectedFolderID ? `AND CategoryID = ${this.selectedFolderID}` : "AND CategoryID IS NULL";
    const result = await rv.RunView({
      EntityName: 'Reports',
      ExtraFilter: `UserID=${md.CurrentUser.ID}  ${folderFilter}`
    })

    if (result && result.Success){
      this.reports = result.Results;
    }
    else{
      this.reports = [];
    }

    let filterString: string = this.selectedFolderID ? `ID = ${this.selectedFolderID}` : "ParentID IS NULL"; 
    filterString += " AND Name != 'Root'";
    const folderResult = await rv.RunView({
      EntityName:'Report Categories',
      ExtraFilter: filterString
    });

    if(folderResult && folderResult.Success){
      this.folders = folderResult.Results;

      if(this.folders.length > 0){
        this.parentFolderID = this.folders[0].ParentID;
      }
    }

    this.createItems();

    this.showLoader = false;
  }
  */

  public itemClick(item: ReportEntity) {
    if (item) {
      this.router.navigate(['resource', 'reports', item.ID])
    }
  }

  public onBackButtonClick(): void {
    const pathData: PathData | null = this.PathData.ParentPathData;
    if(pathData && pathData.ID > 0){
      this.PathData = pathData;
      //navigation seems like it does nothing but update the URL
      //so just reload all of the data
      this.router.navigate(['reports'], {queryParams: {folderID: pathData.ID}});
      this.selectedFolderID = pathData.ID;
      this.GetData();
      
    }
    else if(this.parentFolderID || !this.parentFolderID && this.selectedFolderID){
      this.router.navigate(['reports'], {queryParams: {folderID: this.parentFolderID}});
      this.selectedFolderID = this.parentFolderID;
      this.parentFolderID = null;
      this.GetData();
    }
    else{
      //no parent path, so just go home
      this.router.navigate(['']);
    }
  }
}
