import { Component, Input, OnInit, Type, ViewChild, ViewContainerRef, inject } from '@angular/core';
import { LogError, Metadata, RunView, RunViewParams } from '@memberjunction/core';
import { DashboardEntity, DashboardUserPreferenceEntity, ResourceData } from '@memberjunction/core-entities';
import { BaseDashboard } from '@memberjunction/ng-dashboards';
import { MJGlobal } from '@memberjunction/global';
import { MJTabComponent, MJTabStripComponent } from '@memberjunction/ng-tabstrip';

@Component({
  selector: 'mj-tabbed-dashboard',
  templateUrl: './tabbed-dashboard.component.html',
  styleUrls: ['./tabbed-dashboard.component.css']
})
export class TabbedDashboardComponent implements OnInit {
  @ViewChild('tabstrip') tabstrip!: MJTabStripComponent;
  
  @Input() public defaultComponent: Type<any> | null = null;
  /**
   * Specify the application to display dashboards for. If not specified, the scope is global.
   */
  @Input() public ApplicationID: string | null = null;
  
  public dashboards: DashboardEntity[] = [];
  public loading: boolean = true;
  public error: string | null = null;
  
  private dashboardInstances: Map<string, BaseDashboard> = new Map();
  private metadata = new Metadata();
  
  constructor() {}

  async ngOnInit(): Promise<void> {
    try {
      this.loading = true;
      await this.loadDashboards();
    } catch (error) {
      LogError('Error in TabbedDashboardComponent.ngOnInit', null, error);
      this.error = 'Failed to load dashboards';
    } finally {
      this.loading = false;
    }
  }

  private async loadDashboards(): Promise<void> {
    try {
      const md = new Metadata();
      const rv = new RunView();
      const appFilter = this.ApplicationID ? ` AND ApplicationID='${this.ApplicationID}'` : '';
      const filter: string = `UserID='${md.CurrentUser.ID}' AND Scope='${this.ApplicationID ? 'Application' : 'Global'}'${appFilter}`;
      const params: RunViewParams = {
        EntityName: 'MJ: Dashboard User Preferences',
        ExtraFilter: filter,
        ResultType: 'entity_object',
        OrderBy: 'DisplayOrder',
      };
      
      const prefsResult = await rv.RunView<DashboardUserPreferenceEntity>(params);
      if (prefsResult && prefsResult.Success) {
        const dashResults = await rv.RunView<DashboardEntity>({
          EntityName: 'Dashboards',
          ExtraFilter: `ID IN (${prefsResult.Results.map(p => `'${p.DashboardID}'`).join(',')})`,
          ResultType: 'entity_object',
        })
        if (dashResults && dashResults.Success) {
          // now sort the dashboards based on the user preferences
          this.dashboards = dashResults.Results.sort((a, b) => {
            const prefA = prefsResult.Results.find(p => p.DashboardID === a.ID);
            const prefB = prefsResult.Results.find(p => p.DashboardID === b.ID);
            if (prefA && prefB) {
              // we want to sort by DisplayOrder where lower numbers come first
              return (prefA.DisplayOrder || 0) - (prefB.DisplayOrder || 0);
            }
            return 0;
          });
        } 
        else {
          this.error = dashResults?.ErrorMessage || 'Failed to load dashboards';
          this.dashboards = [];
        }
      }
      else {
        this.error = prefsResult?.ErrorMessage || 'Failed to load user preferences';
        this.dashboards = [];
      }
    } catch (error) {
      LogError('Error loading dashboards', null, error);
      this.error = 'Failed to load dashboards';
      this.dashboards = [];
    }
  }

  public getDashboardInstance(dashboardId: string): BaseDashboard | undefined {
    if (!this.dashboardInstances.has(dashboardId)) {
      try {
        // Create instance of the appropriate dashboard class
        const dashboardEntity = this.dashboards.find(d => d.ID === dashboardId);
        if (dashboardEntity) {
          // Use the type of the dashboard to determine which class to instantiate
          const dashboardInstance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseDashboard>(
            'BaseDashboard',
            dashboardEntity.Type
          );
          
          if (dashboardInstance) {
            this.dashboardInstances.set(dashboardId, dashboardInstance);
          }
        }
      } catch (error) {
        LogError(`Error creating dashboard instance for ID ${dashboardId}`, null, error);
      }
    }
    
    return this.dashboardInstances.get(dashboardId);
  }

  public onTabSelect(tabIndex: number): void {
    // Initialize the dashboard if needed when its tab is selected
    if (tabIndex >= 0 && tabIndex < this.dashboards.length) {
      const dashboard = this.dashboards[tabIndex];
      const instance = this.getDashboardInstance(dashboard.ID);
      
      if (instance) {
        // You might want to trigger a refresh or other actions here when tab is selected
      }
    }
  }
}