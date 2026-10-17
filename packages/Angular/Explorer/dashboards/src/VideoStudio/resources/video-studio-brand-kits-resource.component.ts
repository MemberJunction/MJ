import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { CompositeKey } from '@memberjunction/core';
import {
  BrandKitEngine,
  MJBrandKitAssetEntity,
  MJBrandKitEntity,
  ResourceData,
} from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
  GraphQLDataProvider,
  GraphQLFileStorageClient,
} from '@memberjunction/graphql-dataprovider';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { FilterFieldConfig } from '@memberjunction/ng-ui-components';
import {
  BRAND_KIT_STATUS_FILTERS,
  BrandKitCardSnapshot,
  BrandKitFilterState,
  BrandKitStatusFilter,
  BrandKitSwatchView,
  BuildBrandKitsAgentContext,
  FilterBrandKitCards,
  ResolveVideoStudioItem,
} from '../video-studio-agent-context';

export type BrandKitCardItem = BrandKitCardSnapshot;

/**
 * Brand Kits resource tab for the Video Studio application.
 *
 * Displays all `MJ: Brand Kits` from `BrandKitEngine` as cards showing the kit
 * name, primary logo thumbnail, company scope (or "Workspace Default"), default
 * star indicator, status badge, color palette swatch strip (`kit.StyleObject.Palette`),
 * and asset count (`BrandKitEngine.Instance.GetAssets(kit.ID).length`).
 */
@RegisterClass(BaseResourceComponent, 'VideoStudioBrandKitsResource')
@Component({
  standalone: false,
  selector: 'mj-video-studio-brand-kits-resource',
  templateUrl: './video-studio-brand-kits-resource.component.html',
  styleUrls: ['./video-studio-brand-kits-resource.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoStudioBrandKitsResourceComponent
  extends BaseResourceComponent
  implements OnInit, OnDestroy
{
  public IsLoading = false;
  public LoadError: string | null = null;

  public AllBrandKits: BrandKitCardSnapshot[] = [];
  public FilteredBrandKits: BrandKitCardSnapshot[] = [];
  public SelectedBrandKit: BrandKitCardSnapshot | null = null;

  public SearchText = '';
  public StatusFilter: BrandKitStatusFilter = 'all';
  public CompanyFilter = 'all';

  public FilterFields: FilterFieldConfig[] = [];
  public FilterValues: Record<string, unknown> = {
    status: null,
    companyId: null,
  };

  private readonly cdr = inject(ChangeDetectorRef);

  async ngOnInit(): Promise<void> {
    super.ngOnInit();
    this.registerAgentClientTools();
    await this.LoadBrandKits(false);
    this.NotifyLoadComplete();
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
  }

  public async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Brand Kits';
  }

  public async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-palette';
  }

  public get TotalCount(): number {
    return this.AllBrandKits.length;
  }

  public get FilteredCount(): number {
    return this.FilteredBrandKits.length;
  }

  public get ActivePopoverFilterCount(): number {
    let count = 0;
    if (this.StatusFilter && this.StatusFilter !== 'all') {
      count++;
    }
    if (this.CompanyFilter && this.CompanyFilter !== 'all') {
      count++;
    }
    return count;
  }

  public async Refresh(): Promise<void> {
    await this.LoadBrandKits(true);
  }

  public async LoadBrandKits(forceRefresh = false): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();

    try {
      await BrandKitEngine.Instance.Config(forceRefresh, undefined, this.ProviderToUse);
      const kits = BrandKitEngine.Instance.BrandKits;
      this.AllBrandKits = kits.map((kit) => this.mapKitToCard(kit));
      this.rebuildFilterFieldOptions();
      this.applyFiltersAndSync();
      await this.mintLogoUrls(this.AllBrandKits);
    } catch (err: unknown) {
      this.LoadError = err instanceof Error ? err.message : String(err);
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
    const rawStatus = typeof values['status'] === 'string' ? values['status'] : '';
    this.StatusFilter = (BRAND_KIT_STATUS_FILTERS as readonly string[]).includes(rawStatus)
      ? (rawStatus as BrandKitStatusFilter)
      : 'all';
    const rawCompany = typeof values['companyId'] === 'string' ? values['companyId'] : '';
    this.CompanyFilter = rawCompany.trim() ? rawCompany.trim() : 'all';
    this.applyFiltersAndSync();
  }

  public ClearAllFilters(): void {
    this.StatusFilter = 'all';
    this.CompanyFilter = 'all';
    this.FilterValues = {
      status: null,
      companyId: null,
    };
    this.applyFiltersAndSync();
  }

  public CreateNewBrandKit(): void {
    this.navigationService.OpenNewEntityRecord('MJ: Brand Kits');
  }

  public OpenBrandKit(item: BrandKitCardSnapshot): void {
    this.SelectedBrandKit = item;
    this.syncAgentContext();
    this.navigationService.OpenEntityRecord(
      'MJ: Brand Kits',
      CompositeKey.FromID(item.ID),
    );
    this.cdr.markForCheck();
  }

  // ============================================================================
  // AI Agent Client Tools
  //
  // SAFETY BOUNDARY: The Brand Kits surface exposes ONLY read, search, filter,
  // open-for-viewing, and refresh tools to the AI agent. No create, edit, clone,
  // share, or delete tools are exposed.
  // ============================================================================

  private registerAgentClientTools(): void {
    // SAFETY BOUNDARY: Read-only navigation, search, filter, open-record, and refresh tools only.
    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'SearchBrandKits',
        Description:
          'Search brand kits by name, description, company scope, or status. Read-only filter operation.',
        ParameterSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
        Handler: async (params: Record<string, unknown>) => {
          // SAFETY BOUNDARY: Only updates local search filter state.
          const query = typeof params?.['query'] === 'string' ? params['query'] : '';
          this.OnSearchChange(query);
          return { Success: true };
        },
      },
      {
        Name: 'FilterBrandKits',
        Description:
          'Filter brand kits by companyId ("all", "org-wide", or a specific Company ID) and/or status ("all", "Active", "Inactive"). Read-only filter operation.',
        ParameterSchema: {
          type: 'object',
          properties: {
            companyId: { type: 'string' },
            status: { type: 'string', enum: ['all', 'Active', 'Inactive'] },
          },
        },
        Handler: async (params: Record<string, unknown>) => {
          // SAFETY BOUNDARY: Only updates local filter state; never modifies records.
          if (typeof params?.['status'] === 'string') {
            const rawStatus = params['status'];
            this.StatusFilter = (BRAND_KIT_STATUS_FILTERS as readonly string[]).includes(rawStatus)
              ? (rawStatus as BrandKitStatusFilter)
              : 'all';
            this.FilterValues['status'] = this.StatusFilter === 'all' ? null : this.StatusFilter;
          }
          if (typeof params?.['companyId'] === 'string') {
            this.CompanyFilter = params['companyId'].trim() || 'all';
            this.FilterValues['companyId'] =
              this.CompanyFilter === 'all' ? null : this.CompanyFilter;
          }
          this.applyFiltersAndSync();
          return { Success: true };
        },
      },
      {
        Name: 'ClearBrandKitFilters',
        Description: 'Reset all search and popover filters on the Brand Kits surface.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          // SAFETY BOUNDARY: Read-only filter reset.
          this.SearchText = '';
          this.ClearAllFilters();
          return { Success: true };
        },
      },
      {
        Name: 'OpenBrandKit',
        Description:
          'Open an existing Brand Kit record for viewing by its ID or Name. Does NOT create or mutate any record.',
        ParameterSchema: {
          type: 'object',
          properties: { brandKit: { type: 'string' } },
          required: ['brandKit'],
        },
        Handler: async (params: Record<string, unknown>) => {
          // SAFETY BOUNDARY: Opens the entity record for viewing via NavigationService; no writes.
          const resolved = ResolveVideoStudioItem(
            params?.['brandKit'],
            this.AllBrandKits,
            'brand kit',
          );
          if (!resolved.Ok) {
            return { Success: false, ErrorMessage: resolved.Error };
          }
          this.OpenBrandKit(resolved.Item);
          return { Success: true };
        },
      },
      {
        Name: 'RefreshBrandKits',
        Description: 'Reload Brand Kits from the server. Read-only operation.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          // SAFETY BOUNDARY: Read-only data reload.
          await this.Refresh();
          return { Success: true };
        },
      },
    ]);
  }

  private mapKitToCard(kit: MJBrandKitEntity): BrandKitCardSnapshot {
    const styleObj = kit.StyleObject;
    const rawPalette = Array.isArray(styleObj?.Palette) ? styleObj.Palette : [];
    const swatches: BrandKitSwatchView[] = rawPalette
      .filter((entry) => Boolean(entry && typeof entry.Value === 'string' && entry.Value.trim()))
      .map((entry) => ({
        Name: entry.Name || 'Color',
        Value: entry.Value.trim(),
      }));

    const assets = BrandKitEngine.Instance.GetAssets(kit.ID);
    const primaryLogoAsset = this.findPrimaryLogoAsset(assets);

    return {
      ID: kit.ID,
      Name: kit.Name,
      Description: kit.Description ?? '',
      CompanyID: kit.CompanyID ?? null,
      CompanyName: kit.Company ?? null,
      IsDefault: Boolean(kit.IsDefault),
      Status: kit.Status === 'Inactive' ? 'Inactive' : 'Active',
      Swatches: swatches,
      PrimaryLogoFileID: primaryLogoAsset?.FileID ?? null,
      PrimaryLogoUrl: null,
      AssetCount: assets.length,
    };
  }

  private findPrimaryLogoAsset(assets: MJBrandKitAssetEntity[]): MJBrandKitAssetEntity | null {
    const logoAssets = assets.filter(
      (a) => a.Usage === 'Logo' || a.Usage === 'LogoMark',
    );
    if (logoAssets.length === 0) {
      return null;
    }
    return logoAssets.find((a) => Boolean(a.IsPrimary)) ?? logoAssets[0];
  }

  private async mintLogoUrls(cards: BrandKitCardSnapshot[]): Promise<void> {
    const provider = this.ProviderToUse as unknown as Partial<GraphQLDataProvider> | null;
    if (!provider || typeof provider.ExecuteGQL !== 'function') {
      return;
    }

    const client = new GraphQLFileStorageClient(this.ProviderToUse as GraphQLDataProvider);
    const cardsWithLogos = cards.filter((c) => Boolean(c.PrimaryLogoFileID));
    if (cardsWithLogos.length === 0) {
      return;
    }

    await Promise.all(
      cardsWithLogos.map(async (card) => {
        if (!card.PrimaryLogoFileID) {
          return;
        }
        try {
          const token = await client.CreateMediaAccessToken(card.PrimaryLogoFileID);
          if (token.Success && token.Url) {
            card.PrimaryLogoUrl = token.Url;
          }
        } catch {
          // Non-fatal: card renders fallback icon when logo token minting fails.
        }
      }),
    );
    this.cdr.markForCheck();
  }

  private rebuildFilterFieldOptions(): void {
    const companies = new Map<string, string>();
    for (const item of this.AllBrandKits) {
      if (item.CompanyID) {
        companies.set(item.CompanyID, item.CompanyName || item.CompanyID);
      }
    }

    this.FilterFields = [
      {
        key: 'status',
        label: 'Status',
        type: 'dropdown',
        options: [
          { value: 'Active', text: 'Active' },
          { value: 'Inactive', text: 'Inactive' },
        ],
      },
      {
        key: 'companyId',
        label: 'Company Scope',
        type: 'dropdown',
        options: [
          { value: 'org-wide', text: 'Workspace Default' },
          ...Array.from(companies.entries())
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([value, text]) => ({ value, text })),
        ],
      },
    ];
  }

  private currentFilterState(): BrandKitFilterState {
    return {
      SearchQuery: this.SearchText,
      Status: this.StatusFilter,
      CompanyID: this.CompanyFilter,
    };
  }

  private applyFiltersAndSync(): void {
    this.FilteredBrandKits = FilterBrandKitCards(
      this.AllBrandKits,
      this.currentFilterState(),
    );
    this.syncAgentContext();
    this.cdr.markForCheck();
  }

  private syncAgentContext(): void {
    const availableCompanies = Array.from(
      new Set(
        this.AllBrandKits.map((k) => k.CompanyName ?? '').filter((c) => Boolean(c)),
      ),
    );
    const matchingCompany = this.AllBrandKits.find(
      (k) => k.CompanyID && UUIDsEqual(k.CompanyID, this.CompanyFilter),
    );

    const context = BuildBrandKitsAgentContext({
      AllCards: this.AllBrandKits,
      FilteredCards: this.FilteredBrandKits,
      Filters: this.currentFilterState(),
      CompanyFilterName:
        this.CompanyFilter === 'org-wide'
          ? 'Org-wide'
          : (matchingCompany?.CompanyName ?? null),
      AvailableCompanyNames: availableCompanies,
      IsLoading: this.IsLoading,
    });
    this.navigationService.SetAgentContext(this, context);
  }
}
