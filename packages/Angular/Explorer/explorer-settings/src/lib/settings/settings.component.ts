import { Component, OnInit, OnDestroy, EventEmitter, Output } from '@angular/core';
import { Location } from '@angular/common';
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

export interface SearchableItem {
  id: string;
  tabId: string;
  sectionId?: string;
  label: string;
  keywords: string[];
  description?: string;
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

  // Search state
  public filteredTabs: SettingsTab[] = [];
  public searchResults: SearchableItem[] = [];
  public isSearching = false;
  public showSearchResults = false;

  // Tab configuration
  public tabs: SettingsTab[] = [
    {
      id: 'general',
      label: 'General',
      icon: 'fa-solid fa-cog',
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

  // Searchable content registry
  private searchableItems: SearchableItem[] = [
    // General tab
    {
      id: 'profile',
      tabId: 'general',
      sectionId: 'profile',
      label: 'Profile Information',
      keywords: ['profile', 'avatar', 'picture', 'photo', 'name', 'user', 'image', 'account'],
      description: 'Manage your profile picture and account information'
    },
    {
      id: 'preferences',
      tabId: 'general',
      sectionId: 'preferences',
      label: 'Preferences',
      keywords: ['preferences', 'settings', 'display', 'theme', 'appearance', 'layout'],
      description: 'Customize your experience with display and behavior preferences'
    },
    {
      id: 'notifications',
      tabId: 'general',
      sectionId: 'notifications',
      label: 'Notifications',
      keywords: ['notifications', 'alerts', 'email', 'push', 'messages', 'inbox'],
      description: 'Configure how and when you receive notifications'
    },
    // Users tab
    {
      id: 'users',
      tabId: 'users',
      label: 'User Management',
      keywords: ['users', 'accounts', 'members', 'people', 'employees', 'team', 'manage users', 'add user', 'delete user'],
      description: 'Manage user accounts, roles, and permissions'
    },
    // Roles tab
    {
      id: 'roles',
      tabId: 'roles',
      label: 'Role Management',
      keywords: ['roles', 'permissions', 'security', 'access', 'groups', 'authorization', 'admin', 'moderator'],
      description: 'Define and manage security roles'
    },
    // Applications tab
    {
      id: 'applications',
      tabId: 'applications',
      label: 'Applications',
      keywords: ['applications', 'apps', 'modules', 'entities', 'navigation', 'menu'],
      description: 'Configure application settings and entity associations'
    },
    // Permissions tab
    {
      id: 'permissions',
      tabId: 'permissions',
      label: 'Entity Permissions',
      keywords: ['permissions', 'entities', 'access', 'crud', 'security', 'read', 'write', 'delete', 'create'],
      description: 'Manage entity-level permissions and access control'
    },
    // Advanced tab - SQL Logging
    {
      id: 'sql-logging',
      tabId: 'advanced',
      sectionId: 'sql-logging',
      label: 'SQL Logging',
      keywords: ['sql', 'logging', 'database', 'queries', 'debug', 'performance', 'trace', 'monitor'],
      description: 'Monitor and debug SQL queries'
    },
    // Advanced tab - Performance
    {
      id: 'performance',
      tabId: 'advanced',
      sectionId: 'performance',
      label: 'Performance',
      keywords: ['performance', 'speed', 'optimization', 'monitoring', 'metrics', 'cache'],
      description: 'Performance monitoring and optimization tools'
    },
    // Advanced tab - Developer
    {
      id: 'developer',
      tabId: 'advanced',
      sectionId: 'developer',
      label: 'Developer Tools',
      keywords: ['developer', 'tools', 'debug', 'api', 'code', 'testing', 'console'],
      description: 'Advanced developer options and debugging tools'
    }
  ];

  // Section expansion state
  public expandedSections: string[] = ['profile', 'preferences'];

  // Mobile state
  public isMobile = window.innerWidth < 768;
  public isMobileNavOpen = false;

  private destroy$ = new Subject<void>();

  constructor(private location: Location) {
    // Listen for window resize
    super();
    window.addEventListener('resize', this.handleResize.bind(this));
  }

  ngOnInit(): void {
    // Initialize filtered tabs with all tabs
    this.filteredTabs = [...this.tabs];
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
        debounceTime(200),
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

  /**
   * Filters searchable content based on search term
   * Matches against labels, keywords, and descriptions
   */
  private filterContent(term: string): void {
    if (!term || term.trim() === '') {
      this.showSearchResults = false;
      this.searchResults = [];
      this.filteredTabs = [...this.tabs];
      return;
    }

    const searchLower = term.toLowerCase().trim();
    this.isSearching = true;

    // Filter searchable items
    this.searchResults = this.searchableItems.filter(item => {
      const matchesLabel = item.label.toLowerCase().includes(searchLower);
      const matchesKeywords = item.keywords.some(kw => kw.toLowerCase().includes(searchLower));
      const matchesDescription = item.description?.toLowerCase().includes(searchLower) || false;
      return matchesLabel || matchesKeywords || matchesDescription;
    });

    // Get unique tabs that have matching results
    const matchingTabIds = new Set(this.searchResults.map(r => r.tabId));
    this.filteredTabs = this.tabs.filter(tab => matchingTabIds.has(tab.id));

    this.showSearchResults = true;
    this.isSearching = false;
  }

  /**
   * Navigates to a search result
   * Switches to the correct tab and expands the relevant section
   */
  public navigateToSearchResult(result: SearchableItem): void {
    this.activeTab = result.tabId;

    // If it's a section within a tab, expand it
    if (result.sectionId && !this.expandedSections.includes(result.sectionId)) {
      this.expandedSections.push(result.sectionId);
    }

    // If advanced tab, set the sub-tab
    if (result.tabId === 'advanced' && result.sectionId) {
      this.advancedActiveTab = result.sectionId;
    }

    // Clear search after navigation
    this.clearSearch();
    this.emitStateChange();
  }

  /**
   * Clears the search and resets the view
   */
  public clearSearch(): void {
    this.searchTerm$.next('');
    this.showSearchResults = false;
    this.searchResults = [];
    this.filteredTabs = [...this.tabs];
  }

  /**
   * Toggles the mobile navigation rail open/closed
   */
  public toggleMobileNav(): void {
    this.isMobileNavOpen = !this.isMobileNavOpen;
  }

  /**
   * Closes the mobile navigation rail
   */
  public closeMobileNav(): void {
    this.isMobileNavOpen = false;
  }

  /**
   * Closes the settings page and navigates back
   */
  public closeSettings(): void {
    this.location.back();
  }

  /**
   * Handles tab change on mobile and closes the nav rail
   */
  public onMobileTabChange(tabId: string): void {
    this.onTabChange(tabId);
    this.closeMobileNav();
  }

  private handleResize(): void {
    this.isMobile = window.innerWidth < 768;
    // Close mobile nav on resize to desktop
    if (!this.isMobile) {
      this.isMobileNavOpen = false;
    }
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

  /**
   * Gets the icon for a tab by its ID
   */
  public getTabIconById(tabId: string): string {
    const tab = this.tabs.find(t => t.id === tabId);
    return tab?.icon || 'fa-solid fa-cog';
  }

  /**
   * Gets the label for a tab by its ID
   */
  public getTabLabelById(tabId: string): string {
    const tab = this.tabs.find(t => t.id === tabId);
    return tab?.label || tabId;
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
