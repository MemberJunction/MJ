import { Component, Input, OnInit, ViewChild, ElementRef, AfterViewInit, ViewContainerRef, ComponentRef, OnDestroy } from '@angular/core';
import { CompositeKey, LogError, Metadata, RunView, RunViewParams } from '@memberjunction/core';
import { DashboardEntity, DashboardUserPreferenceEntity, ResourceData } from '@memberjunction/core-entities';
import { BaseDashboard } from '@memberjunction/ng-dashboards';
import { InvokeManualResize, MJGlobal } from '@memberjunction/global';
import { MJTabComponent, MJTabStripComponent } from '@memberjunction/ng-tabstrip';
import { Router } from '@angular/router';

@Component({
  selector: 'mj-tabbed-dashboard',
  templateUrl: './tabbed-dashboard.component.html',
  styleUrls: ['./tabbed-dashboard.component.css']
})
export class TabbedDashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('tabstrip') tabstrip!: MJTabStripComponent;
  @ViewChild('contentWrapper') contentWrapper!: ElementRef;
  @ViewChild('noTabsContainer') noTabsContainer!: ElementRef;
  @ViewChild('tabContainer') tabContainer!: ElementRef;
  @ViewChild('tabstripContainer', { read: ViewContainerRef }) tabstripContainer!: ViewContainerRef;
  
  /**
   * Specify the application to display dashboards for. If not specified, the scope is global.
   */
  @Input() public ApplicationID: string | null = null;
  
  /**
   * Name for the default tab when no dashboards are available.
   */
  @Input() public DefaultTabName: string = 'Default';

  /**
   * Specify the position of the default dashboard, first, last or not shown at all.
   */
  @Input() public DefaultDashboardPosition: 'first' | 'last' | 'none' = 'last';
  
  public dashboards: DashboardEntity[] = [];
  public loading: boolean = true;
  public error: string | null = null;
  
  private dashboardInstances: Map<string, BaseDashboard> = new Map();
  private dashboardComponentRefs: Map<string, ComponentRef<BaseDashboard>> = new Map();
  
  constructor(private router: Router) {}

  async ngOnInit(): Promise<void> {
  }


  async ngAfterViewInit() {
    try {
      this.loading = true;
      await this.loadDashboards();

      // Move content after loading is complete and view might have changed
      setTimeout(() => {
        // Move content to appropriate container after view is initialized
        this.moveContentToCorrectContainer();

        // if the first tab is the default tab, nothing to do, otherwise we need to do the loading of the first tab since it is dynamic content
        if (this.DefaultDashboardPosition !== 'first' && this.dashboards.length > 0) {
          const dashboardId = this.dashboards[0].ID;
          const instance = this.getDashboardInstance(dashboardId);
          if (instance) {
            instance.SetVisible(true);
            // now, we need to invoke a manual resize to ensure everything shows up right
            InvokeManualResize(100);
          }
        } 
      }, 10);
    } catch (error) {
      LogError('Error in TabbedDashboardComponent.ngOnInit', null, error);
      this.error = 'Failed to load dashboards';
    } finally {
      this.loading = false;
    }
  }

  private moveContentToCorrectContainer(): void {
    if (this.contentWrapper) {
      const content = this.contentWrapper.nativeElement.children[0];
      if (content) {
        if (this.dashboards.length === 0 && this.noTabsContainer) {
          this.noTabsContainer.nativeElement.appendChild(content);
        } else if (this.dashboards.length > 0 && this.tabContainer) {
          this.tabContainer.nativeElement.appendChild(content);
        }
      }
    }
  }

  private async loadDashboards(): Promise<void> {
    try {
      const md = new Metadata();
      const rv = new RunView();
      const appFilter = this.ApplicationID ? ` AND ApplicationID='${this.ApplicationID}'` : '';
      const scope = this.ApplicationID ? 'Application' : 'Global'
      const filter: string = `(UserID='${md.CurrentUser.ID}' AND Scope='${scope}'${appFilter}) OR (Scope='${scope}' AND UserID IS NULL)`;
      const params: RunViewParams = {
        EntityName: 'MJ: Dashboard User Preferences',
        ExtraFilter: filter,
        ResultType: 'entity_object',
        OrderBy: 'DisplayOrder',
      };
      
      const prefsResult = await rv.RunView<DashboardUserPreferenceEntity>(params);
      if (prefsResult && prefsResult.Success) {
        if (prefsResult.Results.length > 0) {
          // User has dashboard preferences, load the dashboards
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
        } else {
          // No dashboard preferences found - this is normal, show default content
          this.dashboards = [];
        }
      }
      else {
        // Error loading preferences
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
        if (dashboardEntity && this.tabstripContainer) {
          // Use the type of the dashboard to determine which class to instantiate
          const classInfo = MJGlobal.Instance.ClassFactory.GetRegistration(BaseDashboard, dashboardEntity.DriverClass!);
          if (classInfo && classInfo.SubClass) {
            // Create the component dynamically
            const componentRef = this.tabstripContainer.createComponent<BaseDashboard>(classInfo.SubClass);
            const instance = componentRef.instance as BaseDashboard;
            
            if (instance) {
              // Store both the instance and component reference
              this.dashboardInstances.set(dashboardId, instance);
              this.dashboardComponentRefs.set(dashboardId, componentRef);
              
              // Find the target container element and append the component
              setTimeout(() => {
                const targetElement = document.getElementById(`dashboard-${dashboardId}`);
                if (targetElement && componentRef.location.nativeElement) {
                  targetElement.appendChild(componentRef.location.nativeElement);

                  // handle open entity record events in MJ Explorer with routing
                  instance.OpenEntityRecord.subscribe((data: { EntityName: string; RecordPKey: CompositeKey }) => {
                    // check to see if the data has entityname/pkey
                    if (data && data.EntityName && data.RecordPKey) {
                      // open the record in the explorer
                      this.router.navigate(['resource', 'record', data.RecordPKey.ToURLSegment()], 
                                           { queryParams: { Entity: data.EntityName } })                      
                    }
                  });
                  instance.Refresh();
                }
              }, 0);
              
              return instance;
            }
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
    const dashboardIndex = tabIndex - 1; // Adjust for the default tab
    if (dashboardIndex >= 0 && dashboardIndex < this.dashboards.length) {
      const dashboard = this.dashboards[dashboardIndex];
      const instance = this.getDashboardInstance(dashboard.ID);
      
      if (instance) {
        // You might want to trigger a refresh or other actions here when tab is selected
        instance.SetVisible(true);
        // now get all the other instances and let them know they're not visible 
        this.dashboards.forEach((d, index) => {
          if (index !== dashboardIndex) {
            const otherInstance = this.getDashboardInstance(d.ID);
            if (otherInstance) {
              otherInstance.SetVisible(false);
            }
          }
        });
      }
    }
  }

  ngOnDestroy(): void {
    // Clean up component references
    this.dashboardComponentRefs.forEach(componentRef => {
      componentRef.destroy();
    });
    this.dashboardComponentRefs.clear();
    this.dashboardInstances.clear();
  }
}