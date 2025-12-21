import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

interface TestingDashboardState {
  activeTab: string;
  overviewState: any;
  executionState: any;
  analyticsState: any;
  versionState: any;
  feedbackState: any;
}

@Component({
  standalone: false,
  selector: 'mj-testing-dashboard',
  templateUrl: './testing-dashboard.component.html',
  styleUrls: ['./testing-dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
@RegisterClass(BaseDashboard, 'TestingDashboard')
export class TestingDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {

  public isLoading = false;
  public activeTab = 'overview';
  public selectedIndex = 0;

  // Component states
  public overviewState: any = null;
  public executionState: any = null;
  public analyticsState: any = null;
  public versionState: any = null;
  public feedbackState: any = null;

  // Track visited tabs for lazy loading
  private visitedTabs = new Set<string>();

  // Navigation items
  public navigationItems: string[] = ['overview', 'execution', 'analytics', 'version', 'feedback'];

  public navigationConfig = [
    { text: 'Overview', icon: 'fa-solid fa-chart-line', selected: false },
    { text: 'Execution', icon: 'fa-solid fa-play-circle', selected: false },
    { text: 'Analytics', icon: 'fa-solid fa-chart-bar', selected: false },
    { text: 'Version', icon: 'fa-solid fa-code-compare', selected: false },
    { text: 'Feedback', icon: 'fa-solid fa-clipboard-check', selected: false }
  ];

  private stateChangeSubject = new Subject<TestingDashboardState>();

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
      overviewState: this.overviewState || {},
      executionState: this.executionState || {},
      analyticsState: this.analyticsState || {},
      versionState: this.versionState || {},
      feedbackState: this.feedbackState || {}
    };

    this.stateChangeSubject.next(state);
  }

  public onOverviewStateChange(state: any): void {
    this.overviewState = state;
    this.emitStateChange();
  }

  public onExecutionStateChange(state: any): void {
    this.executionState = state;
    this.emitStateChange();
  }

  public onAnalyticsStateChange(state: any): void {
    this.analyticsState = state;
    this.emitStateChange();
  }

  public onVersionStateChange(state: any): void {
    this.versionState = state;
    this.emitStateChange();
  }

  public onFeedbackStateChange(state: any): void {
    this.feedbackState = state;
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

    if (state.overviewState) this.overviewState = state.overviewState;
    if (state.executionState) this.executionState = state.executionState;
    if (state.analyticsState) this.analyticsState = state.analyticsState;
    if (state.versionState) this.versionState = state.versionState;
    if (state.feedbackState) this.feedbackState = state.feedbackState;

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

    this.LoadingComplete.emit();
  }

  public getCurrentTabLabel(): string {
    const tabIndex = this.navigationItems.indexOf(this.activeTab);
    const labels = ['Overview', 'Execution', 'Analytics', 'Version', 'Feedback'];
    return tabIndex >= 0 ? labels[tabIndex] : 'Testing Dashboard';
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
