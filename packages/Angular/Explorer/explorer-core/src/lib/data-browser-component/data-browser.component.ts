import { Component } from '@angular/core';
import { Router } from '@angular/router'
import { ApplicationInfo, Metadata, RunView } from '@memberjunction/core';
import { ApplicationEntity, UserApplicationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseNavigationComponent, SharedService } from '@memberjunction/ng-shared';

@Component({
  selector: 'app-data-browser',
  templateUrl: './data-browser.component.html',
  styleUrls: ['./data-browser.component.css', '../../shared/first-tab-styles.css']
})
@RegisterClass(BaseNavigationComponent, 'Data')
export class DataBrowserComponent extends BaseNavigationComponent {
  public showLoader: boolean = true;

  public AllApplications: ApplicationEntity[] = [];
  public SelectedApplications: ApplicationEntity[] = [];
  public UnselectedApplications: ApplicationEntity[] = [];

  constructor(public sharedService: SharedService, private router: Router) {
    super();
  }

  ngOnInit(): void {
    this.LoadData();
  }
  async LoadData() {
    this.showLoader = true;
    const rv = new RunView();
    const results = await rv.RunView<ApplicationEntity>({
      EntityName: 'Applications',
      ResultType: 'entity_object',
      OrderBy: 'Name'
    })
    if (results && results.Success) {
      this.AllApplications = results.Results;
    }

    const userApps = await rv.RunView<UserApplicationEntity>({
      EntityName: 'User Applications',
      ResultType: 'entity_object',
      ExtraFilter: `UserID = '${new Metadata().CurrentUser.ID}'`,
      OrderBy: 'Sequence, Application'
    })
    if (userApps && userApps.Success) {
      const apps = userApps.Results.map(ua => this.AllApplications.find(a => a.ID === ua.ApplicationID && ua.IsActive)).filter(a => a)// filter out null entries
      if (!apps.some(a => !a))
        this.SelectedApplications = <ApplicationEntity[]>apps; // forced typecast as we know now that all are non-null

      // now populate the unselected applications
      this.UnselectedApplications = this.AllApplications.filter(a => !this.SelectedApplications.some(sa => sa.ID === a.ID));
    }

    this.showLoader = false;
  }
  public appItemClick(info: ApplicationEntity) {
    if (info) {
      this.router.navigate(['app', info.Name])
    }
  }

  public AppSelectionDialogVisible: boolean = false;
  async ShowAppSelectionDialog() {
    this.AppSelectionDialogVisible = true;
  }

  async GoHome(event: Event) {
    event.preventDefault();
    // tell the router to go to /home
    this.router.navigate(['home']);
  }

  async OnAppSelectionDialogClosed(save: Boolean) {
    this.AppSelectionDialogVisible = false;
    // now we need to process the changes if the user hit save
    if (save) {
      // we need to basically make sure the User Applications entity for this user maps to the set of selected Applications in the order selected as well
      const md = new Metadata();
      const rv = new RunView();
      const userApps = await rv.RunView<UserApplicationEntity>({
        EntityName: 'User Applications',
        ExtraFilter: `UserID='${md.CurrentUser.ID}'`,
        ResultType: 'entity_object',
        OrderBy: 'Sequence, Application',
      });
      // userApps.results is the current DB state, we need to now compare it to the SelectedApplications array
      // and if there are changes either update sequence values or set IsActive=false for records that are not selected anyomre. We
      // don't ever actually delete existing UserApplication records becaue we want to retain the UserApplicationEntities in case the 
      // user selects the app again in the future
      const existingUserApps = userApps.Results;
      const userAppsToSave: UserApplicationEntity[] = [];
      // first we need to update the sequence values for the selected applications
      for (let index = 0; index < this.SelectedApplications.length; index++) {
        const app = this.SelectedApplications[index];
        const existing = existingUserApps.find(ua => ua.ApplicationID === app.ID);
        if (existing) {
          existing.IsActive = true;
          existing.Sequence = index;
          userAppsToSave.push(existing);
        } else {
          // this is a new app that the user has selected
          const newApp = await md.GetEntityObject<UserApplicationEntity>("User Applications");
          newApp.ApplicationID = app.ID;
          newApp.UserID = md.CurrentUser.ID;
          newApp.Sequence = index;
          userAppsToSave.push(newApp);
        }
      }
      // now we need to set IsActive=false for any records that are not selected anymore
      for (let index = 0; index < existingUserApps.length; index++) {
        const existing = existingUserApps[index];
        if (!this.SelectedApplications.some(sa => sa.ID === existing.ApplicationID)) {
          existing.IsActive = false;
          userAppsToSave.push(existing);
        }
      }
      // finally, we need to submit a single transaction so we have one server round trip to commit all this good stuff
      const tg = await md.CreateTransactionGroup();
      for (let index = 0; index < userAppsToSave.length; index++) {
        const ua = userAppsToSave[index];
        ua.TransactionGroup = tg;
        ua.Save(); // no await since we are in a transaction group
      }
      if (!await tg.Submit()) {
        // the data doesn't need to be updated when we are succesful because we're all bound to the same data which is cool
        // but in this case we need to notify the user it failed
        this.sharedService.CreateSimpleNotification('There was an error saving your application selections. Please try again later or notify a system administrator.', "error", 3500);
      }
    }
  }
}
