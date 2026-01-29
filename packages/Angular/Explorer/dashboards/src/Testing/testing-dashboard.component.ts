import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ResourceData } from '@memberjunction/core-entities';

interface TestingDashboardState {
  activeTab: string;
  dashboardState: Record<string, unknown>;
  runsState: Record<string, unknown>;
  analyticsState: Record<string, unknown>;
  reviewState: Record<string, unknown>;
}

@Component({
  selector: 'mj-testing-dashboard',
  templateUrl: './testing-dashboard.component.html',
  styleUrls: ['./testing-dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
@RegisterClass(BaseDashboard, 'TestingDashboard')
export class TestingDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {

  public isLoading = false;
  public activeTab = 'dashboard';
  public selectedIndex = 0;

  // Component states
  public dashboardState: Record<string, unknown> | null = null;
  public runsState: Record<string, unknown> | null = null;
  public analyticsState: Record<string, unknown> | null = null;
  public reviewState: Record<string, unknown> | null = null;

  // Track visited tabs for lazy loading
  private visitedTabs = new Set<string>();

  // Navigation items
  public navigationItems: string[] = ['dashboard', 'runs', 'analytics', 'review'];

  public navigationConfig = [
    { text: 'Dashboard', icon: 'fa-solid fa-gauge-high', selected: false },
    { text: 'Runs', icon: 'fa-solid fa-play-circle', selected: false },
    { text: 'Analytics', icon: 'fa-solid fa-chart-bar', selected: false },
    { text: 'Review', icon: 'fa-solid fa-clipboard-check', selected: false }
  ];

  private stateChangeSubject = new Subject<TestingDashboardState>();

  constructor(private cdr: ChangeDetectorRef) {
    super();
    this.setupStateManagement();
    this.updateNavigationSelection();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Testing';
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
    const state: TestingDashboardState = {
      activeTab: this.activeTab,
      dashboardState: (this.dashboardState || {}) as Record<string, unknown>,
      runsState: (this.runsState || {}) as Record<string, unknown>,
      analyticsState: (this.analyticsState || {}) as Record<string, unknown>,
      reviewState: (this.reviewState || {}) as Record<string, unknown>
    };

    this.stateChangeSubject.next(state);
  }

  public onDashboardStateChange(state: Record<string, unknown>): void {
    this.dashboardState = state;
    this.emitStateChange();
  }

  public onRunsStateChange(state: Record<string, unknown>): void {
    this.runsState = state;
    this.emitStateChange();
  }

  public onAnalyticsStateChange(state: Record<string, unknown>): void {
    this.analyticsState = state;
    this.emitStateChange();
  }

  public onReviewStateChange(state: Record<string, unknown>): void {
    this.reviewState = state;
    this.emitStateChange();
  }

  public loadUserState(state: Partial<TestingDashboardState>): void {
    if (state.activeTab) {
      this.activeTab = state.activeTab;
      const index = this.navigationItems.indexOf(state.activeTab);
      this.selectedIndex = index >= 0 ? index : 0;
      this.visitedTabs.add(state.activeTab);
      this.updateNavigationSelection();
    }

    if (state.dashboardState) this.dashboardState = state.dashboardState;
    if (state.runsState) this.runsState = state.runsState;
    if (state.analyticsState) this.analyticsState = state.analyticsState;
    if (state.reviewState) this.reviewState = state.reviewState;

    this.cdr.markForCheck();
  }

  initDashboard(): void {
    try {
      this.isLoading = true;
    } catch (error) {
      console.error('Error initializing Testing dashboard:', error);
      this.Error.emit(new Error('Failed to initialize Testing dashboard. Please try again.'));
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

    this.NotifyLoadComplete();
  }

  public getCurrentTabLabel(): string {
    const tabIndex = this.navigationItems.indexOf(this.activeTab);
    return tabIndex >= 0 ? this.navigationConfig[tabIndex].text : 'Testing Dashboard';
  }

  private updateNavigationSelection(): void {
    this.navigationConfig.forEach((item, index) => {
      item.selected = this.navigationItems[index] === this.activeTab;
    });
  }
}

export function LoadTestingDashboard() {
  // Prevents tree-shaking
}
