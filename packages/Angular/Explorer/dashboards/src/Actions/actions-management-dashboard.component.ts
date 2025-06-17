import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import { BaseDashboard } from '../generic/base-dashboard';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey } from '@memberjunction/core';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

interface NavigationItem {
  id: string;
  text: string;
  icon: string;
}

interface ActionsManagementState {
  activeTab: string;
  subView: string | null; // For sub-dashboard views like 'actions-list', 'executions-list', etc.
  actionsOverviewState: Record<string, unknown>;
  executionMonitoringState: Record<string, unknown>;
  scheduledActionsState: Record<string, unknown>;
  codeManagementState: Record<string, unknown>;
  entityIntegrationState: Record<string, unknown>;
  securityPermissionsState: Record<string, unknown>;
}

@Component({
  selector: 'mj-actions-management-dashboard',
  templateUrl: './actions-management-dashboard.component.html',
  styleUrls: ['./actions-management-dashboard.component.scss']
})
@RegisterClass(BaseDashboard, 'ActionsManagement')
export class ActionsManagementDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
  
  public isLoading = false;
  public activeTab = 'overview'; // Default tab
  public subView: string | null = null; // Current sub-view
  
  // Navigation items for bottom navigation
  public navigationItems: string[] = ['overview', 'execution', 'scheduled', 'code', 'entities', 'security'];
  
  public navigationConfig = [
    { text: 'Overview', icon: 'fa-solid fa-dashboard' },
    { text: 'Execution', icon: 'fa-solid fa-play-circle' },
    { text: 'Scheduled', icon: 'fa-solid fa-clock' },
    { text: 'Code', icon: 'fa-solid fa-code' },
    { text: 'Entities', icon: 'fa-solid fa-sitemap' },
    { text: 'Security', icon: 'fa-solid fa-lock' }
  ];

  private stateChangeSubject = new Subject<ActionsManagementState>();

  constructor() {
    super();
    this.setupStateManagement();
  }

  ngAfterViewInit(): void {
    this.emitStateChange();
  }

  ngOnDestroy(): void {
    this.stateChangeSubject.complete();
  }

  public onTabChange(tabId: string): void {
    this.activeTab = tabId;
    this.emitStateChange();
  }

  public onNavigationChange(event: Event): void {
    const target = event.target as HTMLElement;
    const index = Array.from(target.parentElement?.children || []).indexOf(target);
    if (index >= 0 && index < this.navigationItems.length) {
      this.activeTab = this.navigationItems[index];
      this.emitStateChange();
    }
  }

  private setupStateManagement(): void {
    this.stateChangeSubject.pipe(
      debounceTime(50)
    ).subscribe(state => {
      this.UserStateChanged.emit(state);
    });
  }

  private emitStateChange(): void {
    const state: ActionsManagementState = {
      activeTab: this.activeTab,
      subView: this.subView,
      actionsOverviewState: {},
      executionMonitoringState: {},
      scheduledActionsState: {},
      codeManagementState: {},
      entityIntegrationState: {},
      securityPermissionsState: {}
    };

    this.stateChangeSubject.next(state);
  }

  public loadUserState(state: Partial<ActionsManagementState>): void {
    if (state.activeTab) {
      this.activeTab = state.activeTab;
    }
    if (state.subView !== undefined) {
      this.subView = state.subView;
    }
  }

  public onOpenEntityRecord(data: {entityName: string; recordId: string} | Event): void {
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
      // Initialize actions management dashboard
    } catch (error) {
      console.error('Error initializing Actions Management dashboard:', error);
      this.Error.emit(new Error('Failed to initialize Actions Management dashboard. Please try again.'));
    } finally {
      this.isLoading = false;
    }
  }

  loadData(): void {
    // Load initial data for actions management
  }

  public getCurrentTabLabel(): string {
    const tabIndex = this.navigationItems.indexOf(this.activeTab);
    const labels = ['Overview', 'Execution', 'Scheduled', 'Code', 'Entities', 'Security'];
    return tabIndex >= 0 ? labels[tabIndex] : 'Actions Management';
  }

  // Sub-view navigation methods
  public showSubView(viewName: string): void {
    this.subView = viewName;
    this.emitStateChange();
  }

  public hideSubView(): void {
    this.subView = null;
    this.emitStateChange();
  }

  public onBackToOverview(): void {
    this.hideSubView();
  }

  // Handle sub-view requests from child components
  public onShowActionsListView(): void {
    this.showSubView('actions-list');
  }

  public onShowExecutionsListView(): void {
    this.showSubView('executions-list');
  }

  public onShowCategoriesListView(): void {
    this.showSubView('categories-list');
  }
}

export function LoadActionsManagementDashboard() {
  // Prevents tree-shaking
}