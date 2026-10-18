import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { LogError, RunView, UserInfo } from '@memberjunction/core';
import {
  BrandKitEngine,
  MJBrandKitEntity,
  MJEnvironmentEntityExtended,
  MJVideoArchetypeEntity,
  ResourceData,
  VideoStudioEngine,
  VideoStudioSetupHealthOperation,
  VideoStudioSetupHealthOutput,
} from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { NavigationRequest } from '@memberjunction/ng-artifacts';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import {
  VSCopilotConversationCreatedEvent,
  VSCopilotPanelComponent,
} from '../components/vs-copilot-panel.component';
import {
  ARCHETYPE_CATEGORIES,
  ArchetypeCardSnapshot,
  ArchetypeCategory,
  BrandKitCardSnapshot,
  BuildSavedQuerySearchFilter,
  BuildStudioAgentContext,
  BuildStudioAppContext,
  ClampStudioDuration,
  ComposeStudioFirstMessage,
  ParseArchetypeDefaultFormats,
  ResolveVideoStudioItem,
  STUDIO_VIDEO_FORMATS,
  StudioSavedQueryItem,
  StudioVideoFormat,
} from '../video-studio-agent-context';

interface SimpleSavedQueryRow {
  ID: string;
  Name: string;
}

const DEFAULT_STUDIO_DURATION_SECONDS = 30;
const DEFAULT_MIN_DURATION_SECONDS = 5;
const DEFAULT_MAX_DURATION_SECONDS = 180;
const SAVED_QUERIES_MAX_ROWS = 20;

/**
 * Studio resource tab (`VideoStudioStudioResource`) for the Video Studio application.
 *
 * Left pane: Start form (archetype cards, company-filtered Brand Kit select, format
 * checkboxes, bounded duration input, topic input, saved-query picker, and user-triggered
 * Start production button).
 * Right pane: Always-present `<vs-copilot-panel>` pinned to the `'Video Studio'` agent.
 */
@RegisterClass(BaseResourceComponent, 'VideoStudioStudioResource')
@Component({
  standalone: false,
  selector: 'mj-video-studio-studio-resource',
  templateUrl: './video-studio-studio-resource.component.html',
  styleUrls: ['./video-studio-studio-resource.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoStudioStudioResourceComponent
  extends BaseResourceComponent
  implements OnInit, OnDestroy
{
  public IsLoading = false;
  public LoadError: string | null = null;
  public IsStarting = false;
  public StartError: string | null = null;

  public SetupHealthResult: VideoStudioSetupHealthOutput | null = null;
  public IsCheckingSetupHealth = false;

  public AllArchetypes: ArchetypeCardSnapshot[] = [];
  public AllBrandKits: BrandKitCardSnapshot[] = [];
  public FilteredBrandKits: BrandKitCardSnapshot[] = [];
  public AvailableQueries: StudioSavedQueryItem[] = [];

  public SelectedArchetype: ArchetypeCardSnapshot | null = null;
  public SelectedCompanyId = 'all';
  public SelectedBrandKit: BrandKitCardSnapshot | null = null;
  public SelectedFormats: StudioVideoFormat[] = ['16:9'];
  public DurationSeconds: number = DEFAULT_STUDIO_DURATION_SECONDS;
  public Topic = '';
  public QuerySearchText = '';
  public SelectedQueries: StudioSavedQueryItem[] = [];
  public IsSearchingQueries = false;

  public ActiveConversationId: string | null = null;
  public PendingMessage: string | null = null;
  public StudioAppContext: Record<string, unknown> = BuildStudioAppContext({
    ArchetypeID: null,
    BrandKitID: null,
    Formats: ['16:9'],
    DurationSeconds: DEFAULT_STUDIO_DURATION_SECONDS,
    QueryIDs: [],
  });

  public readonly AvailableFormats: readonly StudioVideoFormat[] = STUDIO_VIDEO_FORMATS;

  @ViewChild('copilotPanel')
  private copilotPanel?: Pick<VSCopilotPanelComponent, 'StartConversation'>;

  private querySearchRequestId = 0;

  private readonly cdr = inject(ChangeDetectorRef);

  async ngOnInit(): Promise<void> {
    super.ngOnInit();
    this.registerAgentClientTools();
    void this.CheckSetupHealth();
    try {
      await this.LoadStudioData(false);
    } finally {
      this.NotifyLoadComplete();
    }
  }

  public async CheckSetupHealth(): Promise<void> {
    this.IsCheckingSetupHealth = true;
    this.cdr.markForCheck();
    try {
      const res = await new VideoStudioSetupHealthOperation().Execute(
        {},
        { provider: this.ProviderToUse },
      );
      if (res.Success && res.Output) {
        this.SetupHealthResult = res.Output;
      } else {
        this.SetupHealthResult = {
          Healthy: false,
          Checks: [
            {
              Key: 'Render',
              Status: 'Error',
              Title: 'Setup Health',
              Message: res.ErrorMessage || 'Failed to check Video Studio setup health.',
            },
          ],
        };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.SetupHealthResult = {
        Healthy: false,
        Checks: [
          {
            Key: 'Render',
            Status: 'Error',
            Title: 'Setup Health',
            Message: msg || 'Failed to check Video Studio setup health.',
          },
        ],
      };
    } finally {
      this.IsCheckingSetupHealth = false;
      this.cdr.markForCheck();
    }
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
  }

  public async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Studio';
  }

  public async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-wand-magic-sparkles';
  }

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

  public get MinDurationSeconds(): number {
    return this.SelectedArchetype?.MinDurationSeconds ?? DEFAULT_MIN_DURATION_SECONDS;
  }

  public get MaxDurationSeconds(): number {
    return this.SelectedArchetype?.MaxDurationSeconds ?? DEFAULT_MAX_DURATION_SECONDS;
  }

  public get CanStartProduction(): boolean {
    return (
      !this.IsStarting &&
      this.Topic.trim().length > 0 &&
      this.SelectedArchetype !== null &&
      this.SelectedFormats.length > 0
    );
  }

  public get AvailableCompanies(): { ID: string; Name: string }[] {
    const map = new Map<string, string>();
    for (const kit of this.AllBrandKits) {
      if (kit.CompanyID && kit.CompanyName) {
        map.set(kit.CompanyID, kit.CompanyName);
      }
    }
    return Array.from(map.entries())
      .map(([ID, Name]) => ({ ID, Name }))
      .sort((a, b) => a.Name.localeCompare(b.Name));
  }

  public get CompanyDropdownOptions(): { ID: string; Name: string }[] {
    return [{ ID: 'all', Name: 'All Companies' }, ...this.AvailableCompanies];
  }

  public get BrandKitDropdownOptions(): { ID: string; DisplayName: string }[] {
    return this.FilteredBrandKits.map((kit) => ({
      ID: kit.ID,
      DisplayName: `${kit.Name}${kit.CompanyName ? ' (' + kit.CompanyName + ')' : ' (Workspace Default)'}`,
    }));
  }

  public async Refresh(): Promise<void> {
    await this.LoadStudioData(true);
  }

  public async LoadStudioData(forceRefresh = false): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();

    try {
      const vsEngine = VideoStudioEngine.GetProviderInstance<VideoStudioEngine>(
        this.ProviderToUse,
        VideoStudioEngine,
      ) as VideoStudioEngine;
      const bkEngine = BrandKitEngine.GetProviderInstance<BrandKitEngine>(
        this.ProviderToUse,
        BrandKitEngine,
      ) as BrandKitEngine;

      const user = this.ProviderToUse?.CurrentUser ?? undefined;
      await Promise.all([
        vsEngine.Config(forceRefresh, user, this.ProviderToUse),
        bkEngine.Config(forceRefresh, user, this.ProviderToUse),
      ]);

      const activeArchetypes = (vsEngine.Archetypes ?? []).filter(
        (a: MJVideoArchetypeEntity) => a.Status === 'Active' || !a.Status,
      );
      this.AllArchetypes = activeArchetypes.map((a: MJVideoArchetypeEntity) =>
        this.mapArchetypeToCard(a),
      );

      const activeKits = (bkEngine.BrandKits ?? []).filter(
        (k) => k.Status === 'Active' || !k.Status,
      );
      this.AllBrandKits = activeKits.map((k) => this.mapBrandKitToCard(k, bkEngine));
      this.applyCompanyBrandKitFilter();

      await this.SearchSavedQueries(this.QuerySearchText);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      LogError(`VideoStudioStudioResourceComponent.LoadStudioData: ${msg}`);
      this.LoadError = msg;
    } finally {
      this.IsLoading = false;
      this.syncAppAndAgentContext();
      this.cdr.markForCheck();
    }
  }

  public SelectArchetype(card: ArchetypeCardSnapshot): void {
    this.SelectedArchetype = card;
    this.SelectedFormats = ParseArchetypeDefaultFormats(card.DefaultFormats);
    this.DurationSeconds = ClampStudioDuration(
      card.DefaultDurationSeconds,
      card.MinDurationSeconds,
      card.MaxDurationSeconds,
    );
    this.syncAppAndAgentContext();
    this.cdr.markForCheck();
  }

  public OnCompanyFilterChange(companyId: string): void {
    this.SelectedCompanyId = companyId || 'all';
    this.applyCompanyBrandKitFilter();
    if (
      this.SelectedBrandKit &&
      !this.FilteredBrandKits.some((k) => UUIDsEqual(k.ID, this.SelectedBrandKit?.ID))
    ) {
      this.SelectedBrandKit = null;
    }
    this.syncAppAndAgentContext();
    this.cdr.markForCheck();
  }

  public SelectBrandKitById(brandKitId: string | null): void {
    const trimmed = (brandKitId ?? '').trim();
    if (!trimmed) {
      this.SelectedBrandKit = null;
    } else {
      this.SelectedBrandKit =
        this.AllBrandKits.find((k) => UUIDsEqual(k.ID, trimmed)) ?? null;
    }
    this.syncAppAndAgentContext();
    this.cdr.markForCheck();
  }

  public IsFormatSelected(format: StudioVideoFormat): boolean {
    return this.SelectedFormats.includes(format);
  }

  public ToggleFormat(format: StudioVideoFormat): void {
    if (this.SelectedFormats.includes(format)) {
      if (this.SelectedFormats.length > 1) {
        this.SelectedFormats = this.SelectedFormats.filter((f) => f !== format);
      }
    } else {
      this.SelectedFormats = [...this.SelectedFormats, format];
    }
    this.syncAppAndAgentContext();
    this.cdr.markForCheck();
  }

  public SetFormats(formats: readonly string[]): boolean {
    const allowed = new Set<string>(STUDIO_VIDEO_FORMATS);
    const valid: StudioVideoFormat[] = [];
    for (const raw of formats) {
      const cleaned = (raw ?? '').trim();
      if (allowed.has(cleaned) && !valid.includes(cleaned as StudioVideoFormat)) {
        valid.push(cleaned as StudioVideoFormat);
      }
    }
    if (valid.length === 0) {
      return false;
    }
    this.SelectedFormats = valid;
    this.syncAppAndAgentContext();
    this.cdr.markForCheck();
    return true;
  }

  public OnDurationChange(rawValue: string | number): void {
    const numeric = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    this.DurationSeconds = ClampStudioDuration(
      numeric,
      this.MinDurationSeconds,
      this.MaxDurationSeconds,
    );
    this.syncAppAndAgentContext();
    this.cdr.markForCheck();
  }

  public OnTopicChange(value: string): void {
    this.Topic = value ?? '';
    this.syncAppAndAgentContext();
    this.cdr.markForCheck();
  }

  public async SearchSavedQueries(searchText: string): Promise<void> {
    this.QuerySearchText = searchText ?? '';
    this.IsSearchingQueries = true;
    const requestId = ++this.querySearchRequestId;
    this.cdr.markForCheck();

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const extraFilter = BuildSavedQuerySearchFilter(this.QuerySearchText);
      const result = await rv.RunView<SimpleSavedQueryRow>({
        EntityName: 'MJ: Queries',
        ExtraFilter: extraFilter,
        OrderBy: 'Name ASC',
        Fields: ['ID', 'Name'],
        MaxRows: SAVED_QUERIES_MAX_ROWS,
        ResultType: 'simple',
      });

      if (requestId !== this.querySearchRequestId) {
        return;
      }

      if (result.Success && Array.isArray(result.Results)) {
        this.AvailableQueries = result.Results.map((row) => ({
          ID: row.ID,
          Name: row.Name,
        }));
      } else {
        this.AvailableQueries = [];
      }
    } catch (err: unknown) {
      if (requestId !== this.querySearchRequestId) {
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      LogError(`VideoStudioStudioResourceComponent.SearchSavedQueries: ${msg}`);
      this.AvailableQueries = [];
    } finally {
      if (requestId === this.querySearchRequestId) {
        this.IsSearchingQueries = false;
        this.cdr.markForCheck();
      }
    }
  }

  public IsQuerySelected(queryId: string): boolean {
    return this.SelectedQueries.some((q) => UUIDsEqual(q.ID, queryId));
  }

  public ToggleSavedQuery(query: StudioSavedQueryItem): void {
    if (this.IsQuerySelected(query.ID)) {
      this.SelectedQueries = this.SelectedQueries.filter(
        (q) => !UUIDsEqual(q.ID, query.ID),
      );
    } else {
      this.SelectedQueries = [...this.SelectedQueries, query];
    }
    this.syncAppAndAgentContext();
    this.cdr.markForCheck();
  }

  /**
   * User-triggered Start production action.
   * Composes the deterministic first message, resets ConversationId to null to start
   * a fresh conversation, updates PendingMessage + AppContext on the copilot, and
   * dispatches the message through the copilot panel into `mj-conversation-chat-area`.
   */
  public async StartProduction(): Promise<void> {
    if (!this.CanStartProduction || !this.SelectedArchetype) {
      return;
    }

    this.IsStarting = true;
    this.StartError = null;
    this.cdr.markForCheck();

    try {
      const message = ComposeStudioFirstMessage({
        ArchetypeName: this.SelectedArchetype.Name,
        Topic: this.Topic,
        DurationSeconds: this.DurationSeconds,
        Formats: this.SelectedFormats,
        BrandKitName: this.SelectedBrandKit?.Name ?? null,
        QueryNames: this.SelectedQueries.map((q) => q.Name),
      });

      this.ActiveConversationId = null;
      this.StudioAppContext = BuildStudioAppContext({
        ArchetypeID: this.SelectedArchetype.ID,
        BrandKitID: this.SelectedBrandKit?.ID ?? null,
        Formats: this.SelectedFormats,
        DurationSeconds: this.DurationSeconds,
        QueryIDs: this.SelectedQueries.map((q) => q.ID),
      });
      this.PendingMessage = message;
      this.syncAppAndAgentContext();
      this.cdr.detectChanges();

      const started = (await this.copilotPanel?.StartConversation(message)) ?? false;
      if (!started) {
        this.StartError = "The copilot isn't ready yet.";
      }
    } finally {
      this.IsStarting = false;
      this.cdr.markForCheck();
    }
  }

  public OnCopilotConversationCreated(event: VSCopilotConversationCreatedEvent): void {
    this.ActiveConversationId = event.conversation.ID;
    this.syncAppAndAgentContext();
    this.cdr.markForCheck();
  }

  public OnPendingMessageConsumed(): void {
    this.PendingMessage = null;
    this.cdr.markForCheck();
  }

  public OnCopilotNavigationRequest(request: NavigationRequest): void {
    if (request.appName) {
      void this.navigationService.SwitchToApp(
        request.appName,
        request.navItemName,
        request.queryParams,
      );
    }
  }

  // ============================================================================
  // AI Agent Client Tools
  //
  // SAFETY BOUNDARY: The Studio surface exposes ONLY form-fill client tools
  // (`SelectStudioArchetype`, `SelectStudioBrandKit`, `SetStudioFormats`,
  // `SetStudioTopic`). Start production is intentionally excluded from client
  // tools so that spending/rendering actions remain strictly user-triggered.
  // ============================================================================

  private registerAgentClientTools(): void {
    // SAFETY BOUNDARY: Form-fill tools only; StartProduction is never exposed as a client tool.
    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'SelectStudioArchetype',
        Description:
          'Select a video archetype in the Studio Start form by ID or name. Prefills default formats and duration bounds.',
        ParameterSchema: {
          type: 'object',
          properties: {
            archetype: {
              type: 'string',
              description: 'Archetype ID or name to select',
            },
          },
          required: ['archetype'],
        },
        Handler: async (params: Record<string, unknown>) => {
          // SAFETY BOUNDARY: Mutates local Studio form state only.
          const raw = typeof params?.['archetype'] === 'string' ? params['archetype'] : '';
          const resolution = ResolveVideoStudioItem(raw, this.AllArchetypes, 'archetype');
          if (!resolution.Ok) {
            return {
              Success: false,
              ErrorMessage: resolution.Error,
            };
          }
          this.SelectArchetype(resolution.Item);
          return {
            Success: true,
            Data: {
              SelectedArchetypeId: resolution.Item.ID,
              SelectedArchetypeName: resolution.Item.Name,
            },
          };
        },
      },
      {
        Name: 'SelectStudioBrandKit',
        Description:
          'Select a Brand Kit in the Studio Start form by ID or name (or pass "none" to clear the selection).',
        ParameterSchema: {
          type: 'object',
          properties: {
            brandKit: {
              type: 'string',
              description: 'Brand Kit ID or name to select, or "none" to clear',
            },
          },
          required: ['brandKit'],
        },
        Handler: async (params: Record<string, unknown>) => {
          // SAFETY BOUNDARY: Mutates local Studio form state only.
          const raw = typeof params?.['brandKit'] === 'string' ? params['brandKit'].trim() : '';
          if (!raw || raw.toLowerCase() === 'none') {
            this.SelectBrandKitById(null);
            return { Success: true, Data: { SelectedBrandKitId: null } };
          }
          const resolution = ResolveVideoStudioItem(raw, this.AllBrandKits, 'brand kit');
          if (!resolution.Ok) {
            return {
              Success: false,
              ErrorMessage: resolution.Error,
            };
          }
          this.SelectBrandKitById(resolution.Item.ID);
          return {
            Success: true,
            Data: {
              SelectedBrandKitId: resolution.Item.ID,
              SelectedBrandKitName: resolution.Item.Name,
            },
          };
        },
      },
      {
        Name: 'SetStudioFormats',
        Description:
          'Set the output video aspect-ratio formats in the Studio Start form (e.g. ["16:9", "9:16"]).',
        ParameterSchema: {
          type: 'object',
          properties: {
            formats: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of format codes from 16:9, 9:16, 1:1, 4:5',
            },
          },
          required: ['formats'],
        },
        Handler: async (params: Record<string, unknown>) => {
          // SAFETY BOUNDARY: Mutates local Studio form state only.
          const rawFormats = params?.['formats'];
          const list: string[] = Array.isArray(rawFormats)
            ? rawFormats.filter((v): v is string => typeof v === 'string')
            : typeof rawFormats === 'string'
              ? rawFormats.split(',')
              : [];
          const ok = this.SetFormats(list);
          if (!ok) {
            return {
              Success: false,
              ErrorMessage: `Specify at least one valid format (${STUDIO_VIDEO_FORMATS.join(', ')}).`,
            };
          }
          return { Success: true, Data: { SelectedFormats: [...this.SelectedFormats] } };
        },
      },
      {
        Name: 'SetStudioTopic',
        Description:
          'Set the topic description in the Studio Start form without starting production.',
        ParameterSchema: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              description: 'Topic or prompt description for the video',
            },
          },
          required: ['topic'],
        },
        Handler: async (params: Record<string, unknown>) => {
          // SAFETY BOUNDARY: Mutates local Studio form state only.
          const topic = typeof params?.['topic'] === 'string' ? params['topic'] : '';
          this.OnTopicChange(topic);
          return { Success: true, Data: { Topic: this.Topic } };
        },
      },
    ]);
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private applyCompanyBrandKitFilter(): void {
    const companyFilter = (this.SelectedCompanyId ?? 'all').trim();
    if (!companyFilter || companyFilter === 'all') {
      this.FilteredBrandKits = [...this.AllBrandKits];
      return;
    }
    this.FilteredBrandKits = this.AllBrandKits.filter(
      (kit) => kit.CompanyID === null || UUIDsEqual(kit.CompanyID, companyFilter),
    );
  }

  private syncAppAndAgentContext(): void {
    this.StudioAppContext = BuildStudioAppContext({
      ArchetypeID: this.SelectedArchetype?.ID ?? null,
      BrandKitID: this.SelectedBrandKit?.ID ?? null,
      Formats: this.SelectedFormats,
      DurationSeconds: this.DurationSeconds,
      QueryIDs: this.SelectedQueries.map((q) => q.ID),
    });

    this.navigationService.SetAgentContext(
      this,
      BuildStudioAgentContext({
        AllArchetypes: this.AllArchetypes,
        AllBrandKits: this.AllBrandKits,
        SelectedArchetype: this.SelectedArchetype,
        SelectedBrandKit: this.SelectedBrandKit,
        SelectedFormats: this.SelectedFormats,
        DurationSeconds: this.DurationSeconds,
        Topic: this.Topic,
        SelectedQueries: this.SelectedQueries,
        ActiveConversationId: this.ActiveConversationId,
        IsLoading: this.IsLoading,
      }),
    );
  }

  private mapArchetypeToCard(entity: MJVideoArchetypeEntity): ArchetypeCardSnapshot {
    const rawCategory = (entity.Category ?? 'Explainer').trim();
    const category: ArchetypeCategory = (
      ARCHETYPE_CATEGORIES as readonly string[]
    ).includes(rawCategory)
      ? (rawCategory as ArchetypeCategory)
      : 'Explainer';

    const rawBeats = Array.isArray(entity.BeatTemplateObject)
      ? entity.BeatTemplateObject
      : [];
    const beatLabels = rawBeats.map((b, idx) => b.Label || b.Key || `Beat ${idx + 1}`);
    const companyRaw = entity.Company;

    return {
      ID: entity.ID,
      Name: entity.Name ?? 'Untitled Archetype',
      Description: entity.Description ?? '',
      Category: category,
      Status: entity.Status === 'Inactive' ? 'Inactive' : 'Active',
      CompanyID: entity.CompanyID ?? null,
      CompanyName:
        typeof companyRaw === 'string' && companyRaw.trim().length > 0
          ? companyRaw.trim()
          : null,
      IsShipped: entity.CompanyID === null || entity.CompanyID === undefined,
      DefaultDurationSeconds: entity.DefaultDurationSeconds ?? DEFAULT_STUDIO_DURATION_SECONDS,
      MinDurationSeconds: entity.MinDurationSeconds ?? DEFAULT_MIN_DURATION_SECONDS,
      MaxDurationSeconds: entity.MaxDurationSeconds ?? DEFAULT_MAX_DURATION_SECONDS,
      DefaultFormats: entity.DefaultFormats ?? '["16:9"]',
      BeatCount: rawBeats.length,
      BeatLabels: beatLabels,
    };
  }

  private mapBrandKitToCard(
    kit: MJBrandKitEntity,
    engine: BrandKitEngine,
  ): BrandKitCardSnapshot {
    const assets = engine.GetAssets(kit.ID) ?? [];
    const companyRaw = kit.Company;
    return {
      ID: kit.ID,
      Name: kit.Name ?? 'Untitled Brand Kit',
      Description: kit.Description ?? '',
      CompanyID: kit.CompanyID ?? null,
      CompanyName:
        typeof companyRaw === 'string' && companyRaw.trim().length > 0
          ? companyRaw.trim()
          : null,
      IsDefault: Boolean(kit.IsDefault),
      Status: kit.Status === 'Inactive' ? 'Inactive' : 'Active',
      Swatches: [],
      PrimaryLogoFileID: null,
      PrimaryLogoUrl: null,
      AssetCount: assets.length,
    };
  }
}
