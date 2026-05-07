import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { ResourceData } from '@memberjunction/core-entities';
import { TestingDialogService, TestingExecutionService, ActiveRun } from '@memberjunction/ng-testing';
import { TestingInstrumentationService } from './services/testing-instrumentation.service';

interface TestingDashboardState {
  activeTab: string;
  dashboardState: Record<string, unknown>;
  runsState: Record<string, unknown>;
  analyticsState: Record<string, unknown>;
  reviewState: Record<string, unknown>;
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
  public activeTab = 'dashboard';
  public selectedIndex = 0;

  // Active test runs from execution service
  public ActiveRuns: ActiveRun[] = [];

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
  protected override destroy$ = new Subject<void>();

  constructor(
    private cdr: ChangeDetectorRef,
    public testingDialogService: TestingDialogService,
    private executionService: TestingExecutionService,
    private instrumentationService: TestingInstrumentationService
  ) {
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

    this.executionService.ActiveRuns$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(runs => {
      this.ActiveRuns = runs;
      this.cdr.markForCheck();
    });

    this.testingDialogService.PanelStateChanged$.pipe(
      takeUntil(this.destroy$)
    ).subscribe((isOpen) => {
      console.log('[TestingDashboard] PanelStateChanged$:', isOpen, 'IsPanelOpen:', this.testingDialogService.IsPanelOpen);
      this.cdr.detectChanges();
    });

    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.destroy$.next();
    this.destroy$.complete();
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
      this.instrumentationService.Provider = this.ProviderToUse;
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

  public OnPanelClosed(): void {
    this.testingDialogService.ClosePanel();
    this.cdr.markForCheck();
  }

  public OnViewActiveRun(run: ActiveRun): void {
    this.testingDialogService.OpenTestPanel(run.TestId);
    this.cdr.markForCheck();
  }

  public OnViewRunningTestFromTab(testId: string): void {
    this.testingDialogService.OpenTestPanel(testId);
    this.cdr.detectChanges();
  }

  private updateNavigationSelection(): void {
    this.navigationConfig.forEach((item, index) => {
      item.selected = this.navigationItems[index] === this.activeTab;
    });
  }
}
