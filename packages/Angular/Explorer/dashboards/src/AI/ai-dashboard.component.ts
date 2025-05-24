import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import { BaseDashboard } from '../generic/base-dashboard';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey } from '@memberjunction/core';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { BottomNavigationItem } from '@progress/kendo-angular-navigation';

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
  public activeTab = 'models'; // Default tab
  
  // Navigation items for bottom navigation
  public navigationItems: BottomNavigationItem[] = [
    { 
      id: 'models', 
      text: 'Models', 
      icon: 'k-icon k-i-gear',
      selected: this.activeTab === 'models'
    },
    { 
      id: 'prompts', 
      text: 'Prompts', 
      icon: 'k-icon k-i-comment',
      selected: this.activeTab === 'prompts'
    },
    { 
      id: 'agents', 
      text: 'Agents', 
      icon: 'k-icon k-i-user',
      selected: this.activeTab === 'agents'
    },
    { 
      id: 'monitoring', 
      text: 'Monitor', 
      icon: 'k-icon k-i-chart-line',
      selected: this.activeTab === 'monitoring'
    },
    { 
      id: 'config', 
      text: 'Config', 
      icon: 'k-icon k-i-cog',
      selected: this.activeTab === 'config'
    }
  ];

  private stateChangeSubject = new Subject<AIDashboardState>();

  constructor() {
    super();
    this.setupStateManagement();
  }

  ngAfterViewInit(): void {
    // Initialize the dashboard after view init
    this.emitStateChange();
  }

  ngOnDestroy(): void {
    this.stateChangeSubject.complete();
  }

  public onTabChange(tabId: string): void {
    this.activeTab = tabId;
    this.updateNavigationSelection();
    this.emitStateChange();
  }

  public onNavigationChange(item: BottomNavigationItem): void {
    this.activeTab = item.id!;
    this.updateNavigationSelection();
    this.emitStateChange();
  }

  private updateNavigationSelection(): void {
    this.navigationItems = this.navigationItems.map(item => ({
      ...item,
      selected: item.id === this.activeTab
    }));
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
      modelManagementState: {},
      promptManagementState: {},
      agentConfigurationState: {},
      executionMonitoringState: {},
      systemConfigurationState: {}
    };

    this.stateChangeSubject.next(state);
  }

  public loadUserState(state: Partial<AIDashboardState>): void {
    if (state.activeTab) {
      this.activeTab = state.activeTab;
    }
    // Load sub-component states as they're implemented
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
    // This can be expanded to load configuration data, recent activities, etc.
  }

  public getCurrentTabLabel(): string {
    const currentTab = this.tabs.find(tab => tab.id === this.activeTab);
    return currentTab ? currentTab.label : 'AI Administration';
  }
}

export function LoadAIDashboard() {
  // Prevents tree-shaking
}