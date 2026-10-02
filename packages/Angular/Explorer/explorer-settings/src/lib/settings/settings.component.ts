import { Component, OnInit, OnDestroy, EventEmitter, Output, ChangeDetectorRef, NgZone } from '@angular/core';
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
  disabled?: boolean;
  description?: string;
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
  standalone: false,
  selector: 'mj-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
@RegisterClass(BaseNavigationComponent, 'Settings')
export class SettingsComponent extends BaseNavigationComponent implements OnInit, OnDestroy {
  @Output() StateChange = new EventEmitter<SettingsComponentState>();

  /**
   * @deprecated Use {@link StateChange}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (stateChange) keeps working. Must stay AFTER StateChange: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() stateChange = this.StateChange;

  // State management
  public ActiveTab = 'general';

  /** @deprecated Use {@link ActiveTab}. */
  public get activeTab() {
    return this.ActiveTab;
  }
  /** @deprecated Use {@link ActiveTab}. */
  public set activeTab(value) {
    this.ActiveTab = value;
  }
  public SearchTerm$ = new BehaviorSubject<string>('');

  /** @deprecated Use {@link SearchTerm$}. */
  public get searchTerm$() {
    return this.SearchTerm$;
  }
  /** @deprecated Use {@link SearchTerm$}. */
  public set searchTerm$(value) {
    this.SearchTerm$ = value;
  }
  public isLoading = false;
  public error: string | null = null;

  // Search state
  public FilteredTabs: SettingsTab[] = [];

  /** @deprecated Use {@link FilteredTabs}. */
  public get filteredTabs(): SettingsTab[] {
    return this.FilteredTabs;
  }
  /** @deprecated Use {@link FilteredTabs}. */
  public set filteredTabs(value: SettingsTab[]) {
    this.FilteredTabs = value;
  }
  public SearchResults: SearchableItem[] = [];

  /** @deprecated Use {@link SearchResults}. */
  public get searchResults(): SearchableItem[] {
    return this.SearchResults;
  }
  /** @deprecated Use {@link SearchResults}. */
  public set searchResults(value: SearchableItem[]) {
    this.SearchResults = value;
  }
  public IsSearching = false;

  /** @deprecated Use {@link IsSearching}. */
  public get isSearching() {
    return this.IsSearching;
  }
  /** @deprecated Use {@link IsSearching}. */
  public set isSearching(value) {
    this.IsSearching = value;
  }
  public ShowSearchResults = false;

  /** @deprecated Use {@link ShowSearchResults}. */
  public get showSearchResults() {
    return this.ShowSearchResults;
  }
  /** @deprecated Use {@link ShowSearchResults}. */
  public set showSearchResults(value) {
    this.ShowSearchResults = value;
  }

  // Tab configuration - User-focused tabs only
  public Tabs: SettingsTab[] = [
    {
      id: 'general',
      label: 'General',
      icon: 'fa-solid fa-user',
      description: 'Profile and account information'
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: 'fa-solid fa-bell',
      description: 'Notification preferences and delivery channels'
    },
    {
      id: 'applications',
      label: 'Applications',
      icon: 'fa-solid fa-th-large',
      description: 'Manage visible applications and ordering'
    },
    {
      id: 'appearance',
      label: 'Appearance',
      icon: 'fa-solid fa-palette',
      description: 'Theme and display settings',
      disabled: true
    }
  ];

  /** @deprecated Use {@link Tabs}. */
  public get tabs(): SettingsTab[] {
    return this.Tabs;
  }
  /** @deprecated Use {@link Tabs}. */
  public set tabs(value: SettingsTab[]) {
    this.Tabs = value;
  }

  // Searchable content registry - User settings only
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
      id: 'account',
      tabId: 'general',
      sectionId: 'account',
      label: 'Account Information',
      keywords: ['account', 'email', 'role', 'login', 'status', 'type'],
      description: 'View your account details and status'
    },
    // Notifications tab
    {
      id: 'notifications',
      tabId: 'notifications',
      sectionId: 'notifications',
      label: 'Notification Preferences',
      keywords: ['notifications', 'alerts', 'email', 'sms', 'in-app', 'messages'],
      description: 'Configure how and when you receive notifications'
    },
    // Applications tab
    {
      id: 'applications',
      tabId: 'applications',
      sectionId: 'applications',
      label: 'MJ: Application Settings',
      keywords: ['applications', 'apps', 'switcher', 'order', 'visibility', 'menu'],
      description: 'Choose which applications appear in your app switcher'
    },
    // Appearance tab
    {
      id: 'appearance',
      tabId: 'appearance',
      sectionId: 'appearance',
      label: 'Appearance Settings',
      keywords: ['appearance', 'theme', 'dark', 'light', 'display', 'font', 'density'],
      description: 'Customize how the application looks'
    }
  ];

  // Section expansion state
  public ExpandedSections: string[] = ['profile', 'account'];

  /** @deprecated Use {@link ExpandedSections}. */
  public get expandedSections(): string[] {
    return this.ExpandedSections;
  }
  /** @deprecated Use {@link ExpandedSections}. */
  public set expandedSections(value: string[]) {
    this.ExpandedSections = value;
  }

  // Mobile state
  public IsMobile = window.innerWidth < 768;

  /** @deprecated Use {@link IsMobile}. */
  public get isMobile() {
    return this.IsMobile;
  }
  /** @deprecated Use {@link IsMobile}. */
  public set isMobile(value) {
    this.IsMobile = value;
  }
  public IsMobileNavOpen = false;

  /** @deprecated Use {@link IsMobileNavOpen}. */
  public get isMobileNavOpen() {
    return this.IsMobileNavOpen;
  }
  /** @deprecated Use {@link IsMobileNavOpen}. */
  public set isMobileNavOpen(value) {
    this.IsMobileNavOpen = value;
  }

  private destroy$ = new Subject<void>();

  constructor(private location: Location, private cdr: ChangeDetectorRef, private ngZone: NgZone) {
    super();
    window.addEventListener('resize', this.handleResize.bind(this));
  }

  ngOnInit(): void {
    this.FilteredTabs = [...this.Tabs];
    this.setupSearchFilter();
    this.LoadInitialData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    window.removeEventListener('resize', this.handleResize.bind(this));
  }

  private setupSearchFilter(): void {
    this.SearchTerm$
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

  public async LoadInitialData(): Promise<void> {
    try {
      this.isLoading = true;
      await this.simulateDataLoad();
      this.ngZone.run(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      });
    } catch (error) {
      this.ngZone.run(() => {
        this.error = 'Failed to load settings data';
        this.isLoading = false;
        this.cdr.markForCheck();
      });
    }
  }

  /** @deprecated Use {@link LoadInitialData}. */
  public async loadInitialData(): Promise<void> {
    return this.LoadInitialData();
  }

  private async simulateDataLoad(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 300));
  }

  public OnTabChange(tabId: string): void {
    const tab = this.Tabs.find(t => t.id === tabId);
    if (tab?.disabled) {
      return; // Don't switch to disabled tabs
    }
    this.ActiveTab = tabId;
    this.emitStateChange();
  }

  /** @deprecated Use {@link OnTabChange}. */
  public onTabChange(tabId: string): void {
    return this.OnTabChange(tabId);
  }

  public OnSearchChange(event: Event): void {
    const term = (event.target as HTMLInputElement).value;
    this.SearchTerm$.next(term);
  }

  /** @deprecated Use {@link OnSearchChange}. */
  public onSearchChange(event: Event): void {
    return this.OnSearchChange(event);
  }

  public toggleSection(sectionId: string): void {
    const index = this.ExpandedSections.indexOf(sectionId);
    if (index === -1) {
      this.ExpandedSections.push(sectionId);
    } else {
      this.ExpandedSections.splice(index, 1);
    }
    this.emitStateChange();
  }

  public IsSectionExpanded(sectionId: string): boolean {
    return this.ExpandedSections.includes(sectionId);
  }

  /** @deprecated Use {@link IsSectionExpanded}. */
  public isSectionExpanded(sectionId: string): boolean {
    return this.IsSectionExpanded(sectionId);
  }

  /**
   * Filters searchable content based on search term
   */
  private filterContent(term: string): void {
    if (!term || term.trim() === '') {
      this.ShowSearchResults = false;
      this.SearchResults = [];
      this.FilteredTabs = [...this.Tabs];
      return;
    }

    const searchLower = term.toLowerCase().trim();
    this.IsSearching = true;

    // Filter searchable items
    this.SearchResults = this.searchableItems.filter(item => {
      const matchesLabel = item.label.toLowerCase().includes(searchLower);
      const matchesKeywords = item.keywords.some(kw => kw.toLowerCase().includes(searchLower));
      const matchesDescription = item.description?.toLowerCase().includes(searchLower) || false;
      return matchesLabel || matchesKeywords || matchesDescription;
    });

    // Get unique tabs that have matching results
    const matchingTabIds = new Set(this.SearchResults.map(r => r.tabId));
    this.FilteredTabs = this.Tabs.filter(tab => matchingTabIds.has(tab.id));

    this.ShowSearchResults = true;
    this.IsSearching = false;
  }

  /**
   * Navigates to a search result
   */
  public NavigateToSearchResult(result: SearchableItem): void {
    const tab = this.Tabs.find(t => t.id === result.tabId);
    if (tab?.disabled) {
      return; // Don't navigate to disabled tabs
    }

    this.ActiveTab = result.tabId;

    // Expand the section if applicable
    if (result.sectionId && !this.ExpandedSections.includes(result.sectionId)) {
      this.ExpandedSections.push(result.sectionId);
    }

    this.ClearSearch();
    this.emitStateChange();
  }

  /** @deprecated Use {@link NavigateToSearchResult}. */
  public navigateToSearchResult(result: SearchableItem): void {
    return this.NavigateToSearchResult(result);
  }

  /**
   * Clears the search and resets the view
   */
  public ClearSearch(): void {
    this.SearchTerm$.next('');
    this.ShowSearchResults = false;
    this.SearchResults = [];
    this.FilteredTabs = [...this.Tabs];
  }

  /** @deprecated Use {@link ClearSearch}. */
  public clearSearch(): void {
    return this.ClearSearch();
  }

  /**
   * Toggles the mobile navigation rail
   */
  public ToggleMobileNav(): void {
    this.IsMobileNavOpen = !this.IsMobileNavOpen;
  }

  /** @deprecated Use {@link ToggleMobileNav}. */
  public toggleMobileNav(): void {
    return this.ToggleMobileNav();
  }

  /**
   * Closes the mobile navigation rail
   */
  public CloseMobileNav(): void {
    this.IsMobileNavOpen = false;
  }

  /** @deprecated Use {@link CloseMobileNav}. */
  public closeMobileNav(): void {
    return this.CloseMobileNav();
  }

  /**
   * Closes the settings page and navigates back
   */
  public CloseSettings(): void {
    this.location.back();
  }

  /** @deprecated Use {@link CloseSettings}. */
  public closeSettings(): void {
    return this.CloseSettings();
  }

  /**
   * Handles tab change on mobile
   */
  public OnMobileTabChange(tabId: string): void {
    this.OnTabChange(tabId);
    this.CloseMobileNav();
  }

  /** @deprecated Use {@link OnMobileTabChange}. */
  public onMobileTabChange(tabId: string): void {
    return this.OnMobileTabChange(tabId);
  }

  private handleResize(): void {
    this.IsMobile = window.innerWidth < 768;
    if (!this.IsMobile) {
      this.IsMobileNavOpen = false;
    }
  }

  private emitStateChange(): void {
    const state: SettingsComponentState = {
      activeTab: this.ActiveTab,
      searchTerm: this.SearchTerm$.value,
      expandedSections: [...this.ExpandedSections]
    };
    this.StateChange.emit(state);
  }

  public LoadUserState(state: Partial<SettingsComponentState>): void {
    if (state.activeTab) {
      this.ActiveTab = state.activeTab;
    }
    if (state.searchTerm !== undefined) {
      this.SearchTerm$.next(state.searchTerm);
    }
    if (state.expandedSections) {
      this.ExpandedSections = [...state.expandedSections];
    }
  }

  /** @deprecated Use {@link LoadUserState}. */
  public loadUserState(state: Partial<SettingsComponentState>): void {
    return this.LoadUserState(state);
  }

  public GetTabIcon(tab: SettingsTab): string {
    return tab.icon;
  }

  /** @deprecated Use {@link GetTabIcon}. */
  public getTabIcon(tab: SettingsTab): string {
    return this.GetTabIcon(tab);
  }

  public GetTabClass(tab: SettingsTab): string {
    const classes = ['settings-tab'];
    if (this.ActiveTab === tab.id) {
      classes.push('active');
    }
    if (tab.disabled) {
      classes.push('disabled');
    }
    if (tab.badgeCount && tab.badgeCount > 0) {
      classes.push('has-badge');
    }
    return classes.join(' ');
  }

  /** @deprecated Use {@link GetTabClass}. */
  public getTabClass(tab: SettingsTab): string {
    return this.GetTabClass(tab);
  }

  public IsTabDisabled(tab: SettingsTab): boolean {
    return tab.disabled || false;
  }

  /** @deprecated Use {@link IsTabDisabled}. */
  public isTabDisabled(tab: SettingsTab): boolean {
    return this.IsTabDisabled(tab);
  }
}
