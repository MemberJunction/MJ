import { Component, Input, OnInit, ViewChild, ElementRef, AfterViewInit, ViewContainerRef, ComponentRef, OnDestroy } from '@angular/core';
import { CompositeKey, LogError, Metadata, RunView, RunViewParams } from '@memberjunction/core';
import { DashboardEntity, DashboardUserPreferenceEntity, DashboardUserStateEntity, ResourceData } from '@memberjunction/core-entities';
import { BaseDashboard, DashboardConfig } from '@memberjunction/ng-dashboards';
import { InvokeManualResize, MJGlobal, SafeJSONParse } from '@memberjunction/global';
import { MJTabStripComponent } from '@memberjunction/ng-tabstrip';
import { Router } from '@angular/router';
import { DashboardPreferencesDialogComponent, DashboardPreferencesResult } from '../dashboard-preferences-dialog/dashboard-preferences-dialog.component';
import { SingleDashboardComponent } from '../single-dashboard/single-dashboard.component';
import { SharedService } from '@memberjunction/ng-shared';

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

      const ds = await md.GetAndCacheDatasetByName("MJ_Metadata"); // get the main MJ_Metadata dataset which is usually already cached
      if (!ds || !ds.Success) {
        this.error = ds.Status || 'Failed to load metadata dataset';
        this.dashboards = [];
        return;
      }
      const dashList = ds.Results.find(r => r.Code === 'Dashboards');
      if (!dashList) {
        this.error = 'Dashboards dataset not found';
        this.dashboards = [];
        return;
      }

      // now get the data from the dataset which is usually cached
      const scope = this.ApplicationID ? 'App' : 'Global';
      const baseCondition = `Scope='${scope}'${appFilter}`;
      const userFilter = `UserID='${md.CurrentUser.ID}' AND ${baseCondition}`;
      const upEntity = md.EntityByName('MJ: Dashboard User Preferences');

      const filter: string = `(${userFilter})
                              OR 
                              (UserID IS NULL AND ${baseCondition} AND
                              NOT EXISTS (SELECT 1 FROM [${upEntity.SchemaName}].[${upEntity.BaseView}] 
                                        WHERE ${userFilter}))`;

      const params: RunViewParams = {
        EntityName: 'MJ: Dashboard User Preferences',
        ExtraFilter: filter,
        ResultType: 'entity_object',
        OrderBy: 'DisplayOrder',
      };      

      const prefsResult = await rv.RunView<DashboardUserPreferenceEntity>(params); // Use RunView for user preferences because we don't want to cache this data as it would cause cache being refreshed all the time since
                                                                                   // user preferences can change frequently and we want to ensure we always have the latest preferences for the current user    
      if (prefsResult && prefsResult.Success && prefsResult.Results.length > 0) {
        const dashResults = dashList.Results.filter((d: DashboardEntity) => {
          return prefsResult.Results.some((p: DashboardUserPreferenceEntity) => p.DashboardID === d.ID);
        });
        if (dashResults.length > 0) {
          // now sort the dashboards based on the user preferences
          this.dashboards = dashResults.sort((a, b) => {
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
          this.error = 'Failed to load dashboards';
          this.dashboards = [];
        }
      } else {
        // No dashboard preferences found - this is normal, show default content
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
          let instance: BaseDashboard | undefined;
          let componentRef: ComponentRef<BaseDashboard>;
          if (dashboardEntity.Type === 'Code') {
            const classInfo = MJGlobal.Instance.ClassFactory.GetRegistration(BaseDashboard, dashboardEntity.DriverClass!);
            if (!classInfo || !classInfo.SubClass) {
              // Class not found error
              const errorMsg = `Dashboard class '${dashboardEntity.DriverClass}' not found`;
              console.error(`Error loading dashboard '${dashboardEntity.Name}': ${errorMsg}`);
              this.displayDashboardError(dashboardId, `Dashboard component not available: ${dashboardEntity.DriverClass}`, 'The dashboard class is not registered. Please contact your system administrator.');
              return undefined;
            }

            // Create the component dynamically
            componentRef = this.tabstripContainer.createComponent<BaseDashboard>(classInfo.SubClass);
            instance = componentRef.instance as BaseDashboard;
          }
          else {
            // configuration type dashboard, so we can use the 
            // Create the component dynamically
            componentRef = this.tabstripContainer.createComponent<BaseDashboard>(SingleDashboardComponent);
            instance = componentRef.instance as BaseDashboard;
            // get the single dashboard component to set the DashboardID
            const resData = new ResourceData();
            resData.ResourceRecordID = dashboardId;
            (instance as SingleDashboardComponent).ResourceData = resData;  
          }
          if (!instance) {
            // Instance creation failed error
            const errorMsg = `Failed to create instance of dashboard class '${dashboardEntity.DriverClass}'`;
            console.error(`Error loading dashboard '${dashboardEntity.Name}': ${errorMsg}`);
            this.displayDashboardError(dashboardId, 'Dashboard failed to initialize', 'The dashboard could not be created. Please contact your system administrator.');
            return undefined;
          }

          // Store both the instance and component reference
          this.dashboardInstances.set(dashboardId, instance);
          this.dashboardComponentRefs.set(dashboardId, componentRef);
          
          // Find the target container element and append the component
          setTimeout(async () => {
            const targetElement = document.getElementById(`dashboard-${dashboardId}`);
            if (targetElement && componentRef.location.nativeElement) {
              targetElement.appendChild(componentRef.location.nativeElement);

              const userStateEntity = await this.loadDashboardUserState(dashboardId);
              const config: DashboardConfig = {
                dashboard: dashboardEntity,
                userState: userStateEntity.UserState ? SafeJSONParse(userStateEntity.UserState) : {}
              };

              // handle open entity record events in MJ Explorer with routing                  
              instance.OpenEntityRecord.subscribe((data: { EntityName: string; RecordPKey: CompositeKey }) => {
                // check to see if the data has entityname/pkey
                if (data && data.EntityName && data.RecordPKey) {
                  // open the record in the explorer
                  SharedService.Instance.OpenEntityRecord(data.EntityName, data.RecordPKey);
                  // this.router.navigate(['resource', 'record', data.RecordPKey.ToURLSegment()], 
                  //                      { queryParams: { Entity: data.EntityName } })                      
                }
              });

              instance.UserStateChanged.subscribe(async (userState: any) => {
                if (!userState) {
                  // if the user state is null, we need to remove it from the user state
                  userState = {};
                }
                // save the user state to the dashboard user state entity
                userStateEntity.UserState = JSON.stringify(userState);
                if (!await userStateEntity.Save()) {
                  LogError('Error saving user state', null, userStateEntity.LatestResult.CompleteMessage);
                }
              });

              // now that we have state loaded and our events are wired up, we can set the config
              instance.Config = config;
              instance.Refresh();

              // now invoke a manual resize
              InvokeManualResize(100);
            }
          }, 0);
          
          return instance;
        }
      } catch (error) {
        const dashboardEntity = this.dashboards.find(d => d.ID === dashboardId);
        const errorMsg = `Error creating dashboard instance for '${dashboardEntity?.Name || dashboardId}'`;
        console.error(errorMsg, error);
        LogError(errorMsg, null, error);
        this.displayDashboardError(dashboardId, 'Dashboard loading error', 'An unexpected error occurred while loading the dashboard. Please contact your system administrator.');
      }
    }
    
    return this.dashboardInstances.get(dashboardId);
  }

  private displayDashboardError(dashboardId: string, title: string, message: string): void {
    // Display error message in the dashboard container
    setTimeout(() => {
      const targetElement = document.getElementById(`dashboard-${dashboardId}`);
      if (targetElement) {
        targetElement.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 300px; text-align: center; padding: 20px; color: #666;">
            <div style="font-size: 48px; color: #dc3545; margin-bottom: 20px;">⚠️</div>
            <h3 style="color: #dc3545; margin: 0 0 10px 0;">${title}</h3>
            <p style="margin: 0 0 20px 0; max-width: 400px; line-height: 1.5;">${message}</p>
            <small style="color: #999;">Dashboard ID: ${dashboardId}</small>
          </div>
        `;
      }
    }, 0);
  }

  protected async loadDashboardUserState(dashboardId: string): Promise<DashboardUserStateEntity> {
    // handle user state changes for the dashboard
    const rv = new RunView();
    const md = new Metadata();
    const stateResult = await rv.RunView({
      EntityName: 'MJ: Dashboard User States',
      ExtraFilter: `DashboardID='${dashboardId}' AND UserID='${md.CurrentUser.ID}'`,
      ResultType: 'entity_object',
    });
    let stateObject: DashboardUserStateEntity;
    if (stateResult && stateResult.Success && stateResult.Results.length > 0) {
      stateObject = stateResult.Results[0];
    }
    else {
      stateObject = await md.GetEntityObject<DashboardUserStateEntity>('MJ: Dashboard User States');
      stateObject.DashboardID = dashboardId;
      stateObject.UserID = md.CurrentUser.ID;
      // don't save becuase we don't care about the state until something changes
    }
    return stateObject;
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

        // now invoke a manual resize
        InvokeManualResize(100);
      }
    }
  }

  public openPreferencesDialog(): void {
    try {
      // Create the preferences dialog component dynamically
      const componentRef = this.tabstripContainer.createComponent(DashboardPreferencesDialogComponent);
      const dialogInstance = componentRef.instance;
      
      // Configure the dialog
      dialogInstance.applicationId = this.ApplicationID;
      dialogInstance.scope = this.ApplicationID ? 'App' : 'Global';
      
      // Handle dialog result
      dialogInstance.result.subscribe((result: DashboardPreferencesResult) => {
        if (result.saved) {
          // Preferences were saved, reload dashboards
          this.refreshDashboards();
        }
        
        // Clean up the dialog component
        componentRef.destroy();
      });
      
      // The Kendo dialog will handle its own modal overlay and positioning
      // Just append to body for proper z-index stacking
      document.body.appendChild(componentRef.location.nativeElement);
      
      // Clean up when dialog closes
      dialogInstance.result.subscribe(() => {
        if (document.body.contains(componentRef.location.nativeElement)) {
          document.body.removeChild(componentRef.location.nativeElement);
        }
      });
      
    } catch (error) {
      LogError('Error opening preferences dialog', null, error);
    }
  }

  private async refreshDashboards(): Promise<void> {
    try {
      this.loading = true;
      this.error = null;
      
      // Clear existing dashboard instances
      this.dashboardComponentRefs.forEach(componentRef => {
        componentRef.destroy();
      });
      this.dashboardComponentRefs.clear();
      this.dashboardInstances.clear();
      
      // Reload dashboards
      await this.loadDashboards();
      
      // Move content to correct container
      setTimeout(() => {
        this.moveContentToCorrectContainer();
        
        // Load first dashboard if available
        if (this.DefaultDashboardPosition !== 'first' && this.dashboards.length > 0) {
          const dashboardId = this.dashboards[0].ID;
          const instance = this.getDashboardInstance(dashboardId);
          if (instance) {
            instance.SetVisible(true);
            InvokeManualResize(100);
          }
        }
      }, 10);
    } catch (error) {
      LogError('Error refreshing dashboards', null, error);
      this.error = 'Failed to refresh dashboards';
    } finally {
      this.loading = false;
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