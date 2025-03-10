import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { LogError, Metadata, RunQuery, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseNavigationComponent, SharedService } from '@memberjunction/ng-shared';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css', '../../shared/first-tab-styles.css']
})
@RegisterClass(BaseNavigationComponent, 'Home')
export class HomeComponent extends BaseNavigationComponent {

  public versionString: string;

  constructor(public sharedService: SharedService, private router: Router) { 
    super();
    this.versionString = "";
    this.getVersionString().then(version => {
      this.versionString = version;
    });
  }

  public md = new Metadata();
  public HomeItems = this.md.VisibleExplorerNavigationItems.filter(item => item.ShowInHomeScreen); // only want to show the home items here

  public navigate(route: string) {
    this.router.navigate([route]).catch(err => {
      console.error('Navigation error:', err);
    });


  }

  private async getVersionString(): Promise<string> {
    const rq: RunQuery = new RunQuery();
    const rqResult = await rq.RunQuery(
      {
        QueryName: '__mj: Server Installed Version History' // Get the latest schema version in descending order
      }
    );
    
    if(!rqResult.Success){
        LogError("Error getting version string", undefined, rqResult.ErrorMessage);
        return "";
    }

    const latestSchema = rqResult.Results[0];
    return `Version ${latestSchema.Version}`;
  }
}
