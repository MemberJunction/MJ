import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { BaseDashboard } from '../generic/base-dashboard';
import { RegisterClass } from '@memberjunction/global';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { SharedService } from '@memberjunction/ng-shared';

interface SchedulingDashboardState {
  activeTab: string;
  monitoringState: any;
  jobsState: any;
  historyState: any;
  typesState: any;
  healthState: any;
}

@Component({
  selector: 'mj-scheduling-dashboard',
  templateUrl: './scheduling-dashboard.component.html',
  styleUrls: ['./scheduling-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
@RegisterClass(BaseDashboard, 'SchedulingDashboard')
export class SchedulingDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
  public isLoading = false;
  public activeTab = 'monitoring';
  public selectedIndex = 0;

  // Component states
  public monitoringState: any = null;
  public jobsState: any = null;
  public historyState: any = null;
  public typesState: any = null;
  public healthState: any = null;

  // Track visited tabs for lazy loading
  private visitedTabs = new Set<string>();

  // Navigation items
  public navigationItems: string[] = ['monitoring', 'jobs', 'history', 'types', 'health'];

  public navigationConfig = [
    { text: 'Monitor', icon: 'fa-solid fa-chart-line', selected: false },
    { text: 'Jobs', icon: 'fa-solid fa-calendar-alt', selected: false },
    { text: 'History', icon: 'fa-solid fa-history', selected: false },
    { text: 'Types', icon: 'fa-solid fa-cogs', selected: false },
    { text: 'Health', icon: 'fa-solid fa-heartbeat', selected: false }
  ];

  private stateChangeSubject = new Subject<SchedulingDashboardState>();

  constructor(private cdr: ChangeDetectorRef) {
    super();
    this.setupStateManagement();
    this.updateNavigationSelection();
  }

  ngAfterViewInit(): void {
    this.visitedTabs.add(this.activeTab);
    this.updateNavigationSelection();
    this.emitStateChange();
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.stateChangeSubject.complete();
  }

  public onTabChange(tabId: string): void {
    this.activeTab = tabId;
    const index = this.navigationItems.indexOf(tabId);

    this.selectedIndex = index >= 0 ? index : 0;
    this.updateNavigationSelection();

    setTimeout(() => {
      SharedService.Instance.InvokeManualResize();
    }, 100);

    this.visitedTabs.add(tabId);
    this.emitStateChange();
    this.cdr.markForCheck();
  }

  public hasVisited(tabId: string): boolean {
    return this.visitedTabs.has(tabId);
  }

  private setupStateManagement(): void {
    this.stateChangeSubject.pipe(
      debounceTime(50)
    ).subscribe(state => {
      this.UserStateChanged.emit(state);
    });
  }

  private emitStateChange(): void {
    const state: SchedulingDashboardState = {
      activeTab: this.activeTab,
      monitoringState: this.monitoringState || {},
      jobsState: this.jobsState || {},
      historyState: this.historyState || {},
      typesState: this.typesState || {},
      healthState: this.healthState || {}
    };

    this.stateChangeSubject.next(state);
  }

  public onMonitoringStateChange(state: any): void {
    this.monitoringState = state;
    this.emitStateChange();
  }

  public onJobsStateChange(state: any): void {
    this.jobsState = state;
    this.emitStateChange();
  }

  public onHistoryStateChange(state: any): void {
    this.historyState = state;
    this.emitStateChange();
  }

  public onTypesStateChange(state: any): void {
    this.typesState = state;
    this.emitStateChange();
  }

  public onHealthStateChange(state: any): void {
    this.healthState = state;
    this.emitStateChange();
  }

  public loadUserState(state: Partial<SchedulingDashboardState>): void {
    if (state.activeTab) {
      this.activeTab = state.activeTab;
      const index = this.navigationItems.indexOf(state.activeTab);
      this.selectedIndex = index >= 0 ? index : 0;
      this.visitedTabs.add(state.activeTab);
      this.updateNavigationSelection();
    }

    if (state.monitoringState) this.monitoringState = state.monitoringState;
    if (state.jobsState) this.jobsState = state.jobsState;
    if (state.historyState) this.historyState = state.historyState;
    if (state.typesState) this.typesState = state.typesState;
    if (state.healthState) this.healthState = state.healthState;

    this.cdr.markForCheck();
  }

  initDashboard(): void {
    try {
      this.isLoading = true;
    } catch (error) {
      console.error('Error initializing Scheduling dashboard:', error);
      this.Error.emit(new Error('Failed to initialize Scheduling dashboard. Please try again.'));
    } finally {
      this.isLoading = false;
    }
  }

  loadData(): void {
    if (this.Config?.userState) {
      setTimeout(() => {
        if (this.Config?.userState) {
          this.loadUserState(this.Config.userState);
        }
      }, 0);
    }

    this.LoadingComplete.emit();
  }

  public getCurrentTabLabel(): string {
    const tabIndex = this.navigationItems.indexOf(this.activeTab);
    const labels = ['Monitor', 'Jobs', 'History', 'Types', 'Health'];
    return tabIndex >= 0 ? labels[tabIndex] : 'Scheduling Management';
  }

  private updateNavigationSelection(): void {
    this.navigationConfig.forEach((item, index) => {
      item.selected = this.navigationItems[index] === this.activeTab;
    });
  }
}

export function LoadSchedulingDashboard() {
  // Prevents tree-shaking
}
