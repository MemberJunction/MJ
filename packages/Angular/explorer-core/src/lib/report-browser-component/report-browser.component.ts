import { Component } from '@angular/core';
import { Router, Params  } from '@angular/router';
import { Metadata, RunView } from '@memberjunction/core';
import { ReportCategoryEntity, ReportEntity } from '@memberjunction/core-entities';
import { Folder, Item, ItemType } from '../../generic/Item.types';
import { PathData } from '../../generic/PathData.types';
import { SharedService } from '@memberjunction/ng-shared';

@Component({
  selector: 'app-report-browser',
  templateUrl: './report-browser.component.html',
  styleUrls: ['./report-browser.component.css', '../../shared/first-tab-styles.css']
})
export class ReportBrowserComponent {
  public reports: ReportEntity[] = [];
  public showLoader: boolean = false;

  public folders: ReportCategoryEntity[] = [];
  public items: Item[];
  public PathData: PathData;
  public selectedFolderID: number | null = null;
  private parentFolderID: number | null = null;

  constructor(private router: Router, private sharedService: SharedService) {
    this.items = [];
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

  ngOnInit(): void {
    this.LoadData();
  }
  
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

  private createItems(): void {
    for(const dashboard of this.reports){
      let item: Item = new Item(dashboard, ItemType.Entity);
      this.items.push(item);
    }

    for(const folder of this.folders){
      const dashboardFolder: Folder = new Folder(folder.ID, folder.Name);
      dashboardFolder.ParentFolderID = folder.ParentID;
      dashboardFolder.Description = folder.Description;
      let item: Item = new Item(dashboardFolder, ItemType.Folder);
      this.items.push(item);
    }

    this.items.sort(function(a, b){
      if(a.Name < b.Name) { return -1; }
      if(a.Name > b.Name) { return 1; }
      return 0;
    });

  }


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
}
