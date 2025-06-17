import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { LogError, Metadata, RunQuery } from '@memberjunction/core';
import { BaseNavigationComponent, SharedService } from '@memberjunction/ng-shared';

@Component({
  selector: 'mj-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css', '../../shared/first-tab-styles.css']
})
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
  public HomeItems = this.md.VisibleExplorerNavigationItems.filter(item => item.ShowInHomeScreen);

  public navigate(route: string) {
    this.router.navigate([route]).catch(err => {
      console.error('Navigation error:', err);
    });
  }

  public getItemDescription(item: any): string {
    // Provide helpful descriptions for navigation items
    const descriptions: { [key: string]: string } = {
      'Explorer': 'Browse and manage all your data entities',
      'Reports': 'Generate and view custom reports and analytics',
      'Dashboards': 'Interactive data visualizations and insights',
      'AI': 'Artificial intelligence tools and models',
      'Settings': 'Configure system preferences and options',
      'Admin': 'Administrative tools and system management',
      'Users': 'Manage user accounts and permissions',
      'Security': 'Security settings and access controls'
    };
    
    return descriptions[item.Name] || 'Access ' + item.Name.toLowerCase() + ' functionality';
  }

  private async getVersionString(): Promise<string> {
    try {
      const rq: RunQuery = new RunQuery();
      const rqResult = await rq.RunQuery({
        QueryName: 'Server Installed Version History',
        CategoryName: 'Admin'
      });
      
      if (!rqResult.Success) {
        LogError("Error getting version string", undefined, rqResult.ErrorMessage);
        return "Version Unknown";
      }

      const latestSchema = rqResult.Results[0];
      return `Version ${latestSchema.Version}`;
    } catch (error) {
      LogError("Error getting version string", undefined, error);
      return "Version Unknown";
    }
  }
}