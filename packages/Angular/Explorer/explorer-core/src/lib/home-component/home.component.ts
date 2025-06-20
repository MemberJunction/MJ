import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { LogError, Metadata, RunQuery } from '@memberjunction/core';
import { BaseNavigationComponent, SharedService } from '@memberjunction/ng-shared';
import { ChipThemeColor } from '@progress/kendo-angular-buttons';

@Component({
  selector: 'mj-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css', '../../shared/first-tab-styles.css']
})
export class HomeComponent extends BaseNavigationComponent {

  public versionString: string;
  public isLoading: boolean = true;

  constructor(public sharedService: SharedService, private router: Router) { 
    super();
    this.versionString = "";
    this.getVersionString().then(version => {
      this.versionString = version;
      this.isLoading = false;
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
      'Security': 'Security settings and access controls',
      'Applications': 'Access and manage your applications',
      'Lists': 'View and organize your custom lists',
      'Queries': 'Create and run custom database queries',
      'Files': 'Manage documents and file storage'
    };
    
    return descriptions[item.Name] || 'Access ' + item.Name.toLowerCase() + ' functionality';
  }

  public getThemeColor(item: any): ChipThemeColor {
    // Map navigation items to Kendo theme colors
    const colorMap: { [key: string]: string } = {
      'Explorer': 'primary',
      'Reports': 'info',
      'Dashboards': 'success',
      'AI': 'tertiary',
      'Settings': 'warning',
      'Admin': 'error',
      'Users': 'primary',
      'Security': 'error'
    };
    
    return (colorMap[item.Name] || 'base') as ChipThemeColor;
  }

  public getChipLabel(item: any): string {
    // Provide chip labels for navigation items
    const labelMap: { [key: string]: string } = {
      'Explorer': 'DATA',
      'Reports': 'ANALYTICS',
      'Dashboards': 'VISUALIZE',
      'AI': 'SMART',
      'Settings': 'CONFIGURE',
      'Admin': 'MANAGE',
      'Users': 'PEOPLE',
      'Security': 'SECURE',
      'Applications': 'APPS',
      'Lists': 'ORGANIZE',
      'Queries': 'QUERY',
      'Files': 'STORAGE'
    };
    
    return labelMap[item.Name] || 'NAVIGATE';
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