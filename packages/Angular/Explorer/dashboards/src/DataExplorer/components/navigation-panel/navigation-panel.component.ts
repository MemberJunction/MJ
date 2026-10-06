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
  entityName: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  CompositeKey: CompositeKey;
}

/**
 * Event emitted when a record should be selected within Data Explorer (not full tab)
 */
export interface SelectRecordEvent {
  entityName: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  recordId: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
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

  @Input() Entities: EntityInfo[] = [];

  /** @deprecated Use {@link Entities}. */
  @Input() set entities(value: EntityInfo[]) {
    this.Entities = value;
  }
  /** @deprecated Use {@link Entities}. */
  get entities(): EntityInfo[] {
    return this.Entities;
  }
  @Input() SelectedEntityName: string | null = null;

  /** @deprecated Use {@link SelectedEntityName}. */
  @Input() set selectedEntityName(value: string | null) {
    this.SelectedEntityName = value;
  }
  /** @deprecated Use {@link SelectedEntityName}. */
  get selectedEntityName(): string | null {
    return this.SelectedEntityName;
  }
  @Input() Favorites: FavoriteItem[] = [];

  /** @deprecated Use {@link Favorites}. */
  @Input() set favorites(value: FavoriteItem[]) {
    this.Favorites = value;
  }
  /** @deprecated Use {@link Favorites}. */
  get favorites(): FavoriteItem[] {
    return this.Favorites;
  }
  @Input() RecentItems: RecentItem[] = [];

  /** @deprecated Use {@link RecentItems}. */
  @Input() set recentItems(value: RecentItem[]) {
    this.RecentItems = value;
  }
  /** @deprecated Use {@link RecentItems}. */
  get recentItems(): RecentItem[] {
    return this.RecentItems;
  }
  @Input() Collapsed = false;

  /** @deprecated Use {@link Collapsed}. */
  @Input() set collapsed(value: NavigationPanelComponent['Collapsed']) {
    this.Collapsed = value;
  }
  /** @deprecated Use {@link Collapsed}. */
  get collapsed(): NavigationPanelComponent['Collapsed'] {
    return this.Collapsed;
  }
  /**
   * Optional set of allowed entity names for filtering favorites/recents.
   * If provided, only items matching these entities will be shown.
   */
  @Input() AllowedEntityNames: Set<string> | null = null;

  /** @deprecated Use {@link AllowedEntityNames}. */
  @Input() set allowedEntityNames(value: Set<string> | null) {
    this.AllowedEntityNames = value;
  }
  /** @deprecated Use {@link AllowedEntityNames}. */
  get allowedEntityNames(): Set<string> | null {
    return this.AllowedEntityNames;
  }
  /** Application-based entity groups from the parent dashboard */
  @Input() AppEntityGroups: AppEntityGroup[] = [];

  /** @deprecated Use {@link AppEntityGroups}. */
  @Input() set appEntityGroups(value: AppEntityGroup[]) {
    this.AppEntityGroups = value;
  }
  /** @deprecated Use {@link AppEntityGroups}. */
  get appEntityGroups(): AppEntityGroup[] {
    return this.AppEntityGroups;
  }
  /** Optional application ID filter for the tree */
  @Input() ApplicationIdFilter: string | null = null;

  /** @deprecated Use {@link ApplicationIdFilter}. */
  @Input() set applicationIdFilter(value: string | null) {
    this.ApplicationIdFilter = value;
  }
  /** @deprecated Use {@link ApplicationIdFilter}. */
  get applicationIdFilter(): string | null {
    return this.ApplicationIdFilter;
  }

  // Section expansion states
  @Input() FavoritesSectionExpanded = true;

  /** @deprecated Use {@link FavoritesSectionExpanded}. */
  @Input() set favoritesSectionExpanded(value: NavigationPanelComponent['FavoritesSectionExpanded']) {
    this.FavoritesSectionExpanded = value;
  }
  /** @deprecated Use {@link FavoritesSectionExpanded}. */
  get favoritesSectionExpanded(): NavigationPanelComponent['FavoritesSectionExpanded'] {
    return this.FavoritesSectionExpanded;
  }
  @Input() RecentSectionExpanded = true;

  /** @deprecated Use {@link RecentSectionExpanded}. */
  @Input() set recentSectionExpanded(value: NavigationPanelComponent['RecentSectionExpanded']) {
    this.RecentSectionExpanded = value;
  }
  /** @deprecated Use {@link RecentSectionExpanded}. */
  get recentSectionExpanded(): NavigationPanelComponent['RecentSectionExpanded'] {
    return this.RecentSectionExpanded;
  }
  @Input() EntitiesSectionExpanded = true;

  /** @deprecated Use {@link EntitiesSectionExpanded}. */
  @Input() set entitiesSectionExpanded(value: NavigationPanelComponent['EntitiesSectionExpanded']) {
    this.EntitiesSectionExpanded = value;
  }
  /** @deprecated Use {@link EntitiesSectionExpanded}. */
  get entitiesSectionExpanded(): NavigationPanelComponent['EntitiesSectionExpanded'] {
    return this.EntitiesSectionExpanded;
  }
  @Input() ViewsSectionExpanded = true;

  /** @deprecated Use {@link ViewsSectionExpanded}. */
  @Input() set viewsSectionExpanded(value: NavigationPanelComponent['ViewsSectionExpanded']) {
    this.ViewsSectionExpanded = value;
  }
  /** @deprecated Use {@link ViewsSectionExpanded}. */
  get viewsSectionExpanded(): NavigationPanelComponent['ViewsSectionExpanded'] {
    return this.ViewsSectionExpanded;
  }

  @Output() EntitySelected = new EventEmitter<EntityInfo>();

  /**
   * @deprecated Use {@link EntitySelected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (entitySelected) keeps working. Must stay AFTER EntitySelected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() entitySelected = this.EntitySelected;
  @Output() ToggleCollapse = new EventEmitter<void>();

  /**
   * @deprecated Use {@link ToggleCollapse}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (toggleCollapse) keeps working. Must stay AFTER ToggleCollapse: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() toggleCollapse = this.ToggleCollapse;
  @Output() SectionToggled = new EventEmitter<'favorites' | 'recent' | 'entities' | 'views'>();

  /**
   * @deprecated Use {@link SectionToggled}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (sectionToggled) keeps working. Must stay AFTER SectionToggled: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() sectionToggled = this.SectionToggled;
  @Output() OpenRecord = new EventEmitter<OpenRecordEvent>();

  /**
   * @deprecated Use {@link OpenRecord}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (openRecord) keeps working. Must stay AFTER OpenRecord: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() openRecord = this.OpenRecord;
  /** Emitted when a record should be selected within Data Explorer (navigate to entity + select record) */
  @Output() SelectRecord = new EventEmitter<SelectRecordEvent>();

  /**
   * @deprecated Use {@link SelectRecord}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (selectRecord) keeps working. Must stay AFTER SelectRecord: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() selectRecord = this.SelectRecord;
  /** Emitted when a collapsed icon is clicked - expands panel and focuses section */
  @Output() ExpandAndFocus = new EventEmitter<'favorites' | 'recent' | 'entities'>();

  /**
   * @deprecated Use {@link ExpandAndFocus}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (expandAndFocus) keeps working. Must stay AFTER ExpandAndFocus: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() expandAndFocus = this.ExpandAndFocus;
  /** Emitted when a nav panel app group is toggled */
  @Output() AppGroupToggled = new EventEmitter<string>();

  /**
   * @deprecated Use {@link AppGroupToggled}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (appGroupToggled) keeps working. Must stay AFTER AppGroupToggled: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() appGroupToggled = this.AppGroupToggled;

  private get metadata() { return this.ProviderToUse; }

  // Tree configuration for entity list
  public TreeBranchConfig: TreeBranchConfig = {
    EntityName: 'MJ: Applications',
    DisplayField: 'Name',
    IDField: 'ID',
    IconField: 'Icon',
    OrderBy: 'Name'
  };

  /** @deprecated Use {@link TreeBranchConfig}. */
  public get treeBranchConfig(): TreeBranchConfig {
    return this.TreeBranchConfig;
  }
  /** @deprecated Use {@link TreeBranchConfig}. */
  public set treeBranchConfig(value: TreeBranchConfig) {
    this.TreeBranchConfig = value;
  }

  public TreeLeafConfig: TreeLeafConfig = {
    EntityName: 'MJ: Entities',
    ParentField: '', // Using JunctionConfig for M2M relationship
    DisplayField: 'DisplayName',
    IDField: 'ID',
    IconField: 'Icon',
    JunctionConfig: {
      EntityName: 'MJ: Application Entities',
      BranchForeignKey: 'ApplicationID',
      LeafForeignKey: 'EntityID'
    },
    OrderBy: 'DisplayName, Name'
  };

  /** @deprecated Use {@link TreeLeafConfig}. */
  public get treeLeafConfig(): TreeLeafConfig {
    return this.TreeLeafConfig;
  }
  /** @deprecated Use {@link TreeLeafConfig}. */
  public set treeLeafConfig(value: TreeLeafConfig) {
    this.TreeLeafConfig = value;
  }

  @ViewChild('entityTree') EntityTree?: TreeComponent;

  /** @deprecated Use {@link EntityTree}. */
  get entityTree(): TreeComponent | undefined {
    return this.EntityTree;
  }
  /** @deprecated Use {@link EntityTree}. */
  set entityTree(value: TreeComponent | undefined) {
    this.EntityTree = value;
  }

  /** Selected entity ID for tree highlighting */
  public SelectedEntityIds: string[] = [];

  /** @deprecated Use {@link SelectedEntityIds}. */
  public get selectedEntityIds(): string[] {
    return this.SelectedEntityIds;
  }
  /** @deprecated Use {@link SelectedEntityIds}. */
  public set selectedEntityIds(value: string[]) {
    this.SelectedEntityIds = value;
  }

  /** Search term for filtering the entity tree */
  public EntitySearchTerm = '';

  /** @deprecated Use {@link EntitySearchTerm}. */
  public get entitySearchTerm() {
    return this.EntitySearchTerm;
  }
  /** @deprecated Use {@link EntitySearchTerm}. */
  public set entitySearchTerm(value) {
    this.EntitySearchTerm = value;
  }

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
    if (this.SelectedEntityName) {
      const entity = this.metadata.Entities.find(e => e.Name === this.SelectedEntityName);
      if (entity) {
        this.SelectedEntityIds = [entity.ID];
        return;
      }
    }
    this.SelectedEntityIds = [];
  }

  /**
   * Update the tree's branch filter when application filter changes
   */
  private updateTreeBranchFilter(): void {
    if (this.ApplicationIdFilter) {
      this.TreeBranchConfig = {
        ...this.TreeBranchConfig,
        ExtraFilter: `ID='${this.ApplicationIdFilter}'`
      };
    } else {
      this.TreeBranchConfig = {
        ...this.TreeBranchConfig,
        ExtraFilter: undefined
      };
    }
  }

  /**
   * Filter the entity tree when search term changes
   */
  OnEntitySearchChanged(): void {
    if (this.EntityTree) {
      this.EntityTree.FilterNodes(this.EntitySearchTerm, {
        searchBranches: true,
        searchLeaves: true,
        caseSensitive: false
      });
    }
  }

  /** @deprecated Use {@link OnEntitySearchChanged}. */
  onEntitySearchChanged(): void {
    return this.OnEntitySearchChanged();
  }

  /**
   * Clear the entity search
   */
  ClearEntitySearch(): void {
    this.EntitySearchTerm = '';
    this.OnEntitySearchChanged();
  }

  /** @deprecated Use {@link ClearEntitySearch}. */
  clearEntitySearch(): void {
    return this.ClearEntitySearch();
  }

  /**
   * Handle tree selection change - map TreeNode to EntityInfo and emit
   */
  OnTreeEntitySelected(nodes: TreeNode[]): void {
    if (!nodes || nodes.length === 0) return;
    const node = nodes[0];
    if (node.Type !== 'leaf') return;

    // Find the EntityInfo by ID from the node
    const entity = this.metadata.Entities.find(e => UUIDsEqual(e.ID, node.ID));
    if (entity) {
      this.EntitySelected.emit(entity);
    }
  }

  /** @deprecated Use {@link OnTreeEntitySelected}. */
  onTreeEntitySelected(nodes: TreeNode[]): void {
    return this.OnTreeEntitySelected(nodes);
  }

  /**
   * Get recent items filtered by allowed entities (if filter is active)
   */
  get FilteredRecentItems(): RecentItem[] {
    if (!this.AllowedEntityNames) {
      return this.RecentItems;
    }
    return this.RecentItems.filter(r => this.AllowedEntityNames!.has(r.entityName));
  }

  /** @deprecated Use {@link FilteredRecentItems}. */
  get filteredRecentItems(): RecentItem[] {
    return this.FilteredRecentItems;
  }

  /**
   * Get favorites filtered to records only (respecting entity filter)
   */
  get FavoriteRecords(): FavoriteItem[] {
    const records = this.Favorites.filter(f => f.type === 'record');
    if (!this.AllowedEntityNames) {
      return records;
    }
    return records.filter(f => f.entityName && this.AllowedEntityNames!.has(f.entityName));
  }

  /** @deprecated Use {@link FavoriteRecords}. */
  get favoriteRecords(): FavoriteItem[] {
    return this.FavoriteRecords;
  }

  /**
   * Get favorites filtered to entities only (respecting entity filter)
   */
  get FavoriteEntities(): FavoriteItem[] {
    const entities = this.Favorites.filter(f => f.type === 'entity');
    if (!this.AllowedEntityNames) {
      return entities;
    }
    return entities.filter(f => f.entityName && this.AllowedEntityNames!.has(f.entityName));
  }

  /** @deprecated Use {@link FavoriteEntities}. */
  get favoriteEntities(): FavoriteItem[] {
    return this.FavoriteEntities;
  }

  /**
   * Handle entity click
   */
  OnEntityClick(entity: EntityInfo): void {
    this.EntitySelected.emit(entity);
  }

  /** @deprecated Use {@link OnEntityClick}. */
  onEntityClick(entity: EntityInfo): void {
    return this.OnEntityClick(entity);
  }

  /**
   * Handle favorite click - navigates to entity and selects record within Data Explorer
   */
  OnFavoriteClick(favorite: FavoriteItem): void {
    if (favorite.type === 'entity' && favorite.entityName) {
      const entity = this.Entities.find(e => e.Name === favorite.entityName);
      if (entity) {
        this.EntitySelected.emit(entity);
      }
    } else if (favorite.type === 'record' && favorite.entityName && favorite.compositeKeyString) {
      // Extract record ID from the composite key string
      // Format is "FieldName|Value" or "FieldName|Value||FieldName2|Value2"
      const compositeKey = new CompositeKey();
      compositeKey.LoadFromConcatenatedString(favorite.compositeKeyString);
      const recordId = compositeKey.KeyValuePairs[0]?.Value?.toString() || '';

      // Navigate to entity and select record within Data Explorer (not full tab)
      this.SelectRecord.emit({
        entityName: favorite.entityName,
        recordId
      });
    }
  }

  /** @deprecated Use {@link OnFavoriteClick}. */
  onFavoriteClick(favorite: FavoriteItem): void {
    return this.OnFavoriteClick(favorite);
  }

  /**
   * Handle recent item click - navigates to entity and selects record within Data Explorer
   */
  OnRecentClick(item: RecentItem): void {
    // Extract record ID from the composite key string
    const compositeKey = new CompositeKey();
    compositeKey.LoadFromConcatenatedString(item.compositeKeyString);
    const recordId = compositeKey.KeyValuePairs[0]?.Value?.toString() || '';

    // Navigate to entity and select record within Data Explorer (not full tab)
    this.SelectRecord.emit({
      entityName: item.entityName,
      recordId
    });
  }

  /** @deprecated Use {@link OnRecentClick}. */
  onRecentClick(item: RecentItem): void {
    return this.OnRecentClick(item);
  }

  /**
   * Handle section header click
   */
  OnSectionToggle(section: 'favorites' | 'recent' | 'entities' | 'views'): void {
    this.SectionToggled.emit(section);
  }

  /** @deprecated Use {@link OnSectionToggle}. */
  onSectionToggle(section: 'favorites' | 'recent' | 'entities' | 'views'): void {
    return this.OnSectionToggle(section);
  }

  /**
   * Handle collapse toggle
   */
  OnToggleCollapse(): void {
    this.ToggleCollapse.emit();
  }

  /** @deprecated Use {@link OnToggleCollapse}. */
  onToggleCollapse(): void {
    return this.OnToggleCollapse();
  }

  /**
   * Handle collapsed icon click - expands panel and focuses section
   */
  OnCollapsedIconClick(section: 'favorites' | 'recent' | 'entities'): void {
    this.ExpandAndFocus.emit(section);
  }

  /** @deprecated Use {@link OnCollapsedIconClick}. */
  onCollapsedIconClick(section: 'favorites' | 'recent' | 'entities'): void {
    return this.OnCollapsedIconClick(section);
  }

  /**
   * Check if entity is selected
   */
  IsEntitySelected(entity: EntityInfo): boolean {
    return entity.Name === this.SelectedEntityName;
  }

  /** @deprecated Use {@link IsEntitySelected}. */
  isEntitySelected(entity: EntityInfo): boolean {
    return this.IsEntitySelected(entity);
  }

  /**
   * Get icon for entity
   */
  GetEntityIcon(entity: EntityInfo): string {
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

  /** @deprecated Use {@link GetEntityIcon}. */
  getEntityIcon(entity: EntityInfo): string {
    return this.GetEntityIcon(entity);
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
  FormatTimestamp(timestamp: Date): string {
    const epoch = new Date(timestamp).getTime();
    const cached = this.timestampLabelCache.get(epoch);
    if (cached !== undefined) {
      return cached;
    }
    const label = this.computeRelativeLabel(epoch);
    this.timestampLabelCache.set(epoch, label);
    return label;
  }

  /** @deprecated Use {@link FormatTimestamp}. */
  formatTimestamp(timestamp: Date): string {
    return this.FormatTimestamp(timestamp);
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
  GetRecentItemIcon(item: RecentItem): string {
    const entityInfo = this.metadata.Entities.find(e => e.Name === item.entityName);
    if (entityInfo) {
      return this.GetEntityIcon(entityInfo);
    }
    return 'fa-solid fa-file-alt';
  }

  /** @deprecated Use {@link GetRecentItemIcon}. */
  getRecentItemIcon(item: RecentItem): string {
    return this.GetRecentItemIcon(item);
  }

  /**
   * Get icon for a favorite item based on its type and entity
   */
  GetFavoriteIcon(favorite: FavoriteItem): string {
    if (favorite.type === 'view') {
      return 'fa-solid fa-filter';
    }

    // For entity and record types, look up the entity icon
    if (favorite.entityName) {
      const entityInfo = this.metadata.Entities.find(e => e.Name === favorite.entityName);
      if (entityInfo) {
        return this.GetEntityIcon(entityInfo);
      }
    }

    // Fallback icons
    if (favorite.type === 'entity') {
      return 'fa-solid fa-table';
    }
    return 'fa-solid fa-file-alt';
  }

  /** @deprecated Use {@link GetFavoriteIcon}. */
  getFavoriteIcon(favorite: FavoriteItem): string {
    return this.GetFavoriteIcon(favorite);
  }

  /**
   * Get user-friendly display name for an entity.
   */
  GetEntityDisplayName(entityName?: string): string {
    if (!entityName) {
      return '';
    }
    const entityInfo = this.metadata.Entities.find(e => e.Name.toLowerCase() === entityName.toLowerCase());
    return entityInfo?.DisplayNameOrName || entityName;
  }

  /** @deprecated Use {@link GetEntityDisplayName}. */
  getEntityDisplayName(entityName?: string): string {
    return this.GetEntityDisplayName(entityName);
  }
}
