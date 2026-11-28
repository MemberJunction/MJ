import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { CompositeKey, LogError, UserInfo } from '@memberjunction/core';
import {
  MJEnvironmentEntityExtended,
  MJVideoArchetypeEntity,
  ResourceData,
  VideoStudioEngine,
} from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { FormatVideoTime, FormatVideoTimeRange } from '@memberjunction/ng-artifacts';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { FilterFieldConfig } from '@memberjunction/ng-ui-components';
import { ArchetypeEditorMode } from '../components/vs-archetype-editor.component';
import {
  ARCHETYPE_CATEGORIES,
  ArchetypeCardSnapshot,
  ArchetypeCategory,
  ArchetypeCategoryFilter,
  ArchetypeCategoryGroup,
  ArchetypeFilterState,
  ArchetypeScopeFilter,
  BuildArchetypesAgentContext,
  FilterArchetypeCards,
  GroupArchetypesByCategory,
  MapArchetypeToCard,
  ParseArchetypeDefaultFormats,
  ResolveVideoStudioItem,
  StudioBriefClientToolDefinition,
} from '../video-studio-agent-context';

export interface ArchetypeBeatBlock {
  Key: string;
  Label: string;
  Purpose: string;
  MinDurationSeconds: number;
  MaxDurationSeconds: number;
  DefaultDurationSeconds?: number;
  ComputedDurationSeconds: number;
  WidthPercent: number;
  Guidance?: string;
  RequiresDataBinding?: boolean;
}

export interface ArchetypePacingView {
  AvgSecondsBetweenChanges: number;
  HoldRules: string;
  MinBeatDurationSeconds?: number;
  MaxBeatDurationSeconds?: number;
}

export interface ArchetypeViewItem extends ArchetypeCardSnapshot {
  DefaultInteractionMode: string;
  Guidance: string | null;
  BeatTemplateRaw: string;
  PacingRaw: string | null;
  Beats: ArchetypeBeatBlock[];
  Pacing: ArchetypePacingView | null;
}

export interface ArchetypeCategoryChipItem {
  Category: ArchetypeCategory;
  Label: string;
  Count: number;
}

/**
 * Archetypes resource tab for the Video Studio application.
 *
 * Displays all `MJ: Video Archetypes` from `VideoStudioEngine` in a single
 * grid with `<mj-filter-chip>` filters for `Category` (`Announcement | Briefing |
 * DataStory | Explainer | Product | Social | Tutorial`) and scope (`Shipped` /
 * `Yours`), proportional beat-timeline strips (`arch.BeatTemplateObject`), and an
 * inline slide-out preview showing the full beat template, pacing rules,
 * and narrative guidance.
 *
 * Company archetypes (`CompanyID` non-null) provide an "Edit" button that opens
 * `vs-archetype-editor` plus an "Open record" link to the entity form, while
 * shipped archetypes (`CompanyID IS NULL`) are read-only with a "Make a copy"
 * button that opens `vs-archetype-editor` pre-filled with the shipped row.
 */
@RegisterClass(BaseResourceComponent, 'VideoStudioArchetypesResource')
@Component({
  standalone: false,
  selector: 'mj-video-studio-archetypes-resource',
  templateUrl: './video-studio-archetypes-resource.component.html',
  styleUrls: ['./video-studio-archetypes-resource.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoStudioArchetypesResourceComponent
  extends BaseResourceComponent
  implements OnInit
{
  public IsLoading = false;
  public LoadError: string | null = null;

  public AllArchetypes: ArchetypeViewItem[] = [];
  public FilteredArchetypes: ArchetypeViewItem[] = [];
  public CategoryGroups: ArchetypeCategoryGroup<ArchetypeViewItem>[] = [];
  public CategoryChipItems: ArchetypeCategoryChipItem[] = [];
  public CategoryAllCount = 0;
  public SelectedArchetype: ArchetypeViewItem | null = null;

  public SearchText = '';
  public CategoryFilter: ArchetypeCategoryFilter = 'all';
  public ScopeFilter: ArchetypeScopeFilter = 'all';

  public FilterFields: FilterFieldConfig[] = [
    {
      key: 'category',
      label: 'Category',
      type: 'dropdown',
      options: [
        { value: 'all', text: 'All categories' },
        ...ARCHETYPE_CATEGORIES.map((cat) => ({
          value: cat,
          text: this.FormatCategoryLabel(cat),
        })),
      ],
    },
    {
      key: 'scope',
      label: 'Scope',
      type: 'dropdown',
      options: [
        { value: 'all', text: 'All scopes' },
        { value: 'shipped', text: 'Shipped (read-only)' },
        { value: 'company', text: 'Company overrides' },
      ],
    },
  ];

  public FilterValues: Record<string, unknown> = {
    category: 'all',
    scope: 'all',
  };

  // Archetype editor dialog state
  public IsEditorOpen = false;
  public EditorMode: ArchetypeEditorMode = 'copy';
  public EditorSourceArchetypeId: string | null = null;
  public EditorEditingArchetypeId: string | null = null;

  public PageContext: Record<string, unknown> = this.buildArchetypesContext();
  public readonly PageTools: StudioBriefClientToolDefinition[] = this.buildArchetypesClientTools();

  private readonly cdr = inject(ChangeDetectorRef);

  public get CurrentUser(): UserInfo | null {
    return this.ProviderToUse?.CurrentUser ?? null;
  }

  public get EnvironmentId(): string {
    return (
      (this.Data?.Configuration?.['environmentId'] as string | undefined) ||
      MJEnvironmentEntityExtended.DefaultEnvironmentID
    );
  }

  public get ApplicationId(): string {
    return (this.Data?.Configuration?.['applicationId'] as string | undefined) ?? '';
  }

  async ngOnInit(): Promise<void> {
    super.ngOnInit();
    await this.LoadArchetypes(false);
    this.NotifyLoadComplete();
  }

  public async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Archetypes';
  }

  public async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-layer-group';
  }

  public get TotalCount(): number {
    return this.AllArchetypes.length;
  }

  public get FilteredCount(): number {
    return this.FilteredArchetypes.length;
  }

  public get ShippedCount(): number {
    return this.AllArchetypes.filter((a) => a.IsShipped).length;
  }

  public get CompanyCount(): number {
    return this.AllArchetypes.filter((a) => !a.IsShipped).length;
  }

  public get EditorDialogTitle(): string {
    if (this.EditorMode === 'edit') {
      const target = this.AllArchetypes.find(
        (a) => this.EditorEditingArchetypeId && UUIDsEqual(a.ID, this.EditorEditingArchetypeId),
      );
      return target ? `Edit "${target.Name}"` : 'Edit archetype';
    }
    if (this.EditorSourceArchetypeId) {
      const source = this.AllArchetypes.find(
        (a) => this.EditorSourceArchetypeId && UUIDsEqual(a.ID, this.EditorSourceArchetypeId),
      );
      if (source) {
        return `Make a copy of "${source.Name}"`;
      }
    }
    return 'New archetype';
  }

  public get ActivePopoverFilterCount(): number {
    let count = 0;
    if (this.CategoryFilter && this.CategoryFilter !== 'all') {
      count++;
    }
    if (this.ScopeFilter && this.ScopeFilter !== 'all') {
      count++;
    }
    return count;
  }

  public async Refresh(): Promise<void> {
    await this.LoadArchetypes(true);
  }

  public async LoadArchetypes(forceRefresh = false): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();

    try {
      const engine = VideoStudioEngine.GetProviderInstance<VideoStudioEngine>(
        this.ProviderToUse,
        VideoStudioEngine,
      ) as VideoStudioEngine;
      await engine.Config(forceRefresh, undefined, this.ProviderToUse);
      const archetypes = engine.Archetypes;
      this.AllArchetypes = archetypes.map((arch) => this.mapArchetypeToCard(arch));
      this.applyFiltersAndSync();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      LogError(msg);
      this.LoadError = msg;
    } finally {
      this.IsLoading = false;
      this.syncAgentContext();
      this.cdr.markForCheck();
    }
  }

  public OnSearchChange(value: string): void {
    this.SearchText = value;
    this.applyFiltersAndSync();
  }

  public OnFilterValuesChange(values: Record<string, unknown>): void {
    this.FilterValues = { ...values };
    const rawCat = typeof values['category'] === 'string' && values['category'].trim()
      ? values['category'].trim()
      : 'all';
    const rawScope = typeof values['scope'] === 'string' && values['scope'].trim()
      ? values['scope'].trim()
      : 'all';
    this.CategoryFilter = rawCat as ArchetypeCategoryFilter;
    this.ScopeFilter = rawScope as ArchetypeScopeFilter;
    this.applyFiltersAndSync();
  }

  public SelectCategoryChip(category: ArchetypeCategoryFilter): void {
    const nextCategory =
      category !== 'all' && this.CategoryFilter === category ? 'all' : category;
    this.CategoryFilter = nextCategory;
    this.FilterValues = {
      ...this.FilterValues,
      category: nextCategory,
    };
    this.applyFiltersAndSync();
  }

  public ToggleScopeChip(scope: 'shipped' | 'company'): void {
    const nextScope: ArchetypeScopeFilter = this.ScopeFilter === scope ? 'all' : scope;
    this.ScopeFilter = nextScope;
    this.FilterValues = {
      ...this.FilterValues,
      scope: nextScope,
    };
    this.applyFiltersAndSync();
  }

  public ClearAllFilters(): void {
    this.CategoryFilter = 'all';
    this.ScopeFilter = 'all';
    this.FilterValues = {
      category: 'all',
      scope: 'all',
    };
    this.applyFiltersAndSync();
  }

  public SelectArchetype(item: ArchetypeViewItem | null): void {
    this.SelectedArchetype = item;
    this.syncAgentContext();
    this.cdr.markForCheck();
  }

  public CloseSlideOut(): void {
    this.SelectArchetype(null);
  }

  public OpenNewArchetypeEditor(): void {
    this.EditorMode = 'copy';
    this.EditorSourceArchetypeId = this.SelectedArchetype?.ID ?? null;
    this.EditorEditingArchetypeId = null;
    this.IsEditorOpen = true;
    this.cdr.markForCheck();
  }

  public OpenCopyArchetypeEditor(item: ArchetypeViewItem, event?: Event): void {
    event?.stopPropagation();
    this.EditorMode = 'copy';
    this.EditorSourceArchetypeId = item.ID;
    this.EditorEditingArchetypeId = null;
    this.IsEditorOpen = true;
    this.cdr.markForCheck();
  }

  public OpenEditArchetypeEditor(item: ArchetypeViewItem, event?: Event): void {
    event?.stopPropagation();
    if (item.IsShipped) {
      this.OpenCopyArchetypeEditor(item, event);
      return;
    }
    this.EditorMode = 'edit';
    this.EditorSourceArchetypeId = null;
    this.EditorEditingArchetypeId = item.ID;
    this.IsEditorOpen = true;
    this.cdr.markForCheck();
  }

  public OpenArchetypeRecord(item: ArchetypeViewItem, event?: Event): void {
    event?.stopPropagation();
    if (item.IsShipped) {
      this.OpenCopyArchetypeEditor(item, event);
      return;
    }
    this.navigationService.OpenEntityRecord(
      'MJ: Video Archetypes',
      CompositeKey.FromID(item.ID),
    );
  }

  public CloseArchetypeEditor(): void {
    this.IsEditorOpen = false;
    this.EditorSourceArchetypeId = null;
    this.EditorEditingArchetypeId = null;
    this.cdr.markForCheck();
  }

  public async OnArchetypeEditorSaved(savedArchetypeId: string): Promise<void> {
    this.IsEditorOpen = false;
    this.EditorSourceArchetypeId = null;
    this.EditorEditingArchetypeId = null;
    await this.LoadArchetypes(true);
    const saved = this.AllArchetypes.find((a) => UUIDsEqual(a.ID, savedArchetypeId));
    if (saved) {
      this.SelectArchetype(saved);
    }
    this.cdr.markForCheck();
  }

  public FormatCategoryLabel(category: ArchetypeCategory | string): string {
    if (category === 'DataStory') {
      return 'Data Story';
    }
    return category;
  }

  public FormatTime(seconds: number): string {
    return FormatVideoTime(seconds);
  }

  public FormatTimeRange(minSeconds: number, maxSeconds: number): string {
    return FormatVideoTimeRange(minSeconds, maxSeconds);
  }

  public ParseFormats(formatsRaw: string): string[] {
    return ParseArchetypeDefaultFormats(formatsRaw);
  }

  public ResetFiltersAndSearch(): void {
    this.ClearAllFilters();
    this.OnSearchChange('');
  }

  private rebuildCategoryChips(): void {
    const rowsAfterOtherFilters = FilterArchetypeCards(this.AllArchetypes, {
      SearchQuery: this.SearchText,
      Category: 'all',
      Scope: this.ScopeFilter,
    });
    const countsByCategory = new Map<ArchetypeCategory, number>();
    for (const cat of ARCHETYPE_CATEGORIES) {
      countsByCategory.set(cat, 0);
    }
    for (const arch of rowsAfterOtherFilters) {
      countsByCategory.set(
        arch.Category,
        (countsByCategory.get(arch.Category) ?? 0) + 1,
      );
    }
    this.CategoryAllCount = rowsAfterOtherFilters.length;
    this.CategoryChipItems = ARCHETYPE_CATEGORIES.map((cat) => ({
      Category: cat,
      Label: this.FormatCategoryLabel(cat),
      Count: countsByCategory.get(cat) ?? 0,
    }));
  }

  private mapArchetypeToCard(arch: MJVideoArchetypeEntity): ArchetypeViewItem {
    const snapshot = MapArchetypeToCard(arch);
    const rawBeats = Array.isArray(arch.BeatTemplateObject) ? arch.BeatTemplateObject : [];
    const beatItems = snapshot.BeatItems ?? [];
    const totalWeight = beatItems.reduce((acc, item) => acc + item.Seconds, 0) || 1;

    const beats: ArchetypeBeatBlock[] = rawBeats.map((b, idx) => {
      const stripItem = beatItems[idx];
      const seconds = stripItem?.Seconds ?? 1;
      return {
        Key: (b.Key ?? '').trim() || stripItem?.Key || `beat-${idx + 1}`,
        Label: stripItem?.Label ?? (b.Label || b.Key || `Beat ${idx + 1}`),
        Purpose: b.Purpose || '',
        MinDurationSeconds: b.MinDurationSeconds ?? 0,
        MaxDurationSeconds: b.MaxDurationSeconds ?? 0,
        DefaultDurationSeconds: b.DefaultDurationSeconds,
        ComputedDurationSeconds: seconds,
        WidthPercent: Math.max(4, Math.round((seconds / totalWeight) * 1000) / 10),
        Guidance: b.Guidance,
        RequiresDataBinding: b.RequiresDataBinding,
      };
    });

    const pacingObj = arch.PacingObject;
    const pacing: ArchetypePacingView | null = pacingObj
      ? {
          ...pacingObj,
          AvgSecondsBetweenChanges: pacingObj.AvgSecondsBetweenChanges ?? 0,
          HoldRules: pacingObj.HoldRules ?? '',
        }
      : null;

    return {
      ...snapshot,
      DefaultInteractionMode: arch.DefaultInteractionMode ?? 'Auto',
      Guidance: arch.Guidance ?? null,
      BeatTemplateRaw: arch.BeatTemplate ?? JSON.stringify(rawBeats),
      PacingRaw: arch.Pacing ?? (pacingObj ? JSON.stringify(pacingObj) : null),
      Beats: beats,
      Pacing: pacing,
    };
  }

  private currentFilterState(): ArchetypeFilterState {
    return {
      SearchQuery: this.SearchText,
      Category: this.CategoryFilter,
      Scope: this.ScopeFilter,
    };
  }

  private applyFiltersAndSync(): void {
    this.rebuildCategoryChips();
    this.FilteredArchetypes = FilterArchetypeCards(
      this.AllArchetypes,
      this.currentFilterState(),
    );
    this.CategoryGroups = GroupArchetypesByCategory(this.FilteredArchetypes);
    this.syncAgentContext();
    this.cdr.markForCheck();
  }

  private buildArchetypesContext(): Record<string, unknown> {
    return BuildArchetypesAgentContext({
      AllCards: this.AllArchetypes,
      FilteredCards: this.FilteredArchetypes,
      Filters: this.currentFilterState(),
      SelectedArchetype: this.SelectedArchetype,
      IsLoading: this.IsLoading,
    });
  }

  private syncAgentContext(): void {
    this.PageContext = this.buildArchetypesContext();
    this.navigationService.SetAgentContext(this, this.PageContext);
  }

  // SAFETY BOUNDARY: Only read, filter, search, select/open-for-viewing, and refresh
  // tools are registered for the AI agent. Creating or editing a company archetype
  // writes a database record and is gated exclusively behind the user-driven
  // vs-archetype-editor dialog.
  private buildArchetypesClientTools(): StudioBriefClientToolDefinition[] {
    return [
      {
        Name: 'SearchArchetypes',
        Description: 'Filter Video Archetypes by a free-text search query matching name, category, format, or beat labels.',
        ParameterSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Free-text search query (empty string clears search).' },
          },
          required: ['query'],
        },
        Handler: async (params: Record<string, unknown>) => {
          const query = typeof params['query'] === 'string' ? params['query'] : '';
          this.OnSearchChange(query);
          return {
            Success: true,
            Data: { FilteredCount: this.FilteredCount },
          };
        },
      },
      {
        Name: 'FilterArchetypes',
        Description: 'Filter Video Archetypes by category or scope (all, shipped, company).',
        ParameterSchema: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Category name (Announcement, Briefing, DataStory, Explainer, Product, Social, Tutorial, or "all").',
            },
            scope: {
              type: 'string',
              enum: ['all', 'shipped', 'company'],
              description: 'Scope filter ("all", "shipped", or "company").',
            },
          },
        },
        Handler: async (params: Record<string, unknown>) => {
          const nextValues: Record<string, unknown> = { ...this.FilterValues };
          if (typeof params['category'] === 'string') {
            nextValues['category'] = params['category'];
          }
          if (typeof params['scope'] === 'string') {
            nextValues['scope'] = params['scope'];
          }
          this.OnFilterValuesChange(nextValues);
          return {
            Success: true,
            Data: { FilteredCount: this.FilteredCount },
          };
        },
      },
      {
        Name: 'ClearArchetypeFilters',
        Description: 'Clear all active search and popover filters on the Video Archetypes tab.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          this.SearchText = '';
          this.ClearAllFilters();
          return {
            Success: true,
            Data: { FilteredCount: this.FilteredCount },
          };
        },
      },
      {
        Name: 'SelectArchetype',
        Description: 'Open the inline slide-out preview for a Video Archetype by ID or name.',
        ParameterSchema: {
          type: 'object',
          properties: {
            archetype: { type: 'string', description: 'Archetype ID or display name.' },
          },
          required: ['archetype'],
        },
        Handler: async (params: Record<string, unknown>) => {
          const resolution = ResolveVideoStudioItem(
            params['archetype'],
            this.AllArchetypes,
            'video archetype',
          );
          if (!resolution.Ok) {
            return { Success: false, ErrorMessage: resolution.Error };
          }
          this.SelectArchetype(resolution.Item);
          return {
            Success: true,
            Data: { ID: resolution.Item.ID, Name: resolution.Item.Name },
          };
        },
      },
      {
        Name: 'OpenArchetype',
        Description: 'Open a company Video Archetype record form by ID or name (shipped archetypes are read-only and open in the slide-out preview).',
        ParameterSchema: {
          type: 'object',
          properties: {
            archetype: { type: 'string', description: 'Archetype ID or display name.' },
          },
          required: ['archetype'],
        },
        Handler: async (params: Record<string, unknown>) => {
          const resolution = ResolveVideoStudioItem(
            params['archetype'],
            this.AllArchetypes,
            'video archetype',
          );
          if (!resolution.Ok) {
            return { Success: false, ErrorMessage: resolution.Error };
          }
          if (resolution.Item.IsShipped) {
            this.SelectArchetype(resolution.Item);
            return {
              Success: true,
              Data: { ID: resolution.Item.ID, Name: resolution.Item.Name, IsShipped: true },
            };
          }
          this.navigationService.OpenEntityRecord(
            'MJ: Video Archetypes',
            CompositeKey.FromID(resolution.Item.ID),
          );
          return {
            Success: true,
            Data: { ID: resolution.Item.ID, Name: resolution.Item.Name, IsShipped: false },
          };
        },
      },
      {
        Name: 'RefreshArchetypes',
        Description: 'Reload Video Archetypes from VideoStudioEngine.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          await this.Refresh();
          return {
            Success: true,
            Data: { TotalCount: this.TotalCount },
          };
        },
      },
    ];
  }
}
