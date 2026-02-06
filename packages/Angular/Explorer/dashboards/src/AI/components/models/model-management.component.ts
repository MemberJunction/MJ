import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { AIVendorEntity, AIModelTypeEntity, ResourceData, UserInfoEngine } from '@memberjunction/core-entities';
import { Metadata, CompositeKey } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { SharedService, BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { AIModelEntityExtended } from '@memberjunction/ai-core-plus';

interface ModelDisplayData extends AIModelEntityExtended {
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
 * Tree-shaking prevention function - ensures component is included in builds
 */
export function LoadAIModelsResource() {
  // Force inclusion in production builds
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
  public viewMode: 'grid' | 'list' = 'grid';
  public isLoading = true;
  public showFilters = true;
  public expandedModelId: string | null = null;

  // Data - Keep as AIModelEntityExtended to preserve getters
  public models: AIModelEntityExtended[] = [];
  public filteredModels: AIModelEntityExtended[] = [];
  public vendors: AIVendorEntity[] = [];
  public modelTypes: AIModelTypeEntity[] = [];

  // Filtering
  public searchTerm = '';
  private searchSubject = new BehaviorSubject<string>('');
  public selectedVendor = 'all';
  public selectedType = 'all';
  public selectedStatus = 'all';
  public powerRankRange = { min: 0, max: 10 };
  public speedRankRange = { min: 0, max: 10 };
  public costRankRange = { min: 0, max: 10 };

  // Detail panel
  public selectedModel: ModelDisplayData | null = null;
  public detailPanelVisible = false;

  // Sorting
  public sortBy = 'name';
  public sortDirection: 'asc' | 'desc' = 'asc';
  public sortOptions = [
    { value: 'name', label: 'Name' },
    { value: 'vendor', label: 'Vendor' },
    { value: 'type', label: 'Type' },
    { value: 'powerRank', label: 'Power Rank' },
    { value: 'speedRank', label: 'Speed Rank' },
    { value: 'costRank', label: 'Cost Rank' },
    { value: 'created', label: 'Created Date' },
    { value: 'updated', label: 'Updated Date' }
  ];

  // Max rank values calculated from all models
  public maxPowerRank = 10;
  public maxSpeedRank = 10;
  public maxCostRank = 10;

  // Loading messages
  public loadingMessages = [
    'Loading AI models...',
    'Fetching vendor information...',
    'Calculating rankings...',
    'Almost ready...'
  ];
  public currentLoadingMessage = this.loadingMessages[0];
  private loadingMessageIndex = 0;
  private loadingMessageInterval: any;

  private destroy$ = new Subject<void>();

  constructor(
    private sharedService: SharedService,
    private navigationService: NavigationService,
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
    // Load saved user preferences first
    this.loadUserPreferences();

    this.setupSearchListener();
    this.startLoadingMessages();
    this.loadInitialData();

    // Apply initial state from resource configuration if provided (overrides saved prefs)
    if (this.Data?.Configuration) {
      this.applyInitialState(this.Data.Configuration);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.loadingMessageInterval) {
      clearInterval(this.loadingMessageInterval);
    }
  }

  private setupSearchListener(): void {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(searchTerm => {
      this.searchTerm = searchTerm;
      this.applyFilters();
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
      this.viewMode = prefs.viewMode;
    }
    if (prefs.showFilters !== undefined) {
      this.showFilters = prefs.showFilters;
    }
    if (prefs.searchTerm) {
      this.searchTerm = prefs.searchTerm;
    }
    if (prefs.selectedVendor) {
      this.selectedVendor = prefs.selectedVendor;
    }
    if (prefs.selectedType) {
      this.selectedType = prefs.selectedType;
    }
    if (prefs.selectedStatus) {
      this.selectedStatus = prefs.selectedStatus;
    }
    if (prefs.sortBy) {
      this.sortBy = prefs.sortBy;
    }
    if (prefs.sortDirection) {
      this.sortDirection = prefs.sortDirection;
    }
  }

  /**
   * Get current preferences as an object for saving
   */
  private getCurrentPreferences(): ModelManagementUserPreferences {
    return {
      viewMode: this.viewMode,
      showFilters: this.showFilters,
      searchTerm: this.searchTerm,
      selectedVendor: this.selectedVendor,
      selectedType: this.selectedType,
      selectedStatus: this.selectedStatus,
      sortBy: this.sortBy,
      sortDirection: this.sortDirection
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
      this.loadingMessageIndex = (this.loadingMessageIndex + 1) % this.loadingMessages.length;
      this.currentLoadingMessage = this.loadingMessages[this.loadingMessageIndex];
    }, 2000);
  }

  private async loadInitialData(): Promise<void> {
    try {
      // Ensure AIEngineBase is configured (no-op if already loaded)
      await AIEngineBase.Instance.Config(false);

      // Get cached data from AIEngineBase
      const models = AIEngineBase.Instance.Models;
      this.vendors = AIEngineBase.Instance.Vendors;
      this.modelTypes = AIEngineBase.Instance.ModelTypes;
      
      // Log summary data
      
      // Create lookup maps
      const vendorMap = new Map(this.vendors.map(v => [v.ID, v.Name]));
      const typeMap = new Map(this.modelTypes.map(t => [t.ID, t.Name]));

      // Transform models to display format
      this.models = models.map((model) => {
        
        // Find vendor ID by matching vendor name
        let vendorId: string | undefined;
        if (model.Vendor) {
          const vendor = this.vendors.find(v => v.Name === model.Vendor);
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
      this.maxPowerRank = Math.max(...this.models.map(m => m.PowerRank || 0), 10);
      this.maxSpeedRank = Math.max(...this.models.map(m => m.SpeedRank || 0), 10);
      this.maxCostRank = Math.max(...this.models.map(m => m.CostRank || 0), 10);

      // Update filter ranges based on actual max values
      this.powerRankRange = { min: 0, max: this.maxPowerRank };
      this.speedRankRange = { min: 0, max: this.maxSpeedRank };
      this.costRankRange = { min: 0, max: this.maxCostRank };

      this.filteredModels = [...this.models];
      this.sortModels();
      this.applyFilters();
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

  public formatRank(rank: number | null, rankType?: 'power' | 'speed' | 'cost'): string {
    if (rank === null) return 'N/A';
    
    // Determine which max value to use
    let maxValue = 10;
    if (rankType === 'power') {
      maxValue = this.maxPowerRank;
    } else if (rankType === 'speed') {
      maxValue = this.maxSpeedRank;
    } else if (rankType === 'cost') {
      maxValue = this.maxCostRank;
    }
    
    return `${rank}/${maxValue}`;
  }

  private applyInitialState(state: any): void {
    if (state.viewMode) this.viewMode = state.viewMode;
    if (state.showFilters !== undefined) this.showFilters = state.showFilters;
    if (state.searchTerm) this.searchTerm = state.searchTerm;
    if (state.selectedVendor) this.selectedVendor = state.selectedVendor;
    if (state.selectedType) this.selectedType = state.selectedType;
    if (state.selectedStatus) this.selectedStatus = state.selectedStatus;
    if (state.sortBy) this.sortBy = state.sortBy;
    if (state.powerRankRange) this.powerRankRange = state.powerRankRange;
    if (state.speedRankRange) this.speedRankRange = state.speedRankRange;
    if (state.costRankRange) this.costRankRange = state.costRankRange;
  }

  public onSearchChange(value: string): void {
    this.searchSubject.next(value);
  }

  public toggleFilters(): void {
    this.showFilters = !this.showFilters;
    this.saveUserPreferencesDebounced();
  }

  public toggleFilterPanel(): void {
    this.showFilters = !this.showFilters;
    this.saveUserPreferencesDebounced();
  }

  public setViewMode(mode: 'grid' | 'list'): void {
    this.viewMode = mode;
    this.expandedModelId = null;
    this.saveUserPreferencesDebounced();
  }

  public toggleModelExpansion(modelId: string): void {
    this.expandedModelId = this.expandedModelId === modelId ? null : modelId;
  }

  public applyFilters(): void {
    this.filteredModels = this.models.filter(m => {
      const model = m as ModelDisplayData;
      // Search filter
      if (this.searchTerm) {
        const searchLower = this.searchTerm.toLowerCase();
        const matchesSearch = 
          model.Name?.toLowerCase().includes(searchLower) ||
          model.Description?.toLowerCase().includes(searchLower) ||
          model.VendorName?.toLowerCase().includes(searchLower) ||
          model.ModelTypeName?.toLowerCase().includes(searchLower);
        
        if (!matchesSearch) return false;
      }

      // Vendor filter
      if (this.selectedVendor !== 'all' && model.VendorID !== this.selectedVendor) {
        return false;
      }

      // Type filter
      if (this.selectedType !== 'all' && model.AIModelTypeID !== this.selectedType) {
        return false;
      }

      // Status filter
      if (this.selectedStatus !== 'all') {
        const isActive = model.IsActive === true;
        if (this.selectedStatus === 'active' && !isActive) return false;
        if (this.selectedStatus === 'inactive' && isActive) return false;
      }

      // Rank filters
      if (model.PowerRank !== null && (model.PowerRank < this.powerRankRange.min || model.PowerRank > this.powerRankRange.max)) {
        return false;
      }
      if (model.SpeedRank !== null && (model.SpeedRank < this.speedRankRange.min || model.SpeedRank > this.speedRankRange.max)) {
        return false;
      }
      if (model.CostRank !== null && (model.CostRank < this.costRankRange.min || model.CostRank > this.costRankRange.max)) {
        return false;
      }

      return true;
    });

    this.sortModels();
  }

  private sortModels(): void {
    this.filteredModels.sort((a, b) => {
      const modelA = a as ModelDisplayData;
      const modelB = b as ModelDisplayData;
      let comparison = 0;

      switch (this.sortBy) {
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

      return this.sortDirection === 'desc' ? -comparison : comparison;
    });
  }

  public onVendorChange(vendorId: string): void {
    this.selectedVendor = vendorId;
    this.applyFilters();
    this.saveUserPreferencesDebounced();
  }

  public onTypeChange(typeId: string): void {
    this.selectedType = typeId;
    this.applyFilters();
    this.saveUserPreferencesDebounced();
  }

  public onStatusChange(status: string): void {
    this.selectedStatus = status;
    this.applyFilters();
    this.saveUserPreferencesDebounced();
  }

  public onSortChange(sortBy: string): void {
    if (this.sortBy === sortBy) {
      // Toggle direction if same column
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      // New column, default to ascending
      this.sortBy = sortBy;
      this.sortDirection = 'asc';
    }
    this.sortModels();
    this.saveUserPreferencesDebounced();
  }

  public async toggleModelStatus(model: ModelDisplayData, event: Event): Promise<void> {
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

  public openModel(modelId: string): void {
    const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: modelId }]);
    this.navigationService.OpenEntityRecord('AI Models', compositeKey);
  }

  /**
   * Show the detail panel for a model
   */
  public showModelDetails(model: AIModelEntityExtended, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.selectedModel = model as ModelDisplayData;
    this.detailPanelVisible = true;
  }

  /**
   * Close the detail panel
   */
  public closeDetailPanel(): void {
    this.detailPanelVisible = false;
    // Delay clearing selectedModel for smoother animation
    setTimeout(() => {
      if (!this.detailPanelVisible) {
        this.selectedModel = null;
      }
    }, 300);
  }

  /**
   * Open the full entity record from the detail panel
   */
  public openModelFromPanel(): void {
    if (this.selectedModel) {
      this.openModel(this.selectedModel.ID);
    }
  }

  public async createNewModel(): Promise<void> {
    try {
      const md = new Metadata();
      const newModel = await md.GetEntityObject<AIModelEntityExtended>('AI Models');
      
      if (newModel) {
        newModel.Name = 'New AI Model';
        newModel.IsActive = true;
        
        if (await newModel.Save()) {
          const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: newModel.ID }]);
          this.navigationService.OpenEntityRecord('AI Models', compositeKey);

          // Reload the data
          await this.loadInitialData();
        }
      }
    } catch (error) {
      console.error('Error creating new model:', error);
      this.sharedService.CreateSimpleNotification('Error creating model', 'error', 3000);
    }
  }

  public getModelIcon(model: ModelDisplayData): string {
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

  public getRankClass(rank: number | null, rankType?: 'power' | 'speed' | 'cost'): string {
    if (rank === null || rank === 0) return 'rank-none';
    
    // Determine which max value to use
    let maxValue = 10;
    if (rankType === 'power') {
      maxValue = this.maxPowerRank;
    } else if (rankType === 'speed') {
      maxValue = this.maxSpeedRank;
    } else if (rankType === 'cost') {
      maxValue = this.maxCostRank;
    }
    
    // Calculate percentage of max
    const percentage = (rank / maxValue) * 100;
    
    if (percentage >= 70) return 'rank-high';
    if (percentage >= 40) return 'rank-medium';
    return 'rank-low';
  }

  public get hasActiveFilters(): boolean {
    return this.searchTerm !== '' || 
           this.selectedVendor !== 'all' || 
           this.selectedType !== 'all' || 
           this.selectedStatus !== 'all' ||
           this.powerRankRange.min > 0 ||
           this.powerRankRange.max < this.maxPowerRank ||
           this.speedRankRange.min > 0 ||
           this.speedRankRange.max < this.maxSpeedRank ||
           this.costRankRange.min > 0 ||
           this.costRankRange.max < this.maxCostRank;
  }

  public clearFilters(): void {
    this.searchTerm = '';
    this.selectedVendor = 'all';
    this.selectedType = 'all';
    this.selectedStatus = 'all';
    this.powerRankRange = { min: 0, max: this.maxPowerRank };
    this.speedRankRange = { min: 0, max: this.maxSpeedRank };
    this.costRankRange = { min: 0, max: this.maxCostRank };
    this.searchSubject.next('');
    this.applyFilters();
    this.saveUserPreferencesDebounced();
  }

  public formatTokenLimit(limit: number): string {
    if (limit >= 1000000) {
      return Math.floor(limit / 1000000) + 'M';
    } else if (limit >= 1000) {
      return Math.floor(limit / 1000) + 'K';
    }
    return limit.toString();
  }

  public validateAndApplyRankFilters(rankType: 'power' | 'speed' | 'cost'): void {
    // Get the appropriate range and max value based on type
    let range = rankType === 'power' ? this.powerRankRange :
                 rankType === 'speed' ? this.speedRankRange :
                 this.costRankRange;

    let maxValue = rankType === 'power' ? this.maxPowerRank :
                   rankType === 'speed' ? this.maxSpeedRank :
                   this.maxCostRank;

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
    this.applyFilters();
  }

  // BaseResourceComponent abstract method implementations
  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Models';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-microchip';
  }
}