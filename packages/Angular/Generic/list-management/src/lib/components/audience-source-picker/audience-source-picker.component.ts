import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { RunView, type EntityInfo } from '@memberjunction/core';
import type { MJListEntity, MJUserViewEntity } from '@memberjunction/core-entities';
import type { AudienceSource } from '@memberjunction/lists-base';

/**
 * Reusable picker for an `AudienceSource` (mockup 20). Three tabs:
 *
 *   - **List** — pick from saved `MJ: List`s for the chosen entity.
 *   - **View** — pick from saved `MJ: User View`s for the chosen entity.
 *     Marked "live" so the user knows the record set is re-resolved at
 *     execution time.
 *   - **Ad-hoc Filter** — entity + free-form `ExtraFilter`. Skips
 *     server-side validation; the consumer can pre-flight via
 *     `ResolveAudience` (Action) or `AudienceResolver.Resolve` if desired.
 *
 * Emits the typed `AudienceSource` via `SourceChange` on selection; the
 * sister `AudienceSourceSummaryComponent` renders the friendly summary.
 * Multi-provider safe via `BaseAngularComponent.ProviderToUse`.
 */
export type AudienceSourcePickerTab = 'list' | 'view' | 'adhoc';

@Component({
  standalone: false,
  selector: 'mj-audience-source-picker',
  templateUrl: './audience-source-picker.component.html',
  styleUrls: ['./audience-source-picker.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AudienceSourcePickerComponent extends BaseAngularComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);

  /**
   * Pre-seed the picker with an existing audience. Useful when editing
   * a previously-configured audience on a saved campaign.
   */
  @Input()
  set Source(value: AudienceSource | null) {
    this._source = value;
    if (value) {
      // Pick the right tab + restore the saved field values.
      this.ActiveTab = value.kind;
      if (value.kind === 'list') {
        this.SelectedListId = value.listId;
      } else if (value.kind === 'view') {
        this.SelectedViewId = value.viewId;
      } else {
        this.AdhocEntityName = value.entityName;
        this.AdhocFilter = value.extraFilter;
      }
    }
  }
  get Source(): AudienceSource | null {
    return this._source;
  }
  private _source: AudienceSource | null = null;

  /** When set, restrict the entity dropdown to this entity (lock it). */
  @Input() LockedEntityName: string | null = null;

  @Output() SourceChange = new EventEmitter<AudienceSource | null>();

  public ActiveTab: AudienceSourcePickerTab = 'list';

  /** @deprecated Use {@link ActiveTab}. */
  public get activeTab(): AudienceSourcePickerTab {
    return this.ActiveTab;
  }
  /** @deprecated Use {@link ActiveTab}. */
  public set activeTab(value: AudienceSourcePickerTab) {
    this.ActiveTab = value;
  }
  public EntityOptions: EntityInfo[] = [];

  /** @deprecated Use {@link EntityOptions}. */
  public get entityOptions(): EntityInfo[] {
    return this.EntityOptions;
  }
  /** @deprecated Use {@link EntityOptions}. */
  public set entityOptions(value: EntityInfo[]) {
    this.EntityOptions = value;
  }

  // List-tab state
  public SelectedEntityName: string | null = null;

  /** @deprecated Use {@link SelectedEntityName}. */
  public get selectedEntityName(): string | null {
    return this.SelectedEntityName;
  }
  /** @deprecated Use {@link SelectedEntityName}. */
  public set selectedEntityName(value: string | null) {
    this.SelectedEntityName = value;
  }
  public AvailableLists: MJListEntity[] = [];

  /** @deprecated Use {@link AvailableLists}. */
  public get availableLists(): MJListEntity[] {
    return this.AvailableLists;
  }
  /** @deprecated Use {@link AvailableLists}. */
  public set availableLists(value: MJListEntity[]) {
    this.AvailableLists = value;
  }
  public FilteredLists: MJListEntity[] = [];

  /** @deprecated Use {@link FilteredLists}. */
  public get filteredLists(): MJListEntity[] {
    return this.FilteredLists;
  }
  /** @deprecated Use {@link FilteredLists}. */
  public set filteredLists(value: MJListEntity[]) {
    this.FilteredLists = value;
  }
  public ListSearch = '';

  /** @deprecated Use {@link ListSearch}. */
  public get listSearch() {
    return this.ListSearch;
  }
  /** @deprecated Use {@link ListSearch}. */
  public set listSearch(value) {
    this.ListSearch = value;
  }
  public SelectedListId: string | null = null;

  /** @deprecated Use {@link SelectedListId}. */
  public get selectedListId(): string | null {
    return this.SelectedListId;
  }
  /** @deprecated Use {@link SelectedListId}. */
  public set selectedListId(value: string | null) {
    this.SelectedListId = value;
  }

  // View-tab state
  public AvailableViews: MJUserViewEntity[] = [];

  /** @deprecated Use {@link AvailableViews}. */
  public get availableViews(): MJUserViewEntity[] {
    return this.AvailableViews;
  }
  /** @deprecated Use {@link AvailableViews}. */
  public set availableViews(value: MJUserViewEntity[]) {
    this.AvailableViews = value;
  }
  public FilteredViews: MJUserViewEntity[] = [];

  /** @deprecated Use {@link FilteredViews}. */
  public get filteredViews(): MJUserViewEntity[] {
    return this.FilteredViews;
  }
  /** @deprecated Use {@link FilteredViews}. */
  public set filteredViews(value: MJUserViewEntity[]) {
    this.FilteredViews = value;
  }
  public ViewSearch = '';

  /** @deprecated Use {@link ViewSearch}. */
  public get viewSearch() {
    return this.ViewSearch;
  }
  /** @deprecated Use {@link ViewSearch}. */
  public set viewSearch(value) {
    this.ViewSearch = value;
  }
  public SelectedViewId: string | null = null;

  /** @deprecated Use {@link SelectedViewId}. */
  public get selectedViewId(): string | null {
    return this.SelectedViewId;
  }
  /** @deprecated Use {@link SelectedViewId}. */
  public set selectedViewId(value: string | null) {
    this.SelectedViewId = value;
  }

  // Adhoc-tab state
  public AdhocEntityName: string | null = null;

  /** @deprecated Use {@link AdhocEntityName}. */
  public get adhocEntityName(): string | null {
    return this.AdhocEntityName;
  }
  /** @deprecated Use {@link AdhocEntityName}. */
  public set adhocEntityName(value: string | null) {
    this.AdhocEntityName = value;
  }
  public AdhocFilter = '';

  /** @deprecated Use {@link AdhocFilter}. */
  public get adhocFilter() {
    return this.AdhocFilter;
  }
  /** @deprecated Use {@link AdhocFilter}. */
  public set adhocFilter(value) {
    this.AdhocFilter = value;
  }

  public Loading = false;

  /** @deprecated Use {@link Loading}. */
  public get loading() {
    return this.Loading;
  }
  /** @deprecated Use {@link Loading}. */
  public set loading(value) {
    this.Loading = value;
  }

  async ngOnInit(): Promise<void> {
    this.EntityOptions = this.ProviderToUse.Entities
      .filter((e) => !e.SchemaName.startsWith('sys'))
      .sort((a, b) => a.Name.localeCompare(b.Name));
    if (this.LockedEntityName) {
      this.SelectedEntityName = this.LockedEntityName;
      this.AdhocEntityName = this.LockedEntityName;
    } else if (this.EntityOptions.length > 0) {
      this.SelectedEntityName = this.EntityOptions[0].Name;
      this.AdhocEntityName = this.SelectedEntityName;
    }
    await this.refreshTabData();
  }

  public async SetTab(tab: AudienceSourcePickerTab): Promise<void> {
    this.ActiveTab = tab;
    this.emitCurrentSource();
    await this.refreshTabData();
  }

  /** @deprecated Use {@link SetTab}. */
  public async setTab(tab: AudienceSourcePickerTab): Promise<void> {
    return this.SetTab(tab);
  }

  public async OnEntityChange(name: string): Promise<void> {
    this.SelectedEntityName = name;
    this.AdhocEntityName = name;
    // Selecting a new entity invalidates any picked list/view.
    this.SelectedListId = null;
    this.SelectedViewId = null;
    this.emitCurrentSource();
    await this.refreshTabData();
  }

  public OnListSearchChange(): void {
    this.recomputeFilteredLists();
  }

  public OnViewSearchChange(): void {
    this.recomputeFilteredViews();
  }

  public OnSelectList(list: MJListEntity): void {
    this.SelectedListId = list.ID;
    this.emitCurrentSource();
  }

  public OnSelectView(view: MJUserViewEntity): void {
    this.SelectedViewId = view.ID;
    this.emitCurrentSource();
  }

  public OnAdhocFilterChange(): void {
    this.emitCurrentSource();
  }

  /**
   * Build the currently-selected `AudienceSource` from picker state, or
   * `null` if the picker isn't yet in a complete state.
   */
  public get CurrentSource(): AudienceSource | null {
    if (this.ActiveTab === 'list') {
      return this.SelectedListId ? { kind: 'list', listId: this.SelectedListId } : null;
    }
    if (this.ActiveTab === 'view') {
      return this.SelectedViewId ? { kind: 'view', viewId: this.SelectedViewId } : null;
    }
    // adhoc
    if (this.AdhocEntityName && this.AdhocFilter.trim().length > 0) {
      return { kind: 'adhoc', entityName: this.AdhocEntityName, extraFilter: this.AdhocFilter.trim() };
    }
    return null;
  }

  /** @deprecated Use {@link CurrentSource}. */
  public get currentSource(): AudienceSource | null {
    return this.CurrentSource;
  }

  private emitCurrentSource(): void {
    this._source = this.CurrentSource;
    this.SourceChange.emit(this._source);
    this.cdr.markForCheck();
  }

  /**
   * Pull lists or views for the current tab from the server. We
   * intentionally batch the (list, view) pair on entity change so
   * switching tabs doesn't re-query.
   */
  private async refreshTabData(): Promise<void> {
    if (!this.SelectedEntityName) return;
    this.Loading = true;
    this.cdr.markForCheck();
    try {
      const entityInfo = this.ProviderToUse.EntityByName(this.SelectedEntityName);
      if (!entityInfo) {
        this.AvailableLists = [];
        this.AvailableViews = [];
        this.recomputeFilteredLists();
        this.recomputeFilteredViews();
        return;
      }
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const [lists, views] = await Promise.all([
        rv.RunView<MJListEntity>({
          EntityName: 'MJ: Lists',
          ExtraFilter: `EntityID='${entityInfo.ID}'`,
          OrderBy: 'Name',
          ResultType: 'entity_object',
        }),
        rv.RunView<MJUserViewEntity>({
          EntityName: 'MJ: User Views',
          ExtraFilter: `EntityID='${entityInfo.ID}'`,
          OrderBy: 'Name',
          ResultType: 'entity_object',
        }),
      ]);
      this.AvailableLists = lists.Success ? lists.Results ?? [] : [];
      this.AvailableViews = views.Success ? views.Results ?? [] : [];
      this.recomputeFilteredLists();
      this.recomputeFilteredViews();
    } finally {
      this.Loading = false;
      this.cdr.markForCheck();
    }
  }

  private recomputeFilteredLists(): void {
    const term = this.ListSearch.trim().toLowerCase();
    this.FilteredLists = term
      ? this.AvailableLists.filter((l) => l.Name.toLowerCase().includes(term))
      : this.AvailableLists;
    this.cdr.markForCheck();
  }

  private recomputeFilteredViews(): void {
    const term = this.ViewSearch.trim().toLowerCase();
    this.FilteredViews = term
      ? this.AvailableViews.filter((v) => v.Name.toLowerCase().includes(term))
      : this.AvailableViews;
    this.cdr.markForCheck();
  }
}
