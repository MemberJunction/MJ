import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { CompositeKey, LogError, RunView, UserInfo } from '@memberjunction/core';
import {
  BrandKitEngine,
  MJArtifactEntity,
  MJBrandKitEntity,
  MJEnvironmentEntityExtended,
  ResourceData,
} from '@memberjunction/core-entities';
import { EscapeSQLString, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
  GraphQLDataProvider,
  GraphQLFileStorageClient,
} from '@memberjunction/graphql-dataprovider';
import { FormatVideoTime, GetVideoStatusBadgeVariant } from '@memberjunction/ng-artifacts';
import { ArtifactPermissionService } from '@memberjunction/ng-conversations';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { FilterFieldConfig } from '@memberjunction/ng-ui-components';
import { VideoCaptionMode, VideoProductionStatus } from '@memberjunction/video-studio-core';
import { VSCopilotPanelComponent } from '../components/vs-copilot-panel.component';
import { VSProductionBriefStateSnapshot } from '../components/vs-production-brief.component';
import { VSStudioSlideInComponent } from '../components/vs-studio-slide-in.component';
import { VSStudioSlideInStateService } from '../services/vs-studio-slide-in-state.service';
import {
  ArchetypeCardSnapshot,
  BrandKitCardSnapshot,
  BuildProductionsAgentContext,
  CountActiveProductionPopoverFilters,
  FilterProductionCards,
  ParseArchetypeDefaultFormats,
  ProductionCardSnapshot,
  ProductionCardStatus,
  ProductionFilterState,
  ResolveVideoStudioItem,
} from '../video-studio-agent-context';

/**
 * Primary key for the `MJ: Video Production` artifact type
 * (`metadata/artifact-types/.video-production-artifact-type.json`).
 */
export const VIDEO_PRODUCTION_ARTIFACT_TYPE_ID = '2E23F219-E790-4A77-9C86-CB19C711B71E';

export type VideoProductionCardItem = ProductionCardSnapshot;

interface SimpleArtifactVersionRow {
  ID: string;
  ArtifactID: string;
  VersionNumber: number;
}

interface SimpleArtifactVersionAttributeRow {
  ArtifactVersionID: string;
  Name: string;
  Value: string | null;
}

interface SimpleCompanyRow {
  ID: string;
  Name: string;
}

const VALID_PRODUCTION_STATUSES: ReadonlySet<VideoProductionStatus> = new Set<VideoProductionStatus>([
  'Briefing',
  'Styled',
  'Storyboarded',
  'Approved',
  'PreProduced',
  'Composed',
  'RoughCut',
  'Reviewed',
  'Delivered',
  'Blocked',
]);

/**
 * Productions resource tab for the Video Studio application.
 *
 * Displays a responsive grid of `MJ: Video Production` artifacts readable by the
 * current user, enriched with extracted version attributes (`posterFileID`,
 * `status`, `archetype`, `brandKitID`, `companyID`, `durationSeconds`, `formats`, `name`) and
 * short-lived media access token poster URLs, alongside an artifact viewer detail
 * pane and URL query-param synchronization (`?production=<id>`).
 */
@RegisterClass(BaseResourceComponent, 'VideoStudioProductionsResource')
@Component({
  standalone: false,
  selector: 'mj-video-studio-productions-resource',
  templateUrl: './video-studio-productions-resource.component.html',
  styleUrls: ['./video-studio-productions-resource.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoStudioProductionsResourceComponent
  extends BaseResourceComponent
  implements OnInit, OnDestroy
{
  public IsLoading = false;
  public LoadError: string | null = null;

  public AllProductions: ProductionCardSnapshot[] = [];
  public FilteredProductions: ProductionCardSnapshot[] = [];
  public SelectedProduction: ProductionCardSnapshot | null = null;

  public SearchText = '';
  public ArchetypeFilter = '';
  public StatusFilter = '';
  public BrandKitFilter = '';
  public CompanyFilter = '';
  public DateFrom = '';
  public DateTo = '';

  public FilterFields: FilterFieldConfig[] = [];
  public FilterValues: Record<string, unknown> = {
    archetype: null,
    status: null,
    brandKitId: null,
    companyId: null,
  };

  public CanShareSelected = false;
  public CanEditSelected = false;
  public IsShareModalOpen = false;
  public ShareTargetArtifact: MJArtifactEntity | null = null;

  private artifactsById = new Map<string, MJArtifactEntity>();
  private brandKitsById = new Map<string, MJBrandKitEntity>();
  private companiesById = new Map<string, string>();

  public readonly SlideInState = inject(VSStudioSlideInStateService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly artifactPermissionService = inject(ArtifactPermissionService);
  private slideInStateSub: Subscription | null = null;
  private lastBriefShowingState: boolean | null = null;

  async ngOnInit(): Promise<void> {
    super.ngOnInit();
    this.lastBriefShowingState = this.SlideInState.IsBriefShowing;
    this.registerAgentClientTools();
    this.slideInStateSub = this.SlideInState.State$.subscribe(() => {
      this.CopilotAppContext = this.buildCopilotAppContext();
      if (this.lastBriefShowingState !== this.SlideInState.IsBriefShowing) {
        this.lastBriefShowingState = this.SlideInState.IsBriefShowing;
        this.registerAgentClientTools();
      }
      this.cdr.markForCheck();
    });
    await this.LoadProductions(false);
    this.NotifyLoadComplete();
  }

  override ngOnDestroy(): void {
    this.slideInStateSub?.unsubscribe();
    this.slideInStateSub = null;
    super.ngOnDestroy();
  }

  public async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Productions';
  }

  public async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-clapperboard';
  }

  public get TotalCount(): number {
    return this.AllProductions.length;
  }

  public get FilteredCount(): number {
    return this.FilteredProductions.length;
  }

  public get ActivePopoverFilterCount(): number {
    return CountActiveProductionPopoverFilters(this.currentFilterState());
  }

  public get SelectedArtifactEntity(): MJArtifactEntity | null {
    if (!this.SelectedProduction) {
      return null;
    }
    return this.artifactsById.get(this.SelectedProduction.ID) ?? null;
  }

  public async Refresh(): Promise<void> {
    await this.LoadProductions(true);
  }

  public async LoadProductions(forceRefresh = false): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();

    try {
      const currentUser = this.ProviderToUse?.CurrentUser;
      if (!currentUser?.ID) {
        this.LoadError = 'Unable to load video productions: no current user context.';
        this.AllProductions = [];
        this.FilteredProductions = [];
        return;
      }

      const brandKitEngine = BrandKitEngine.GetProviderInstance<BrandKitEngine>(
        this.ProviderToUse,
        BrandKitEngine,
      ) as BrandKitEngine;
      await brandKitEngine.Config(forceRefresh, undefined, this.ProviderToUse);
      this.brandKitsById.clear();
      this.companiesById.clear();
      for (const kit of brandKitEngine.BrandKits) {
        this.brandKitsById.set(kit.ID, kit);
        if (kit.CompanyID && kit.Company) {
          this.companiesById.set(kit.CompanyID, kit.Company);
        }
      }

      this.artifactPermissionService.Provider = this.ProviderToUse;
      const readableFilter = await this.artifactPermissionService.GetReadableArtifactsFilter(
        currentUser.ID,
        currentUser,
      );
      if (!readableFilter) {
        this.LoadError = 'Unable to load video productions: permission filter unavailable.';
        this.AllProductions = [];
        this.FilteredProductions = [];
        return;
      }

      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const artifactsResult = await rv.RunView<MJArtifactEntity>({
        EntityName: 'MJ: Artifacts',
        ExtraFilter: `TypeID = '${VIDEO_PRODUCTION_ARTIFACT_TYPE_ID}' AND ${readableFilter}`,
        OrderBy: '__mj_UpdatedAt DESC',
        ResultType: 'entity_object',
      });

      if (!artifactsResult.Success) {
        this.LoadError = artifactsResult.ErrorMessage || 'Failed to load video productions.';
        this.AllProductions = [];
        this.FilteredProductions = [];
        return;
      }

      const artifacts = artifactsResult.Results ?? [];
      this.artifactsById.clear();
      for (const artifact of artifacts) {
        this.artifactsById.set(artifact.ID, artifact);
      }

      const versionByArtifactId = new Map<string, SimpleArtifactVersionRow>();
      const attrsByVersionId = new Map<string, Map<string, string>>();
      if (artifacts.length > 0) {
        const quotedIds = artifacts
          .map((a) => `'${EscapeSQLString(a.ID)}'`)
          .join(', ');
        const latestVersionsSubquery = `SELECT v.ID FROM [__mj].[vwArtifactVersions] v INNER JOIN (SELECT ArtifactID, MAX(VersionNumber) AS MaxVer FROM [__mj].[vwArtifactVersions] WHERE ArtifactID IN (${quotedIds}) GROUP BY ArtifactID) latest ON v.ArtifactID = latest.ArtifactID AND v.VersionNumber = latest.MaxVer`;
        const [versionsResult, attributesResult, companiesResult] = await rv.RunViews([
          {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ID IN (${latestVersionsSubquery})`,
            Fields: ['ID', 'ArtifactID', 'VersionNumber'],
            ResultType: 'simple',
          },
          {
            EntityName: 'MJ: Artifact Version Attributes',
            ExtraFilter: `ArtifactVersionID IN (${latestVersionsSubquery})`,
            Fields: ['ArtifactVersionID', 'Name', 'Value'],
            ResultType: 'simple',
          },
          {
            EntityName: 'MJ: Companies',
            Fields: ['ID', 'Name'],
            ResultType: 'simple',
          },
        ]);

        if (
          !versionsResult?.Success ||
          !attributesResult?.Success ||
          (companiesResult && !companiesResult.Success)
        ) {
          const errMessage =
            (!versionsResult?.Success ? versionsResult?.ErrorMessage : undefined) ||
            (!attributesResult?.Success ? attributesResult?.ErrorMessage : undefined) ||
            (companiesResult && !companiesResult.Success ? companiesResult.ErrorMessage : undefined) ||
            'Failed to load version or attribute details.';
          LogError(errMessage);
          this.LoadError = `Couldn't load production details: ${errMessage}`;
          this.AllProductions = [];
          this.FilteredProductions = [];
          return;
        }

        if (Array.isArray(versionsResult.Results)) {
          for (const row of versionsResult.Results as SimpleArtifactVersionRow[]) {
            if (row?.ID && row?.ArtifactID) {
              versionByArtifactId.set(row.ArtifactID.toLowerCase(), row);
            }
          }
        }

        if (Array.isArray(attributesResult.Results)) {
          for (const row of attributesResult.Results as SimpleArtifactVersionAttributeRow[]) {
            if (!row?.ArtifactVersionID || !row.Name || row.Value == null) {
              continue;
            }
            const vKey = row.ArtifactVersionID.toLowerCase();
            let attrMap = attrsByVersionId.get(vKey);
            if (!attrMap) {
              attrMap = new Map<string, string>();
              attrsByVersionId.set(vKey, attrMap);
            }
            attrMap.set(row.Name, String(row.Value));
          }
        }

        if (companiesResult && Array.isArray(companiesResult.Results)) {
          for (const row of companiesResult.Results as SimpleCompanyRow[]) {
            if (row?.ID && row?.Name) {
              this.companiesById.set(row.ID, row.Name);
            }
          }
        }
      }

      this.AllProductions = this.buildCardItems(
        artifacts,
        versionByArtifactId,
        attrsByVersionId,
      );
      this.rebuildFilterFieldOptions();
      this.applyFiltersAndSync();
      await this.restoreSelectionFromQueryParams();
      await this.mintPosterUrls(this.AllProductions);
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
    this.ArchetypeFilter = typeof values['archetype'] === 'string' ? values['archetype'] : '';
    this.StatusFilter = typeof values['status'] === 'string' ? values['status'] : '';
    this.BrandKitFilter = typeof values['brandKitId'] === 'string' ? values['brandKitId'] : '';
    this.CompanyFilter = typeof values['companyId'] === 'string' ? values['companyId'] : '';
    this.applyFiltersAndSync();
  }

  public OnDateFromChange(value: Date | string | null): void {
    this.DateFrom = this.formatDateFilterInput(value);
    this.applyFiltersAndSync();
  }

  public OnDateToChange(value: Date | string | null): void {
    this.DateTo = this.formatDateFilterInput(value);
    this.applyFiltersAndSync();
  }

  private formatDateFilterInput(value: Date | string | null | undefined): string {
    if (!value) {
      return '';
    }
    if (typeof value === 'string') {
      return value.trim();
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return '';
  }

  public ClearAllFilters(): void {
    this.ArchetypeFilter = '';
    this.StatusFilter = '';
    this.BrandKitFilter = '';
    this.CompanyFilter = '';
    this.DateFrom = '';
    this.DateTo = '';
    this.FilterValues = {
      archetype: null,
      status: null,
      brandKitId: null,
      companyId: null,
    };
    this.applyFiltersAndSync();
  }

  @ViewChild('studioSlideIn')
  public StudioSlideIn?: VSStudioSlideInComponent;

  public get CopilotPanel(): VSCopilotPanelComponent | undefined {
    return this.StudioSlideIn?.CopilotPanel;
  }

  public SelectedProductionConversationId: string | null = null;
  public ShowGridInFocusMode = false;

  public get IsIterateFocusMode(): boolean {
    return (
      this.SelectedProduction !== null &&
      this.IsCopilotSlideInOpen &&
      !this.ShowGridInFocusMode
    );
  }

  public ShowAllProductions(): void {
    this.ShowGridInFocusMode = true;
    this.cdr.markForCheck();
  }

  public get IsCopilotSlideInOpen(): boolean {
    return this.SlideInState.IsOpen;
  }
  public set IsCopilotSlideInOpen(value: boolean) {
    if (value) {
      this.SlideInState.Reopen();
    } else {
      this.SlideInState.Close();
    }
  }

  public get SlideInConversationId(): string | null {
    return this.SlideInState.ConversationId;
  }
  public set SlideInConversationId(value: string | null) {
    this.SlideInState.SetConversationId(value);
  }

  public get SlideInPendingArtifactId(): string | null {
    return this.SlideInState.PendingArtifactId;
  }
  public set SlideInPendingArtifactId(value: string | null) {
    this.SlideInState.PendingArtifactId = value;
  }

  public get SlideInPendingArtifactVersionNumber(): number | null {
    return this.SlideInState.PendingArtifactVersionNumber;
  }
  public set SlideInPendingArtifactVersionNumber(value: number | null) {
    this.SlideInState.PendingArtifactVersionNumber = value;
  }

  public get BriefArchetypes(): ArchetypeCardSnapshot[] {
    return this.SlideInState.BriefArchetypes;
  }
  public set BriefArchetypes(value: ArchetypeCardSnapshot[]) {
    this.SlideInState.BriefArchetypes = value;
  }

  public get BriefBrandKits(): BrandKitCardSnapshot[] {
    return this.SlideInState.BriefBrandKits;
  }
  public set BriefBrandKits(value: BrandKitCardSnapshot[]) {
    this.SlideInState.BriefBrandKits = value;
  }

  public get BriefSelectedArchetype(): ArchetypeCardSnapshot | null {
    return this.SlideInState.BriefSelectedArchetype;
  }
  public set BriefSelectedArchetype(value: ArchetypeCardSnapshot | null) {
    this.SlideInState.BriefSelectedArchetype = value;
  }

  public get BriefSelectedBrandKit(): BrandKitCardSnapshot | null {
    return this.SlideInState.BriefSelectedBrandKit;
  }
  public set BriefSelectedBrandKit(value: BrandKitCardSnapshot | null) {
    this.SlideInState.BriefSelectedBrandKit = value;
  }

  public get BriefSelectedFormats(): string[] {
    return this.SlideInState.BriefSelectedFormats;
  }
  public set BriefSelectedFormats(value: string[]) {
    this.SlideInState.BriefSelectedFormats = value;
  }

  public get BriefDurationSeconds(): number {
    return this.SlideInState.BriefDurationSeconds;
  }
  public set BriefDurationSeconds(value: number) {
    this.SlideInState.BriefDurationSeconds = value;
  }

  public get BriefTopic(): string {
    return this.SlideInState.BriefTopic;
  }
  public set BriefTopic(value: string) {
    this.SlideInState.BriefTopic = value;
  }

  public get NarrationEnabled(): boolean {
    return this.SlideInState.NarrationEnabled;
  }
  public set NarrationEnabled(value: boolean) {
    this.SlideInState.SetNarrationEnabled(value);
  }

  public get CaptionsMode(): VideoCaptionMode {
    return this.SlideInState.CaptionsMode;
  }
  public set CaptionsMode(value: VideoCaptionMode) {
    this.SlideInState.SetCaptionsMode(value);
  }

  public CopilotAppContext: Record<string, unknown> = this.buildCopilotAppContext();

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

  /**
   * Opens the single right slide-in on a brand-new conversation (`SlideInConversationId = null`),
   * displaying `<vs-production-brief>` in the chat area's `emptyState` slot.
   */
  public OpenNewProductionCopilot(): void {
    this.ShowGridInFocusMode = false;
    this.SlideInState.OpenNewProduction();
    this.CopilotAppContext = this.buildCopilotAppContext();
    this.syncAgentContext();
    this.cdr.markForCheck();
  }

  /**
   * Reopens the right slide-in from the right-edge strip, preserving any active
   * conversation or showing the brief if none is active.
   */
  public ReopenCopilotSlideIn(): void {
    this.ShowGridInFocusMode = false;
    this.SlideInState.Reopen();
    this.CopilotAppContext = this.buildCopilotAppContext();
    this.syncAgentContext();
    this.cdr.markForCheck();
  }

  public ToggleCopilotSlideIn(): void {
    if (this.IsCopilotSlideInOpen) {
      this.CloseCopilotSlideIn();
    } else {
      this.OpenNewProductionCopilot();
    }
  }

  public CloseCopilotSlideIn(): void {
    this.ShowGridInFocusMode = false;
    this.SlideInState.Close();
    this.syncAgentContext();
    this.cdr.markForCheck();
  }

  public OnSlideInOpenChange(isOpen: boolean): void {
    if (!isOpen) {
      this.ShowGridInFocusMode = false;
    }
    this.CopilotAppContext = this.buildCopilotAppContext();
    this.syncAgentContext();
    this.cdr.markForCheck();
  }

  public ToggleNarrationEnabled(): void {
    this.SlideInState.SetNarrationEnabled(!this.SlideInState.NarrationEnabled);
    this.CopilotAppContext = this.buildCopilotAppContext();
    this.cdr.markForCheck();
  }

  public SetCaptionsMode(mode: VideoCaptionMode): void {
    this.SlideInState.SetCaptionsMode(mode);
    this.CopilotAppContext = this.buildCopilotAppContext();
    this.cdr.markForCheck();
  }

  public OnBriefStateChange(snapshot: VSProductionBriefStateSnapshot): void {
    this.SlideInState.ApplyBriefSnapshot(snapshot);
    this.CopilotAppContext = this.buildCopilotAppContext();
    this.syncAgentContext();
    this.cdr.markForCheck();
  }

  public OnSlideInConversationCreated(event: { conversation: { ID: string } }): void {
    this.SlideInState.SetConversationId(event.conversation.ID);
    this.syncAgentContext();
    this.cdr.markForCheck();
  }

  public OnSlideInPendingArtifactConsumed(): void {
    this.SlideInState.ClearPendingArtifact();
    this.cdr.markForCheck();
  }

  private buildCopilotAppContext(): Record<string, unknown> {
    const fallbackBrandKitId =
      this.BrandKitFilter || (this.SelectedProduction?.BrandKitID ?? null);
    return this.SlideInState.BuildCombinedAppContext(
      this.buildProductionsContext(),
      fallbackBrandKitId,
    );
  }

  public async SelectProduction(
    item: ProductionCardSnapshot | null,
    updateUrl = true,
  ): Promise<void> {
    this.ShowGridInFocusMode = false;
    this.SelectedProduction = item;
    this.CanShareSelected = false;
    this.CanEditSelected = false;
    this.SelectedProductionConversationId = null;

    if (updateUrl) {
      this.UpdateQueryParams({ production: item ? item.ID : null });
    }

    if (item && this.ProviderToUse?.CurrentUser) {
      try {
        this.artifactPermissionService.Provider = this.ProviderToUse;
        const perms = await this.artifactPermissionService.GetUserPermissions(
          item.ID,
          this.ProviderToUse.CurrentUser,
        );
        if (this.SelectedProduction !== item) {
          return;
        }
        this.CanShareSelected = perms.canShare;
        this.CanEditSelected = perms.canEdit;
      } catch (err: unknown) {
        LogError(err instanceof Error ? err.message : String(err));
        if (this.SelectedProduction !== item) {
          return;
        }
        this.CanShareSelected = false;
        this.CanEditSelected = false;
      }
    }

    if (item) {
      const convId = await this.resolveProductionConversationId(item.ID);
      if (this.SelectedProduction !== item) {
        return;
      }
      this.SelectedProductionConversationId = convId;
    }

    this.CopilotAppContext = this.buildCopilotAppContext();
    this.syncAgentContext();
    this.cdr.markForCheck();
  }

  /**
   * Opens the single right slide-in on the selected production's existing conversation
   * with the production artifact attached for iteration.
   */
  public StartIterate(): void {
    if (!this.SelectedProduction || !this.SelectedProductionConversationId) {
      return;
    }
    this.ShowGridInFocusMode = false;
    this.SlideInState.OpenIterate(
      this.SelectedProductionConversationId,
      this.SelectedProduction.ID,
      this.SelectedProduction.VersionNumber,
    );
    this.syncAgentContext();
    this.cdr.markForCheck();
  }

  private async resolveProductionConversationId(
    artifactId: string,
  ): Promise<string | null> {
    const trimmedId = (artifactId ?? '').trim();
    if (!trimmedId) {
      return null;
    }
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const escapedId = EscapeSQLString(trimmedId);
      const detailArtifactResult = await rv.RunView<{
        ConversationDetailID?: string | null;
      }>({
        EntityName: 'MJ: Conversation Detail Artifacts',
        ExtraFilter: `ArtifactVersionID IN (SELECT ID FROM [__mj].[vwArtifactVersions] WHERE ArtifactID = '${escapedId}') AND Direction = 'Output'`,
        OrderBy: '__mj_CreatedAt DESC',
        Fields: ['ConversationDetailID'],
        MaxRows: 1,
        ResultType: 'simple',
      });

      const detailId =
        detailArtifactResult.Success &&
        Array.isArray(detailArtifactResult.Results) &&
        detailArtifactResult.Results.length > 0
          ? (detailArtifactResult.Results[0].ConversationDetailID ?? '').trim()
          : '';
      if (!detailId) {
        return null;
      }

      const escapedDetailId = EscapeSQLString(detailId);
      const detailResult = await rv.RunView<{ ConversationID?: string | null }>({
        EntityName: 'MJ: Conversation Details',
        ExtraFilter: `ID = '${escapedDetailId}'`,
        Fields: ['ConversationID'],
        MaxRows: 1,
        ResultType: 'simple',
      });

      const conversationId =
        detailResult.Success &&
        Array.isArray(detailResult.Results) &&
        detailResult.Results.length > 0
          ? (detailResult.Results[0].ConversationID ?? '').trim()
          : '';

      return conversationId.length > 0 ? conversationId : null;
    } catch (err: unknown) {
      LogError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  public CloseDetailPane(): void {
    void this.SelectProduction(null, true);
  }

  public OpenShareModal(artifactIdOrEntity?: string | MJArtifactEntity): void {
    if (typeof artifactIdOrEntity === 'string') {
      this.ShareTargetArtifact =
        this.artifactsById.get(artifactIdOrEntity) ?? this.SelectedArtifactEntity;
    } else {
      this.ShareTargetArtifact = artifactIdOrEntity ?? this.SelectedArtifactEntity;
    }
    if (this.ShareTargetArtifact) {
      this.IsShareModalOpen = true;
      this.cdr.markForCheck();
    }
  }

  public CloseShareModal(): void {
    this.IsShareModalOpen = false;
    this.ShareTargetArtifact = null;
    this.cdr.markForCheck();
  }

  public async OnShareSaved(): Promise<void> {
    this.CloseShareModal();
    await this.Refresh();
  }

  public OnNavigateToArtifactLink(event: {
    type: 'conversation' | 'collection';
    id: string;
  }): void {
    const entityName =
      event.type === 'conversation' ? 'MJ: Conversations' : 'MJ: Collections';
    this.navigationService.OpenEntityRecord(
      entityName,
      CompositeKey.FromID(event.id),
    );
  }

  public OpenBrandKitRecord(brandKitId: string | null, event?: Event): void {
    event?.stopPropagation();
    if (!brandKitId) {
      return;
    }
    this.navigationService.OpenEntityRecord(
      'MJ: Brand Kits',
      CompositeKey.FromID(brandKitId),
    );
  }

  public FormatDuration(seconds: number | null): string {
    if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
      return '—';
    }
    return FormatVideoTime(seconds);
  }

  public ParseFormats(aspectRatio: string): string[] {
    if (!aspectRatio || !aspectRatio.trim()) {
      return [];
    }
    return ParseArchetypeDefaultFormats(aspectRatio);
  }

  public ResetFiltersAndSearch(): void {
    this.ClearAllFilters();
    this.OnSearchChange('');
  }

  public StatusBadgeClass(status: ProductionCardStatus | string): string {
    const variant = GetVideoStatusBadgeVariant(status);
    return `vs-production-poster__status mj-badge mj-badge-${variant}`;
  }

  protected override OnQueryParamsChanged(
    params: Record<string, string>,
    _source: 'popstate' | 'deeplink',
  ): void {
    const targetId = params['production'] ?? null;
    if (!targetId) {
      if (this.SelectedProduction) {
        void this.SelectProduction(null, false);
      }
      return;
    }

    const resolution = ResolveVideoStudioItem(targetId, this.AllProductions, 'production');
    if (
      resolution.Ok &&
      (!this.SelectedProduction || !UUIDsEqual(this.SelectedProduction.ID, resolution.Item.ID))
    ) {
      void this.SelectProduction(resolution.Item, false);
    }
  }

  // ============================================================================
  // AI Agent Client Tools
  //
  // SAFETY BOUNDARY: The Productions surface exposes ONLY read, search, filter,
  // select/open-for-viewing, refresh, and in-memory brief form-fill tools
  // (`SelectStudioArchetype`, `SelectStudioBrandKit`, `SetStudioFormats`,
  // `SetStudioTopic`) to the AI agent. No create, edit, clone, share, or delete
  // tools are exposed (`ArtifactShareModal` and `StartProduction` are strictly
  // user-confirm-only).
  // ============================================================================

  private registerAgentClientTools(): void {
    // SAFETY BOUNDARY: Read-only navigation/filter/select/refresh + reversible brief form-fill tools only.
    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'SearchProductions',
        Description:
          'Search video productions by title, description, archetype, brand kit, company, or status. Read-only filter operation.',
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
        Name: 'FilterProductions',
        Description:
          'Filter video productions by archetype, brandKitId, companyId, status, fromDate (YYYY-MM-DD), or toDate (YYYY-MM-DD). Read-only filter operation.',
        ParameterSchema: {
          type: 'object',
          properties: {
            archetype: { type: 'string' },
            brandKitId: { type: 'string' },
            companyId: { type: 'string' },
            status: { type: 'string' },
            fromDate: { type: 'string' },
            toDate: { type: 'string' },
          },
        },
        Handler: async (params: Record<string, unknown>) => {
          // SAFETY BOUNDARY: Only updates local filter state; never mutates artifacts.
          if (typeof params?.['archetype'] === 'string') {
            this.ArchetypeFilter = params['archetype'] === 'all' ? '' : params['archetype'];
            this.FilterValues['archetype'] = this.ArchetypeFilter || null;
          }
          if (typeof params?.['brandKitId'] === 'string') {
            this.BrandKitFilter = params['brandKitId'] === 'all' ? '' : params['brandKitId'];
            this.FilterValues['brandKitId'] = this.BrandKitFilter || null;
          }
          if (typeof params?.['companyId'] === 'string') {
            this.CompanyFilter = params['companyId'] === 'all' ? '' : params['companyId'];
            this.FilterValues['companyId'] = this.CompanyFilter || null;
          }
          if (typeof params?.['status'] === 'string') {
            this.StatusFilter = params['status'] === 'all' ? '' : params['status'];
            this.FilterValues['status'] = this.StatusFilter || null;
          }
          if (typeof params?.['fromDate'] === 'string') {
            this.DateFrom = params['fromDate'];
          }
          if (typeof params?.['toDate'] === 'string') {
            this.DateTo = params['toDate'];
          }
          this.applyFiltersAndSync();
          return { Success: true };
        },
      },
      {
        Name: 'ClearProductionFilters',
        Description: 'Reset all search and popover filters on the Productions surface.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          // SAFETY BOUNDARY: Read-only filter reset.
          this.SearchText = '';
          this.ClearAllFilters();
          return { Success: true };
        },
      },
      {
        Name: 'SelectProduction',
        Description:
          'Select and open a video production in the viewer panel by its ID or Name. Read-only viewing operation.',
        ParameterSchema: {
          type: 'object',
          properties: { production: { type: 'string' } },
          required: ['production'],
        },
        Handler: async (params: Record<string, unknown>) => {
          // SAFETY BOUNDARY: Opens the production in the read-only viewer panel only.
          const resolved = ResolveVideoStudioItem(
            params?.['production'],
            this.AllProductions,
            'production',
          );
          if (!resolved.Ok) {
            return { Success: false, ErrorMessage: resolved.Error };
          }
          await this.SelectProduction(resolved.Item, true);
          return { Success: true };
        },
      },
      {
        Name: 'RefreshProductions',
        Description: 'Reload the Video Productions gallery from the server. Read-only operation.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          // SAFETY BOUNDARY: Read-only data reload.
          await this.Refresh();
          return { Success: true };
        },
      },
      ...this.SlideInState.BuildBriefClientTools({
        GetBriefComponent: () => this.CopilotPanel?.BriefComponent,
        GetFallbackBrandKits: () =>
          Array.from(this.brandKitsById.values()).map((k) => ({
            ID: k.ID,
            Name: k.Name,
            Description: k.Description ?? '',
            CompanyID: k.CompanyID ?? null,
            CompanyName: this.findCompanyName(k.CompanyID ?? null),
            IsDefault: Boolean(k.IsDefault),
            Status: k.Status === 'Inactive' ? 'Inactive' : 'Active',
            Swatches: [],
            PrimaryLogoFileID: null,
            PrimaryLogoUrl: null,
            AssetCount: 0,
          })),
        OnBriefMutated: () => {
          this.CopilotAppContext = this.buildCopilotAppContext();
          this.syncAgentContext();
          this.cdr.markForCheck();
        },
      }),
    ]);
  }

  private async restoreSelectionFromQueryParams(): Promise<void> {
    const params = this.GetQueryParams();
    const targetId = params['production'];
    if (!targetId) {
      return;
    }
    const resolution = ResolveVideoStudioItem(targetId, this.AllProductions, 'production');
    if (resolution.Ok) {
      await this.SelectProduction(resolution.Item, false);
    }
  }

  private buildCardItems(
    artifacts: MJArtifactEntity[],
    versionByArtifactId: Map<string, SimpleArtifactVersionRow>,
    attrsByVersionId: Map<string, Map<string, string>>,
  ): ProductionCardSnapshot[] {
    return artifacts.map((artifact) => {
      const versionRow = versionByArtifactId.get(artifact.ID.toLowerCase()) ?? null;
      const attrMap =
        (versionRow ? attrsByVersionId.get(versionRow.ID.toLowerCase()) : undefined) ??
        new Map<string, string>();

      const statusAttr = this.cleanAttributeValue(attrMap.get('status'));
      const status: ProductionCardStatus =
        statusAttr && VALID_PRODUCTION_STATUSES.has(statusAttr as VideoProductionStatus)
          ? (statusAttr as VideoProductionStatus)
          : 'Unknown';
      const archetype = this.cleanAttributeValue(attrMap.get('archetype')) || '';
      const rawPosterFileId = this.cleanAttributeValue(attrMap.get('posterFileID'));
      const posterFileId =
        rawPosterFileId && !rawPosterFileId.startsWith('inline:') ? rawPosterFileId : null;
      const brandKitId = this.cleanAttributeValue(attrMap.get('brandKitID'));
      const companyId = this.cleanAttributeValue(attrMap.get('companyID'));
      const durationRaw = this.cleanAttributeValue(attrMap.get('durationSeconds'));
      const durationParsed = durationRaw ? Number(durationRaw) : NaN;
      const format =
        this.cleanAttributeValue(attrMap.get('format')) ??
        this.cleanAttributeValue(attrMap.get('formats'));
      const extractedTitle =
        this.cleanAttributeValue(attrMap.get('title')) ??
        this.cleanAttributeValue(attrMap.get('name'));

      const brandKit = this.findBrandKit(brandKitId);
      const resolvedCompanyId = companyId ?? brandKit?.CompanyID ?? null;
      const resolvedCompanyName = this.findCompanyName(resolvedCompanyId);
      const rawUpdated = artifact.__mj_UpdatedAt ?? artifact.__mj_CreatedAt;
      const updatedDate =
        rawUpdated instanceof Date && !Number.isNaN(rawUpdated.getTime())
          ? rawUpdated
          : typeof rawUpdated === 'string' && !Number.isNaN(Date.parse(rawUpdated))
            ? new Date(rawUpdated)
            : new Date(0);

      return {
        ID: artifact.ID,
        Name: extractedTitle || artifact.Name || 'Untitled Production',
        Description: artifact.Description ?? '',
        VersionID: versionRow?.ID ?? null,
        VersionNumber: typeof versionRow?.VersionNumber === 'number' ? versionRow.VersionNumber : 0,
        PosterFileID: posterFileId,
        PosterUrl: null,
        Status: status,
        Archetype: archetype,
        BrandKitID: brandKit?.ID ?? brandKitId,
        BrandKitName: brandKit?.Name ?? null,
        CompanyID: resolvedCompanyId,
        CompanyName: resolvedCompanyName,
        DurationSeconds: Number.isFinite(durationParsed) ? durationParsed : null,
        AspectRatio: format,
        SceneCount: null,
        UpdatedAt: updatedDate,
      };
    });
  }

  private cleanAttributeValue(raw: string | undefined): string | null {
    if (!raw) {
      return null;
    }
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
      return null;
    }
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      const unquoted = trimmed.slice(1, -1).trim();
      return unquoted.length > 0 ? unquoted : null;
    }
    return trimmed;
  }

  private findBrandKit(brandKitId: string | null): MJBrandKitEntity | null {
    if (!brandKitId) {
      return null;
    }
    const direct = this.brandKitsById.get(brandKitId);
    if (direct) {
      return direct;
    }
    for (const kit of this.brandKitsById.values()) {
      if (UUIDsEqual(kit.ID, brandKitId)) {
        return kit;
      }
    }
    return null;
  }

  private findCompanyName(companyId: string | null): string | null {
    if (!companyId) {
      return null;
    }
    const direct = this.companiesById.get(companyId);
    if (direct) {
      return direct;
    }
    for (const [id, name] of this.companiesById.entries()) {
      if (UUIDsEqual(id, companyId)) {
        return name;
      }
    }
    return null;
  }

  private async mintPosterUrls(items: ProductionCardSnapshot[]): Promise<void> {
    if (!(this.ProviderToUse instanceof GraphQLDataProvider)) {
      return;
    }

    const client = new GraphQLFileStorageClient(this.ProviderToUse);
    const itemsWithPosters = items.filter(
      (item) => Boolean(item.PosterFileID && !item.PosterFileID.startsWith('inline:')),
    );
    if (itemsWithPosters.length === 0) {
      return;
    }

    await Promise.all(
      itemsWithPosters.map(async (item) => {
        if (!item.PosterFileID || item.PosterFileID.startsWith('inline:')) {
          return;
        }
        try {
          const token = await client.CreateMediaAccessToken(item.PosterFileID);
          if (token.Success && token.Url) {
            item.PosterUrl = token.Url;
          }
        } catch (err: unknown) {
          LogError(err instanceof Error ? err.message : String(err));
        }
      }),
    );
    this.cdr.markForCheck();
  }

  private rebuildFilterFieldOptions(): void {
    const archetypes = new Set<string>();
    const statuses = new Set<string>();
    const brandKitOptions = new Map<string, string>();
    const companyOptions = new Map<string, string>();

    for (const kit of this.brandKitsById.values()) {
      brandKitOptions.set(kit.ID, kit.Name);
      if (kit.CompanyID) {
        companyOptions.set(
          kit.CompanyID,
          this.findCompanyName(kit.CompanyID) || kit.Company || kit.CompanyID,
        );
      }
    }

    for (const item of this.AllProductions) {
      if (item.Archetype) {
        archetypes.add(item.Archetype);
      }
      if (item.Status) {
        statuses.add(item.Status);
      }
      if (item.BrandKitID) {
        brandKitOptions.set(item.BrandKitID, item.BrandKitName || item.BrandKitID);
      }
      if (item.CompanyID) {
        companyOptions.set(
          item.CompanyID,
          this.findCompanyName(item.CompanyID) || item.CompanyName || item.CompanyID,
        );
      }
    }

    this.FilterFields = [
      {
        key: 'archetype',
        label: 'Archetype',
        type: 'dropdown',
        options: Array.from(archetypes)
          .sort((a, b) => a.localeCompare(b))
          .map((value) => ({ value, text: value })),
      },
      {
        key: 'status',
        label: 'Status',
        type: 'dropdown',
        options: Array.from(statuses)
          .sort((a, b) => a.localeCompare(b))
          .map((value) => ({ value, text: value })),
      },
      {
        key: 'brandKitId',
        label: 'Brand Kit',
        type: 'dropdown',
        options: Array.from(brandKitOptions.entries())
          .sort((a, b) => a[1].localeCompare(b[1]))
          .map(([value, text]) => ({ value, text })),
      },
      {
        key: 'companyId',
        label: 'Company',
        type: 'dropdown',
        options: Array.from(companyOptions.entries())
          .sort((a, b) => a[1].localeCompare(b[1]))
          .map(([value, text]) => ({ value, text })),
      },
    ];
  }

  private currentFilterState(): ProductionFilterState {
    return {
      SearchQuery: this.SearchText,
      Archetype: this.ArchetypeFilter,
      Status: this.StatusFilter,
      BrandKitID: this.BrandKitFilter,
      CompanyID: this.CompanyFilter,
      FromDate: this.DateFrom,
      ToDate: this.DateTo,
    };
  }

  private applyFiltersAndSync(): void {
    this.FilteredProductions = FilterProductionCards(
      this.AllProductions,
      this.currentFilterState(),
    );
    this.syncAgentContext();
    this.cdr.markForCheck();
  }

  private buildProductionsContext(): Record<string, unknown> {
    const availableArchetypes = Array.from(
      new Set(this.AllProductions.map((p) => p.Archetype).filter((a) => Boolean(a))),
    );
    const availableBrandKitNames = Array.from(
      new Set(
        Array.from(this.brandKitsById.values())
          .map((k) => k.Name)
          .filter((n) => Boolean(n)),
      ),
    );
    const availableCompanyNames = Array.from(
      new Set(
        this.AllProductions.map((p) => p.CompanyName ?? '').filter((c) => Boolean(c)),
      ),
    );

    const activeBrandKit = this.findBrandKit(this.BrandKitFilter || null);
    const activeCompanyName =
      this.findCompanyName(this.CompanyFilter || null) ??
      this.AllProductions.find(
        (p) => p.CompanyID && UUIDsEqual(p.CompanyID, this.CompanyFilter),
      )?.CompanyName ??
      null;

    return BuildProductionsAgentContext({
      TotalCount: this.AllProductions.length,
      FilteredCards: this.FilteredProductions,
      Filters: this.currentFilterState(),
      BrandKitFilterName: activeBrandKit?.Name ?? null,
      CompanyFilterName: activeCompanyName,
      SelectedProduction: this.SelectedProduction,
      AvailableArchetypes: availableArchetypes,
      AvailableBrandKitNames: availableBrandKitNames,
      AvailableCompanyNames: availableCompanyNames,
      IsLoading: this.IsLoading,
    });
  }

  private syncAgentContext(): void {
    const context = this.buildProductionsContext();
    this.CopilotAppContext = this.buildCopilotAppContext();
    this.navigationService.SetAgentContext(this, context);
    this.registerAgentClientTools();
  }
}

