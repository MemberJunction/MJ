import { Component, OnInit, OnDestroy, EventEmitter, Output } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { BaseNavigationComponent } from '@memberjunction/ng-shared';

export interface SettingsTab {
  id: string;
  label: string;
  icon: string;
  component?: unknown;
  badgeCount?: number;
  badgeColor?: 'primary' | 'danger' | 'warning' | 'success';
}

export interface SettingsComponentState {
  activeTab: string;
  searchTerm: string;
  expandedSections: string[];
}

@Component({
  selector: 'mj-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
@RegisterClass(BaseNavigationComponent, 'Settings')
export class SettingsComponent extends BaseNavigationComponent implements OnInit, OnDestroy {
  @Output() stateChange = new EventEmitter<SettingsComponentState>();

  // State management
  public activeTab = 'general';
  public advancedActiveTab = 'sql-logging';
  public searchTerm$ = new BehaviorSubject<string>('');
  public isLoading = false;
  public error: string | null = null;
  
  // Tab configuration
  public tabs: SettingsTab[] = [
    {
      id: 'general',
      label: 'General',
      icon: 'fa-solid fa-cog',
      badgeCount: 0
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: 'fa-solid fa-bell',
      badgeCount: 0
    },
    {
      id: 'users',
      label: 'Users',
      icon: 'fa-solid fa-users',
      badgeCount: 0
    },
    {
      id: 'roles',
      label: 'Roles',
      icon: 'fa-solid fa-shield-halved',
      badgeCount: 0
    },
    {
      id: 'applications',
      label: 'Applications',
      icon: 'fa-solid fa-th-large',
      badgeCount: 0
    },
    {
      id: 'permissions',
      label: 'Permissions',
      icon: 'fa-solid fa-lock',
      badgeCount: 0
    },
    {
      id: 'advanced',
      label: 'Advanced',
      icon: 'fa-solid fa-flask',
      badgeCount: 1,
      badgeColor: 'warning'
    }
  ];

  // Section expansion state
  public expandedSections: string[] = ['profile', 'preferences'];
  
  // Mobile state
  public isMobile = window.innerWidth < 768;
  
  private destroy$ = new Subject<void>();

  constructor() {
    // Listen for window resize
    super();
    window.addEventListener('resize', this.handleResize.bind(this));
  }

  ngOnInit(): void {
    this.setupSearchFilter();
    this.loadInitialData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    window.removeEventListener('resize', this.handleResize.bind(this));
  }

  private setupSearchFilter(): void {
    this.searchTerm$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(term => {
        this.filterContent(term);
        this.emitStateChange();
      });
  }

  public async loadInitialData(): Promise<void> {
    try {
      this.isLoading = true;
      // TODO: Load user settings, roles, applications data
      await this.simulateDataLoad();
      this.isLoading = false;
    } catch (error) {
      this.error = 'Failed to load settings data';
      this.isLoading = false;
    }
  }

  private async simulateDataLoad(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 500));
  }

  public onTabChange(tabId: string): void {
    this.activeTab = tabId;
    this.emitStateChange();
  }

  public onSearchChange(event: Event): void {
    const term = (event.target as HTMLInputElement).value;
    this.searchTerm$.next(term);
  }

  public toggleSection(sectionId: string): void {
    const index = this.expandedSections.indexOf(sectionId);
    if (index === -1) {
      this.expandedSections.push(sectionId);
    } else {
      this.expandedSections.splice(index, 1);
    }
    this.emitStateChange();
  }

  public isSectionExpanded(sectionId: string): boolean {
    return this.expandedSections.includes(sectionId);
  }

  public setAdvancedTab(tabId: string): void {
    this.advancedActiveTab = tabId;
  }

  private filterContent(term: string): void {
    // TODO: Implement content filtering based on search term
    console.log('Filtering content with term:', term);
  }

  private handleResize(): void {
    this.isMobile = window.innerWidth < 768;
  }

  private emitStateChange(): void {
    const state: SettingsComponentState = {
      activeTab: this.activeTab,
      searchTerm: this.searchTerm$.value,
      expandedSections: [...this.expandedSections]
    };
    this.stateChange.emit(state);
  }

  public loadUserState(state: Partial<SettingsComponentState>): void {
    if (state.activeTab) {
      this.activeTab = state.activeTab;
    }
    if (state.searchTerm !== undefined) {
      this.searchTerm$.next(state.searchTerm);
    }
    if (state.expandedSections) {
      this.expandedSections = [...state.expandedSections];
    }
  }

  public getTabIcon(tab: SettingsTab): string {
    return tab.icon;
  }

  public getTabClass(tab: SettingsTab): string {
    const classes = ['settings-tab'];
    if (this.activeTab === tab.id) {
      classes.push('active');
    }
    if (tab.badgeCount && tab.badgeCount > 0) {
      classes.push('has-badge');
    }
    return classes.join(' ');
  }
}