import { Component, AfterViewInit, OnDestroy, ViewChild } from '@angular/core';
import { BaseDashboard } from '../generic/base-dashboard';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey } from '@memberjunction/core';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { SharedService } from '@memberjunction/ng-shared';

interface AIDashboardState {
  activeTab: string;
  modelManagementState: any;
  promptManagementState: any;
  agentConfigurationState: any;
  executionMonitoringState: any;
  systemConfigurationState: any;
}

@Component({
  selector: 'mj-ai-dashboard',
  templateUrl: './ai-dashboard.component.html',
  styleUrls: ['./ai-dashboard.component.scss']
})
@RegisterClass(BaseDashboard, 'AIDashboard')
export class AIDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
  
  public isLoading = false;
  public activeTab = 'monitoring'; // Default tab changed to monitoring
  public selectedIndex = 0; // Track selected navigation index
  
  // Component states
  public modelManagementState: any = null;
  public promptManagementState: any = null;
  public agentConfigurationState: any = null;
  public systemConfigurationState: any = null;
  public executionMonitoringState: any = null;
  
  // Track which tabs have been visited for lazy loading
  private visitedTabs = new Set<string>();
  
  // Navigation items for bottom navigation - reordered with monitoring first
  public navigationItems: string[] = ['monitoring', 'prompts', 'agents', 'models', 'config'];
  
  public get navigationConfig() {
    return [
      { text: 'Monitor', icon: 'fa-solid fa-chart-line', selected: this.activeTab === 'monitoring' },
      { text: 'Prompts', icon: 'fa-solid fa-comment-dots', selected: this.activeTab === 'prompts' },
      { text: 'Agents', icon: 'fa-solid fa-robot', selected: this.activeTab === 'agents' },
      { text: 'Models', icon: 'fa-solid fa-microchip', selected: this.activeTab === 'models' },
      { text: 'Config', icon: 'fa-solid fa-cogs', selected: this.activeTab === 'config' }
    ];
  }

  public get navigationConfigForKendo() {
    return [
      { text: 'Monitor', icon: 'chart-line', selected: this.activeTab === 'monitoring' },
      { text: 'Prompts', icon: 'comment', selected: this.activeTab === 'prompts' },
      { text: 'Agents', icon: 'user', selected: this.activeTab === 'agents' },
      { text: 'Models', icon: 'gear', selected: this.activeTab === 'models' },
      { text: 'Config', icon: 'cog', selected: this.activeTab === 'config' }
    ];
  }

  private stateChangeSubject = new Subject<AIDashboardState>();

  constructor() {
    super();
    this.setupStateManagement();
  }

  ngAfterViewInit(): void {
    // Initialize the dashboard after view init
    // Mark the initial tab as visited
    this.visitedTabs.add(this.activeTab);
    this.emitStateChange();
  }

  ngOnDestroy(): void {
    this.stateChangeSubject.complete();
  }

  public onTabChange(tabId: string): void {
    this.activeTab = tabId;
    const index = this.navigationItems.indexOf(tabId);
    
    // Defer selectedIndex update to avoid change detection issues
    setTimeout(() => {
      this.selectedIndex = index >= 0 ? index : 0;
      
      // Invoke manual resize after tab change to fix rendering issues
      // TODO: Remove this when resize issues are properly fixed
      SharedService.Instance.InvokeManualResize();
    }, 100); // Give a bit more time for the DOM to update
    
    this.visitedTabs.add(tabId); // Mark tab as visited
    this.emitStateChange();
  }
  
  public hasVisited(tabId: string): boolean {
    return this.visitedTabs.has(tabId);
  }

  public onNavigationChange(event: any): void {
    // Legacy method for Kendo navigation - kept for compatibility
    const index = event.index;
    if (index >= 0 && index < this.navigationItems.length) {
      this.selectedIndex = index;
      this.activeTab = this.navigationItems[index];
      this.emitStateChange();
      
      // Invoke manual resize after navigation change
      // TODO: Remove this when resize issues are properly fixed
      setTimeout(() => {
        SharedService.Instance.InvokeManualResize();
      }, 100);
    }
  }

  private setupStateManagement(): void {
    // Debounced state change emissions
    this.stateChangeSubject.pipe(
      debounceTime(50)
    ).subscribe(state => {
      this.UserStateChanged.emit(state);
    });
  }

  private emitStateChange(): void {
    const state: AIDashboardState = {
      activeTab: this.activeTab,
      modelManagementState: this.modelManagementState || {},
      promptManagementState: this.promptManagementState || {},
      agentConfigurationState: this.agentConfigurationState || {},
      executionMonitoringState: this.executionMonitoringState || {},
      systemConfigurationState: this.systemConfigurationState || {}
    };

    this.stateChangeSubject.next(state);
  }
  
  public onModelManagementStateChange(state: any): void {
    this.modelManagementState = state;
    this.emitStateChange();
  }

  public onPromptManagementStateChange(state: any): void {
    this.promptManagementState = state;
    this.emitStateChange();
  }
  
  public onAgentConfigurationStateChange(state: any): void {
    this.agentConfigurationState = state;
    this.emitStateChange();
  }
  
  public onSystemConfigurationStateChange(state: any): void {
    this.systemConfigurationState = state;
    this.emitStateChange();
  }
  
  public onExecutionMonitoringStateChange(state: any): void {
    this.executionMonitoringState = state;
    this.emitStateChange();
  }

  public loadUserState(state: Partial<AIDashboardState>): void {
    if (state.activeTab) {
      this.activeTab = state.activeTab;
      const index = this.navigationItems.indexOf(state.activeTab);
      
      // Defer selectedIndex update to avoid change detection issues
      setTimeout(() => {
        // Ensure we don't set selectedIndex to -1
        this.selectedIndex = index >= 0 ? index : 0;
      });
      
      // Mark the tab as visited
      this.visitedTabs.add(state.activeTab);
    }
    
    // Store component states for when they're rendered
    if (state.modelManagementState) {
      this.modelManagementState = state.modelManagementState;
    }
    if (state.executionMonitoringState) {
      this.executionMonitoringState = state.executionMonitoringState;
    }
    if (state.promptManagementState) {
      this.promptManagementState = state.promptManagementState;
    }
    if (state.agentConfigurationState) {
      this.agentConfigurationState = state.agentConfigurationState;
    }
    if (state.systemConfigurationState) {
      this.systemConfigurationState = state.systemConfigurationState;
    }
    
    // No need for manual change detection with default strategy
  }

  // Handle entity record opening from sub-components
  public onOpenEntityRecord(data: {entityName: string; recordId: string} | Event): void {
    // Type guard to check if it's the correct event type
    if (data && typeof data === 'object' && 'entityName' in data && 'recordId' in data) {
      const entityData = data as {entityName: string; recordId: string};
      const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: entityData.recordId }]);
      this.OpenEntityRecord.emit({
        EntityName: entityData.entityName,
        RecordPKey: compositeKey
      });
    }
  }

  // Required BaseDashboard methods
  initDashboard(): void {
    try {
      this.isLoading = true;
      // Initialize AI dashboard components
    } catch (error) {
      console.error('Error initializing AI dashboard:', error);
      this.Error.emit(new Error('Failed to initialize AI dashboard. Please try again.'));
    } finally {
      this.isLoading = false;
    }
  }

  loadData(): void {
    // Load any initial data needed for the AI dashboard
    // Check if we have user state in the Config and apply it
    if (this.Config?.userState) {
      // Wrap in setTimeout to avoid ExpressionChangedAfterItHasBeenCheckedError
      setTimeout(() => {
        if (this.Config?.userState) {
          this.loadUserState(this.Config.userState);
        }
      }, 0);
    }
    
    // Emit loading complete event
    this.LoadingComplete.emit();
  }

  public getCurrentTabLabel(): string {
    const tabIndex = this.navigationItems.indexOf(this.activeTab);
    const labels = ['Monitor', 'Prompts', 'Agents', 'Models', 'Config'];
    return tabIndex >= 0 ? labels[tabIndex] : 'AI Administration';
  }
}

export function LoadAIDashboard() {
  // Prevents tree-shaking
}