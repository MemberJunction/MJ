import { Component } from '@angular/core';
import { Router, ActivatedRoute, Params  } from '@angular/router'
import { Metadata, RunView } from '@memberjunction/core';
import { DashboardEntity } from '@memberjunction/core-entities';
import { DashboardConfigDetails } from '../single-dashboard/single-dashboard.component';
import { SharedService } from '@memberjunction/ng-shared';
import { Folder, Item, ItemType, PathData } from '../../generic/Item.types';

@Component({
  selector: 'app-dashboard-browser',
  templateUrl: './dashboard-browser.component.html',
  styleUrls: ['./dashboard-browser.component.css', '../../shared/first-tab-styles.css']
})

export class DashboardBrowserComponent {
  public dashboards: DashboardEntity[] = [];
  public showLoader: boolean = false;
  public items: Item<DashboardEntity | Folder>[];
  public PathData: PathData;
  
  private selectedFolderID: number = -1;
  
  constructor(private router: Router, private activatedRoute: ActivatedRoute, private sharedService: SharedService) {
    this.items = [];
    this.PathData = new PathData(0, "Dashboards", "/dashboards");
    let queryParams: Params | undefined = this.router.getCurrentNavigation()?.extractedUrl.queryParams;
    console.log(queryParams);
    if(queryParams && queryParams.folderID){
      let folderID: number = Number(queryParams.folderID);
      this.PathData = new PathData(-1, "Dashboards", "/dashboards?folderID=" + folderID);
      console.log(queryParams["folderID"]);
      this.selectedFolderID = folderID;
    }
    else{
      this.PathData = new PathData(-1, "Dashboards", "/dashboards");
    }
  }

  ngOnInit(): void {
    this.LoadData();
  }

  async LoadData() {
    this.showLoader = true;

    this.dashboards = [];
    this.items = [];

    const md = new Metadata()
    const rv = new RunView();

    const result = await rv.RunView({
      EntityName: 'Dashboards',
      ExtraFilter: `UserID=${md.CurrentUser.ID}`
    })

    if (result && result.Success){
      this.dashboards = result.Results;
    }
    else{
      this.dashboards = [];
    }

    this.createItems();

    this.showLoader = false;
  }

  private createItems(): void {
    for(const dashboard of this.dashboards){
      let item: Item<DashboardEntity> = new Item(dashboard, ItemType.Resource);

      if(this.selectedFolderID > 0){
        item.Name = `Dashboard ${dashboard.ID} in Sub Folder ${this.selectedFolderID}`;
      }

      this.items.push(item);
    }

    for(let i = 0; i < 5; i++){
      let folderName: string = '';
      let rng: number = Math.floor(Math.random() * 100);
      if(this.selectedFolderID > 0){
        folderName = `Folder #${rng} in Sub Folder ${this.selectedFolderID} - Sample Folder ${i}`;
      }
      else{
        folderName = `Sample Folder ${rng}`;
      }

      let folder: Folder = new Folder(rng, folderName);
      let item: Item<Folder> = new Item(folder, ItemType.Folder);
      this.items.push(item);
    }

    this.items.sort(function(a, b){
      if(a.Name < b.Name) { return -1; }
      if(a.Name > b.Name) { return 1; }
      return 0;
    });

  }

  public itemClick(item: Item<DashboardEntity | Folder>) {

    if(!item){
      return
    }

    if (item.Type === ItemType.Resource) {
      console.log(`dashboard clicked: ${item.Name}`);
      let dashboardEntity: DashboardEntity = item.Data as DashboardEntity;
      this.router.navigate(['resource', 'dashboard', dashboardEntity.ID])
    }
    else if(item.Type === ItemType.Folder){
      console.log(`folder clicked: ${item.Name}`);
      const oldPathData: PathData = this.PathData;
      const newPathData: PathData = new PathData(item.Data.ID, item.Data.Name, `/dashboards?folderID=${item.Data.ID}`);
      
      oldPathData.ChildPatchData = newPathData;
      newPathData.ParentPathData = oldPathData;
      this.PathData = newPathData;
      
      //navigation seems like it does nothing but update the URL
      //so just reload all of the data
      this.router.navigate(['dashboards'], {queryParams: {folderID: item.Data.ID}});
      this.selectedFolderID = item.Data.ID;
      this.LoadData();
    }
  }

  public onBackButtonClick(): void {
    console.log("back button clicked");
    const pathData: PathData | undefined  = this.PathData.ParentPathData;
    if(pathData){
      this.PathData = pathData;
      //navigation seems like it does nothing but update the URL
      //so just reload all of the data
      this.router.navigate(['dashboards'], {queryParams: {folderID: pathData.ID}});
      this.selectedFolderID = pathData.ID;
      this.LoadData();
      
    }
    else{
      //no parent path, so just go home
      this.router.navigate(['']);
    }
  }

  public async addNew(): Promise<void> {

    this.showLoader = true;
    const metadata: Metadata = new Metadata();
    let dashboardEntity = <DashboardEntity>await metadata.GetEntityObject('Dashboards');
    dashboardEntity.NewRecord();
    dashboardEntity.UserID = metadata.CurrentUser.ID;

    let dashboardCount: number = this.dashboards.length; 
    let nameSuffix: string = dashboardCount > 0 ? `${dashboardCount + 1}` : "";
    dashboardEntity.Name = "New Dashboard " + nameSuffix;

    let defaultConfigDetails: DashboardConfigDetails = new DashboardConfigDetails();
    const config = {
      columns: defaultConfigDetails.columns,
      rowHeight: defaultConfigDetails.rowHeight,
      resizable: defaultConfigDetails.resizable,
      reorderable: defaultConfigDetails.reorderable,
      items: []
    }
    const configJSON = JSON.stringify(config);
    dashboardEntity.UIConfigDetails = configJSON;

    const result = await dashboardEntity.Save();
    if(result){
      this.dashboards.push(dashboardEntity);

      let item: Item<DashboardEntity> = new Item(dashboardEntity, ItemType.Resource);
      this.items.push(item);
    }
    else{
      this.sharedService.CreateSimpleNotification("Error creating new dashboard entity", "error");
    }
    this.showLoader = false;
  }

  public async deleteItem(item: Item<DashboardEntity | Folder>): Promise<void> {

    if(!item){
      return;
    }

    if(item.Type === ItemType.Folder){
      //todo - change this to be more robust
      this.items = this.items.filter(i => i !== item);
    }
    else if(item.Type === ItemType.Resource){
      this.showLoader = true;
      let dashboardEntity: DashboardEntity = <DashboardEntity>item.Data;
      if (dashboardEntity && dashboardEntity.ID && dashboardEntity.ID > 0) {
        
        const md = new Metadata();
        
        let entityObject = <DashboardEntity>await md.GetEntityObject('Dashboards');
        let loadResult = await entityObject.Load(dashboardEntity.ID);

        if(loadResult){
          let deleteResult = await entityObject.Delete();
          if(deleteResult){
            //todo - change these to use the shared
            this.sharedService.CreateSimpleNotification(`successfully deleted dashboard record ${dashboardEntity.ID}`, "info");
            this.dashboards = this.dashboards.filter(i => i.ID != dashboardEntity.ID);
          }
          else{
            this.sharedService.CreateSimpleNotification(`Unable to delete dashboard record ${dashboardEntity.ID}`, "error");
          }
        }
        else{
          this.sharedService.CreateSimpleNotification(`unable to fetch dashboard record ${dashboardEntity.ID}`, "error");
        }
      }

      //todo - change this to be more robust
      this.items = this.items.filter(i => i !== item);

      this.showLoader = false;
    }
  }

  public async createFolder(folderName: string): Promise<void> {
    console.log(`creating folder ${folderName}...`);
    let folder: Folder = new Folder(this.items.length, folderName);
    let item: Item<Folder> = new Item(folder, ItemType.Folder);
    this.items.push(item);
  }
}
