import { Component, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { RunView, Metadata, LogError, LogStatus } from '@memberjunction/core';
import { AIModelEntity, AIVendorEntity, AIModelTypeEntity } from '@memberjunction/core-entities';
import { Subject, combineLatest, BehaviorSubject } from 'rxjs';
import { debounceTime, takeUntil, distinctUntilChanged } from 'rxjs/operators';

export interface ModelFilter {
  searchTerm: string;
  vendorId: string | null;
  modelTypeId: string | null;
  powerRankMin: number | null;
  powerRankMax: number | null;
  speedRankMin: number | null;
  speedRankMax: number | null;
  costRankMin: number | null;
  costRankMax: number | null;
  isActive: boolean | null;
}

export interface ModelSortOption {
  field: keyof AIModelEntity;
  direction: 'asc' | 'desc';
  label: string;
}

export interface ModelDisplayData {
  model: AIModelEntity;
  vendor: AIVendorEntity | null;
  modelType: AIModelTypeEntity | null;
  powerRankDisplay: string;
  speedRankDisplay: string;
  costRankDisplay: string;
  statusDisplay: string;
}

@Component({
  selector: 'app-model-management',
  templateUrl: './model-management.component.html',
  styleUrls: ['./model-management.component.scss']
})
export class ModelManagementComponent implements OnInit, OnDestroy {
  @Output() openEntityRecord = new EventEmitter<{entityName: string, recordId: string}>();

  // Data properties
  public models: AIModelEntity[] = [];
  public vendors: AIVendorEntity[] = [];
  public modelTypes: AIModelTypeEntity[] = [];
  public filteredModels: ModelDisplayData[] = [];
  
  // UI state
  public isLoading = false;
  public loadingMessage = 'Loading AI models...';
  public error: string | null = null;
  public filtersVisible = false;
  
  // Filter state
  public filter: ModelFilter = {
    searchTerm: '',
    vendorId: null,
    modelTypeId: null,
    powerRankMin: null,
    powerRankMax: null,
    speedRankMin: null,
    speedRankMax: null,
    costRankMin: null,
    costRankMax: null,
    isActive: null
  };
  
  // Sort options
  public sortOptions: ModelSortOption[] = [
    { field: 'Name', direction: 'asc', label: 'Name (A-Z)' },
    { field: 'Name', direction: 'desc', label: 'Name (Z-A)' },
    { field: 'PowerRank', direction: 'desc', label: 'Power Rank (High to Low)' },
    { field: 'PowerRank', direction: 'asc', label: 'Power Rank (Low to High)' },
    { field: 'SpeedRank', direction: 'desc', label: 'Speed Rank (High to Low)' },
    { field: 'SpeedRank', direction: 'asc', label: 'Speed Rank (Low to High)' },
    { field: 'CostRank', direction: 'desc', label: 'Cost Rank (High to Low)' },
    { field: 'CostRank', direction: 'asc', label: 'Cost Rank (Low to High)' },
    { field: '__mj_CreatedAt', direction: 'desc', label: 'Recently Added' },
    { field: '__mj_UpdatedAt', direction: 'desc', label: 'Recently Updated' }
  ];
  
  public selectedSort: ModelSortOption = this.sortOptions[0];
  
  // Search and filter subjects
  private searchSubject = new BehaviorSubject<string>('');
  private filterSubject = new BehaviorSubject<ModelFilter>(this.filter);
  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.setupFilterSubscriptions();
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupFilterSubscriptions(): void {
    // Debounced search
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(searchTerm => {
      this.filter.searchTerm = searchTerm;
      this.applyFilters();
    });

    // Combined filter changes
    combineLatest([
      this.filterSubject.pipe(debounceTime(100)),
      this.searchSubject.pipe(debounceTime(300))
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.applyFilters();
    });
  }

  public async loadData(): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;
      this.loadingMessage = 'Loading AI models...';

      // Load all required data in parallel
      const [modelsResult, vendorsResult, modelTypesResult] = await Promise.all([
        this.loadModels(),
        this.loadVendors(),
        this.loadModelTypes()
      ]);

      if (modelsResult && vendorsResult && modelTypesResult) {
        this.applyFilters();
        LogStatus('Model management data loaded successfully');
      }
    } catch (error) {
      this.error = 'Failed to load model data. Please try again.';
      LogError('Error loading model management data: ' + String(error));
    } finally {
      this.isLoading = false;
    }
  }

  private async loadModels(): Promise<boolean> {
    try {
      const md = Metadata.Provider;
      if (!md) {
        throw new Error('Metadata provider not available');
      }

      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'AI Models',
        ExtraFilter: '', // Load all models, we'll filter in UI
        OrderBy: 'Name',
        UserSearchString: '',
        OverrideExcludeFilter: '',
        SaveViewResults: false
      });

      if (result && result.Success && result.Results) {
        this.models = result.Results as AIModelEntity[];
        return true;
      } else {
        throw new Error('Failed to load AI models');
      }
    } catch (error) {
      LogError('Error loading AI models: ' + String(error));
      return false;
    }
  }

  private async loadVendors(): Promise<boolean> {
    try {
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'AI Vendors',
        ExtraFilter: '',
        OrderBy: 'Name',
        UserSearchString: '',
        OverrideExcludeFilter: '',
        SaveViewResults: false
      });

      if (result && result.Success && result.Results) {
        this.vendors = result.Results as AIVendorEntity[];
        return true;
      } else {
        throw new Error('Failed to load AI vendors');
      }
    } catch (error) {
      LogError('Error loading AI vendors: ' + String(error));
      return false;
    }
  }

  private async loadModelTypes(): Promise<boolean> {
    try {
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'AI Model Types',
        ExtraFilter: '',
        OrderBy: 'Name',
        UserSearchString: '',
        OverrideExcludeFilter: '',
        SaveViewResults: false
      });

      if (result && result.Success && result.Results) {
        this.modelTypes = result.Results as AIModelTypeEntity[];
        return true;
      } else {
        throw new Error('Failed to load AI model types');
      }
    } catch (error) {
      LogError('Error loading AI model types: ' + String(error));
      return false;
    }
  }

  public onSearchChange(searchTerm: string): void {
    this.searchSubject.next(searchTerm);
  }

  public onFilterChange(): void {
    this.filterSubject.next({ ...this.filter });
  }

  public onSortChange(sort: ModelSortOption): void {
    this.selectedSort = sort;
    this.applyFilters();
  }

  public toggleFiltersVisible(): void {
    this.filtersVisible = !this.filtersVisible;
  }

  public clearFilters(): void {
    this.filter = {
      searchTerm: '',
      vendorId: null,
      modelTypeId: null,
      powerRankMin: null,
      powerRankMax: null,
      speedRankMin: null,
      speedRankMax: null,
      costRankMin: null,
      costRankMax: null,
      isActive: null
    };
    this.searchSubject.next('');
    this.filterSubject.next(this.filter);
  }

  private applyFilters(): void {
    let filtered = [...this.models];

    // Apply search filter
    if (this.filter.searchTerm) {
      const searchLower = this.filter.searchTerm.toLowerCase();
      filtered = filtered.filter(model => 
        model.Name?.toLowerCase().includes(searchLower) ||
        model.Description?.toLowerCase().includes(searchLower) ||
        this.getVendorName(model)?.toLowerCase().includes(searchLower)
      );
    }

    // Apply vendor filter
    if (this.filter.vendorId) {
      filtered = filtered.filter(model => model.APIName === this.filter.vendorId);
    }

    // Apply model type filter
    if (this.filter.modelTypeId) {
      filtered = filtered.filter(model => model.AIModelTypeID === this.filter.modelTypeId);
    }

    // Apply rank filters
    if (this.filter.powerRankMin !== null) {
      filtered = filtered.filter(model => (model.PowerRank || 0) >= this.filter.powerRankMin!);
    }
    if (this.filter.powerRankMax !== null) {
      filtered = filtered.filter(model => (model.PowerRank || 0) <= this.filter.powerRankMax!);
    }
    if (this.filter.speedRankMin !== null) {
      filtered = filtered.filter(model => (model.SpeedRank || 0) >= this.filter.speedRankMin!);
    }
    if (this.filter.speedRankMax !== null) {
      filtered = filtered.filter(model => (model.SpeedRank || 0) <= this.filter.speedRankMax!);
    }
    if (this.filter.costRankMin !== null) {
      filtered = filtered.filter(model => (model.CostRank || 0) >= this.filter.costRankMin!);
    }
    if (this.filter.costRankMax !== null) {
      filtered = filtered.filter(model => (model.CostRank || 0) <= this.filter.costRankMax!);
    }

    // Apply active filter
    if (this.filter.isActive !== null) {
      filtered = filtered.filter(model => model.IsActive === this.filter.isActive);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      const aValue = a[this.selectedSort.field] as any;
      const bValue = b[this.selectedSort.field] as any;
      
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;
      
      let comparison = 0;
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue);
      } else {
        comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      }
      
      return this.selectedSort.direction === 'desc' ? -comparison : comparison;
    });

    // Transform to display data
    this.filteredModels = filtered.map(model => this.transformToDisplayData(model));
  }

  private transformToDisplayData(model: AIModelEntity): ModelDisplayData {
    return {
      model,
      vendor: this.getVendor(model),
      modelType: this.getModelType(model),
      powerRankDisplay: this.formatRank(model.PowerRank),
      speedRankDisplay: this.formatRank(model.SpeedRank),
      costRankDisplay: this.formatRank(model.CostRank),
      statusDisplay: model.IsActive ? 'Active' : 'Inactive'
    };
  }

  private getVendor(model: AIModelEntity): AIVendorEntity | null {
    return this.vendors.find(v => v.ID === model.APIName) || null;
  }

  private getVendorName(model: AIModelEntity): string | null {
    const vendor = this.getVendor(model);
    return vendor?.Name || null;
  }

  private getModelType(model: AIModelEntity): AIModelTypeEntity | null {
    return this.modelTypes.find(mt => mt.ID === model.AIModelTypeID) || null;
  }

  private formatRank(rank: number | null | undefined): string {
    if (rank == null) return 'N/A';
    return `${rank}/10`;
  }

  public onOpenModel(model: AIModelEntity): void {
    this.openEntityRecord.emit({
      entityName: 'AI Models',
      recordId: model.ID!
    });
  }

  public async createNewModel(): Promise<void> {
    try {
      const md = Metadata.Provider;
      if (!md) {
        throw new Error('Metadata provider not available');
      }

      const newModel = await md.GetEntityObject<AIModelEntity>('AI Models', md.CurrentUser);
      // Pre-populate some defaults
      newModel.IsActive = true;
      newModel.PowerRank = 5;
      newModel.SpeedRank = 5;
      newModel.CostRank = 5;
      
      this.openEntityRecord.emit({
        entityName: 'AI Models',
        recordId: 'new'
      });
    } catch (error) {
      LogError('Error creating new AI model: ' + String(error));
    }
  }

  public async toggleModelStatus(model: AIModelEntity): Promise<void> {
    try {
      const md = Metadata.Provider;
      if (!md) {
        throw new Error('Metadata provider not available');
      }

      const modelToUpdate = await md.GetEntityObject<AIModelEntity>('AI Models', md.CurrentUser);
      await modelToUpdate.Load(model.ID!);
      
      modelToUpdate.IsActive = !modelToUpdate.IsActive;
      const result = await modelToUpdate.Save();
      
      if (result) {
        // Update local data
        const index = this.models.findIndex(m => m.ID === model.ID);
        if (index >= 0) {
          this.models[index] = Object.assign({}, this.models[index], { IsActive: modelToUpdate.IsActive });
          this.applyFilters();
        }
        LogStatus(`Model ${modelToUpdate.Name} ${modelToUpdate.IsActive ? 'activated' : 'deactivated'}`);
      }
    } catch (error) {
      LogError('Error updating model status: ' + String(error));
    }
  }
}