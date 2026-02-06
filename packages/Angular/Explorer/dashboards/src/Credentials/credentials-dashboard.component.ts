import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { SharedService } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RunView } from '@memberjunction/core';

interface CredentialsDashboardState {
    activeTab: string;
}

@Component({
  standalone: false,
    selector: 'mj-credentials-dashboard',
    templateUrl: './credentials-dashboard.component.html',
    styleUrls: ['./credentials-dashboard.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
@RegisterClass(BaseDashboard, 'CredentialsDashboard')
export class CredentialsDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
    public isLoading = false;
    public activeTab = 'overview';
    public selectedIndex = 0;

    // Counts for badges
    public credentialCount = 0;
    public typeCount = 0;

    // Track visited tabs for lazy loading
    private visitedTabs = new Set<string>();

    // Navigation items
    public navigationItems: string[] = ['overview', 'credentials', 'types', 'categories', 'audit'];

    public tabLabels: Record<string, string> = {
        'overview': 'Overview',
        'credentials': 'Credentials',
        'types': 'Credential Types',
        'categories': 'Categories',
        'audit': 'Audit Trail'
    };

    private stateChangeSubject = new Subject<CredentialsDashboardState>();

    constructor(private cdr: ChangeDetectorRef) {
        super();
        this.setupStateManagement();
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return "Credentials";
    }

    ngAfterViewInit(): void {
        this.visitedTabs.add(this.activeTab);
        this.loadCounts();
        this.emitStateChange();
        this.cdr.detectChanges();
    }

    ngOnDestroy(): void {
        this.stateChangeSubject.complete();
    }

    private async loadCounts(): Promise<void> {
        try {
            const rv = new RunView();

            // Load credential count
            const credResult = await rv.RunView({
                EntityName: 'MJ: Credentials',
                ExtraFilter: 'IsActive = 1',
                ResultType: 'count_only'
            });
            if (credResult.Success) {
                this.credentialCount = credResult.RowCount;
            }

            // Load type count
            const typeResult = await rv.RunView({
                EntityName: 'MJ: Credential Types',
                ResultType: 'count_only'
            });
            if (typeResult.Success) {
                this.typeCount = typeResult.RowCount;
            }

            this.cdr.markForCheck();
        } catch (error) {
            console.error('Error loading counts:', error);
        }
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

    private setupStateManagement(): void {
        this.stateChangeSubject.pipe(
            debounceTime(50)
        ).subscribe(state => {
            this.UserStateChanged.emit(state);
        });
    }

    private emitStateChange(): void {
        const state: CredentialsDashboardState = {
            activeTab: this.activeTab
        };

        this.stateChangeSubject.next(state);
    }

    public loadUserState(state: Partial<CredentialsDashboardState>): void {
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
            console.error('Error initializing Credentials dashboard:', error);
            this.Error.emit(new Error('Failed to initialize Credentials dashboard. Please try again.'));
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
        return this.tabLabels[this.activeTab] || 'Credential Management';
    }
}

export function LoadCredentialsDashboard() {
    // Prevents tree-shaking
}
