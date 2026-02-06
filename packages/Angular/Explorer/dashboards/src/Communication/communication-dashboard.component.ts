import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { SharedService } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';

interface CommunicationDashboardState {
    activeTab: string;
}

@Component({
  standalone: false,
    selector: 'mj-communication-dashboard',
    templateUrl: './communication-dashboard.component.html',
    styleUrls: ['./communication-dashboard.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
@RegisterClass(BaseDashboard, 'CommunicationDashboard')
export class CommunicationDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
    public isLoading = false;
    public isRefreshing = false;
    public activeTab = 'monitor';
    public selectedIndex = 0;

    private visitedTabs = new Set<string>();
    public navigationItems: string[] = ['monitor', 'logs', 'providers', 'templates', 'runs', 'settings'];

    private stateChangeSubject = new Subject<CommunicationDashboardState>();

    constructor(private cdr: ChangeDetectorRef) {
        super();
        this.setupStateManagement();
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return "Communications";
    }

    ngAfterViewInit(): void {
        this.visitedTabs.add(this.activeTab);
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

    public onRefresh(): void {
        this.isRefreshing = true;
        this.cdr.markForCheck();
        setTimeout(() => {
            this.isRefreshing = false;
            this.cdr.markForCheck();
        }, 1000);
    }

    private setupStateManagement(): void {
        this.stateChangeSubject.pipe(
            debounceTime(50)
        ).subscribe(state => {
            this.UserStateChanged.emit(state);
        });
    }

    private emitStateChange(): void {
        const state: CommunicationDashboardState = {
            activeTab: this.activeTab
        };
        this.stateChangeSubject.next(state);
    }

    public loadUserState(state: Partial<CommunicationDashboardState>): void {
        if (state.activeTab) {
            this.activeTab = state.activeTab;
            const index = this.navigationItems.indexOf(state.activeTab);
            this.selectedIndex = index >= 0 ? index : 0;
            this.visitedTabs.add(state.activeTab);
        }
        this.cdr.markForCheck();
    }

    initDashboard(): void {
        try {
            this.isLoading = true;
        } catch (error) {
            console.error('Error initializing Communication dashboard:', error);
            this.Error.emit(new Error('Failed to initialize Communication dashboard. Please try again.'));
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
        const labels = ['Monitor', 'Logs', 'Providers', 'Templates', 'Runs', 'Settings'];
        return tabIndex >= 0 ? labels[tabIndex] : 'Communication Management';
    }
}

export function LoadCommunicationDashboard() {
    // Prevents tree-shaking
}
