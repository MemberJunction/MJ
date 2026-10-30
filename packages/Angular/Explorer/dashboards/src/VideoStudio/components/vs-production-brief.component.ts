import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  QueryList,
  ViewChildren,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LogError, RunView } from '@memberjunction/core';
import {
  BrandKitEngine,
  MJBrandKitEntity,
  MJVideoArchetypeEntity,
  VideoStudioEngine,
  VideoStudioSetupHealthOperation,
  VideoStudioSetupHealthOutput,
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import {
  FormatVideoTime,
  FormatVideoTimeRange,
  MJVideoBeatStripComponent,
  MJVideoFormatGlyphComponent,
  VideoBeatStripItem,
} from '@memberjunction/ng-artifacts';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { BrandKitCreatorComponent } from '@memberjunction/ng-brand-kits';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import {
  MJButtonDirective,
  MJDialogComponent,
  MJDropdownComponent,
  MJNumericInputComponent,
} from '@memberjunction/ng-ui-components';
import { VideoCaptionMode } from '@memberjunction/video-studio-core';
import { VSAudioOptionsComponent } from './vs-audio-options.component';
import { VSSetupHealthCardComponent } from './vs-setup-health-card.component';
import {
  ARCHETYPE_CATEGORIES,
  ArchetypeCardSnapshot,
  ArchetypeCategory,
  BrandKitCardSnapshot,
  BuildArchetypeBeatStripItems,
  BuildSavedQuerySearchFilter,
  BuildStudioAppContext,
  ClampStudioDuration,
  ComposeStudioFirstMessage,
  ParseArchetypeDefaultFormats,
  ResolveVideoStudioItem,
  STUDIO_VIDEO_FORMATS,
  StudioSavedQueryItem,
} from '../video-studio-agent-context';

interface SimpleSavedQueryRow {
  ID: string;
  Name: string;
}

const DEFAULT_STUDIO_DURATION_SECONDS = 30;
const DEFAULT_MIN_DURATION_SECONDS = 5;
const DEFAULT_MAX_DURATION_SECONDS = 180;
const SAVED_QUERIES_MAX_ROWS = 20;

export interface VSProductionBriefStartEvent {
  Message: string;
  AppContext: Record<string, unknown>;
  Archetype: ArchetypeCardSnapshot;
  BrandKit: BrandKitCardSnapshot | null;
  Formats: string[];
  DurationSeconds: number;
  Topic: string;
  Queries: StudioSavedQueryItem[];
  NarrationEnabled: boolean;
  CaptionsMode: VideoCaptionMode;
}

export interface VSProductionBriefStateSnapshot {
  AllArchetypes: ArchetypeCardSnapshot[];
  AllBrandKits: BrandKitCardSnapshot[];
  SelectedArchetype: ArchetypeCardSnapshot | null;
  SelectedBrandKit: BrandKitCardSnapshot | null;
  SelectedFormats: string[];
  DurationSeconds: number;
  Topic: string;
  SelectedQueries: StudioSavedQueryItem[];
  NarrationEnabled: boolean;
  CaptionsMode: VideoCaptionMode;
  AppContext: Record<string, unknown>;
  IsLoading: boolean;
}

export interface VSProductionBriefSetupHealthEvent {
  Result: VideoStudioSetupHealthOutput | null;
  Loading: boolean;
}

/**
 * Video Studio production brief (`vs-production-brief`).
 *
 * Renders inside the Video Studio right slide-in before the first conversation message
 * (via `<ng-template mjChatSlot="emptyState">`), guiding the user through:
 * 1. Setup health (shown on warning/error, or when Setup OK details are toggled from the header)
 * 2. What's it about?
 * 3. Shape (archetype cards with beat strip and m:ss range)
 * 4. Where it plays (format toggles with frame glyph + length numeric input)
 * 5. Sound (`vs-audio-options`)
 * 6. Brand kit (optional)
 * 7. Data (optional)
 * 8. Start production (sticky footer with one-line summary)
 */
@Component({
  standalone: true,
  selector: 'vs-production-brief, mj-vs-production-brief',
  imports: [
    CommonModule,
    FormsModule,
    SharedGenericModule,
    BrandKitCreatorComponent,
    MJButtonDirective,
    MJDialogComponent,
    MJDropdownComponent,
    MJNumericInputComponent,
    MJVideoFormatGlyphComponent,
    MJVideoBeatStripComponent,
    VSSetupHealthCardComponent,
    VSAudioOptionsComponent,
  ],
  templateUrl: './vs-production-brief.component.html',
  styleUrls: ['./vs-production-brief.component.css'],
})
export class VSProductionBriefComponent extends BaseAngularComponent implements OnInit {
  @Input() AutoLoad = true;

  @Input() SetupHealthResult: VideoStudioSetupHealthOutput | null = null;
  @Input() IsCheckingSetupHealth = false;
  @Input() ShowHealthySetupDetails = false;

  @Input() AllArchetypes: ArchetypeCardSnapshot[] = [];
  @Input() AllBrandKits: BrandKitCardSnapshot[] = [];
  @Input() AvailableQueries: StudioSavedQueryItem[] = [];
  @Input() AvailableFormats: string[] = [...STUDIO_VIDEO_FORMATS];

  @Input() SelectedArchetype: ArchetypeCardSnapshot | null = null;
  @Input() SelectedCompanyId = 'all';
  @Input() SelectedBrandKit: BrandKitCardSnapshot | null = null;
  @Input() SelectedFormats: string[] = ['16:9'];
  @Input() DurationSeconds: number = DEFAULT_STUDIO_DURATION_SECONDS;
  @Input() Topic = '';
  @Input() QuerySearchText = '';
  @Input() SelectedQueries: StudioSavedQueryItem[] = [];
  @Input() NarrationEnabled = true;
  @Input() CaptionsMode: VideoCaptionMode = 'Burned';

  @Output() StateChange = new EventEmitter<VSProductionBriefStateSnapshot>();
  @Output() StartRequested = new EventEmitter<VSProductionBriefStartEvent>();
  @Output() SetupHealthChange = new EventEmitter<VSProductionBriefSetupHealthEvent>();
  @Output() ShowHealthySetupDetailsChange = new EventEmitter<boolean>();

  @ViewChildren(MJButtonDirective)
  private buttonDirectives?: QueryList<MJButtonDirective>;

  public IsLoading = false;
  public LoadError: string | null = null;
  public IsSearchingQueries = false;
  public FilteredBrandKits: BrandKitCardSnapshot[] = [];
  public IsBrandKitCreatorOpen = false;

  private querySearchRequestId = 0;
  private readonly cdr = inject(ChangeDetectorRef);

  async ngOnInit(): Promise<void> {
    this.applyCompanyBrandKitFilter();
    if (this.AllArchetypes.length > 0 && !this.SelectedArchetype) {
      this.SelectArchetype(this.AllArchetypes[0]);
    }
    this.emitSetupHealthChange();
    if (!this.AutoLoad) {
      this.emitStateChange();
      return;
    }
    if (!this.SetupHealthResult) {
      void this.CheckSetupHealth();
    }
    if (this.AllArchetypes.length === 0) {
      await this.LoadBriefData(false);
    } else {
      this.emitStateChange();
    }
  }

  public get IsAllSetupOk(): boolean {
    return Boolean(
      this.SetupHealthResult &&
        this.SetupHealthResult.Healthy &&
        (this.SetupHealthResult.Checks ?? []).every((check) => check.Status === 'OK'),
    );
  }

  public get ShouldShowSetupHealthCard(): boolean {
    if (!this.SetupHealthResult) {
      return false;
    }
    if (this.IsAllSetupOk) {
      return this.ShowHealthySetupDetails;
    }
    return true;
  }

  public OnSetupHealthExpandedChange(expanded: boolean): void {
    this.ShowHealthySetupDetails = expanded;
    this.ShowHealthySetupDetailsChange.emit(expanded);
    this.cdr.markForCheck();
  }

  public FormatTime(seconds: number): string {
    return FormatVideoTime(seconds);
  }

  public FormatTimeRange(fromSeconds: number, toSeconds: number): string {
    return FormatVideoTimeRange(fromSeconds, toSeconds);
  }

  public get MinDurationSeconds(): number {
    return this.SelectedArchetype?.MinDurationSeconds ?? DEFAULT_MIN_DURATION_SECONDS;
  }

  public get MaxDurationSeconds(): number {
    return this.SelectedArchetype?.MaxDurationSeconds ?? DEFAULT_MAX_DURATION_SECONDS;
  }

  public get CanStartProduction(): boolean {
    return (
      this.Topic.trim().length > 0 &&
      this.SelectedArchetype !== null &&
      this.SelectedFormats.length > 0
    );
  }

  public get SummaryLine(): string {
    if (this.Topic.trim().length === 0) {
      return 'Add a topic to start';
    }
    if (!this.SelectedArchetype) {
      return 'Pick a shape to start';
    }
    if (this.SelectedFormats.length === 0) {
      return 'Pick at least one format to start';
    }

    const parts: string[] = [
      FormatVideoTime(this.DurationSeconds),
      this.SelectedArchetype.Name,
      this.SelectedFormats.join(', '),
      this.buildAudioSummary(),
    ];

    if (this.SelectedBrandKit?.Name) {
      parts.push(this.SelectedBrandKit.Name);
    }
    if (this.SelectedQueries.length > 0) {
      parts.push(
        this.SelectedQueries.length === 1
          ? '1 query'
          : `${this.SelectedQueries.length} queries`,
      );
    }

    return parts.join(' \u00B7 ');
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
    return [{ ID: 'all', Name: 'All companies' }, ...this.AvailableCompanies];
  }

  public get BrandKitDropdownOptions(): { ID: string; DisplayName: string }[] {
    return [
      { ID: '', DisplayName: 'None' },
      ...this.FilteredBrandKits.map((kit) => ({
        ID: kit.ID,
        DisplayName: `${kit.Name}${kit.CompanyName ? ' (' + kit.CompanyName + ')' : ' (Default)'}`,
      })),
    ];
  }

  public GetArchetypeBeats(card: ArchetypeCardSnapshot): VideoBeatStripItem[] {
    if (card.BeatItems && card.BeatItems.length > 0) {
      return [...card.BeatItems];
    }
    const labels = card.BeatLabels ?? [];
    if (labels.length === 0) {
      return [];
    }
    return BuildArchetypeBeatStripItems(
      labels.map((label, idx) => ({
        Key: `${card.ID}-beat-${idx + 1}`,
        Label: label,
      })),
      card.DefaultDurationSeconds || DEFAULT_STUDIO_DURATION_SECONDS,
    );
  }

  public IsArchetypeSelected(card: ArchetypeCardSnapshot): boolean {
    return Boolean(this.SelectedArchetype && UUIDsEqual(this.SelectedArchetype.ID, card.ID));
  }

  public async CheckSetupHealth(): Promise<void> {
    this.IsCheckingSetupHealth = true;
    this.emitSetupHealthChange();
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
      this.emitSetupHealthChange();
      this.cdr.markForCheck();
    }
  }

  public async LoadBriefData(forceRefresh = false): Promise<void> {
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

      if (!this.SelectedArchetype && this.AllArchetypes.length > 0) {
        this.SelectArchetype(this.AllArchetypes[0]);
      }

      await this.SearchSavedQueries(this.QuerySearchText);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      LogError(`VSProductionBriefComponent.LoadBriefData: ${msg}`);
      this.LoadError = msg;
    } finally {
      this.IsLoading = false;
      this.emitStateChange();
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
    if (card.CompanyID) {
      this.SelectedCompanyId = card.CompanyID;
      this.applyCompanyBrandKitFilter();
      const companyDefault =
        this.FilteredBrandKits.find(
          (k) => UUIDsEqual(k.CompanyID, card.CompanyID) && k.IsDefault,
        ) ??
        this.FilteredBrandKits.find((k) => UUIDsEqual(k.CompanyID, card.CompanyID)) ??
        this.FilteredBrandKits.find((k) => k.IsDefault) ??
        null;
      if (companyDefault) {
        this.SelectedBrandKit = companyDefault;
      }
    } else if (!this.SelectedBrandKit && this.FilteredBrandKits.length > 0) {
      this.SelectedBrandKit =
        this.FilteredBrandKits.find((k) => k.CompanyID === null && k.IsDefault) ??
        this.FilteredBrandKits.find((k) => k.IsDefault) ??
        this.FilteredBrandKits[0] ??
        null;
    }
    this.emitStateChange();
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
    this.emitStateChange();
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
    this.emitStateChange();
    this.cdr.markForCheck();
  }

  public OpenBrandKitCreator(): void {
    this.IsBrandKitCreatorOpen = true;
    this.cdr.markForCheck();
  }

  public CloseBrandKitCreator(): void {
    this.IsBrandKitCreatorOpen = false;
    this.cdr.markForCheck();
  }

  public async OnBrandKitCreatorSaved(newBrandKitId: string): Promise<void> {
    const trimmedId = (newBrandKitId ?? '').trim();
    if (!trimmedId) {
      this.IsBrandKitCreatorOpen = false;
      this.cdr.markForCheck();
      return;
    }

    try {
      const bkEngine = BrandKitEngine.GetProviderInstance<BrandKitEngine>(
        this.ProviderToUse,
        BrandKitEngine,
      ) as BrandKitEngine;
      const user = this.ProviderToUse?.CurrentUser ?? undefined;
      await bkEngine.Config(true, user, this.ProviderToUse);
      const activeKits = (bkEngine.BrandKits ?? []).filter(
        (k) => k.Status === 'Active' || !k.Status,
      );
      if (activeKits.length > 0) {
        const refreshed = activeKits.map((k) => this.mapBrandKitToCard(k, bkEngine));
        const existingExtra = this.AllBrandKits.filter(
          (existing) => !refreshed.some((r) => UUIDsEqual(r.ID, existing.ID)),
        );
        this.AllBrandKits = [...refreshed, ...existingExtra];
      }
    } catch {
      // Non-fatal in test/disconnected environments; fallback card below ensures selection works.
    }

    let targetKit = this.AllBrandKits.find((k) => UUIDsEqual(k.ID, trimmedId)) ?? null;
    if (!targetKit) {
      targetKit = {
        ID: trimmedId,
        Name: 'New brand kit',
        Description: '',
        CompanyID:
          this.SelectedCompanyId && this.SelectedCompanyId !== 'all'
            ? this.SelectedCompanyId
            : null,
        CompanyName: null,
        IsDefault: false,
        Status: 'Active',
        Swatches: [],
        PrimaryLogoFileID: null,
        PrimaryLogoUrl: null,
        AssetCount: 0,
      };
      this.AllBrandKits = [...this.AllBrandKits, targetKit];
    }

    if (
      this.SelectedCompanyId !== 'all' &&
      targetKit.CompanyID !== null &&
      !UUIDsEqual(targetKit.CompanyID, this.SelectedCompanyId)
    ) {
      this.SelectedCompanyId = targetKit.CompanyID;
    }
    this.applyCompanyBrandKitFilter();
    this.IsBrandKitCreatorOpen = false;
    this.SelectBrandKitById(trimmedId);
  }

  public IsFormatSelected(format: string): boolean {
    return this.SelectedFormats.includes(format);
  }

  public ToggleFormat(format: string): void {
    if (this.SelectedFormats.includes(format)) {
      if (this.SelectedFormats.length > 1) {
        this.SelectedFormats = this.SelectedFormats.filter((f) => f !== format);
      }
    } else {
      this.SelectedFormats = [...this.SelectedFormats, format];
    }
    this.emitStateChange();
    this.cdr.markForCheck();
  }

  public SetFormats(formats: readonly string[]): boolean {
    const allowed = new Set<string>([
      ...STUDIO_VIDEO_FORMATS,
      ...this.AvailableFormats,
    ]);
    const valid: string[] = [];
    for (const raw of formats) {
      const cleaned = (raw ?? '').trim();
      if (allowed.has(cleaned) && !valid.includes(cleaned)) {
        valid.push(cleaned);
      }
    }
    if (valid.length === 0) {
      return false;
    }
    this.SelectedFormats = valid;
    this.emitStateChange();
    this.cdr.markForCheck();
    return true;
  }

  public OnDurationChange(rawValue: string | number | null): void {
    const numeric = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    this.DurationSeconds = ClampStudioDuration(
      numeric,
      this.MinDurationSeconds,
      this.MaxDurationSeconds,
    );
    this.emitStateChange();
    this.cdr.markForCheck();
  }

  public OnTopicChange(value: string): void {
    this.Topic = value ?? '';
    this.emitStateChange();
    this.cdr.markForCheck();
  }

  public OnNarrationEnabledChange(enabled: boolean): void {
    this.NarrationEnabled = Boolean(enabled);
    this.emitStateChange();
    this.cdr.markForCheck();
  }

  public OnCaptionsModeChange(mode: VideoCaptionMode): void {
    this.CaptionsMode = mode;
    this.emitStateChange();
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
      LogError(`VSProductionBriefComponent.SearchSavedQueries: ${msg}`);
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
    this.emitStateChange();
    this.cdr.markForCheck();
  }

  public OnStartClick(): void {
    if (!this.CanStartProduction || !this.SelectedArchetype) {
      return;
    }
    const message = ComposeStudioFirstMessage({
      ArchetypeName: this.SelectedArchetype.Name,
      Topic: this.Topic,
      DurationSeconds: this.DurationSeconds,
      Formats: this.SelectedFormats,
      BrandKitName: this.SelectedBrandKit?.Name ?? null,
      QueryNames: this.SelectedQueries.map((q) => q.Name),
      NarrationEnabled: this.NarrationEnabled ? undefined : false,
      CaptionsMode: this.CaptionsMode === 'Burned' ? undefined : this.CaptionsMode,
    });
    const appContext = this.BuildCurrentAppContext();
    this.StartRequested.emit({
      Message: message,
      AppContext: appContext,
      Archetype: this.SelectedArchetype,
      BrandKit: this.SelectedBrandKit,
      Formats: [...this.SelectedFormats],
      DurationSeconds: this.DurationSeconds,
      Topic: this.Topic.trim(),
      Queries: [...this.SelectedQueries],
      NarrationEnabled: this.NarrationEnabled,
      CaptionsMode: this.CaptionsMode,
    });
  }

  // ============================================================================
  // Client Tool Helpers (invoked from VideoStudioProductionsResourceComponent)
  // ============================================================================

  public ApplyClientToolArchetype(rawReference: string): {
    Success: boolean;
    ErrorMessage?: string;
    Data?: Record<string, unknown>;
  } {
    const resolution = ResolveVideoStudioItem(rawReference, this.AllArchetypes, 'archetype');
    if (!resolution.Ok) {
      return { Success: false, ErrorMessage: resolution.Error };
    }
    this.SelectArchetype(resolution.Item);
    return {
      Success: true,
      Data: {
        SelectedArchetypeId: resolution.Item.ID,
        SelectedArchetypeName: resolution.Item.Name,
      },
    };
  }

  public ApplyClientToolBrandKit(rawReference: string): {
    Success: boolean;
    ErrorMessage?: string;
    Data?: Record<string, unknown>;
  } {
    const trimmed = (rawReference ?? '').trim();
    if (!trimmed || trimmed.toLowerCase() === 'none') {
      this.SelectBrandKitById(null);
      return { Success: true, Data: { SelectedBrandKitId: null } };
    }
    const resolution = ResolveVideoStudioItem(trimmed, this.AllBrandKits, 'brand kit');
    if (!resolution.Ok) {
      return { Success: false, ErrorMessage: resolution.Error };
    }
    this.SelectBrandKitById(resolution.Item.ID);
    return {
      Success: true,
      Data: {
        SelectedBrandKitId: resolution.Item.ID,
        SelectedBrandKitName: resolution.Item.Name,
      },
    };
  }

  public ApplyClientToolFormats(rawFormats: unknown): {
    Success: boolean;
    ErrorMessage?: string;
    Data?: Record<string, unknown>;
  } {
    const list: string[] = Array.isArray(rawFormats)
      ? rawFormats.filter((v): v is string => typeof v === 'string')
      : typeof rawFormats === 'string'
        ? rawFormats.split(',')
        : [];
    const ok = this.SetFormats(list);
    if (!ok) {
      return {
        Success: false,
        ErrorMessage: `Specify at least one valid format (${this.AvailableFormats.join(', ')}).`,
      };
    }
    return { Success: true, Data: { SelectedFormats: [...this.SelectedFormats] } };
  }

  public ApplyClientToolTopic(rawTopic: string): {
    Success: boolean;
    Data: Record<string, unknown>;
  } {
    this.OnTopicChange(rawTopic);
    return { Success: true, Data: { Topic: this.Topic } };
  }

  public BuildCurrentAppContext(): Record<string, unknown> {
    return BuildStudioAppContext({
      ArchetypeID: this.SelectedArchetype?.ID ?? null,
      BrandKitID: this.SelectedBrandKit?.ID ?? null,
      Formats: this.SelectedFormats,
      DurationSeconds: this.DurationSeconds,
      QueryIDs: this.SelectedQueries.map((q) => q.ID),
      NarrationEnabled: this.NarrationEnabled,
      CaptionsMode: this.CaptionsMode,
    });
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private buildAudioSummary(): string {
    if (!this.NarrationEnabled) {
      return 'Voiceover off';
    }
    if (this.CaptionsMode === 'Burned') {
      return 'Voiceover, captions in the video';
    }
    if (this.CaptionsMode === 'Sidecar') {
      return 'Voiceover, captions in separate file';
    }
    return 'Voiceover, captions off';
  }

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

  private emitStateChange(): void {
    this.StateChange.emit({
      AllArchetypes: this.AllArchetypes,
      AllBrandKits: this.AllBrandKits,
      SelectedArchetype: this.SelectedArchetype,
      SelectedBrandKit: this.SelectedBrandKit,
      SelectedFormats: [...this.SelectedFormats],
      DurationSeconds: this.DurationSeconds,
      Topic: this.Topic,
      SelectedQueries: [...this.SelectedQueries],
      NarrationEnabled: this.NarrationEnabled,
      CaptionsMode: this.CaptionsMode,
      AppContext: this.BuildCurrentAppContext(),
      IsLoading: this.IsLoading,
    });
  }

  private emitSetupHealthChange(): void {
    this.SetupHealthChange.emit({
      Result: this.SetupHealthResult,
      Loading: this.IsCheckingSetupHealth,
    });
  }

  private mapArchetypeToCard(entity: MJVideoArchetypeEntity): ArchetypeCardSnapshot {
    const rawCategory = (entity.Category ?? 'Explainer').trim();
    const category: ArchetypeCategory = (
      ARCHETYPE_CATEGORIES as readonly string[]
    ).includes(rawCategory)
      ? (rawCategory as ArchetypeCategory)
      : 'Explainer';

    const defaultDur = entity.DefaultDurationSeconds ?? DEFAULT_STUDIO_DURATION_SECONDS;
    const rawBeats = Array.isArray(entity.BeatTemplateObject)
      ? entity.BeatTemplateObject
      : [];
    const beatItems: VideoBeatStripItem[] = BuildArchetypeBeatStripItems(rawBeats, defaultDur);
    const beatLabels = beatItems.map((b) => b.Label);
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
      DefaultDurationSeconds: defaultDur,
      MinDurationSeconds: entity.MinDurationSeconds ?? DEFAULT_MIN_DURATION_SECONDS,
      MaxDurationSeconds: entity.MaxDurationSeconds ?? DEFAULT_MAX_DURATION_SECONDS,
      DefaultFormats: entity.DefaultFormats ?? '["16:9"]',
      BeatCount: beatItems.length,
      BeatLabels: beatLabels,
      BeatItems: beatItems,
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
