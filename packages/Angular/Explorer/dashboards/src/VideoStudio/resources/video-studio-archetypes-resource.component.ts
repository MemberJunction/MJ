import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { CompositeKey, LogError, RunView } from '@memberjunction/core';
import {
  MJVideoArchetypeEntity,
  ResourceData,
  VideoStudioEngine,
} from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { FilterFieldConfig } from '@memberjunction/ng-ui-components';
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
  ResolveVideoStudioItem,
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
}

export interface ArchetypeViewItem extends ArchetypeCardSnapshot {
  DefaultInteractionMode: string;
  Guidance: string | null;
  BeatTemplateRaw: string;
  PacingRaw: string | null;
  Beats: ArchetypeBeatBlock[];
  Pacing: ArchetypePacingView | null;
}

export interface ArchetypeCompanyOption {
  ID: string;
  Name: string;
}

/**
 * Archetypes resource tab for the Video Studio application.
 *
 * Displays all `MJ: Video Archetypes` from `VideoStudioEngine` grouped by
 * `Category` (`Announcement | Briefing | DataStory | Explainer | Product | Social | Tutorial`),
 * with proportional beat-timeline strips (`arch.BeatTemplateObject`) and an
 * inline slide-out preview showing the full beat template, pacing rules,
 * and narrative guidance.
 *
 * Company archetypes (`CompanyID` non-null) provide an "Edit Record" button
 * that opens the generated `MJ: Video Archetypes` form, while shipped
 * archetypes (`CompanyID IS NULL`) are read-only with a "Clone" button that
 * creates a company copy and opens the copy's entity form.
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
  implements OnInit, OnDestroy
{
  public IsLoading = false;
  public LoadError: string | null = null;

  public AllArchetypes: ArchetypeViewItem[] = [];
  public FilteredArchetypes: ArchetypeViewItem[] = [];
  public CategoryGroups: ArchetypeCategoryGroup<ArchetypeViewItem>[] = [];
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
        { value: 'all', text: 'All Categories' },
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
        { value: 'all', text: 'All Scopes' },
        { value: 'shipped', text: 'Shipped (Read-Only)' },
        { value: 'company', text: 'Company Overrides' },
      ],
    },
  ];

  public FilterValues: Record<string, unknown> = {
    category: 'all',
    scope: 'all',
  };

  // Clone dialog state for shipped archetypes
  public CloneSourceArchetype: ArchetypeViewItem | null = null;
  public CloneName = '';
  public CloneCompanyID = '';
  public AvailableCompanies: ArchetypeCompanyOption[] = [];
  public IsCloning = false;
  public CloneError: string | null = null;

  private companiesLoadError: string | null = null;
  private readonly cdr = inject(ChangeDetectorRef);

  async ngOnInit(): Promise<void> {
    super.ngOnInit();
    this.registerAgentTools();
    await this.LoadArchetypes(false);
    this.NotifyLoadComplete();
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
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
      await this.loadAvailableCompanies();
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

  public EditArchetypeRecord(item: ArchetypeViewItem, event?: Event): void {
    event?.stopPropagation();
    if (item.IsShipped) {
      this.OpenCloneDialog(item, event);
      return;
    }
    this.navigationService.OpenEntityRecord(
      'MJ: Video Archetypes',
      CompositeKey.FromID(item.ID),
    );
  }

  public OpenCloneDialog(item: ArchetypeViewItem, event?: Event): void {
    event?.stopPropagation();
    this.CloneSourceArchetype = item;
    this.CloneName = `${item.Name} (Copy)`;
    this.CloneCompanyID = this.AvailableCompanies[0]?.ID ?? '';
    this.CloneError = this.companiesLoadError;
    this.IsCloning = false;
    this.cdr.markForCheck();
  }

  public CancelCloneDialog(): void {
    this.CloneSourceArchetype = null;
    this.CloneError = null;
    this.IsCloning = false;
    this.cdr.markForCheck();
  }

  public async ConfirmClone(): Promise<void> {
    const source = this.CloneSourceArchetype;
    if (!source || this.IsCloning) {
      return;
    }
    const trimmedName = this.CloneName.trim();
    if (!trimmedName) {
      this.CloneError = 'Please enter a name for the cloned archetype.';
      this.cdr.markForCheck();
      return;
    }
    if (!this.CloneCompanyID) {
      this.CloneError = 'Please select a company for the cloned archetype.';
      this.cdr.markForCheck();
      return;
    }

    this.IsCloning = true;
    this.CloneError = null;
    this.cdr.markForCheck();

    try {
      const copy = await this.ProviderToUse.GetEntityObject<MJVideoArchetypeEntity>(
        'MJ: Video Archetypes',
        this.ProviderToUse.CurrentUser,
      );
      copy.Name = trimmedName;
      copy.Description = source.Description || '';
      copy.Category = source.Category;
      copy.CompanyID = this.CloneCompanyID;
      copy.DefaultDurationSeconds = source.DefaultDurationSeconds;
      copy.MinDurationSeconds = source.MinDurationSeconds;
      copy.MaxDurationSeconds = source.MaxDurationSeconds;
      copy.DefaultFormats = source.DefaultFormats;
      copy.DefaultInteractionMode = source.DefaultInteractionMode as MJVideoArchetypeEntity['DefaultInteractionMode'];
      copy.BeatTemplate = source.BeatTemplateRaw;
      copy.Pacing = source.PacingRaw;
      copy.Guidance = source.Guidance;
      copy.Status = 'Active';

      const saved = await copy.Save();
      if (!saved) {
        const message = copy.LatestResult?.CompleteMessage || 'Failed to save cloned archetype.';
        this.CloneError = message;
        return;
      }

      const newId = copy.ID;
      this.CloneSourceArchetype = null;
      await this.LoadArchetypes(true);
      this.navigationService.OpenEntityRecord(
        'MJ: Video Archetypes',
        CompositeKey.FromID(newId),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      LogError(msg);
      this.CloneError = msg;
    } finally {
      this.IsCloning = false;
      this.cdr.markForCheck();
    }
  }

  public FormatCategoryLabel(category: ArchetypeCategory | string): string {
    if (category === 'DataStory') {
      return 'Data Story';
    }
    return category;
  }

  private async loadAvailableCompanies(): Promise<void> {
    this.companiesLoadError = null;
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const res = await rv.RunView<{ ID: string; Name: string }>({
        EntityName: 'MJ: Companies',
        Fields: ['ID', 'Name'],
        OrderBy: 'Name ASC',
        ResultType: 'simple',
      });
      if (!res.Success) {
        const msg = res.ErrorMessage || 'Failed to load companies.';
        LogError(msg);
        this.companiesLoadError = `Couldn't load companies: ${msg}`;
        this.CloneError = this.companiesLoadError;
        return;
      }
      if (Array.isArray(res.Results)) {
        this.AvailableCompanies = res.Results.map((r) => ({
          ID: r.ID,
          Name: r.Name,
        }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      LogError(msg);
      this.companiesLoadError = `Couldn't load companies: ${msg}`;
      this.CloneError = this.companiesLoadError;
    }
  }

  private mapArchetypeToCard(arch: MJVideoArchetypeEntity): ArchetypeViewItem {
    const rawBeats = Array.isArray(arch.BeatTemplateObject) ? arch.BeatTemplateObject : [];
    const computedWeights = rawBeats.map((b) => {
      const def = b.DefaultDurationSeconds;
      if (typeof def === 'number' && def > 0) {
        return def;
      }
      const min = typeof b.MinDurationSeconds === 'number' ? b.MinDurationSeconds : 5;
      const max = typeof b.MaxDurationSeconds === 'number' ? b.MaxDurationSeconds : min;
      return Math.max(1, (min + max) / 2);
    });
    const totalWeight = computedWeights.reduce((acc, w) => acc + w, 0) || 1;

    const beats: ArchetypeBeatBlock[] = rawBeats.map((b, idx) => {
      const weight = computedWeights[idx] ?? 1;
      return {
        Key: b.Key || `beat-${idx + 1}`,
        Label: b.Label || b.Key || `Beat ${idx + 1}`,
        Purpose: b.Purpose || '',
        MinDurationSeconds: b.MinDurationSeconds ?? 0,
        MaxDurationSeconds: b.MaxDurationSeconds ?? 0,
        DefaultDurationSeconds: b.DefaultDurationSeconds,
        ComputedDurationSeconds: weight,
        WidthPercent: Math.max(4, Math.round((weight / totalWeight) * 1000) / 10),
        Guidance: b.Guidance,
        RequiresDataBinding: b.RequiresDataBinding,
      };
    });

    const pacingObj = arch.PacingObject;
    const pacing: ArchetypePacingView | null = pacingObj
      ? {
          AvgSecondsBetweenChanges: pacingObj.AvgSecondsBetweenChanges ?? 0,
          HoldRules: pacingObj.HoldRules ?? '',
        }
      : null;

    const companyId = arch.CompanyID ?? null;

    return {
      ID: arch.ID,
      Name: arch.Name,
      Description: arch.Description ?? '',
      Category: (arch.Category ?? 'Explainer') as ArchetypeCategory,
      Status: (arch.Status === 'Inactive' ? 'Inactive' : 'Active'),
      CompanyID: companyId,
      CompanyName: arch.Company ?? null,
      IsShipped: companyId === null,
      DefaultDurationSeconds: arch.DefaultDurationSeconds ?? 60,
      MinDurationSeconds: arch.MinDurationSeconds ?? 30,
      MaxDurationSeconds: arch.MaxDurationSeconds ?? 120,
      DefaultFormats: arch.DefaultFormats ?? '16:9',
      DefaultInteractionMode: arch.DefaultInteractionMode ?? 'Auto',
      Guidance: arch.Guidance ?? null,
      BeatTemplateRaw: arch.BeatTemplate ?? JSON.stringify(rawBeats),
      PacingRaw: arch.Pacing ?? (pacingObj ? JSON.stringify(pacingObj) : null),
      BeatCount: beats.length,
      BeatLabels: beats.map((b) => b.Label),
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
    this.FilteredArchetypes = FilterArchetypeCards(
      this.AllArchetypes,
      this.currentFilterState(),
    );
    this.CategoryGroups = GroupArchetypesByCategory(this.FilteredArchetypes);
    this.syncAgentContext();
    this.cdr.markForCheck();
  }

  private syncAgentContext(): void {
    const context = BuildArchetypesAgentContext({
      AllCards: this.AllArchetypes,
      FilteredCards: this.FilteredArchetypes,
      Filters: this.currentFilterState(),
      SelectedArchetype: this.SelectedArchetype,
      IsLoading: this.IsLoading,
    });
    this.navigationService.SetAgentContext(this, context);
  }

  // SAFETY BOUNDARY: Only read, filter, search, select/open-for-viewing, and refresh
  // tools are registered for the AI agent. Cloning a shipped archetype creates a new
  // database record and is gated exclusively behind the user-driven Clone dialog.
  private registerAgentTools(): void {
    this.navigationService.SetAgentClientTools(this, [
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
    ]);
  }
}
