import { Component, OnInit, OnDestroy, Output, EventEmitter, Input } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { AIModelEntity, AIVendorEntity, AIModelTypeEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';

interface ModelDisplayData extends AIModelEntity {
  VendorName?: string;
  VendorID?: string; // Add this since we're using it for filtering
  ModelTypeName?: string;
  PowerRankDisplay?: string;
  SpeedRankDisplay?: string;
  CostRankDisplay?: string;
}

@Component({
  selector: 'app-model-management-v2',
  templateUrl: './model-management-v2.component.html',
  styleUrls: ['./model-management-v2.component.scss']
})
export class ModelManagementV2Component implements OnInit, OnDestroy {
  @Output() openEntityRecord = new EventEmitter<{entityName: string; recordId: string}>();
  @Output() stateChange = new EventEmitter<any>();
  @Input() initialState: any = null;

  // View state
  public viewMode: 'grid' | 'list' = 'grid';
  public isLoading = true;
  public showFilters = true;
  public expandedModelId: string | null = null;

  // Data
  public models: ModelDisplayData[] = [];
  public filteredModels: ModelDisplayData[] = [];
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

  // Sorting
  public sortBy = 'name';
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
    private sharedService: SharedService
  ) {}

  ngOnInit(): void {
    this.setupSearchListener();
    this.startLoadingMessages();
    this.loadInitialData();
    
    if (this.initialState) {
      this.applyInitialState(this.initialState);
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
    });
  }

  private startLoadingMessages(): void {
    this.loadingMessageInterval = setInterval(() => {
      this.loadingMessageIndex = (this.loadingMessageIndex + 1) % this.loadingMessages.length;
      this.currentLoadingMessage = this.loadingMessages[this.loadingMessageIndex];
    }, 2000);
  }

  private async loadInitialData(): Promise<void> {
    try {
      const rv = new RunView();

      // Load all data in parallel using RunViews
      const [modelResults, vendorResults, typeResults] = await rv.RunViews([
        {
          EntityName: 'AI Models',
          OrderBy: 'Name',
          MaxRows: 1000,
          ResultType: 'entity_object'
        },
        {
          EntityName: 'MJ: AI Vendors',
          OrderBy: 'Name',
          MaxRows: 1000,
          ResultType: 'entity_object'
        },
        {
          EntityName: 'AI Model Types',
          OrderBy: 'Name',
          MaxRows: 1000,
          ResultType: 'entity_object'
        }
      ]);

      this.vendors = vendorResults.Results as AIVendorEntity[];
      this.modelTypes = typeResults.Results as AIModelTypeEntity[];

      // Create lookup maps
      const vendorMap = new Map(this.vendors.map(v => [v.ID, v.Name]));
      const typeMap = new Map(this.modelTypes.map(t => [t.ID, t.Name]));

      // Transform models to display format
      this.models = (modelResults.Results as AIModelEntity[]).map(model => {
        // Find vendor ID by matching vendor name
        let vendorId: string | undefined;
        if (model.Vendor) {
          const vendor = this.vendors.find(v => v.Name === model.Vendor);
          vendorId = vendor?.ID;
        }
        
        return {
          ...model,
          VendorID: vendorId,
          VendorName: model.Vendor || 'No Vendor',
          ModelTypeName: model.AIModelTypeID ? typeMap.get(model.AIModelTypeID) || 'Unknown' : 'No Type',
          PowerRankDisplay: this.formatRank(model.PowerRank),
          SpeedRankDisplay: this.formatRank(model.SpeedRank),
          CostRankDisplay: this.formatRank(model.CostRank)
        } as ModelDisplayData;
      });

      this.filteredModels = [...this.models];
      this.sortModels();
      this.applyFilters();
      this.emitStateChange();
    } catch (error) {
      console.error('Error loading model data:', error);
      this.sharedService.CreateSimpleNotification('Error loading models', 'error', 3000);
    } finally {
      this.isLoading = false;
      if (this.loadingMessageInterval) {
        clearInterval(this.loadingMessageInterval);
      }
    }
  }

  private formatRank(rank: number | null): string {
    return rank !== null ? `${rank}/10` : 'N/A';
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
    this.emitStateChange();
  }

  public toggleFilterPanel(): void {
    this.showFilters = !this.showFilters;
    this.emitStateChange();
  }

  public setViewMode(mode: 'grid' | 'list'): void {
    this.viewMode = mode;
    this.expandedModelId = null;
    this.emitStateChange();
  }

  public toggleModelExpansion(modelId: string): void {
    this.expandedModelId = this.expandedModelId === modelId ? null : modelId;
  }

  public applyFilters(): void {
    this.filteredModels = this.models.filter(model => {
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
    this.emitStateChange();
  }

  private sortModels(): void {
    this.filteredModels.sort((a, b) => {
      switch (this.sortBy) {
        case 'name':
          return (a.Name || '').localeCompare(b.Name || '');
        case 'vendor':
          return (a.VendorName || '').localeCompare(b.VendorName || '');
        case 'type':
          return (a.ModelTypeName || '').localeCompare(b.ModelTypeName || '');
        case 'powerRank':
          return (b.PowerRank || 0) - (a.PowerRank || 0);
        case 'speedRank':
          return (b.SpeedRank || 0) - (a.SpeedRank || 0);
        case 'costRank':
          return (b.CostRank || 0) - (a.CostRank || 0);
        case 'created':
          return new Date(b.__mj_CreatedAt).getTime() - new Date(a.__mj_CreatedAt).getTime();
        case 'updated':
          return new Date(b.__mj_UpdatedAt).getTime() - new Date(a.__mj_UpdatedAt).getTime();
        default:
          return 0;
      }
    });
  }

  public onVendorChange(vendorId: string): void {
    this.selectedVendor = vendorId;
    this.applyFilters();
  }

  public onTypeChange(typeId: string): void {
    this.selectedType = typeId;
    this.applyFilters();
  }

  public onStatusChange(status: string): void {
    this.selectedStatus = status;
    this.applyFilters();
  }

  public onSortChange(sortBy: string): void {
    this.sortBy = sortBy;
    this.sortModels();
    this.emitStateChange();
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
    this.openEntityRecord.emit({
      entityName: 'AI Models',
      recordId: modelId
    });
  }

  public async createNewModel(): Promise<void> {
    try {
      const md = new Metadata();
      const newModel = await md.GetEntityObject<AIModelEntity>('AI Models');
      
      if (newModel) {
        newModel.Name = 'New AI Model';
        newModel.IsActive = true;
        
        if (await newModel.Save()) {
          this.openEntityRecord.emit({
            entityName: 'AI Models',
            recordId: newModel.ID
          });
          
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

  public getRankClass(rank: number | null): string {
    if (rank === null) return 'rank-none';
    if (rank >= 8) return 'rank-high';
    if (rank >= 5) return 'rank-medium';
    return 'rank-low';
  }

  private emitStateChange(): void {
    this.stateChange.emit({
      viewMode: this.viewMode,
      showFilters: this.showFilters,
      searchTerm: this.searchTerm,
      selectedVendor: this.selectedVendor,
      selectedType: this.selectedType,
      selectedStatus: this.selectedStatus,
      sortBy: this.sortBy,
      powerRankRange: this.powerRankRange,
      speedRankRange: this.speedRankRange,
      costRankRange: this.costRankRange,
      modelCount: this.filteredModels.length
    });
  }

  public get hasActiveFilters(): boolean {
    return this.searchTerm !== '' || 
           this.selectedVendor !== 'all' || 
           this.selectedType !== 'all' || 
           this.selectedStatus !== 'all' ||
           this.powerRankRange.min > 0 ||
           this.powerRankRange.max < 10 ||
           this.speedRankRange.min > 0 ||
           this.speedRankRange.max < 10 ||
           this.costRankRange.min > 0 ||
           this.costRankRange.max < 10;
  }

  public clearFilters(): void {
    this.searchTerm = '';
    this.selectedVendor = 'all';
    this.selectedType = 'all';
    this.selectedStatus = 'all';
    this.powerRankRange = { min: 0, max: 10 };
    this.speedRankRange = { min: 0, max: 10 };
    this.costRankRange = { min: 0, max: 10 };
    this.searchSubject.next('');
    this.applyFilters();
  }
}