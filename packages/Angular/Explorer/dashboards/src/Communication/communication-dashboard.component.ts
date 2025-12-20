import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { SharedService } from '@memberjunction/ng-shared';

interface CommunicationDashboardState {
    activeTab: string;
}

@Component({
    selector: 'mj-communication-dashboard',
    templateUrl: './communication-dashboard.component.html',
    styleUrls: ['./communication-dashboard.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
@RegisterClass(BaseDashboard, 'CommunicationDashboard')
export class CommunicationDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
    public isLoading = false;
    public activeTab = 'monitor';
    public selectedIndex = 0;

    // Track visited tabs for lazy loading
    private visitedTabs = new Set<string>();

    // Navigation items
    public navigationItems: string[] = ['monitor', 'logs', 'providers', 'runs'];

    public navigationConfig = [
        { text: 'Monitor', icon: 'fa-solid fa-chart-line', selected: false },
        { text: 'Logs', icon: 'fa-solid fa-list-ul', selected: false },
        { text: 'Providers', icon: 'fa-solid fa-server', selected: false },
        { text: 'Runs', icon: 'fa-solid fa-play', selected: false }
    ];

    private stateChangeSubject = new Subject<CommunicationDashboardState>();

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
            this.updateNavigationSelection();
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

        this.LoadingComplete.emit();
    }

    public getCurrentTabLabel(): string {
        const tabIndex = this.navigationItems.indexOf(this.activeTab);
        const labels = ['Monitor', 'Logs', 'Providers', 'Runs'];
        return tabIndex >= 0 ? labels[tabIndex] : 'Communication Management';
    }

    private updateNavigationSelection(): void {
        this.navigationConfig.forEach((item, index) => {
            item.selected = this.navigationItems[index] === this.activeTab;
        });
    }
}

export function LoadCommunicationDashboard() {
    // Prevents tree-shaking
}
