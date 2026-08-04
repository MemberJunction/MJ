import { ChangeDetectorRef, Component, Input, Output, EventEmitter, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { EntityInfo, CompositeKey } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { TreeBranchConfig, TreeLeafConfig, TreeNode, TreeComponent } from '@memberjunction/ng-trees';
import { RecentItem, FavoriteItem, AppEntityGroup } from '../../models/explorer-state.interface';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

/**
 * Event emitted when a record should be opened in a full tab
 */
export interface OpenRecordEvent {
  entityName: string;
  compositeKey: CompositeKey;
}

/**
 * Event emitted when a record should be selected within Data Explorer (not full tab)
 */
export interface SelectRecordEvent {
  entityName: string;
  recordId: string;
}

@Component({
  standalone: false,
  selector: 'mj-explorer-navigation-panel',
  templateUrl: './navigation-panel.component.html',
  styleUrls: ['./navigation-panel.component.css']
})
export class NavigationPanelComponent extends BaseAngularComponent implements OnChanges, OnInit, OnDestroy {
  constructor(private cdr: ChangeDetectorRef) {
    super();
  }

  @Input() entities: EntityInfo[] = [];
  @Input() selectedEntityName: string | null = null;
  @Input() favorites: FavoriteItem[] = [];
  @Input() recentItems: RecentItem[] = [];
  @Input() collapsed = false;
  /**
   * Optional set of allowed entity names for filtering favorites/recents.
   * If provided, only items matching these entities will be shown.
   */
  @Input() allowedEntityNames: Set<string> | null = null;
  /** Application-based entity groups from the parent dashboard */
  @Input() appEntityGroups: AppEntityGroup[] = [];
  /** Optional application ID filter for the tree */
  @Input() applicationIdFilter: string | null = null;

  // Section expansion states
  @Input() favoritesSectionExpanded = true;
  @Input() recentSectionExpanded = true;
  @Input() entitiesSectionExpanded = true;
  @Input() viewsSectionExpanded = true;

  @Output() entitySelected = new EventEmitter<EntityInfo>();
  @Output() toggleCollapse = new EventEmitter<void>();
  @Output() sectionToggled = new EventEmitter<'favorites' | 'recent' | 'entities' | 'views'>();
  @Output() openRecord = new EventEmitter<OpenRecordEvent>();
  /** Emitted when a record should be selected within Data Explorer (navigate to entity + select record) */
  @Output() selectRecord = new EventEmitter<SelectRecordEvent>();
  /** Emitted when a collapsed icon is clicked - expands panel and focuses section */
  @Output() expandAndFocus = new EventEmitter<'favorites' | 'recent' | 'entities'>();
  /** Emitted when a nav panel app group is toggled */
  @Output() appGroupToggled = new EventEmitter<string>();

  private get metadata() { return this.ProviderToUse; }

  // Tree configuration for entity list
  public treeBranchConfig: TreeBranchConfig = {
    EntityName: 'MJ: Applications',
    DisplayField: 'Name',
    IDField: 'ID',
    IconField: 'Icon',
    OrderBy: 'Name'
  };

  public treeLeafConfig: TreeLeafConfig = {
    EntityName: 'MJ: Entities',
    ParentField: '', // Using JunctionConfig for M2M relationship
    DisplayField: 'Name',
    IDField: 'ID',
    IconField: 'Icon',
    JunctionConfig: {
      EntityName: 'MJ: Application Entities',
      BranchForeignKey: 'ApplicationID',
      LeafForeignKey: 'EntityID'
    },
    OrderBy: 'Name'
  };

  @ViewChild('entityTree') entityTree?: TreeComponent;

  /** Selected entity ID for tree highlighting */
  public selectedEntityIds: string[] = [];

  /** Search term for filtering the entity tree */
  public entitySearchTerm = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedEntityName']) {
      this.updateSelectedEntityKey();
    }
    if (changes['applicationIdFilter']) {
      this.updateTreeBranchFilter();
    }
    if (changes['recentItems']) {
      this.timestampLabelCache.clear();
    }
  }

  ngOnInit(): void {
    this.timestampRefreshHandle = setInterval(() => {
      if (this.timestampLabelCache.size === 0) return;
      this.timestampLabelCache.clear();
      this.cdr.markForCheck();
    }, 30000);
  }

  ngOnDestroy(): void {
    if (this.timestampRefreshHandle !== undefined) {
      clearInterval(this.timestampRefreshHandle);
      this.timestampRefreshHandle = undefined;
    }
  }

  /**
   * Update the selected entity IDs for tree highlighting when selected entity changes
   */
  private updateSelectedEntityKey(): void {
    if (this.selectedEntityName) {
      const entity = this.metadata.Entities.find(e => e.Name === this.selectedEntityName);
      if (entity) {
        this.selectedEntityIds = [entity.ID];
        return;
      }
    }
    this.selectedEntityIds = [];
  }

  /**
   * Update the tree's branch filter when application filter changes
   */
  private updateTreeBranchFilter(): void {
    if (this.applicationIdFilter) {
      this.treeBranchConfig = {
        ...this.treeBranchConfig,
        ExtraFilter: `ID='${this.applicationIdFilter}'`
      };
    } else {
      this.treeBranchConfig = {
        ...this.treeBranchConfig,
        ExtraFilter: undefined
      };
    }
  }

  /**
   * Filter the entity tree when search term changes
   */
  onEntitySearchChanged(): void {
    if (this.entityTree) {
      this.entityTree.FilterNodes(this.entitySearchTerm, {
        searchBranches: true,
        searchLeaves: true,
        caseSensitive: false
      });
    }
  }

  /**
   * Clear the entity search
   */
  clearEntitySearch(): void {
    this.entitySearchTerm = '';
    this.onEntitySearchChanged();
  }

  /**
   * Handle tree selection change - map TreeNode to EntityInfo and emit
   */
  onTreeEntitySelected(nodes: TreeNode[]): void {
    if (!nodes || nodes.length === 0) return;
    const node = nodes[0];
    if (node.Type !== 'leaf') return;

    // Find the EntityInfo by ID from the node
    const entity = this.metadata.Entities.find(e => UUIDsEqual(e.ID, node.ID));
    if (entity) {
      this.entitySelected.emit(entity);
    }
  }

  /**
   * Get recent items filtered by allowed entities (if filter is active)
   */
  get filteredRecentItems(): RecentItem[] {
    if (!this.allowedEntityNames) {
      return this.recentItems;
    }
    return this.recentItems.filter(r => this.allowedEntityNames!.has(r.entityName));
  }

  /**
   * Get favorites filtered to records only (respecting entity filter)
   */
  get favoriteRecords(): FavoriteItem[] {
    const records = this.favorites.filter(f => f.type === 'record');
    if (!this.allowedEntityNames) {
      return records;
    }
    return records.filter(f => f.entityName && this.allowedEntityNames!.has(f.entityName));
  }

  /**
   * Get favorites filtered to entities only (respecting entity filter)
   */
  get favoriteEntities(): FavoriteItem[] {
    const entities = this.favorites.filter(f => f.type === 'entity');
    if (!this.allowedEntityNames) {
      return entities;
    }
    return entities.filter(f => f.entityName && this.allowedEntityNames!.has(f.entityName));
  }

  /**
   * Handle entity click
   */
  onEntityClick(entity: EntityInfo): void {
    this.entitySelected.emit(entity);
  }

  /**
   * Handle favorite click - navigates to entity and selects record within Data Explorer
   */
  onFavoriteClick(favorite: FavoriteItem): void {
    if (favorite.type === 'entity' && favorite.entityName) {
      const entity = this.entities.find(e => e.Name === favorite.entityName);
      if (entity) {
        this.entitySelected.emit(entity);
      }
    } else if (favorite.type === 'record' && favorite.entityName && favorite.compositeKeyString) {
      // Extract record ID from the composite key string
      // Format is "FieldName|Value" or "FieldName|Value||FieldName2|Value2"
      const compositeKey = new CompositeKey();
      compositeKey.LoadFromConcatenatedString(favorite.compositeKeyString);
      const recordId = compositeKey.KeyValuePairs[0]?.Value?.toString() || '';

      // Navigate to entity and select record within Data Explorer (not full tab)
      this.selectRecord.emit({
        entityName: favorite.entityName,
        recordId
      });
    }
  }

  /**
   * Handle recent item click - navigates to entity and selects record within Data Explorer
   */
  onRecentClick(item: RecentItem): void {
    // Extract record ID from the composite key string
    const compositeKey = new CompositeKey();
    compositeKey.LoadFromConcatenatedString(item.compositeKeyString);
    const recordId = compositeKey.KeyValuePairs[0]?.Value?.toString() || '';

    // Navigate to entity and select record within Data Explorer (not full tab)
    this.selectRecord.emit({
      entityName: item.entityName,
      recordId
    });
  }

  /**
   * Handle section header click
   */
  onSectionToggle(section: 'favorites' | 'recent' | 'entities' | 'views'): void {
    this.sectionToggled.emit(section);
  }

  /**
   * Handle collapse toggle
   */
  onToggleCollapse(): void {
    this.toggleCollapse.emit();
  }

  /**
   * Handle collapsed icon click - expands panel and focuses section
   */
  onCollapsedIconClick(section: 'favorites' | 'recent' | 'entities'): void {
    this.expandAndFocus.emit(section);
  }

  /**
   * Check if entity is selected
   */
  isEntitySelected(entity: EntityInfo): boolean {
    return entity.Name === this.selectedEntityName;
  }

  /**
   * Get icon for entity
   */
  getEntityIcon(entity: EntityInfo): string {
    const icon = entity.Icon;
    if (!icon) {
      return 'fa-solid fa-table';
    }
    // If icon already has fa- prefix, use it as-is
    if (icon.startsWith('fa-') || icon.startsWith('fa ')) {
      // Ensure it has a style prefix (fa-solid, fa-regular, etc.)
      if (icon.startsWith('fa-solid') || icon.startsWith('fa-regular') ||
          icon.startsWith('fa-light') || icon.startsWith('fa-brands') ||
          icon.startsWith('fa ')) {
        return icon;
      }
      // It's just "fa-something", add fa-solid prefix
      return `fa-solid ${icon}`;
    }
    // Check if it's just an icon name like "table" or "users"
    return `fa-solid fa-${icon}`;
  }

  /**
   * Cache of formatted relative-time labels keyed by timestamp epoch ms.
   * Stable within a change-detection cycle (avoids NG0100 from `now`-dependent
   * values shifting between dirty-check and verify passes). Cleared on a coarse
   * interval so the displayed label still updates over time.
   */
  private timestampLabelCache = new Map<number, string>();
  private timestampRefreshHandle?: ReturnType<typeof setInterval>;

  /**
   * Format recent item timestamp. Cached per-timestamp so the same value is
   * returned across change-detection passes within a single tick — recomputed
   * on a 30-second interval (see `ngOnInit`).
   */
  formatTimestamp(timestamp: Date): string {
    const epoch = new Date(timestamp).getTime();
    const cached = this.timestampLabelCache.get(epoch);
    if (cached !== undefined) {
      return cached;
    }
    const label = this.computeRelativeLabel(epoch);
    this.timestampLabelCache.set(epoch, label);
    return label;
  }

  private computeRelativeLabel(epoch: number): string {
    const diffMs = Date.now() - epoch;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return new Date(epoch).toLocaleDateString();
  }

  /**
   * Get icon for a recent item based on its entity
   */
  getRecentItemIcon(item: RecentItem): string {
    const entityInfo = this.metadata.Entities.find(e => e.Name === item.entityName);
    if (entityInfo) {
      return this.getEntityIcon(entityInfo);
    }
    return 'fa-solid fa-file-alt';
  }

  /**
   * Get icon for a favorite item based on its type and entity
   */
  getFavoriteIcon(favorite: FavoriteItem): string {
    if (favorite.type === 'view') {
      return 'fa-solid fa-filter';
    }

    // For entity and record types, look up the entity icon
    if (favorite.entityName) {
      const entityInfo = this.metadata.Entities.find(e => e.Name === favorite.entityName);
      if (entityInfo) {
        return this.getEntityIcon(entityInfo);
      }
    }

    // Fallback icons
    if (favorite.type === 'entity') {
      return 'fa-solid fa-table';
    }
    return 'fa-solid fa-file-alt';
  }
}
