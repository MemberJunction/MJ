import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { SharedService } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { SchedulingInstrumentationService } from './services/scheduling-instrumentation.service';

interface SchedulingDashboardState {
  activeTab: string;
  dashboardState: Record<string, unknown>;
  jobsState: Record<string, unknown>;
  activityState: Record<string, unknown>;
}

@Component({
  standalone: false,
  selector: 'mj-scheduling-dashboard',
  templateUrl: './scheduling-dashboard.component.html',
  styleUrls: ['./scheduling-dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
@RegisterClass(BaseDashboard, 'SchedulingDashboard')
export class SchedulingDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
  public IsLoading = false;
  public ActiveTab = 'dashboard';

  public DashboardState: Record<string, unknown> = {};
  public JobsState: Record<string, unknown> = {};
  public ActivityState: Record<string, unknown> = {};

  private visitedTabs = new Set<string>();
  private stateChangeSubject = new Subject<SchedulingDashboardState>();

  public ActiveJobCount = 0;
  public AlertCount = 0;

  private kpiSub: Subscription | undefined;
  private alertSub: Subscription | undefined;

  public NavigationItems = [
    { id: 'dashboard', text: 'Dashboard', icon: 'fa-solid fa-gauge-high' },
    { id: 'jobs', text: 'Jobs', icon: 'fa-solid fa-calendar-check' },
    { id: 'activity', text: 'Activity', icon: 'fa-solid fa-clock-rotate-left' }
  ];

  constructor(
    private cdr: ChangeDetectorRef,
    private schedulingService: SchedulingInstrumentationService
  ) {
    super();
    this.setupStateManagement();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Scheduling';
  }

  ngAfterViewInit(): void {
    this.visitedTabs.add(this.ActiveTab);
    this.loadSidebarCounts();
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.stateChangeSubject.complete();
    if (this.kpiSub) this.kpiSub.unsubscribe();
    if (this.alertSub) this.alertSub.unsubscribe();
  }

  private loadSidebarCounts(): void {
    this.kpiSub = this.schedulingService.kpis$.subscribe(kpis => {
      this.ActiveJobCount = kpis.totalActiveJobs;
      this.cdr.markForCheck();
    });

    this.alertSub = this.schedulingService.alerts$.subscribe(alerts => {
      this.AlertCount = alerts.length;
      this.cdr.markForCheck();
    });
  }

  public OnTabChange(tabId: string): void {
    this.ActiveTab = tabId;
    this.visitedTabs.add(tabId);

    setTimeout(() => {
      SharedService.Instance.InvokeManualResize();
    }, 100);

    this.emitStateChange();
    this.cdr.markForCheck();
  }

  public HasVisited(tabId: string): boolean {
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
    this.stateChangeSubject.next({
      activeTab: this.ActiveTab,
      dashboardState: this.DashboardState,
      jobsState: this.JobsState,
      activityState: this.ActivityState
    });
  }

  public OnDashboardStateChange(state: Record<string, unknown>): void {
    this.DashboardState = state;
    this.emitStateChange();
  }

  public OnJobsStateChange(state: Record<string, unknown>): void {
    this.JobsState = state;
    this.emitStateChange();
  }

  public OnActivityStateChange(state: Record<string, unknown>): void {
    this.ActivityState = state;
    this.emitStateChange();
  }

  public GetCurrentTabLabel(): string {
    const item = this.NavigationItems.find(n => n.id === this.ActiveTab);
    return item ? item.text : 'Scheduling';
  }

  initDashboard(): void {
    this.IsLoading = false;
  }

  loadData(): void {
    if (this.Config?.userState) {
      const state = this.Config.userState as Partial<SchedulingDashboardState>;
      if (state.activeTab) {
        this.ActiveTab = state.activeTab;
        this.visitedTabs.add(state.activeTab);
      }
      if (state.dashboardState) this.DashboardState = state.dashboardState;
      if (state.jobsState) this.JobsState = state.jobsState;
      if (state.activityState) this.ActivityState = state.activityState;
      this.cdr.markForCheck();
    }
    this.NotifyLoadComplete();
  }
}
