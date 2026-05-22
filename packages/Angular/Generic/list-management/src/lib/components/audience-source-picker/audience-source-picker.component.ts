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
      this.activeTab = value.kind;
      if (value.kind === 'list') {
        this.selectedListId = value.listId;
      } else if (value.kind === 'view') {
        this.selectedViewId = value.viewId;
      } else {
        this.adhocEntityName = value.entityName;
        this.adhocFilter = value.extraFilter;
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

  public activeTab: AudienceSourcePickerTab = 'list';
  public entityOptions: EntityInfo[] = [];

  // List-tab state
  public selectedEntityName: string | null = null;
  public availableLists: MJListEntity[] = [];
  public filteredLists: MJListEntity[] = [];
  public listSearch = '';
  public selectedListId: string | null = null;

  // View-tab state
  public availableViews: MJUserViewEntity[] = [];
  public filteredViews: MJUserViewEntity[] = [];
  public viewSearch = '';
  public selectedViewId: string | null = null;

  // Adhoc-tab state
  public adhocEntityName: string | null = null;
  public adhocFilter = '';

  public loading = false;

  async ngOnInit(): Promise<void> {
    this.entityOptions = this.ProviderToUse.Entities
      .filter((e) => !e.SchemaName.startsWith('sys'))
      .sort((a, b) => a.Name.localeCompare(b.Name));
    if (this.LockedEntityName) {
      this.selectedEntityName = this.LockedEntityName;
      this.adhocEntityName = this.LockedEntityName;
    } else if (this.entityOptions.length > 0) {
      this.selectedEntityName = this.entityOptions[0].Name;
      this.adhocEntityName = this.selectedEntityName;
    }
    await this.refreshTabData();
  }

  public async setTab(tab: AudienceSourcePickerTab): Promise<void> {
    this.activeTab = tab;
    this.emitCurrentSource();
    await this.refreshTabData();
  }

  public async OnEntityChange(name: string): Promise<void> {
    this.selectedEntityName = name;
    this.adhocEntityName = name;
    // Selecting a new entity invalidates any picked list/view.
    this.selectedListId = null;
    this.selectedViewId = null;
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
    this.selectedListId = list.ID;
    this.emitCurrentSource();
  }

  public OnSelectView(view: MJUserViewEntity): void {
    this.selectedViewId = view.ID;
    this.emitCurrentSource();
  }

  public OnAdhocFilterChange(): void {
    this.emitCurrentSource();
  }

  /**
   * Build the currently-selected `AudienceSource` from picker state, or
   * `null` if the picker isn't yet in a complete state.
   */
  public get currentSource(): AudienceSource | null {
    if (this.activeTab === 'list') {
      return this.selectedListId ? { kind: 'list', listId: this.selectedListId } : null;
    }
    if (this.activeTab === 'view') {
      return this.selectedViewId ? { kind: 'view', viewId: this.selectedViewId } : null;
    }
    // adhoc
    if (this.adhocEntityName && this.adhocFilter.trim().length > 0) {
      return { kind: 'adhoc', entityName: this.adhocEntityName, extraFilter: this.adhocFilter.trim() };
    }
    return null;
  }

  private emitCurrentSource(): void {
    this._source = this.currentSource;
    this.SourceChange.emit(this._source);
    this.cdr.markForCheck();
  }

  /**
   * Pull lists or views for the current tab from the server. We
   * intentionally batch the (list, view) pair on entity change so
   * switching tabs doesn't re-query.
   */
  private async refreshTabData(): Promise<void> {
    if (!this.selectedEntityName) return;
    this.loading = true;
    this.cdr.markForCheck();
    try {
      const entityInfo = this.ProviderToUse.EntityByName(this.selectedEntityName);
      if (!entityInfo) {
        this.availableLists = [];
        this.availableViews = [];
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
      this.availableLists = lists.Success ? lists.Results ?? [] : [];
      this.availableViews = views.Success ? views.Results ?? [] : [];
      this.recomputeFilteredLists();
      this.recomputeFilteredViews();
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private recomputeFilteredLists(): void {
    const term = this.listSearch.trim().toLowerCase();
    this.filteredLists = term
      ? this.availableLists.filter((l) => l.Name.toLowerCase().includes(term))
      : this.availableLists;
    this.cdr.markForCheck();
  }

  private recomputeFilteredViews(): void {
    const term = this.viewSearch.trim().toLowerCase();
    this.filteredViews = term
      ? this.availableViews.filter((v) => v.Name.toLowerCase().includes(term))
      : this.availableViews;
    this.cdr.markForCheck();
  }
}
