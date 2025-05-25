import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import { BaseDashboard } from '../generic/base-dashboard';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey } from '@memberjunction/core';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

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
  public selectedIndex = 0; // Track selected navigation index
  
  // Navigation items for bottom navigation
  public navigationItems: string[] = ['models', 'prompts', 'agents', 'monitoring', 'config'];
  
  public get navigationConfig() {
    return [
      { text: 'Models', icon: 'fa-solid fa-microchip', selected: this.activeTab === 'models' },
      { text: 'Prompts', icon: 'fa-solid fa-comment-dots', selected: this.activeTab === 'prompts' },
      { text: 'Agents', icon: 'fa-solid fa-robot', selected: this.activeTab === 'agents' },
      { text: 'Monitor', icon: 'fa-solid fa-chart-line', selected: this.activeTab === 'monitoring' },
      { text: 'Config', icon: 'fa-solid fa-cogs', selected: this.activeTab === 'config' }
    ];
  }

  public get navigationConfigForKendo() {
    return [
      { text: 'Models', icon: 'gear', selected: this.activeTab === 'models' },
      { text: 'Prompts', icon: 'comment', selected: this.activeTab === 'prompts' },
      { text: 'Agents', icon: 'user', selected: this.activeTab === 'agents' },
      { text: 'Monitor', icon: 'chart-line', selected: this.activeTab === 'monitoring' },
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
    this.emitStateChange();
  }

  ngOnDestroy(): void {
    this.stateChangeSubject.complete();
  }

  public onTabChange(tabId: string): void {
    console.log('AI Dashboard: Tab changed to:', tabId);
    this.activeTab = tabId;
    this.selectedIndex = this.navigationItems.indexOf(tabId);
    this.emitStateChange();
  }

  public onNavigationChange(event: any): void {
    // Legacy method for Kendo navigation - kept for compatibility
    const index = event.index;
    if (index >= 0 && index < this.navigationItems.length) {
      this.selectedIndex = index;
      this.activeTab = this.navigationItems[index];
      this.emitStateChange();
      console.log('AI Dashboard: Switched to tab:', this.activeTab, 'index:', index);
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
      this.selectedIndex = this.navigationItems.indexOf(state.activeTab);
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
    const tabIndex = this.navigationItems.indexOf(this.activeTab);
    const labels = ['Models', 'Prompts', 'Agents', 'Monitor', 'Config'];
    return tabIndex >= 0 ? labels[tabIndex] : 'AI Administration';
  }
}

export function LoadAIDashboard() {
  // Prevents tree-shaking
}