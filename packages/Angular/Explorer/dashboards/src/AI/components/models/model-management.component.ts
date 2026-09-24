import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { MJAIVendorEntity, MJAIModelTypeEntity, ResourceData, UserInfoEngine } from '@memberjunction/core-entities';
import { BaseEntity, BaseEntityEvent, Metadata, CompositeKey } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { SharedService, BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { RegisterClass, UUIDsEqual, MJGlobal, MJEventType } from '@memberjunction/global';
import { MJAIModelEntityExtended } from '@memberjunction/ai-core-plus';
import { FilterFieldConfig } from '@memberjunction/ng-ui-components';

interface ModelDisplayData extends MJAIModelEntityExtended {
  VendorName?: string;
  VendorID?: string; // Add this since we're using it for filtering
  ModelTypeName?: string;
  PowerRankDisplay?: string;
  SpeedRankDisplay?: string;
  CostRankDisplay?: string;
}

/**
 * User preferences for the Model Management dashboard
 */
interface ModelManagementUserPreferences {
  viewMode: 'grid' | 'list';
  showFilters: boolean;
  searchTerm: string;
  selectedVendor: string;
  selectedType: string;
  selectedStatus: string;
  sortBy: string;
  sortDirection: 'asc' | 'desc';
}

/**
 * AI Models Resource - displays AI model management
 * Extends BaseResourceComponent to work with the resource type system
 */
@RegisterClass(BaseResourceComponent, 'AIModelsResource')
@Component({
  standalone: false,
  selector: 'app-model-management',
  templateUrl: './model-management.component.html',
  styleUrls: ['./model-management.component.css']
})
export class ModelManagementComponent extends BaseResourceComponent implements OnInit, OnDestroy {

  // Settings persistence
  private readonly USER_SETTINGS_KEY = 'AI.Models.UserPreferences';
  private settingsPersistSubject = new Subject<void>();
  private settingsLoaded = false;

  // View state
  public ViewMode: 'grid' | 'list' = 'grid';

  /** @deprecated Use {@link ViewMode}. */
  public get viewMode(): 'grid' | 'list' {
    return this.ViewMode;
  }
  /** @deprecated Use {@link ViewMode}. */
  public set viewMode(value: 'grid' | 'list') {
    this.ViewMode = value;
  }
  public isLoading = true;
  public ShowFilters = true;

  /** @deprecated Use {@link ShowFilters}. */
  public get showFilters() {
    return this.ShowFilters;
  }
  /** @deprecated Use {@link ShowFilters}. */
  public set showFilters(value) {
    this.ShowFilters = value;
  }
  public ExpandedModelId: string | null = null;

  /** @deprecated Use {@link ExpandedModelId}. */
  public get expandedModelId(): string | null {
    return this.ExpandedModelId;
  }
  /** @deprecated Use {@link ExpandedModelId}. */
  public set expandedModelId(value: string | null) {
    this.ExpandedModelId = value;
  }

  // Data - Keep as MJAIModelEntityExtended to preserve getters
  public Models: MJAIModelEntityExtended[] = [];

  /** @deprecated Use {@link Models}. */
  public get models(): MJAIModelEntityExtended[] {
    return this.Models;
  }
  /** @deprecated Use {@link Models}. */
  public set models(value: MJAIModelEntityExtended[]) {
    this.Models = value;
  }
  public FilteredModels: MJAIModelEntityExtended[] = [];

  /** @deprecated Use {@link FilteredModels}. */
  public get filteredModels(): MJAIModelEntityExtended[] {
    return this.FilteredModels;
  }
  /** @deprecated Use {@link FilteredModels}. */
  public set filteredModels(value: MJAIModelEntityExtended[]) {
    this.FilteredModels = value;
  }
  public Vendors: MJAIVendorEntity[] = [];

  /** @deprecated Use {@link Vendors}. */
  public get vendors(): MJAIVendorEntity[] {
    return this.Vendors;
  }
  /** @deprecated Use {@link Vendors}. */
  public set vendors(value: MJAIVendorEntity[]) {
    this.Vendors = value;
  }
  public ModelTypes: MJAIModelTypeEntity[] = [];

  /** @deprecated Use {@link ModelTypes}. */
  public get modelTypes(): MJAIModelTypeEntity[] {
    return this.ModelTypes;
  }
  /** @deprecated Use {@link ModelTypes}. */
  public set modelTypes(value: MJAIModelTypeEntity[]) {
    this.ModelTypes = value;
  }

  // Filtering
  public SearchTerm = '';

  /** @deprecated Use {@link SearchTerm}. */
  public get searchTerm() {
    return this.SearchTerm;
  }
  /** @deprecated Use {@link SearchTerm}. */
  public set searchTerm(value) {
    this.SearchTerm = value;
  }
  private searchSubject = new BehaviorSubject<string>('');
  public SelectedVendor = 'all';

  /** @deprecated Use {@link SelectedVendor}. */
  public get selectedVendor() {
    return this.SelectedVendor;
  }
  /** @deprecated Use {@link SelectedVendor}. */
  public set selectedVendor(value) {
    this.SelectedVendor = value;
  }
  public SelectedType = 'all';

  /** @deprecated Use {@link SelectedType}. */
  public get selectedType() {
    return this.SelectedType;
  }
  /** @deprecated Use {@link SelectedType}. */
  public set selectedType(value) {
    this.SelectedType = value;
  }
  public SelectedStatus = 'all';

  /** @deprecated Use {@link SelectedStatus}. */
  public get selectedStatus() {
    return this.SelectedStatus;
  }
  /** @deprecated Use {@link SelectedStatus}. */
  public set selectedStatus(value) {
    this.SelectedStatus = value;
  }
  public PowerRankRange = { min: 0, max: 10 };

  /** @deprecated Use {@link PowerRankRange}. */
  public get powerRankRange() {
    return this.PowerRankRange;
  }
  /** @deprecated Use {@link PowerRankRange}. */
  public set powerRankRange(value) {
    this.PowerRankRange = value;
  }
  public SpeedRankRange = { min: 0, max: 10 };

  /** @deprecated Use {@link SpeedRankRange}. */
  public get speedRankRange() {
    return this.SpeedRankRange;
  }
  /** @deprecated Use {@link SpeedRankRange}. */
  public set speedRankRange(value) {
    this.SpeedRankRange = value;
  }
  public CostRankRange = { min: 0, max: 10 };

  /** @deprecated Use {@link CostRankRange}. */
  public get costRankRange() {
    return this.CostRankRange;
  }
  /** @deprecated Use {@link CostRankRange}. */
  public set costRankRange(value) {
    this.CostRankRange = value;
  }

  // Detail panel
  public SelectedModel: ModelDisplayData | null = null;

  /** @deprecated Use {@link SelectedModel}. */
  public get selectedModel(): ModelDisplayData | null {
    return this.SelectedModel;
  }
  /** @deprecated Use {@link SelectedModel}. */
  public set selectedModel(value: ModelDisplayData | null) {
    this.SelectedModel = value;
  }
  public DetailPanelVisible = false;

  /** @deprecated Use {@link DetailPanelVisible}. */
  public get detailPanelVisible() {
    return this.DetailPanelVisible;
  }
  /** @deprecated Use {@link DetailPanelVisible}. */
  public set detailPanelVisible(value) {
    this.DetailPanelVisible = value;
  }

  // Sorting
  public SortBy = 'name';

  /** @deprecated Use {@link SortBy}. */
  public get sortBy() {
    return this.SortBy;
  }
  /** @deprecated Use {@link SortBy}. */
  public set sortBy(value) {
    this.SortBy = value;
  }
  public SortDirection: 'asc' | 'desc' = 'asc';

  /** @deprecated Use {@link SortDirection}. */
  public get sortDirection(): 'asc' | 'desc' {
    return this.SortDirection;
  }
  /** @deprecated Use {@link SortDirection}. */
  public set sortDirection(value: 'asc' | 'desc') {
    this.SortDirection = value;
  }
  public SortOptions = [
    { value: 'name', label: 'Name' },
    { value: 'vendor', label: 'Vendor' },
    { value: 'type', label: 'Type' },
    { value: 'powerRank', label: 'Power Rank' },
    { value: 'speedRank', label: 'Speed Rank' },
    { value: 'costRank', label: 'Cost Rank' },
    { value: 'created', label: 'Created Date' },
    { value: 'updated', label: 'Updated Date' }
  ];

  /** @deprecated Use {@link SortOptions}. */
  public get sortOptions() {
    return this.SortOptions;
  }
  /** @deprecated Use {@link SortOptions}. */
  public set sortOptions(value) {
    this.SortOptions = value;
  }

  // Max rank values calculated from all models
  public MaxPowerRank = 10;

  /** @deprecated Use {@link MaxPowerRank}. */
  public get maxPowerRank() {
    return this.MaxPowerRank;
  }
  /** @deprecated Use {@link MaxPowerRank}. */
  public set maxPowerRank(value) {
    this.MaxPowerRank = value;
  }
  public MaxSpeedRank = 10;

  /** @deprecated Use {@link MaxSpeedRank}. */
  public get maxSpeedRank() {
    return this.MaxSpeedRank;
  }
  /** @deprecated Use {@link MaxSpeedRank}. */
  public set maxSpeedRank(value) {
    this.MaxSpeedRank = value;
  }
  public MaxCostRank = 10;

  /** @deprecated Use {@link MaxCostRank}. */
  public get maxCostRank() {
    return this.MaxCostRank;
  }
  /** @deprecated Use {@link MaxCostRank}. */
  public set maxCostRank(value) {
    this.MaxCostRank = value;
  }

  // Loading messages
  public LoadingMessages = [
    'Loading AI models...',
    'Fetching vendor information...',
    'Calculating rankings...',
    'Almost ready...'
  ];

  /** @deprecated Use {@link LoadingMessages}. */
  public get loadingMessages() {
    return this.LoadingMessages;
  }
  /** @deprecated Use {@link LoadingMessages}. */
  public set loadingMessages(value) {
    this.LoadingMessages = value;
  }
  public CurrentLoadingMessage = this.LoadingMessages[0];

  /** @deprecated Use {@link CurrentLoadingMessage}. */
  public get currentLoadingMessage() {
    return this.CurrentLoadingMessage;
  }
  /** @deprecated Use {@link CurrentLoadingMessage}. */
  public set currentLoadingMessage(value) {
    this.CurrentLoadingMessage = value;
  }
  private loadingMessageIndex = 0;
  private loadingMessageInterval: any;

  protected override destroy$ = new Subject<void>();

  constructor(
    private sharedService: SharedService,
    private cdr: ChangeDetectorRef
  ) {
    super();

    // Set up debounced settings persistence
    this.settingsPersistSubject.pipe(
      debounceTime(500),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.persistUserPreferences();
    });
  }

  ngOnInit(): void {
    super.ngOnInit();
    // Load saved user preferences first
    this.loadUserPreferences();

    this.setupSearchListener();
    this.startLoadingMessages();
    this.loadInitialData();

    // Apply initial state from resource configuration if provided (overrides saved prefs)
    if (this.Data?.Configuration) {
      this.applyInitialState(this.Data.Configuration);
    }

    // Subscribe to remote cache invalidation events for real-time updates
    this.subscribeToCacheInvalidation();
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.destroy$.next();
    this.destroy$.complete();
    if (this.loadingMessageInterval) {
      clearInterval(this.loadingMessageInterval);
    }
  }

  private subscribeToCacheInvalidation(): void {
    MJGlobal.Instance.GetEventListener(true)
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        if (event.event !== MJEventType.ComponentEvent || event.eventCode !== BaseEntity.BaseEventCode) return;
        const beEvent = event.args as BaseEntityEvent;
        if (beEvent.type !== 'remote-invalidate') return;
        const entityName = beEvent.entityName?.toLowerCase().trim();
        if (entityName === 'mj: ai models' || entityName === 'mj: ai model types') {
          console.log(`[AI Models Dashboard] Remote invalidation for "${beEvent.entityName}" — refreshing`);
          // Small delay to let BaseEngine finish its LoadSingleConfig network call
          setTimeout(() => this.refreshDataFromEngine(), 500);
        }
      });
  }

  private refreshDataFromEngine(): void {
    const models = AIEngineBase.Instance.Models;
    this.Vendors = AIEngineBase.Instance.Vendors;
    this.ModelTypes = AIEngineBase.Instance.ModelTypes;

    const vendorMap = new Map(this.Vendors.map(v => [v.ID, v.Name]));
    const typeMap = new Map(this.ModelTypes.map(t => [t.ID, t.Name]));

    this.Models = models.map((model) => {
      let vendorId: string | undefined;
      if (model.Vendor) {
        const vendor = this.Vendors.find(v => v.Name === model.Vendor);
        vendorId = vendor?.ID;
      }
      const modelWithDisplay = model as ModelDisplayData;
      modelWithDisplay.VendorID = vendorId;
      modelWithDisplay.VendorName = model.Vendor || 'No Vendor';
      modelWithDisplay.ModelTypeName = model.AIModelTypeID ? typeMap.get(model.AIModelTypeID) || 'Unknown' : 'No Type';
      return model;
    });

    this.FilteredModels = [...this.Models];
    this.sortModels();
    this.ApplyFilters();
    this.cdr.detectChanges();
  }

  private setupSearchListener(): void {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(searchTerm => {
      this.SearchTerm = searchTerm;
      this.ApplyFilters();
      this.saveUserPreferencesDebounced();
    });
  }

  // ========================================
  // User Settings Persistence
  // ========================================

  /**
   * Load saved user preferences from the UserInfoEngine
   */
  private loadUserPreferences(): void {
    try {
      const savedPrefs = UserInfoEngine.Instance.GetSetting(this.USER_SETTINGS_KEY);
      if (savedPrefs) {
        const prefs = JSON.parse(savedPrefs) as ModelManagementUserPreferences;
        this.applyUserPreferencesFromStorage(prefs);
      }
    } catch (error) {
      console.warn('[ModelManagement] Failed to load user preferences:', error);
    } finally {
      this.settingsLoaded = true;
    }
  }

  /**
   * Apply loaded preferences to component state
   */
  private applyUserPreferencesFromStorage(prefs: ModelManagementUserPreferences): void {
    if (prefs.viewMode) {
      this.ViewMode = prefs.viewMode;
    }
    if (prefs.showFilters !== undefined) {
      this.ShowFilters = prefs.showFilters;
    }
    if (prefs.searchTerm) {
      this.SearchTerm = prefs.searchTerm;
    }
    if (prefs.selectedVendor) {
      this.SelectedVendor = prefs.selectedVendor;
    }
    if (prefs.selectedType) {
      this.SelectedType = prefs.selectedType;
    }
    if (prefs.selectedStatus) {
      this.SelectedStatus = prefs.selectedStatus;
    }
    if (prefs.sortBy) {
      this.SortBy = prefs.sortBy;
    }
    if (prefs.sortDirection) {
      this.SortDirection = prefs.sortDirection;
    }
  }

  /**
   * Get current preferences as an object for saving
   */
  private getCurrentPreferences(): ModelManagementUserPreferences {
    return {
      viewMode: this.ViewMode,
      showFilters: this.ShowFilters,
      searchTerm: this.SearchTerm,
      selectedVendor: this.SelectedVendor,
      selectedType: this.SelectedType,
      selectedStatus: this.SelectedStatus,
      sortBy: this.SortBy,
      sortDirection: this.SortDirection
    };
  }

  /**
   * Persist user preferences to storage (debounced)
   */
  private saveUserPreferencesDebounced(): void {
    if (!this.settingsLoaded) return; // Don't save during initial load
    this.settingsPersistSubject.next();
  }

  /**
   * Actually persist user preferences to the UserInfoEngine
   */
  private async persistUserPreferences(): Promise<void> {
    try {
      const prefs = this.getCurrentPreferences();
      await UserInfoEngine.Instance.SetSetting(this.USER_SETTINGS_KEY, JSON.stringify(prefs));
    } catch (error) {
      console.warn('[ModelManagement] Failed to persist user preferences:', error);
    }
  }

  private startLoadingMessages(): void {
    this.loadingMessageInterval = setInterval(() => {
      this.loadingMessageIndex = (this.loadingMessageIndex + 1) % this.LoadingMessages.length;
      this.CurrentLoadingMessage = this.LoadingMessages[this.loadingMessageIndex];
    }, 2000);
  }

  private async loadInitialData(): Promise<void> {
    try {
      // Ensure AIEngineBase is configured (no-op if already loaded)
      await AIEngineBase.Instance.Config(false);

      // Get cached data from AIEngineBase
      const models = AIEngineBase.Instance.Models;
      this.Vendors = AIEngineBase.Instance.Vendors;
      this.ModelTypes = AIEngineBase.Instance.ModelTypes;
      
      // Log summary data
      
      // Create lookup maps
      const vendorMap = new Map(this.Vendors.map(v => [v.ID, v.Name]));
      const typeMap = new Map(this.ModelTypes.map(t => [t.ID, t.Name]));

      // Transform models to display format
      this.Models = models.map((model) => {
        
        // Find vendor ID by matching vendor name
        let vendorId: string | undefined;
        if (model.Vendor) {
          const vendor = this.Vendors.find(v => v.Name === model.Vendor);
          vendorId = vendor?.ID;
        }
        
        // Don't spread the model - it loses getter properties!
        // Instead, augment the model with display properties
        const modelWithDisplay = model as ModelDisplayData;
        modelWithDisplay.VendorID = vendorId;
        modelWithDisplay.VendorName = model.Vendor || 'No Vendor';
        modelWithDisplay.ModelTypeName = model.AIModelTypeID ? typeMap.get(model.AIModelTypeID) || 'Unknown' : 'No Type';
        
        return model;
      });

      // Calculate max values for each rank type from ALL models
      this.MaxPowerRank = Math.max(...this.Models.map(m => m.PowerRank || 0), 10);
      this.MaxSpeedRank = Math.max(...this.Models.map(m => m.SpeedRank || 0), 10);
      this.MaxCostRank = Math.max(...this.Models.map(m => m.CostRank || 0), 10);

      // Update filter ranges based on actual max values
      this.PowerRankRange = { min: 0, max: this.MaxPowerRank };
      this.SpeedRankRange = { min: 0, max: this.MaxSpeedRank };
      this.CostRankRange = { min: 0, max: this.MaxCostRank };

      this.FilteredModels = [...this.Models];
      this.sortModels();
      this.ApplyFilters();
    } catch (error) {
      console.error('Error loading model data:', error);
      this.sharedService.CreateSimpleNotification('Error loading models', 'error', 3000);
    } finally {
      this.isLoading = false;
      if (this.loadingMessageInterval) {
        clearInterval(this.loadingMessageInterval);
      }
      this.NotifyLoadComplete();
      this.cdr.detectChanges();
    }
  }

  public FormatRank(rank: number | null, rankType?: 'power' | 'speed' | 'cost'): string {
    if (rank === null) return 'N/A';
    
    // Determine which max value to use
    let maxValue = 10;
    if (rankType === 'power') {
      maxValue = this.MaxPowerRank;
    } else if (rankType === 'speed') {
      maxValue = this.MaxSpeedRank;
    } else if (rankType === 'cost') {
      maxValue = this.MaxCostRank;
    }
    
    return `${rank}/${maxValue}`;
  }

  /** @deprecated Use {@link FormatRank}. */
  public formatRank(rank: number | null, rankType?: 'power' | 'speed' | 'cost'): string {
    return this.FormatRank(rank, rankType);
  }

  private applyInitialState(state: any): void {
    if (state.viewMode) this.ViewMode = state.viewMode;
    if (state.showFilters !== undefined) this.ShowFilters = state.showFilters;
    if (state.searchTerm) this.SearchTerm = state.searchTerm;
    if (state.selectedVendor) this.SelectedVendor = state.selectedVendor;
    if (state.selectedType) this.SelectedType = state.selectedType;
    if (state.selectedStatus) this.SelectedStatus = state.selectedStatus;
    if (state.sortBy) this.SortBy = state.sortBy;
    if (state.powerRankRange) this.PowerRankRange = state.powerRankRange;
    if (state.speedRankRange) this.SpeedRankRange = state.speedRankRange;
    if (state.costRankRange) this.CostRankRange = state.costRankRange;
  }

  public OnSearchChange(value: string): void {
    this.searchSubject.next(value);
  }

  /** @deprecated Use {@link OnSearchChange}. */
  public onSearchChange(value: string): void {
    return this.OnSearchChange(value);
  }

  public ToggleFilters(): void {
    this.ShowFilters = !this.ShowFilters;
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link ToggleFilters}. */
  public toggleFilters(): void {
    return this.ToggleFilters();
  }

  public ToggleFilterPanel(): void {
    this.ShowFilters = !this.ShowFilters;
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link ToggleFilterPanel}. */
  public toggleFilterPanel(): void {
    return this.ToggleFilterPanel();
  }

  public SetViewMode(mode: 'grid' | 'list'): void {
    this.ViewMode = mode;
    this.ExpandedModelId = null;
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link SetViewMode}. */
  public setViewMode(mode: 'grid' | 'list'): void {
    return this.SetViewMode(mode);
  }

  public ToggleModelExpansion(modelId: string): void {
    this.ExpandedModelId = this.ExpandedModelId === modelId ? null : modelId;
  }

  /** @deprecated Use {@link ToggleModelExpansion}. */
  public toggleModelExpansion(modelId: string): void {
    return this.ToggleModelExpansion(modelId);
  }

  public ApplyFilters(): void {
    this.FilteredModels = this.Models.filter(m => {
      const model = m as ModelDisplayData;
      // Search filter
      if (this.SearchTerm) {
        const searchLower = this.SearchTerm.toLowerCase();
        const matchesSearch = 
          model.Name?.toLowerCase().includes(searchLower) ||
          model.Description?.toLowerCase().includes(searchLower) ||
          model.VendorName?.toLowerCase().includes(searchLower) ||
          model.ModelTypeName?.toLowerCase().includes(searchLower);
        
        if (!matchesSearch) return false;
      }

      // Vendor filter
      if (this.SelectedVendor !== 'all' && !UUIDsEqual(model.VendorID, this.SelectedVendor)) {
        return false;
      }

      // Type filter
      if (this.SelectedType !== 'all' && !UUIDsEqual(model.AIModelTypeID, this.SelectedType)) {
        return false;
      }

      // Status filter
      if (this.SelectedStatus !== 'all') {
        const isActive = model.IsActive === true;
        if (this.SelectedStatus === 'active' && !isActive) return false;
        if (this.SelectedStatus === 'inactive' && isActive) return false;
      }

      // Rank filters
      if (model.PowerRank !== null && (model.PowerRank < this.PowerRankRange.min || model.PowerRank > this.PowerRankRange.max)) {
        return false;
      }
      if (model.SpeedRank !== null && (model.SpeedRank < this.SpeedRankRange.min || model.SpeedRank > this.SpeedRankRange.max)) {
        return false;
      }
      if (model.CostRank !== null && (model.CostRank < this.CostRankRange.min || model.CostRank > this.CostRankRange.max)) {
        return false;
      }

      return true;
    });

    this.sortModels();
  }

  /** @deprecated Use {@link ApplyFilters}. */
  public applyFilters(): void {
    return this.ApplyFilters();
  }

  private sortModels(): void {
    this.FilteredModels.sort((a, b) => {
      const modelA = a as ModelDisplayData;
      const modelB = b as ModelDisplayData;
      let comparison = 0;

      switch (this.SortBy) {
        case 'name':
          comparison = (modelA.Name || '').localeCompare(modelB.Name || '');
          break;
        case 'vendor':
          comparison = (modelA.VendorName || '').localeCompare(modelB.VendorName || '');
          break;
        case 'type':
          comparison = (modelA.ModelTypeName || '').localeCompare(modelB.ModelTypeName || '');
          break;
        case 'powerRank':
          comparison = (modelA.PowerRank || 0) - (modelB.PowerRank || 0);
          break;
        case 'speedRank':
          comparison = (modelA.SpeedRank || 0) - (modelB.SpeedRank || 0);
          break;
        case 'costRank':
          comparison = (modelA.CostRank || 0) - (modelB.CostRank || 0);
          break;
        case 'created':
          comparison = new Date(modelA.__mj_CreatedAt).getTime() - new Date(modelB.__mj_CreatedAt).getTime();
          break;
        case 'updated':
          comparison = new Date(modelA.__mj_UpdatedAt).getTime() - new Date(modelB.__mj_UpdatedAt).getTime();
          break;
        default:
          comparison = 0;
      }

      return this.SortDirection === 'desc' ? -comparison : comparison;
    });
  }

  public OnVendorChange(vendorId: string): void {
    this.SelectedVendor = vendorId;
    this.ApplyFilters();
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link OnVendorChange}. */
  public onVendorChange(vendorId: string): void {
    return this.OnVendorChange(vendorId);
  }

  public OnTypeChange(typeId: string): void {
    this.SelectedType = typeId;
    this.ApplyFilters();
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link OnTypeChange}. */
  public onTypeChange(typeId: string): void {
    return this.OnTypeChange(typeId);
  }

  public OnStatusChange(status: string): void {
    this.SelectedStatus = status;
    this.ApplyFilters();
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link OnStatusChange}. */
  public onStatusChange(status: string): void {
    return this.OnStatusChange(status);
  }

  public OnSortChange(sortBy: string): void {
    if (this.SortBy === sortBy) {
      // Toggle direction if same column
      this.SortDirection = this.SortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      // New column, default to ascending
      this.SortBy = sortBy;
      this.SortDirection = 'asc';
    }
    this.sortModels();
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link OnSortChange}. */
  public onSortChange(sortBy: string): void {
    return this.OnSortChange(sortBy);
  }

  public async ToggleModelStatus(model: ModelDisplayData, event: Event): Promise<void> {
    event.stopPropagation();
    
    try {
      model.IsActive = !model.IsActive;
      if (await model.Save()) {
        this.sharedService.CreateSimpleNotification(
          `Model ${model.IsActive ? 'activated' : 'deactivated'} successfully`,
          'success',
          3000
        );
      } else {
        // Revert on failure
        model.IsActive = !model.IsActive;
        throw new Error('Failed to save model status');
      }
    } catch (error) {
      console.error('Error toggling model status:', error);
      this.sharedService.CreateSimpleNotification('Error updating model status', 'error', 3000);
    }
  }

  /** @deprecated Use {@link ToggleModelStatus}. */
  public async toggleModelStatus(model: ModelDisplayData, event: Event): Promise<void> {
    return this.ToggleModelStatus(model, event);
  }

  public OpenModel(modelId: string): void {
    this.navigationService.OpenEntityRecord('MJ: AI Models', CompositeKey.FromID(modelId));
  }

  /** @deprecated Use {@link OpenModel}. */
  public openModel(modelId: string): void {
    return this.OpenModel(modelId);
  }

  /**
   * Show the detail panel for a model
   */
  public ShowModelDetails(model: MJAIModelEntityExtended, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.SelectedModel = model as ModelDisplayData;
    this.DetailPanelVisible = true;
  }

  /** @deprecated Use {@link ShowModelDetails}. */
  public showModelDetails(model: MJAIModelEntityExtended, event?: Event): void {
    return this.ShowModelDetails(model, event);
  }

  /**
   * Close the detail panel
   */
  public CloseDetailPanel(): void {
    this.DetailPanelVisible = false;
    // Delay clearing selectedModel for smoother animation
    setTimeout(() => {
      if (!this.DetailPanelVisible) {
        this.SelectedModel = null;
      }
    }, 300);
  }

  /** @deprecated Use {@link CloseDetailPanel}. */
  public closeDetailPanel(): void {
    return this.CloseDetailPanel();
  }

  /**
   * Open the full entity record from the detail panel
   */
  public OpenModelFromPanel(): void {
    if (this.SelectedModel) {
      this.OpenModel(this.SelectedModel.ID);
      // The user's intent has moved to the full record — leaving the panel
      // open would paint it over the records view and greet them with stale
      // chrome when they return to this page.
      this.CloseDetailPanel();
    }
  }

  /** @deprecated Use {@link OpenModelFromPanel}. */
  public openModelFromPanel(): void {
    return this.OpenModelFromPanel();
  }

  public async CreateNewModel(): Promise<void> {
    try {
      const md = this.ProviderToUse;
      const newModel = await md.GetEntityObject<MJAIModelEntityExtended>('MJ: AI Models');
      
      if (newModel) {
        newModel.Name = 'New AI Model';
        newModel.IsActive = true;
        
        if (await newModel.Save()) {
          const compositeKey = CompositeKey.FromID(newModel.ID);
          this.navigationService.OpenEntityRecord('MJ: AI Models', compositeKey);

          // Reload the data
          await this.loadInitialData();
        }
      }
    } catch (error) {
      console.error('Error creating new model:', error);
      this.sharedService.CreateSimpleNotification('Error creating model', 'error', 3000);
    }
  }

  /** @deprecated Use {@link CreateNewModel}. */
  public async createNewModel(): Promise<void> {
    return this.CreateNewModel();
  }

  public GetModelIcon(model: ModelDisplayData): string {
    const typeName = model.ModelTypeName?.toLowerCase();
    if (typeName?.includes('chat') || typeName?.includes('conversation')) {
      return 'fa-solid fa-comments';
    } else if (typeName?.includes('image') || typeName?.includes('vision')) {
      return 'fa-solid fa-image';
    } else if (typeName?.includes('audio') || typeName?.includes('speech')) {
      return 'fa-solid fa-microphone';
    } else if (typeName?.includes('embed')) {
      return 'fa-solid fa-vector-square';
    }
    return 'fa-solid fa-microchip';
  }

  /** @deprecated Use {@link GetModelIcon}. */
  public getModelIcon(model: ModelDisplayData): string {
    return this.GetModelIcon(model);
  }

  public GetRankClass(rank: number | null, rankType?: 'power' | 'speed' | 'cost'): string {
    if (rank === null || rank === 0) return 'rank-none';
    
    // Determine which max value to use
    let maxValue = 10;
    if (rankType === 'power') {
      maxValue = this.MaxPowerRank;
    } else if (rankType === 'speed') {
      maxValue = this.MaxSpeedRank;
    } else if (rankType === 'cost') {
      maxValue = this.MaxCostRank;
    }
    
    // Calculate percentage of max
    const percentage = (rank / maxValue) * 100;
    
    if (percentage >= 70) return 'rank-high';
    if (percentage >= 40) return 'rank-medium';
    return 'rank-low';
  }

  /** @deprecated Use {@link GetRankClass}. */
  public getRankClass(rank: number | null, rankType?: 'power' | 'speed' | 'cost'): string {
    return this.GetRankClass(rank, rankType);
  }

  public get HasActiveFilters(): boolean {
    return this.SearchTerm !== '' || 
           this.SelectedVendor !== 'all' || 
           this.SelectedType !== 'all' || 
           this.SelectedStatus !== 'all' ||
           this.PowerRankRange.min > 0 ||
           this.PowerRankRange.max < this.MaxPowerRank ||
           this.SpeedRankRange.min > 0 ||
           this.SpeedRankRange.max < this.MaxSpeedRank ||
           this.CostRankRange.min > 0 ||
           this.CostRankRange.max < this.MaxCostRank;
  }

  /** @deprecated Use {@link HasActiveFilters}. */
  public get hasActiveFilters(): boolean {
    return this.HasActiveFilters;
  }

  public ClearFilters(): void {
    this.SearchTerm = '';
    this.SelectedVendor = 'all';
    this.SelectedType = 'all';
    this.SelectedStatus = 'all';
    this.PowerRankRange = { min: 0, max: this.MaxPowerRank };
    this.SpeedRankRange = { min: 0, max: this.MaxSpeedRank };
    this.CostRankRange = { min: 0, max: this.MaxCostRank };
    this.searchSubject.next('');
    this.ApplyFilters();
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link ClearFilters}. */
  public clearFilters(): void {
    return this.ClearFilters();
  }

  /** Empty-state CTA: clear filters when the list is narrowed, otherwise create. */
  public OnEmptyStateAction(): void {
    if (this.HasActiveFilters) {
      this.ClearFilters();
    } else {
      this.CreateNewModel();
    }
  }

  /** @deprecated Use {@link OnEmptyStateAction}. */
  public onEmptyStateAction(): void {
    return this.OnEmptyStateAction();
  }

  /** Reset only the popover filters — leave searchTerm (toolbar) untouched. */
  public ResetPopoverFilters(): void {
    this.SelectedVendor = 'all';
    this.SelectedType = 'all';
    this.SelectedStatus = 'all';
    this.PowerRankRange = { min: 0, max: this.MaxPowerRank };
    this.ApplyFilters();
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link ResetPopoverFilters}. */
  public resetPopoverFilters(): void {
    return this.ResetPopoverFilters();
  }

  /** Number of active filter criteria inside the popover (excludes searchTerm + sortBy). */
  public get ActiveFilterCount(): number {
    let n = 0;
    if (this.SelectedVendor && this.SelectedVendor !== 'all') n++;
    if (this.SelectedType && this.SelectedType !== 'all') n++;
    if (this.SelectedStatus && this.SelectedStatus !== 'all') n++;
    if (this.PowerRankRange.min > 0 || this.PowerRankRange.max < this.MaxPowerRank) n++;
    return n;
  }

  /** View-mode options for the shared <mj-view-toggle>. */
  public readonly ModelViewOptions = [
    { key: 'grid', icon: 'fa-solid fa-grip', title: 'Grid View' },
    { key: 'list', icon: 'fa-solid fa-list', title: 'List View' },
  ];

  /** @deprecated Use {@link ModelViewOptions}. */
  public get modelViewOptions() {
    return this.ModelViewOptions;
  }

  /** Values record consumed by the centralized <mj-filter-panel>. */
  public get ModelFilterValues(): Record<string, unknown> {
    return {
      sortBy:         this.SortBy,
      selectedVendor: this.SelectedVendor,
      selectedType:   this.SelectedType,
      selectedStatus: this.SelectedStatus,
    };
  }

  /** @deprecated Use {@link ModelFilterValues}. */
  public get modelFilterValues(): Record<string, unknown> {
    return this.ModelFilterValues;
  }

  /** Field config consumed by the centralized <mj-filter-panel>. */
  public get ModelFilterFields(): FilterFieldConfig[] {
    return [
      {
        key: 'sortBy',
        type: 'dropdown',
        label: 'Sort By',
        icon: 'fa-solid fa-sort',
        options: this.SortOptions.map(o => ({ text: o.label, value: o.value })),
      },
      {
        key: 'selectedVendor',
        type: 'dropdown',
        label: 'Vendor',
        icon: 'fa-solid fa-building',
        filterable: this.Vendors.length > 10,
        options: [
          { text: 'All Vendors', value: 'all' },
          ...this.Vendors.map(v => ({ text: v.Name ?? '', value: v.ID })),
        ],
      },
      {
        key: 'selectedType',
        type: 'dropdown',
        label: 'Type',
        icon: 'fa-solid fa-microchip',
        options: [
          { text: 'All Types', value: 'all' },
          ...this.ModelTypes.map(t => ({ text: t.Name ?? '', value: t.ID })),
        ],
      },
      {
        key: 'selectedStatus',
        type: 'dropdown',
        label: 'Status',
        icon: 'fa-solid fa-toggle-on',
        options: [
          { text: 'All Statuses', value: 'all' },
          { text: 'Active',       value: 'active' },
          { text: 'Inactive',     value: 'inactive' },
        ],
      },
    ];
  }

  /** @deprecated Use {@link ModelFilterFields}. */
  public get modelFilterFields(): FilterFieldConfig[] {
    return this.ModelFilterFields;
  }

  /** Receive the updated values record from <mj-filter-panel> and apply it. */
  public OnFilterValuesChange(values: Record<string, unknown>): void {
    this.SortBy         = (values['sortBy']         as string) ?? this.SortBy;
    this.SelectedVendor = (values['selectedVendor'] as string) ?? 'all';
    this.SelectedType   = (values['selectedType']   as string) ?? 'all';
    this.SelectedStatus = (values['selectedStatus'] as string) ?? 'all';
    this.ApplyFilters();
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link OnFilterValuesChange}. */
  public onFilterValuesChange(values: Record<string, unknown>): void {
    return this.OnFilterValuesChange(values);
  }

  public FormatTokenLimit(limit: number): string {
    if (limit >= 1000000) {
      return Math.floor(limit / 1000000) + 'M';
    } else if (limit >= 1000) {
      return Math.floor(limit / 1000) + 'K';
    }
    return limit.toString();
  }

  /** @deprecated Use {@link FormatTokenLimit}. */
  public formatTokenLimit(limit: number): string {
    return this.FormatTokenLimit(limit);
  }

  public ValidateAndApplyRankFilters(rankType: 'power' | 'speed' | 'cost'): void {
    // Get the appropriate range and max value based on type
    let range = rankType === 'power' ? this.PowerRankRange :
                 rankType === 'speed' ? this.SpeedRankRange :
                 this.CostRankRange;

    let maxValue = rankType === 'power' ? this.MaxPowerRank :
                   rankType === 'speed' ? this.MaxSpeedRank :
                   this.MaxCostRank;

    // Ensure min is not greater than max
    if (range.min > range.max) {
      // Swap the values
      const temp = range.min;
      range.min = range.max;
      range.max = temp;
    }

    // Ensure values are within bounds
    range.min = Math.max(0, Math.min(maxValue, range.min));
    range.max = Math.max(0, Math.min(maxValue, range.max));

    // Apply the filters
    this.ApplyFilters();
  }

  /** @deprecated Use {@link ValidateAndApplyRankFilters}. */
  public validateAndApplyRankFilters(rankType: 'power' | 'speed' | 'cost'): void {
    return this.ValidateAndApplyRankFilters(rankType);
  }

  // BaseResourceComponent abstract method implementations
  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Models';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-microchip';
  }
}