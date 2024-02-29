import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'
import { Metadata } from '@memberjunction/core';
import { ViewInfo, UserViewEntity } from '@memberjunction/core-entities';
import { ViewPropertiesDialogComponent } from '../user-view-properties/view-properties-dialog.component';
import { NotificationService } from "@progress/kendo-angular-notification";
import { SharedService } from '@memberjunction/ng-shared';

@Component({
  selector: 'app-single-entity',
  templateUrl: './single-entity.component.html',
  styleUrls: ['./single-entity.component.css', '../../shared/first-tab-styles.css']
})
export class SingleEntityComponent implements OnInit {
  constructor(private router: Router, private route: ActivatedRoute, private notificationService: NotificationService, public sharedService: SharedService) {

  }
  public appName: string = ''
  public entityName: string = ''
  public entityFieldsText: string = ''
  public entityDescription: string = ''
  public entityViews: UserViewEntity[] = [];
  public selectedView: UserViewEntity | null = null;
  public deleteDialogOpened: boolean = false;
  public showloader: boolean = false;

  @ViewChild(ViewPropertiesDialogComponent, { static: true }) viewPropertiesDialog!: ViewPropertiesDialogComponent;

  ngOnInit(): void {
    this.route.paramMap.subscribe(async params => {
      const entityName = params.get('entityName');
      const appName = params.get('appName')
      if (appName)
        this.appName = appName;

      // Perform any necessary actions with the ViewID, such as fetching data
      if (entityName) {
        this.entityName = entityName;
        await this.LoadData(entityName);
      }
    });
  }

  async LoadData(entityName: string = this.entityName) {
    if (entityName) {
      this.showloader = true;
      this.selectedView = null;
      const md = new Metadata()
      const entity = md.Entities.find(e => e.Name == entityName)
      if (entity) {
        this.entityDescription = entity.Description;

        this.entityViews = <UserViewEntity[]>await ViewInfo.GetViewsForUser(entity.ID);
        this.showloader = false;
      }
    }
  }
  viewItemClick(info: UserViewEntity) {
    if (info) {
      this.router.navigate(['resource', 'view', info.ID])
    }
  }

  createNewView() {
    // launch the dialog
    this.viewPropertiesDialog.CreateView(this.entityName);
  }

  editView(entity: UserViewEntity) {
    this.selectedView = entity;
    this.viewPropertiesDialog.Open(this.selectedView?.ID);
  }

  handleDeleteView(entity: UserViewEntity | null = null) {
    this.selectedView = entity;
    this.deleteDialogOpened = !this.deleteDialogOpened;
  }

  async deleteView() {
    if (this.selectedView) {
      this.showloader = true;
      const md = new Metadata();
      const viewObj = <UserViewEntity>await md.GetEntityObject('User Views');
      await viewObj.Load(this.selectedView?.ID); // load the view to be deleted

      if (await viewObj.Delete()) { // delete the view
        this.notificationService.show({
          content: "View deleted successfully!",
          hideAfter: 800,
          position: { horizontal: "center", vertical: "top" },
          animation: { type: "fade", duration: 400 },
          type: { style: "success", icon: true },
        });

        this.showloader = false;
        this.deleteDialogOpened = false;
        await this.LoadData(); // reload the updated data on UI
      }
      else {
        this.notificationService.show({
          content: "Error deleting view!",
          hideAfter: 800,
          position: { horizontal: "center", vertical: "top" },
          animation: { type: "fade", duration: 400 },
          type: { style: "error", icon: true },
        });
      }
    }
  }

  async viewPropertiesClosed(args: any) {
    if (this.selectedView) {
      await this.LoadData(this.entityName);
      this.viewPropertiesDialog.isDialogOpened = false;
      this.selectedView = null;
    } else if (args && args.Saved === true && args.ViewEntity) {
      const paramsArray = ['/app', this.appName, 'entity', this.entityName, 'view', args.ViewEntity.ID];
      this.router.navigate(paramsArray)
    }
  }
}
