import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges, ViewChild, ViewContainerRef, ComponentRef, Type, ChangeDetectorRef } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { UserInfo, Metadata, RunView, LogError, CompositeKey, DataSnapshot } from '@memberjunction/core';
import { ParseJSONRecursive, ParseJSONOptions , UUIDsEqual } from '@memberjunction/global';
import { MJArtifactEntity, MJArtifactVersionEntity, MJArtifactVersionAttributeEntity, MJArtifactTypeEntity, MJCollectionEntity, MJCollectionArtifactEntity, ArtifactMetadataEngine, MJConversationEntity, MJConversationDetailArtifactEntity, MJConversationDetailEntity, MJArtifactUseEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ArtifactTypePluginViewerComponent } from './artifact-type-plugin-viewer.component';
import { ArtifactViewerTab, NavigationRequest } from './base-artifact-viewer.component';
import { ArtifactIconService } from '../services/artifact-icon.service';
import { ArtifactFileService } from '../services/artifact-file.service';
import { RecentAccessService } from '@memberjunction/ng-shared-generic';

@Component({
  standalone: false,
  selector: 'mj-artifact-viewer-panel',
  templateUrl: './artifact-viewer-panel.component.html',
  styleUrls: ['./artifact-viewer-panel.component.css']
})
export class ArtifactViewerPanelComponent extends BaseAngularComponent implements OnInit, OnChanges, OnDestroy  {
  @Input() artifactId!: string;
  @Input() CurrentUser!: UserInfo;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo {
    return this.CurrentUser;
  }
  @Input() EnvironmentId!: string;

  /** @deprecated Use {@link EnvironmentId}. */
  @Input() set environmentId(value: string) {
    this.EnvironmentId = value;
  }
  /** @deprecated Use {@link EnvironmentId}. */
  get environmentId(): string {
    return this.EnvironmentId;
  }
  @Input() VersionNumber?: number;

  /** @deprecated Use {@link VersionNumber}. */
  @Input() set versionNumber(value: number | undefined) {
    this.VersionNumber = value;
  }
  /** @deprecated Use {@link VersionNumber}. */
  get versionNumber(): number | undefined {
    return this.VersionNumber;
  } // Version to display
  @Input() ShowSaveToCollection: boolean = true;

  /** @deprecated Use {@link ShowSaveToCollection}. */
  @Input() set showSaveToCollection(value: boolean) {
    this.ShowSaveToCollection = value;
  }
  /** @deprecated Use {@link ShowSaveToCollection}. */
  get showSaveToCollection(): boolean {
    return this.ShowSaveToCollection;
  } // Control whether Save to Collection button is shown
  @Input() ShowHeader: boolean = true;

  /** @deprecated Use {@link ShowHeader}. */
  @Input() set showHeader(value: boolean) {
    this.ShowHeader = value;
  }
  /** @deprecated Use {@link ShowHeader}. */
  get showHeader(): boolean {
    return this.ShowHeader;
  } // Control whether the header section is shown
  @Input() ShowTabs: boolean = true;

  /** @deprecated Use {@link ShowTabs}. */
  @Input() set showTabs(value: boolean) {
    this.ShowTabs = value;
  }
  /** @deprecated Use {@link ShowTabs}. */
  get showTabs(): boolean {
    return this.ShowTabs;
  } // Control whether the tab navigation is shown (false = show only Display tab content)
  @Input() ShowCloseButton: boolean = true;

  /** @deprecated Use {@link ShowCloseButton}. */
  @Input() set showCloseButton(value: boolean) {
    this.ShowCloseButton = value;
  }
  /** @deprecated Use {@link ShowCloseButton}. */
  get showCloseButton(): boolean {
    return this.ShowCloseButton;
  } // Control whether the close button is shown in header
  @Input() ShowMaximizeButton: boolean = true;

  /** @deprecated Use {@link ShowMaximizeButton}. */
  @Input() set showMaximizeButton(value: boolean) {
    this.ShowMaximizeButton = value;
  }
  /** @deprecated Use {@link ShowMaximizeButton}. */
  get showMaximizeButton(): boolean {
    return this.ShowMaximizeButton;
  } // Control whether the maximize/restore button is shown in header
  @Input() RefreshTrigger?: Subject<{artifactId: string; versionNumber: number}>;

  /** @deprecated Use {@link RefreshTrigger}. */
  @Input() set refreshTrigger(value: Subject<{artifactId: string; versionNumber: number}> | undefined) {
    this.RefreshTrigger = value;
  }
  /** @deprecated Use {@link RefreshTrigger}. */
  get refreshTrigger(): Subject<{artifactId: string; versionNumber: number}> | undefined {
    return this.RefreshTrigger;
  }
  @Input() ViewContext: 'conversation' | 'collection' | null = null;

  /** @deprecated Use {@link ViewContext}. */
  @Input() set viewContext(value: 'conversation' | 'collection' | null) {
    this.ViewContext = value;
  }
  /** @deprecated Use {@link ViewContext}. */
  get viewContext(): 'conversation' | 'collection' | null {
    return this.ViewContext;
  } // Where artifact is being viewed
  @Input() ContextCollectionId?: string;

  /** @deprecated Use {@link ContextCollectionId}. */
  @Input() set contextCollectionId(value: string | undefined) {
    this.ContextCollectionId = value;
  }
  /** @deprecated Use {@link ContextCollectionId}. */
  get contextCollectionId(): string | undefined {
    return this.ContextCollectionId;
  } // If viewing in collection, which collection
  @Input() canShare?: boolean; // Whether user can share this artifact
  @Input() canEdit?: boolean; // Whether user can edit this artifact
  @Input() IsMaximized: boolean = false;

  /** @deprecated Use {@link IsMaximized}. */
  @Input() set isMaximized(value: boolean) {
    this.IsMaximized = value;
  }
  /** @deprecated Use {@link IsMaximized}. */
  get isMaximized(): boolean {
    return this.IsMaximized;
  } // Whether the panel is currently maximized
  @Output() Closed = new EventEmitter<void>();

  /**
   * @deprecated Use {@link Closed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (closed) keeps working. Must stay AFTER Closed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() closed = this.Closed;
  @Output() SaveToCollectionRequested = new EventEmitter<{artifactId: string; excludedCollectionIds: string[]}>();

  /**
   * @deprecated Use {@link SaveToCollectionRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (saveToCollectionRequested) keeps working. Must stay AFTER SaveToCollectionRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() saveToCollectionRequested = this.SaveToCollectionRequested;
  @Output() NavigateToLink = new EventEmitter<{type: 'conversation' | 'collection'; id: string; artifactId?: string; versionNumber?: number; versionId?: string}>();

  /**
   * @deprecated Use {@link NavigateToLink}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (navigateToLink) keeps working. Must stay AFTER NavigateToLink: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() navigateToLink = this.NavigateToLink;
  @Output() ShareRequested = new EventEmitter<string>();

  /**
   * @deprecated Use {@link ShareRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (shareRequested) keeps working. Must stay AFTER ShareRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() shareRequested = this.ShareRequested; // Emits artifactId when share is clicked
  @Output() MaximizeToggled = new EventEmitter<void>();

  /**
   * @deprecated Use {@link MaximizeToggled}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (maximizeToggled) keeps working. Must stay AFTER MaximizeToggled: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() maximizeToggled = this.MaximizeToggled; // Emits when user clicks maximize/restore button
  @Output() OpenEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();

  /**
   * @deprecated Use {@link OpenEntityRecord}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (openEntityRecord) keeps working. Must stay AFTER OpenEntityRecord: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() openEntityRecord = this.OpenEntityRecord;
  @Output() navigationRequest = new EventEmitter<NavigationRequest>();
  @Output() AnalyzeRequested = new EventEmitter<{ artifactId: string; snapshot: DataSnapshot }>();

  /**
   * @deprecated Use {@link AnalyzeRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (analyzeRequested) keeps working. Must stay AFTER AnalyzeRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() analyzeRequested = this.AnalyzeRequested;
  /**
   * "Apply to my form" — bubbled from the form-aware component-artifact-viewer
   * branch. Carries the spec + entity. Consumer (chat message card, etc.)
   * confirms and invokes the Create-or-Modify Interactive Form action.
   */
  @Output() ApplyFormRequested = new EventEmitter<{ spec: unknown; entityName: string }>();

  /**
   * @deprecated Use {@link ApplyFormRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (applyFormRequested) keeps working. Must stay AFTER ApplyFormRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() applyFormRequested = this.ApplyFormRequested;

  @ViewChild(ArtifactTypePluginViewerComponent) pluginViewer?: ArtifactTypePluginViewerComponent;

  private destroy$ = new Subject<void>();
  private artifactLoadToken = 0;

  public Artifact: MJArtifactEntity | null = null;

  /** @deprecated Use {@link Artifact}. */
  public get artifact(): MJArtifactEntity | null {
    return this.Artifact;
  }
  /** @deprecated Use {@link Artifact}. */
  public set artifact(value: MJArtifactEntity | null) {
    this.Artifact = value;
  }
  public artifactVersion: MJArtifactVersionEntity | null = null;
  public AllVersions: MJArtifactVersionEntity[] = [];

  /** @deprecated Use {@link AllVersions}. */
  public get allVersions(): MJArtifactVersionEntity[] {
    return this.AllVersions;
  }
  /** @deprecated Use {@link AllVersions}. */
  public set allVersions(value: MJArtifactVersionEntity[]) {
    this.AllVersions = value;
  }
  public SelectedVersionNumber: number = 1;

  /** @deprecated Use {@link SelectedVersionNumber}. */
  public get selectedVersionNumber(): number {
    return this.SelectedVersionNumber;
  }
  /** @deprecated Use {@link SelectedVersionNumber}. */
  public set selectedVersionNumber(value: number) {
    this.SelectedVersionNumber = value;
  }
  public isLoading = true;
  public error: string | null = null;
  public JsonContent = '';

  /** @deprecated Use {@link JsonContent}. */
  public get jsonContent() {
    return this.JsonContent;
  }
  /** @deprecated Use {@link JsonContent}. */
  public set jsonContent(value) {
    this.JsonContent = value;
  }
  public ShowVersionDropdown = false;

  /** @deprecated Use {@link ShowVersionDropdown}. */
  public get showVersionDropdown() {
    return this.ShowVersionDropdown;
  }
  /** @deprecated Use {@link ShowVersionDropdown}. */
  public set showVersionDropdown(value) {
    this.ShowVersionDropdown = value;
  }
  public ArtifactCollections: MJCollectionArtifactEntity[] = [];

  /** @deprecated Use {@link ArtifactCollections}. */
  public get artifactCollections(): MJCollectionArtifactEntity[] {
    return this.ArtifactCollections;
  }
  /** @deprecated Use {@link ArtifactCollections}. */
  public set artifactCollections(value: MJCollectionArtifactEntity[]) {
    this.ArtifactCollections = value;
  } // All collections for ALL versions
  public CurrentVersionCollections: MJCollectionArtifactEntity[] = [];

  /** @deprecated Use {@link CurrentVersionCollections}. */
  public get currentVersionCollections(): MJCollectionArtifactEntity[] {
    return this.CurrentVersionCollections;
  }
  /** @deprecated Use {@link CurrentVersionCollections}. */
  public set currentVersionCollections(value: MJCollectionArtifactEntity[]) {
    this.CurrentVersionCollections = value;
  } // Collections containing CURRENT version only
  public PrimaryCollection: MJCollectionEntity | null = null;

  /** @deprecated Use {@link PrimaryCollection}. */
  public get primaryCollection(): MJCollectionEntity | null {
    return this.PrimaryCollection;
  }
  /** @deprecated Use {@link PrimaryCollection}. */
  public set primaryCollection(value: MJCollectionEntity | null) {
    this.PrimaryCollection = value;
  }

  // Tabbed interface
  public ActiveTab: string = 'display';

  /** @deprecated Use {@link ActiveTab}. */
  public get activeTab(): string {
    return this.ActiveTab;
  }
  /** @deprecated Use {@link ActiveTab}. */
  public set activeTab(value: string) {
    this.ActiveTab = value;
  } // Changed to string to support dynamic tabs
  public DisplayMarkdown: string | null = null;

  /** @deprecated Use {@link DisplayMarkdown}. */
  public get displayMarkdown(): string | null {
    return this.DisplayMarkdown;
  }
  /** @deprecated Use {@link DisplayMarkdown}. */
  public set displayMarkdown(value: string | null) {
    this.DisplayMarkdown = value;
  }
  public DisplayHtml: string | null = null;

  /** @deprecated Use {@link DisplayHtml}. */
  public get displayHtml(): string | null {
    return this.DisplayHtml;
  }
  /** @deprecated Use {@link DisplayHtml}. */
  public set displayHtml(value: string | null) {
    this.DisplayHtml = value;
  }
  /**
   * The no-plugin fallback. An artifact type with no viewer plugin (CSV today) used to render an empty
   * pane: the display tab only knew the extracted markdown/HTML attributes, and a file-backed version
   * has no inline Content to show. Now such an artifact gets a file card with a Download action, and
   * text-like content (text/*, JSON, CSV) is fetched and shown as plain text — capped, so a large file
   * is downloaded rather than rendered.
   */
  public FallbackText: string | null = null;

  /** @deprecated Use {@link FallbackText}. */
  public get fallbackText(): string | null {
    return this.FallbackText;
  }
  /** @deprecated Use {@link FallbackText}. */
  public set fallbackText(value: string | null) {
    this.FallbackText = value;
  }
  public FallbackTextTruncated = false;

  /** @deprecated Use {@link FallbackTextTruncated}. */
  public get fallbackTextTruncated() {
    return this.FallbackTextTruncated;
  }
  /** @deprecated Use {@link FallbackTextTruncated}. */
  public set fallbackTextTruncated(value) {
    this.FallbackTextTruncated = value;
  }
  public FallbackBusy = false;

  /** @deprecated Use {@link FallbackBusy}. */
  public get fallbackBusy() {
    return this.FallbackBusy;
  }
  /** @deprecated Use {@link FallbackBusy}. */
  public set fallbackBusy(value) {
    this.FallbackBusy = value;
  }
  private static readonly FALLBACK_TEXT_MAX_CHARS = 200_000;
  public VersionAttributes: MJArtifactVersionAttributeEntity[] = [];

  /** @deprecated Use {@link VersionAttributes}. */
  public get versionAttributes(): MJArtifactVersionAttributeEntity[] {
    return this.VersionAttributes;
  }
  /** @deprecated Use {@link VersionAttributes}. */
  public set versionAttributes(value: MJArtifactVersionAttributeEntity[]) {
    this.VersionAttributes = value;
  }
  private artifactTypeDriverClass: string | null = null;
  /** Populated from ArtifactType.ContentCategory. Used to suppress the JSON tab for
   *  binary file-type artifacts — driven by metadata, not hardcoded plugin overrides. */
  private artifactContentCategory: 'File' | 'Text' | null = null;

  // Links tab data
  public OriginConversation: MJConversationEntity | null = null;

  /** @deprecated Use {@link OriginConversation}. */
  public get originConversation(): MJConversationEntity | null {
    return this.OriginConversation;
  }
  /** @deprecated Use {@link OriginConversation}. */
  public set originConversation(value: MJConversationEntity | null) {
    this.OriginConversation = value;
  }
  public AllCollections: MJCollectionEntity[] = [];

  /** @deprecated Use {@link AllCollections}. */
  public get allCollections(): MJCollectionEntity[] {
    return this.AllCollections;
  }
  /** @deprecated Use {@link AllCollections}. */
  public set allCollections(value: MJCollectionEntity[]) {
    this.AllCollections = value;
  }
  public HasAccessToOriginConversation: boolean = false;

  /** @deprecated Use {@link HasAccessToOriginConversation}. */
  public get hasAccessToOriginConversation(): boolean {
    return this.HasAccessToOriginConversation;
  }
  /** @deprecated Use {@link HasAccessToOriginConversation}. */
  public set hasAccessToOriginConversation(value: boolean) {
    this.HasAccessToOriginConversation = value;
  }
  public OriginConversationVersionId: string | null = null;

  /** @deprecated Use {@link OriginConversationVersionId}. */
  public get originConversationVersionId(): string | null {
    return this.OriginConversationVersionId;
  }
  /** @deprecated Use {@link OriginConversationVersionId}. */
  public set originConversationVersionId(value: string | null) {
    this.OriginConversationVersionId = value;
  } // Version ID that came from origin conversation

  // Dynamic tabs from plugin
  public get AllTabs(): string[] {
    const tabs: string[] = [];

    // Only add Display tab if there's content to display
    if (this.HasDisplayTab) {
      tabs.push('Display');
    }

    // Get plugin tabs directly from plugin instance (no caching needed - plugin always exists)
    if (this.pluginViewer?.pluginInstance?.GetAdditionalTabs) {
      const pluginTabs = this.pluginViewer.pluginInstance.GetAdditionalTabs();
      const pluginTabLabels = pluginTabs.map((t: ArtifactViewerTab) => t.label);
      tabs.push(...pluginTabLabels);
    }

    // Get tabs to remove from plugin (case-insensitive)
    const removals = this.pluginViewer?.pluginInstance?.GetStandardTabRemovals?.() || [];
    const removalsLower = removals.map(r => r.toLowerCase());

    // File-category artifacts (PDF, Excel, Word) have binary content — the JSON tab
    // would show a base64 blob or a storage reference, which is meaningless. Suppress it
    // using ArtifactType.ContentCategory from the database rather than a hardcoded plugin override.
    const isFileArtifact = this.artifactContentCategory === 'File';

    // Add standard tabs (unless suppressed by metadata or plugin)
    if (!isFileArtifact && !removalsLower.includes('json')) {
      tabs.push('JSON');
    }
    if (!removalsLower.includes('details')) {
      tabs.push('Details');
    }

    // Only add Links tab if there are links to show (unless plugin explicitly removes it)
    if (!removalsLower.includes('links') && this.LinksToShow.length > 0) {
      tabs.push('Links');
    }

    return tabs;
  }

  /** @deprecated Use {@link AllTabs}. */
  public get allTabs(): string[] {
    return this.AllTabs;
  }

  /**
   * Get the full tab definition for a given tab name.
   * Returns the ArtifactViewerTab which may include component info for custom component tabs.
   */
  public GetTabDefinition(tabName: string): ArtifactViewerTab | null {
    // Check if this is a plugin-provided tab
    if (this.pluginViewer?.pluginInstance?.GetAdditionalTabs) {
      const pluginTabs = this.pluginViewer.pluginInstance.GetAdditionalTabs();
      const pluginTab = pluginTabs.find((t: ArtifactViewerTab) =>
        t.label.toLowerCase() === tabName.toLowerCase()
      );
      if (pluginTab) {
        return pluginTab;
      }
    }

    // Handle base tabs
    switch (tabName.toLowerCase()) {
      case 'json':
        return { label: 'JSON', contentType: 'json', content: this.JsonContent, language: 'json' };
      case 'details':
        return { label: 'Details', contentType: 'html', content: this.DisplayMarkdown || this.DisplayHtml || '' };
      default:
        return null;
    }
  }

  /**
   * Get resolved tab content for string-based tabs (non-component tabs).
   * For component tabs, use GetTabDefinition() and render the component directly.
   */
  public GetTabContent(tabName: string): { type: string; content: string; language?: string } | null {
    const tabDef = this.GetTabDefinition(tabName);
    if (!tabDef) return null;

    // Component tabs don't have string content
    if (tabDef.contentType === 'component') {
      return null;
    }

    const content = typeof tabDef.content === 'function'
      ? tabDef.content()
      : tabDef.content || '';

    return {
      type: tabDef.contentType,
      content: content,
      language: tabDef.language
    };
  }

  /**
   * Check if a tab is a component tab (renders a custom Angular component)
   */
  public IsComponentTab(tabName: string): boolean {
    const tabDef = this.GetTabDefinition(tabName);
    return tabDef?.contentType === 'component' && !!tabDef.component;
  }

  /**
   * Get the component type for a component tab.
   * Returns null if the tab is not a component tab (used for template type safety).
   */
  public GetComponentTabType(tabName: string): Type<any> | null {
    const tabDef = this.GetTabDefinition(tabName);
    if (tabDef?.contentType === 'component' && tabDef.component) {
      return tabDef.component;
    }
    return null;
  }

  /**
   * Get the component inputs for a component tab
   */
  public GetComponentInputs(tabName: string): Record<string, any> {
    const tabDef = this.GetTabDefinition(tabName);
    if (!tabDef || tabDef.contentType !== 'component') {
      return {};
    }
    return typeof tabDef.componentInputs === 'function'
      ? tabDef.componentInputs()
      : tabDef.componentInputs || {};
  }

  private recentAccessService: RecentAccessService;

  constructor(
    private cdr: ChangeDetectorRef,
    private notificationService: MJNotificationService,
    private sanitizer: DomSanitizer,
    private artifactIconService: ArtifactIconService,
    private artifactFileService: ArtifactFileService
  ) {
    super();
    this.recentAccessService = new RecentAccessService();
  }

  async ngOnInit() {
    // Subscribe to refresh trigger for dynamic version changes
    if (this.RefreshTrigger) {
      this.RefreshTrigger.pipe(takeUntil(this.destroy$)).subscribe(async (data) => {
        // UUIDsEqual, not ===: SQL Server hands back upper-case UUIDs and PostgreSQL lower-case, so
        // a raw comparison silently drops a legitimate refresh whenever the emitting side and this
        // input picked up the id from differently-cased sources.
        if (UUIDsEqual(data.artifactId, this.artifactId)) {
          // Reload all versions to get any new ones
          await this.loadArtifact(data.versionNumber);
        }
      });
    }

    // Defer the initial load past Angular's first stable CD cycle so that the inner
    // awaits in loadArtifact can't mutate `this.artifact`/`this.artifactVersion` between
    // the main CD pass and dev-mode's verifyNoChanges pass (the classic NG0100
    // "ExpressionChangedAfterItHasBeenCheckedError" we used to hit on the title).
    // Using setTimeout(0) instead of Promise.resolve() because we need a fresh
    // macrotask boundary — microtasks can still drain inside Angular's CD cycle.
    setTimeout(async () => {
      await this.loadArtifact(this.VersionNumber);

      // Track that user viewed this artifact (deferred so it runs after the load)
      if (this.artifactVersion?.ID && this.CurrentUser) {
        this.trackArtifactUsage('Viewed');
        // Also log to User Record Logs for recents feature (fire-and-forget)
        this.recentAccessService.logAccess('MJ: Artifacts', this.artifactId, 'artifact');
      }
    }, 0);
  }

  async ngOnChanges(changes: SimpleChanges) {
    // Reload artifact when artifactId changes
    if (changes['artifactId'] && !changes['artifactId'].firstChange) {
      await this.loadArtifact(this.VersionNumber);
      // `loadArtifact` already honored the (possibly also-changed) versionNumber, so the branch
      // below has nothing left to do. Angular delivers both inputs in ONE SimpleChanges when a
      // caller switches artifact and version together, and these are two independent `if`s: the
      // version branch used to find the version `loadArtifact` had just loaded sitting in the
      // freshly populated `allVersions` and load its content, attributes, collections and links a
      // second time — roughly six redundant round trips per open, including a second full content
      // download, none of them cancellable by a later load.
      return;
    }

    // Switch to new version when versionNumber changes (but artifactId stays the same)
    if (changes['versionNumber'] && !changes['versionNumber'].firstChange) {
      const newVersionNumber = changes['versionNumber'].currentValue;
      if (newVersionNumber != null) {
        // Check if we have metadata for this version (allVersions has lightweight metadata)
        const targetVersion = this.AllVersions.find(v => v.VersionNumber === newVersionNumber);
        if (targetVersion) {
          this.SelectedVersionNumber = (targetVersion.VersionNumber as number) || 1;

          // Load full content for the selected version
          const fullVersion = await this.loadVersionContent(targetVersion.ID);
          if (fullVersion) {
            this.artifactVersion = fullVersion;
            this.JsonContent = this.formatJSON(fullVersion.Content || '{}');
          }

          // Load attributes and collection data in parallel
          await Promise.all([
            this.loadVersionAttributes(),
            this.loadCollectionAssociations(),
            this.loadLinksData()
          ]);

          this.cdr.detectChanges();
        } else {
          // Need to reload to get this version (shouldn't normally happen)
          await this.loadArtifact(newVersionNumber);
        }
      }
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private isCurrentArtifactLoad(artifactId: string, loadToken: number): boolean {
    return loadToken === this.artifactLoadToken && UUIDsEqual(artifactId, this.artifactId);
  }

  private clearLoadedArtifactState(): void {
    this.Artifact = null;
    this.artifactVersion = null;
    this.AllVersions = [];
    this.VersionAttributes = [];
    this.JsonContent = '';
    this.DisplayMarkdown = null;
    this.DisplayHtml = null;
    this.FallbackText = null;
    this.FallbackTextTruncated = false;
    this.ArtifactCollections = [];
    this.CurrentVersionCollections = [];
    this.PrimaryCollection = null;
    this.artifactTypeDriverClass = null;
    this.artifactContentCategory = null;
    this.clearLinksData();
  }

  private async loadArtifact(targetVersionNumber?: number): Promise<void> {
    const artifactId = this.artifactId;
    const loadToken = ++this.artifactLoadToken;
    const isCurrentLoad = () => this.isCurrentArtifactLoad(artifactId, loadToken);

    try {
      this.isLoading = true;
      this.error = null;
      this.clearLoadedArtifactState();

      const md = this.ProviderToUse;

      // Load artifact — assign to local first to avoid mid-cycle icon flicker
      const artifactEntity = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', this.CurrentUser);
      const loaded = await artifactEntity.Load(artifactId);
      if (!isCurrentLoad()) {
        return;
      }

      if (!loaded) {
        this.error = 'Failed to load artifact';
        return;
      }

      // PERF: Batch load version metadata, collection associations, and conversation links
      // in a single RunViews call. Content is excluded here — loaded on-demand for the selected version.
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const batchResults = await rv.RunViews([
        {
          // [0] Version metadata (lightweight — no Content field)
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ArtifactID='${artifactId}'`,
          OrderBy: 'VersionNumber DESC',
          Fields: ['ID', 'ArtifactID', 'VersionNumber', 'Name', 'Description', '__mj_CreatedAt', '__mj_UpdatedAt'],
          ResultType: 'simple'
        },
        {
          // [1] Collection associations for all versions of this artifact
          EntityName: 'MJ: Collection Artifacts',
          ExtraFilter: `ArtifactVersionID IN (
            SELECT ID FROM [__mj].[vwArtifactVersions] WHERE ArtifactID='${artifactId}'
          )`,
          Fields: ['ID', 'CollectionID', 'ArtifactVersionID', 'Sequence'],
          ResultType: 'simple'
        },
        {
          // [2] Conversation detail artifact links (for Links tab)
          EntityName: 'MJ: Conversation Detail Artifacts',
          ExtraFilter: `ArtifactVersionID IN (
            SELECT ID FROM [__mj].[vwArtifactVersions] WHERE ArtifactID='${artifactId}'
          )`,
          Fields: ['ID', 'ConversationDetailID', 'ArtifactVersionID'],
          MaxRows: 1,
          ResultType: 'simple'
        }
      ], this.CurrentUser);
      if (!isCurrentLoad()) {
        return;
      }

      const [versionsResult, collectionsResult, convDetailResult] = batchResults;

      if (!versionsResult.Success || !versionsResult.Results || versionsResult.Results.length === 0) {
        this.error = 'No artifact version found';
        return;
      }

      this.Artifact = artifactEntity;
      this.AllVersions = versionsResult.Results as MJArtifactVersionEntity[];

      // Determine which version to display
      let selectedVersion: Record<string, unknown> | undefined;
      if (targetVersionNumber) {
        selectedVersion = versionsResult.Results.find(
          (v: Record<string, unknown>) => v.VersionNumber === targetVersionNumber
        );
      }
      // Fall back to latest version (first in DESC order)
      const versionToLoad = selectedVersion || versionsResult.Results[0];
      this.SelectedVersionNumber = (versionToLoad.VersionNumber as number) || 1;

      // PERF: Start artifact type resolution and selected version content load in parallel
      const [, selectedVersionEntity] = await Promise.all([
        this.loadArtifactType(artifactEntity.Type, artifactId, loadToken),
        this.loadVersionContent(versionToLoad.ID as string)
      ]);
      if (!isCurrentLoad()) {
        return;
      }

      if (selectedVersionEntity) {
        this.artifactVersion = selectedVersionEntity;
        this.JsonContent = this.formatJSON(selectedVersionEntity.Content || '{}');
      } else {
        this.error = 'Failed to load artifact version content';
        return;
      }

      // PERF: Process collection and links data in parallel (uses already-fetched batch data)
      await Promise.all([
        this.processCollectionAssociations(collectionsResult, artifactId, loadToken),
        this.processLinksData(collectionsResult, convDetailResult, artifactId, loadToken)
      ]);
      if (!isCurrentLoad()) {
        return;
      }

      // Load version attributes (depends on selected version being set)
      await this.loadVersionAttributes(artifactId, loadToken);
    } catch (err) {
      if (!isCurrentLoad()) {
        return;
      }
      console.error('Error loading artifact:', err);
      this.error = 'Error loading artifact: ' + (err as Error).message;
    } finally {
      if (!isCurrentLoad()) {
        return;
      }
      this.isLoading = false;
      this.updateArtifactIcon();
      this.cdr.detectChanges();
    }
  }

  /**
   * Load full content for a single version by ID.
   * This avoids downloading Content for ALL versions when only one is displayed.
   */
  private async loadVersionContent(versionId: string): Promise<MJArtifactVersionEntity | null> {
    try {
      const md = this.ProviderToUse;
      const versionEntity = await md.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', this.CurrentUser);
      const loaded = await versionEntity.Load(versionId);
      return loaded ? versionEntity : null;
    } catch (err) {
      console.error('Error loading version content:', err);
      return null;
    }
  }

  /**
   * Clear all links-related data to prevent stale data when switching artifacts
   */
  private clearLinksData(): void {
    this.AllCollections = [];
    this.OriginConversation = null;
    this.HasAccessToOriginConversation = false;
    this.OriginConversationVersionId = null;
  }

  private async loadArtifactType(artifactTypeName: string | null | undefined = this.Artifact?.Type, artifactId: string = this.artifactId, loadToken: number = this.artifactLoadToken): Promise<void> {
    const isCurrentLoad = () => this.isCurrentArtifactLoad(artifactId, loadToken);
    this.artifactTypeDriverClass = null;
    this.artifactContentCategory = null;

    if (!artifactTypeName) {
      return;
    }

    try {
      await ArtifactMetadataEngine.Instance.Config(false, this.CurrentUser);
      if (!isCurrentLoad()) {
        return;
      }

      const artifactType = ArtifactMetadataEngine.Instance.FindArtifactType(artifactTypeName);
      if (artifactType) {
        // Resolve DriverClass by traversing parent hierarchy if needed
        const driverClass = await this.resolveDriverClassForType(artifactType);
        if (!isCurrentLoad()) {
          return;
        }
        this.artifactTypeDriverClass = driverClass;
        this.artifactContentCategory = artifactType.ContentCategory;
      }
    } catch (err) {
      console.error('Error loading artifact type:', err);
      // Don't fail the whole load if we can't get the artifact type
    }
  }

  private async loadVersionAttributes(artifactId: string = this.artifactId, loadToken: number = this.artifactLoadToken): Promise<void> {
    const isCurrentLoad = () => this.isCurrentArtifactLoad(artifactId, loadToken);
    if (!this.artifactVersion) return;

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJArtifactVersionAttributeEntity>({
        EntityName: 'MJ: Artifact Version Attributes',
        ExtraFilter: `ArtifactVersionID='${this.artifactVersion.ID}'`,
        ResultType: 'simple'
      }, this.CurrentUser);
      if (!isCurrentLoad()) {
        return;
      }

      if (result.Success && result.Results) {
        this.VersionAttributes = result.Results;

        // Check for displayMarkdown or displayHtml attributes
        const displayMarkdownAttr = this.VersionAttributes.find(a => a.Name?.toLowerCase() === 'displaymarkdown');
        const displayHtmlAttr = this.VersionAttributes.find(a => a.Name?.toLowerCase() === 'displayhtml');

        // Parse values - they might be JSON-encoded strings
        this.DisplayMarkdown = this.parseAttributeValue(displayMarkdownAttr?.Value);
        this.DisplayHtml = this.parseAttributeValue(displayHtmlAttr?.Value);

        // Clean up double-escaped characters in HTML (from LLM generation)
        if (this.DisplayHtml) {
          this.DisplayHtml = this.cleanEscapedCharacters(this.DisplayHtml);
        }

        // Set active tab to the first available tab
        this.setActiveTabToFirstAvailable();
      }
      await this.prepareNoPluginFallback(isCurrentLoad);
    } catch (err) {
      if (!isCurrentLoad()) {
        return;
      }
      console.error('Error loading version attributes:', err);
    } finally {
      if (isCurrentLoad()) {
        this.cdr.detectChanges(); // zone.js 0.15: async RunView doesn't trigger CD
      }
    }
  }

  get displayName(): string {
    if (this.artifactVersion?.Name) {
      return this.artifactVersion.Name;
    }
    return this.Artifact?.Name || 'Artifact';
  }

  get DisplayDescription(): string | null {
    if (this.artifactVersion?.Description) {
      return this.artifactVersion.Description;
    }
    return this.Artifact?.Description || null;
  }

  /** @deprecated Use {@link DisplayDescription}. */
  get displayDescription(): string | null {
    return this.DisplayDescription;
  }

  get HasDisplayTab(): boolean {
    // Show Display tab if:
    // 1. We have a plugin AND it reports having content to display, OR
    // 2. We have displayMarkdown or displayHtml attributes from extract rules
    //
    // Note: hasDisplayContent defaults to false in base class, so plugins must
    // explicitly opt-in by overriding to return true when they have content.
    // This prevents showing Display tab before plugin loads or when plugin has no content.
    const pluginHasContent = this.pluginViewer?.pluginInstance?.hasDisplayContent ?? false;

    return pluginHasContent || !!this.DisplayMarkdown || !!this.DisplayHtml;
  }

  /** @deprecated Use {@link HasDisplayTab}. */
  get hasDisplayTab(): boolean {
    return this.HasDisplayTab;
  }

  /** True when the display tab has nothing better than the file card to show. */
  get ShowFileFallback(): boolean {
    return !this.HasPlugin && !!this.artifactVersion && !this.DisplayMarkdown && !this.DisplayHtml;
  }

  /** @deprecated Use {@link ShowFileFallback}. */
  get showFileFallback(): boolean {
    return this.ShowFileFallback;
  }

  /** The file name shown on the fallback card. */
  get FallbackFileName(): string {
    return this.artifactVersion?.FileName || this.Artifact?.Name || 'file';
  }

  /** @deprecated Use {@link FallbackFileName}. */
  get fallbackFileName(): string {
    return this.FallbackFileName;
  }

  /** Human file size for the fallback card, when the version knows it. */
  get FallbackSize(): string | null {
    const content = this.artifactVersion?.Content;
    if (this.artifactVersion?.ContentMode === 'Text' && content?.startsWith('data:')) {
      const b64 = content.slice(content.indexOf(',') + 1);
      return this.formatBytes(Math.floor((b64.length * 3) / 4));
    }
    return null;
  }

  /** @deprecated Use {@link FallbackSize}. */
  get fallbackSize(): string | null {
    return this.FallbackSize;
  }

  /** Text-like MIME types are shown inline on the fallback card; everything else is download-only. */
  private isTextLike(mime: string | null | undefined): boolean {
    const m = (mime ?? '').toLowerCase();
    return m.startsWith('text/') || m === 'application/json' || m === 'application/xml' || m === 'application/csv';
  }

  /**
   * Fetch text-like content for the no-plugin fallback. File-backed: MJ's pre-authenticated URL;
   * inline: the data URL. Silent on failure — the Download action still works.
   */
  private async prepareNoPluginFallback(isCurrentLoad: () => boolean): Promise<void> {
    this.FallbackText = null;
    this.FallbackTextTruncated = false;
    const version = this.artifactVersion;
    if (!this.ShowFileFallback || !version || !this.isTextLike(version.MimeType)) return;
    try {
      let text: string | null = null;
      if (version.ContentMode === 'File') {
        const url = await this.artifactFileService.getDownloadUrl(version.ID);
        const res = await fetch(url);
        if (res.ok) text = await res.text();
      } else if (version.Content?.startsWith('data:')) {
        text = new TextDecoder().decode(this.artifactFileService.dataUrlToArrayBuffer(version.Content));
      } else if (typeof version.Content === 'string') {
        text = version.Content;
      }
      if (!isCurrentLoad() || text == null) return;
      if (text.length > ArtifactViewerPanelComponent.FALLBACK_TEXT_MAX_CHARS) {
        text = text.slice(0, ArtifactViewerPanelComponent.FALLBACK_TEXT_MAX_CHARS);
        this.FallbackTextTruncated = true;
      }
      this.FallbackText = text;
      this.cdr.markForCheck();
    } catch (err) {
      LogError(`Artifact viewer: could not load text for the no-plugin fallback: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Download the artifact's file: file-backed via MJ's URL (fetched to a blob so the browser saves it), inline via the data URL. */
  public async DownloadArtifactFile(): Promise<void> {
    const version = this.artifactVersion;
    if (!version || this.FallbackBusy) return;
    this.FallbackBusy = true;
    try {
      let objectUrl: string | null = null;
      if (version.ContentMode === 'File') {
        const url = await this.artifactFileService.getDownloadUrl(version.ID);
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          objectUrl = URL.createObjectURL(await res.blob());
        } catch {
          window.open(url, '_blank', 'noopener'); // storage refused the cross-origin fetch — let the browser handle it
          return;
        }
      } else if (version.Content?.startsWith('data:')) {
        objectUrl = this.artifactFileService.dataUrlToObjectUrl(version.Content, version.MimeType || 'application/octet-stream');
      } else if (typeof version.Content === 'string') {
        objectUrl = URL.createObjectURL(new Blob([version.Content], { type: version.MimeType || 'text/plain' }));
      }
      if (!objectUrl) return;
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = this.FallbackFileName;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl as string), 60_000);
    } finally {
      this.FallbackBusy = false;
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link DownloadArtifactFile}. */
  public async downloadArtifactFile(): Promise<void> {
    return this.DownloadArtifactFile();
  }

  private formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  get HasPlugin(): boolean {
    // Check if the artifact type has a DriverClass configured
    // If DriverClass is set, we have a plugin available
    return !!this.artifactTypeDriverClass;
  }

  /** @deprecated Use {@link HasPlugin}. */
  get hasPlugin(): boolean {
    return this.HasPlugin;
  }

  get HasJsonTab(): boolean {
    // Query plugin directly (no cache needed - plugin always exists when it should)
    const pluginInstance = this.pluginViewer?.pluginInstance;
    return pluginInstance?.parentShouldShowRawContent || false;
  }

  /** @deprecated Use {@link HasJsonTab}. */
  get hasJsonTab(): boolean {
    return this.HasJsonTab;
  }

  get ArtifactTypeName(): string {
    return this.Artifact?.Type || '';
  }

  /** @deprecated Use {@link ArtifactTypeName}. */
  get artifactTypeName(): string {
    return this.ArtifactTypeName;
  }

  get ContentType(): string | undefined {
    // Try to get content type from artifact type or attributes
    const contentTypeAttr = this.VersionAttributes.find(a => a.Name?.toLowerCase() === 'contenttype');
    return contentTypeAttr?.Value || undefined;
  }

  /** @deprecated Use {@link ContentType}. */
  get contentType(): string | undefined {
    return this.ContentType;
  }

  get FilteredAttributes(): MJArtifactVersionAttributeEntity[] {
    // Filter out displayMarkdown and displayHtml as they're shown in the Display tab
    return this.VersionAttributes.filter(attr => {
      const name = attr.Name?.toLowerCase();
      return name !== 'displaymarkdown' && name !== 'displayhtml';
    });
  }

  /** @deprecated Use {@link FilteredAttributes}. */
  get filteredAttributes(): MJArtifactVersionAttributeEntity[] {
    return this.FilteredAttributes;
  }

  setActiveTab(tab: 'display' | 'json' | 'details' | 'links'): void {
    this.ActiveTab = tab;
  }

  /**
   * Sets the active tab to the first available tab in the list.
   * Called when tabs change or when the currently active tab becomes unavailable.
   */
  private setActiveTabToFirstAvailable(): void {
    const tabs = this.AllTabs;
    if (tabs.length > 0) {
      // If current tab is still available, keep it; otherwise switch to first
      const currentTabStillAvailable = tabs.some(t => t.toLowerCase() === this.ActiveTab.toLowerCase());
      if (!currentTabStillAvailable) {
        this.ActiveTab = tabs[0].toLowerCase();
      }
    } else {
      // Fallback to details if no tabs available (shouldn't happen)
      this.ActiveTab = 'details';
    }
  }

  /**
   * Called when a plugin's async tab data changes (e.g., ComponentArtifactViewer loads
   * the full spec from the registry after initial render with a stripped spec).
   * Forces re-evaluation of allTabs so new tab labels render correctly.
   */
  OnTabsChanged(): void {
    // If Display tab just became available (e.g., after plugin async load),
    // switch to it — it should be the default when present.
    const tabs = this.AllTabs;
    if (tabs.length > 0 && tabs[0].toLowerCase() === 'display' && this.ActiveTab !== 'display') {
      this.ActiveTab = 'display';
    }
    this.cdr.detectChanges(); // zone.js 0.15: plugin emitted tabsChanged, force CD to re-evaluate allTabs
  }

  /** @deprecated Use {@link OnTabsChanged}. */
  onTabsChanged(): void {
    return this.OnTabsChanged();
  }

  /**
   * Called when the plugin viewer finishes loading.
   * Selects the first available tab now that plugin tabs are available.
   */
  OnPluginLoaded(): void {
    // Now that plugin is loaded, we have accurate tab information
    // Always select the first tab since this is the initial load
    const tabs = this.AllTabs;
    if (tabs.length > 0) {
      this.ActiveTab = tabs[0].toLowerCase();
    }
    this.cdr.detectChanges(); // zone.js 0.15: plugin loaded via async callback, force CD
  }

  /** @deprecated Use {@link OnPluginLoaded}. */
  onPluginLoaded(): void {
    return this.OnPluginLoaded();
  }

  private parseAttributeValue(value: string | null | undefined): string | null {
    if (!value) return null;

    // Check if it's a JSON-encoded string (starts and ends with quotes)
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        return JSON.parse(value);
      } catch (e) {
        console.warn('Failed to parse attribute value as JSON:', e);
        return value;
      }
    }

    return value;
  }

  /**
   * Clean up double-escaped characters that appear in LLM-generated HTML
   * Removes literal "\\n" and "\\t" which cause rendering issues
   */
  private cleanEscapedCharacters(html: string): string {
    // Remove escaped newlines (\\n becomes nothing)
    // HTML doesn't need whitespace for formatting, and these cause display issues
    let cleaned = html.replace(/\\n/g, '');

    // Remove escaped tabs
    cleaned = cleaned.replace(/\\t/g, '');

    // Remove double-escaped tabs
    cleaned = cleaned.replace(/\\\\t/g, '');

    // Remove double-escaped newlines
    cleaned = cleaned.replace(/\\\\n/g, '');

    return cleaned;
  }

  /**
   * Process pre-fetched collection association data.
   * Accepts the batch result from loadArtifact() to avoid duplicate queries.
   */
  private async processCollectionAssociations(
    collectionsResult?: { Success: boolean; Results: Record<string, unknown>[] },
    artifactId: string = this.artifactId,
    loadToken: number = this.artifactLoadToken
  ): Promise<void> {
    if (!artifactId) return;
    const isCurrentLoad = () => this.isCurrentArtifactLoad(artifactId, loadToken);

    try {
      // If no pre-fetched data, fetch it (used by selectVersion/saveToCollections reload)
      let collectionRows: Record<string, unknown>[];
      if (collectionsResult?.Success && collectionsResult.Results) {
        collectionRows = collectionsResult.Results;
      } else {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<{ ID: string; CollectionID: string; ArtifactVersionID: string; Sequence: number }>({
          EntityName: 'MJ: Collection Artifacts',
          ExtraFilter: `ArtifactVersionID IN (
            SELECT ID FROM [__mj].[vwArtifactVersions] WHERE ArtifactID='${artifactId}'
          )`,
          Fields: ['ID', 'CollectionID', 'ArtifactVersionID', 'Sequence'],
          ResultType: 'simple'
        }, this.CurrentUser);
        collectionRows = (result.Success ? result.Results : []) as Record<string, unknown>[];
      }
      if (!isCurrentLoad()) {
        return;
      }

      // Store as simple objects — these are read-only display data
      this.ArtifactCollections = collectionRows as unknown as MJCollectionArtifactEntity[];

      // Filter to get only collections containing the CURRENT version
      const currentVersionId = this.artifactVersion?.ID;
      if (currentVersionId) {
        const currentIdStr = String(currentVersionId).toLowerCase();
        this.CurrentVersionCollections = collectionRows.filter(ca => {
          const versionIdStr = String(ca['ArtifactVersionID'] || ca.ArtifactVersionID || '').toLowerCase();
          return versionIdStr && currentIdStr && versionIdStr === currentIdStr;
        }) as unknown as MJCollectionArtifactEntity[];
      } else {
        this.CurrentVersionCollections = [];
      }

      // Load the primary collection details if exists
      if (this.ArtifactCollections.length > 0) {
        const collectionId = (collectionRows[0] as Record<string, unknown>).CollectionID as string ||
                             (this.ArtifactCollections[0] as unknown as Record<string, unknown>).CollectionID as string;
        if (collectionId) {
          const md = this.ProviderToUse;
          const primaryCollection = await md.GetEntityObject<MJCollectionEntity>('MJ: Collections', this.CurrentUser);
          await primaryCollection.Load(collectionId);
          if (!isCurrentLoad()) {
            return;
          }
          this.PrimaryCollection = primaryCollection;
        }
      } else {
        this.PrimaryCollection = null;
      }
    } catch (err) {
      if (!isCurrentLoad()) {
        return;
      }
      console.error('Error processing collection associations:', err);
    } finally {
      if (isCurrentLoad()) {
        this.cdr.detectChanges();
      }
    }
  }

  /**
   * @deprecated Use processCollectionAssociations() instead. Kept as a shim for callers
   * that don't have pre-fetched data (e.g., selectVersion, saveToCollections).
   */
  private async loadCollectionAssociations(): Promise<void> {
    return this.processCollectionAssociations();
  }

  get IsInCollection(): boolean {
    return this.CurrentVersionCollections.length > 0;
  }

  /** @deprecated Use {@link IsInCollection}. */
  get isInCollection(): boolean {
    return this.IsInCollection;
  }

  /**
   * Get collection IDs that already contain the current version
   * Used to exclude them from the save picker
   */
  get CurrentVersionCollectionIds(): string[] {
    return this.CurrentVersionCollections.map(ca => ca.CollectionID);
  }

  /** @deprecated Use {@link CurrentVersionCollectionIds}. */
  get currentVersionCollectionIds(): string[] {
    return this.CurrentVersionCollectionIds;
  }

  OnCopyToClipboard(): void {
    // Get content from the currently active tab instead of always copying jsonContent
    const tabData = this.GetTabContent(this.ActiveTab);
    if (tabData?.content) {
      navigator.clipboard.writeText(tabData.content);
    } else if (this.JsonContent) {
      // Fallback to jsonContent if tab content not found
      navigator.clipboard.writeText(this.JsonContent);
    }
  }

  /** @deprecated Use {@link OnCopyToClipboard}. */
  onCopyToClipboard(): void {
    return this.OnCopyToClipboard();
  }

  OnCopyDisplayContent(): void {
    const content = this.DisplayHtml || this.DisplayMarkdown;
    if (content) {
      navigator.clipboard.writeText(content).catch(err => {
        console.error('Failed to copy to clipboard:', err);
      });
    }
  }

  /** @deprecated Use {@link OnCopyDisplayContent}. */
  onCopyDisplayContent(): void {
    return this.OnCopyDisplayContent();
  }

  OnPrintDisplayContent(): void {
    // Try to delegate to the plugin viewer's print method
    if (this.pluginViewer?.pluginInstance) {
      const plugin = this.pluginViewer.pluginInstance as any;
      if (typeof plugin.printHtml === 'function') {
        plugin.printHtml();
        return;
      }
    }

    // Fallback: create a temporary print window with displayHtml or displayMarkdown
    const content = this.DisplayHtml || this.DisplayMarkdown;
    if (content) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        if (this.DisplayHtml) {
          printWindow.document.write(content);
        } else if (this.DisplayMarkdown) {
          // Wrap markdown in basic HTML for printing
          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Print</title>
              <style>
                body { font-family: sans-serif; padding: 20px; }
                pre { background: #f5f5f5; padding: 10px; border-radius: 4px; }
              </style>
            </head>
            <body>
              <pre>${content}</pre>
            </body>
            </html>
          `);
        }
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 250);
      }
    }
  }

  /** @deprecated Use {@link OnPrintDisplayContent}. */
  onPrintDisplayContent(): void {
    return this.OnPrintDisplayContent();
  }

  ToggleVersionDropdown(): void {
    if (this.AllVersions.length > 1) {
      this.ShowVersionDropdown = !this.ShowVersionDropdown;
    }
  }

  /** @deprecated Use {@link ToggleVersionDropdown}. */
  toggleVersionDropdown(): void {
    return this.ToggleVersionDropdown();
  }

  async SelectVersion(version: MJArtifactVersionEntity): Promise<void> {
    this.SelectedVersionNumber = (version.VersionNumber as number) || 1;
    this.ShowVersionDropdown = false;

    // Load full content for the selected version (allVersions only has metadata)
    const fullVersion = await this.loadVersionContent(version.ID);
    if (fullVersion) {
      this.artifactVersion = fullVersion;
      this.JsonContent = this.formatJSON(fullVersion.Content || '{}');
    }

    // Load attributes and collection data in parallel
    await Promise.all([
      this.loadVersionAttributes(),
      this.loadCollectionAssociations(),
      this.loadLinksData()
    ]);

    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link SelectVersion}. */
  async selectVersion(version: MJArtifactVersionEntity): Promise<void> {
    return this.SelectVersion(version);
  }

  async OnSaveToLibrary(): Promise<void> {
    // Always show the collection picker modal
    // Artifacts can be saved to multiple collections
    this.SaveToCollectionRequested.emit({
      artifactId: this.artifactId,
      excludedCollectionIds: this.ExcludedCollectionIds
    });
  }

  /** @deprecated Use {@link OnSaveToLibrary}. */
  async onSaveToLibrary(): Promise<void> {
    return this.OnSaveToLibrary();
  }

  get ExcludedCollectionIds(): string[] {
    // Return IDs of collections that already contain the CURRENT VERSION
    // This allows saving different versions to the same collection
    const excluded = this.CurrentVersionCollections
      .filter(ca => ca.CollectionID)
      .map(ca => String(ca.CollectionID));
    return excluded;
  }

  /** @deprecated Use {@link ExcludedCollectionIds}. */
  get excludedCollectionIds(): string[] {
    return this.ExcludedCollectionIds;
  }

  /**
   * Reload the cached set of collections that contain the *current version* of this artifact.
   * Called by the chat-area after the collection picker reports successful saves so the bookmark
   * icon and "already saved" exclusion list refresh without a full artifact reload.
   */
  public async ReloadCollectionAssociations(): Promise<void> {
    await this.loadCollectionAssociations();
  }

  /**
   * @deprecated Writes are now owned by the picker modal so the dialog can render per-collection
   * progress and partial-failure UI. Kept for any external consumer that still calls it; new code
   * should pass `artifactVersionId` to the picker and listen for its `completed` event.
   */
  async saveToCollections(collectionIds: string[]): Promise<boolean> {
    if (!this.artifactId || collectionIds.length === 0) {
      return false;
    }

    try {
      const md = this.ProviderToUse;
      let successCount = 0;

      // Get current version ID - save the version being viewed
      const currentVersionId = this.artifactVersion?.ID;
      if (!currentVersionId) {
        console.error('No current version ID available');
        MJNotificationService.Instance.CreateSimpleNotification(
          'Cannot save: no version selected',
          'error'
        );
        return false;
      }

      // Save artifact version to each selected collection
      for (const collectionId of collectionIds) {
        // Double check this exact version doesn't already exist in the collection
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const existingResult = await rv.RunView<MJCollectionArtifactEntity>({
          EntityName: 'MJ: Collection Artifacts',
          ExtraFilter: `CollectionID='${collectionId}' AND ArtifactVersionID='${currentVersionId}'`,
          ResultType: 'entity_object'
        }, this.CurrentUser);

        if (existingResult.Success && existingResult.Results && existingResult.Results.length > 0) {
          continue;
        }

        // Create junction record with version ID
        const collectionArtifact = await md.GetEntityObject<MJCollectionArtifactEntity>('MJ: Collection Artifacts', this.CurrentUser);
        collectionArtifact.CollectionID = collectionId;
        collectionArtifact.ArtifactVersionID = currentVersionId;
        collectionArtifact.Sequence = 0;

        const saved = await collectionArtifact.Save();
        if (saved) {
          successCount++;
        } else {
          console.error(`Failed to save artifact version to collection ${collectionId}`);
        }
      }

      if (successCount > 0) {
        MJNotificationService.Instance.CreateSimpleNotification(
          `Artifact saved to ${successCount} collection(s) successfully!`,
          'success',
          3000
        );

        // Reload collection associations to update the bookmark icon state
        await this.loadCollectionAssociations();
        return true;
      } else {
        MJNotificationService.Instance.CreateSimpleNotification(
          'Failed to save artifact to any collections',
          'error'
        );
        return false;
      }
    } catch (err) {
      console.error('Error saving to collections:', err);
      LogError(err);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error saving artifact to collections. Please try again.',
        'error'
      );
      return false;
    }
  }

  /**
   * Process links data using pre-fetched batch results from loadArtifact().
   * Reuses collection data from the same batch to avoid duplicate queries.
   */
  private async processLinksData(
    collectionsResult?: { Success: boolean; Results: Record<string, unknown>[] },
    convDetailResult?: { Success: boolean; Results: Record<string, unknown>[] },
    artifactId: string = this.artifactId,
    loadToken: number = this.artifactLoadToken
  ): Promise<void> {
    if (!artifactId) return;
    const isCurrentLoad = () => this.isCurrentArtifactLoad(artifactId, loadToken);

    // Clear old links data first to prevent stale data from previous artifact
    this.clearLinksData();

    try {
      const md = this.ProviderToUse;
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);

      // Use pre-fetched collection data or fetch if not provided
      let collectionRows: Record<string, unknown>[] = [];
      if (collectionsResult?.Success && collectionsResult.Results) {
        collectionRows = collectionsResult.Results;
      } else {
        const result = await rv.RunView<{ ID: string; CollectionID: string; ArtifactVersionID: string }>({
          EntityName: 'MJ: Collection Artifacts',
          ExtraFilter: `ArtifactVersionID IN (
            SELECT ID FROM [__mj].[vwArtifactVersions] WHERE ArtifactID='${artifactId}'
          )`,
          Fields: ['ID', 'CollectionID', 'ArtifactVersionID'],
          ResultType: 'simple'
        }, this.CurrentUser);
        collectionRows = (result.Success ? result.Results : []) as Record<string, unknown>[];
      }
      if (!isCurrentLoad()) {
        return;
      }

      // Get unique collection IDs and load collection details
      const collectionIds = [...new Set(
        collectionRows.map(ca => (ca['CollectionID'] || ca.CollectionID) as string)
      )].filter(Boolean);

      if (collectionIds.length > 0) {
        const collectionsFilter = collectionIds.map(id => `ID='${id}'`).join(' OR ');
        const collectionsEntityResult = await rv.RunView<MJCollectionEntity>({
          EntityName: 'MJ: Collections',
          ExtraFilter: collectionsFilter,
          Fields: ['ID', 'Name', 'UserID', 'Description'],
          ResultType: 'simple'
        }, this.CurrentUser);
        if (!isCurrentLoad()) {
          return;
        }

        if (collectionsEntityResult.Success && collectionsEntityResult.Results) {
          this.AllCollections = collectionsEntityResult.Results as unknown as MJCollectionEntity[];
        }
      }

      // Use pre-fetched conversation detail artifact data or fetch if not provided
      let convDetailRows: Record<string, unknown>[] = [];
      if (convDetailResult?.Success && convDetailResult.Results) {
        convDetailRows = convDetailResult.Results;
      } else {
        const versionIds = this.AllVersions.map(v => v.ID);
        if (versionIds.length > 0) {
          const versionFilter = versionIds.map(id => `ArtifactVersionID='${id}'`).join(' OR ');
          const result = await rv.RunView<{ ID: string; ConversationDetailID: string; ArtifactVersionID: string }>({
            EntityName: 'MJ: Conversation Detail Artifacts',
            ExtraFilter: versionFilter,
            Fields: ['ID', 'ConversationDetailID', 'ArtifactVersionID'],
            MaxRows: 1,
            ResultType: 'simple'
          }, this.CurrentUser);
          convDetailRows = (result.Success ? result.Results : []) as Record<string, unknown>[];
        }
      }
      if (!isCurrentLoad()) {
        return;
      }

      // Load origin conversation if we have a link
      if (convDetailRows.length > 0) {
        const conversationDetailId = (convDetailRows[0]['ConversationDetailID'] || convDetailRows[0].ConversationDetailID) as string;
        const artifactVersionId = (convDetailRows[0]['ArtifactVersionID'] || convDetailRows[0].ArtifactVersionID) as string;

        if (!isCurrentLoad()) {
          return;
        }
        this.OriginConversationVersionId = artifactVersionId;

        // Load conversation detail to get conversation ID
        const conversationDetail = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', this.CurrentUser);
        const detailLoaded = await conversationDetail.Load(conversationDetailId);
        if (!isCurrentLoad()) {
          return;
        }

        if (detailLoaded && conversationDetail.ConversationID) {
          const conversation = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', this.CurrentUser);
          const loaded = await conversation.Load(conversationDetail.ConversationID);
          if (!isCurrentLoad()) {
            return;
          }

          if (loaded) {
            // Check if user has access (is owner or participant)
            const userIsOwner = UUIDsEqual(conversation.UserID, this.CurrentUser.ID);

            const participantResult = await rv.RunView({
              EntityName: 'MJ: Conversation Details',
              ExtraFilter: `ConversationID='${conversation.ID}' AND UserID='${this.CurrentUser.ID}'`,
              MaxRows: 1,
              Fields: ['ID'],
              ResultType: 'simple'
            }, this.CurrentUser);
            if (!isCurrentLoad()) {
              return;
            }

            const userIsParticipant = participantResult.Success &&
                                       participantResult.Results &&
                                       participantResult.Results.length > 0;

            this.OriginConversation = conversation;
            this.HasAccessToOriginConversation = userIsOwner || userIsParticipant;
          }
        }
      }
    } catch (error) {
      if (!isCurrentLoad()) {
        return;
      }
      console.error('Error loading links data:', error);
    } finally {
      if (isCurrentLoad()) {
        this.cdr.detectChanges();
      }
    }
  }

  /**
   * @deprecated Use processLinksData() instead. Kept as shim for callers without pre-fetched data.
   */
  private async loadLinksData(): Promise<void> {
    return this.processLinksData();
  }

  get LinksToShow(): Array<{type: 'conversation' | 'collection'; id: string; name: string; hasAccess: boolean}> {
    const links: Array<{type: 'conversation' | 'collection'; id: string; name: string; hasAccess: boolean}> = [];

    // Get current version ID being viewed
    const currentVersionId = this.artifactVersion?.ID;

    // RULE: In conversation context, show ONLY collection links
    // RULE: In collection context, show ONLY conversation links
    if (this.ViewContext === 'conversation') {
      // Show all collections containing this artifact (any version)
      for (const collection of this.AllCollections) {
        links.push({
          type: 'collection',
          id: collection.ID,
          name: collection.Name,
          hasAccess: true
        });
      }
    } else if (this.ViewContext === 'collection') {
      // Show origin conversation if it exists
      // Show for ALL versions of the artifact, not just the original version that was added
      if (this.OriginConversation) {
        links.push({
          type: 'conversation',
          id: this.OriginConversation.ID,
          name: this.OriginConversation.Name || 'Untitled Conversation',
          hasAccess: this.HasAccessToOriginConversation
        });
      }
    }
    // If viewContext is null, show nothing (no links)

    return links;
  }

  /** @deprecated Use {@link LinksToShow}. */
  get linksToShow(): Array<{type: 'conversation' | 'collection'; id: string; name: string; hasAccess: boolean}> {
    return this.LinksToShow;
  }

  /**
   * Navigate to a linked conversation or collection
   */
  OnNavigateToLink(link: {type: 'conversation' | 'collection'; id: string; name: string; hasAccess: boolean}): void {
    if (!link.hasAccess) {
      return;
    }

    // Include artifact ID, version number, and version ID so destination can show the artifact with correct URL
    this.NavigateToLink.emit({
      type: link.type,
      id: link.id,
      artifactId: this.artifactId,
      versionNumber: this.SelectedVersionNumber,
      versionId: this.artifactVersion?.ID
    });
  }

  /** @deprecated Use {@link OnNavigateToLink}. */
  onNavigateToLink(link: {type: 'conversation' | 'collection'; id: string; name: string; hasAccess: boolean}): void {
    return this.OnNavigateToLink(link);
  }

  OnClose(): void {
    this.Closed.emit();
  }

  /** @deprecated Use {@link OnClose}. */
  onClose(): void {
    return this.OnClose();
  }

  OnShare(): void {
    this.ShareRequested.emit(this.artifactId);
  }

  /** @deprecated Use {@link OnShare}. */
  onShare(): void {
    return this.OnShare();
  }

  OnMaximizeToggle(): void {
    this.MaximizeToggled.emit();
  }

  /** @deprecated Use {@link OnMaximizeToggle}. */
  onMaximizeToggle(): void {
    return this.OnMaximizeToggle();
  }

  /**
   * Handle entity record open request from artifact viewer plugin (React component)
   * Propagates the event up to parent components
   */
  OnOpenEntityRecord(event: {entityName: string; compositeKey: CompositeKey}): void {
    this.OpenEntityRecord.emit(event);
  }

  /** @deprecated Use {@link OnOpenEntityRecord}. */
  onOpenEntityRecord(event: {entityName: string; compositeKey: CompositeKey}): void {
    return this.OnOpenEntityRecord(event);
  }

  /**
   * Handle navigation request from artifact viewer plugin.
   * Propagates the event up to parent components for app-level navigation.
   */
  OnNavigationRequest(event: NavigationRequest): void {
    this.navigationRequest.emit(event);
  }

  /** @deprecated Use {@link OnNavigationRequest}. */
  onNavigationRequest(event: NavigationRequest): void {
    return this.OnNavigationRequest(event);
  }

  /**
   * Resolves the DriverClass for an artifact type by traversing up the parent hierarchy.
   * Returns the first DriverClass found, or null if none found in the hierarchy.
   */
  private async resolveDriverClassForType(artifactType: MJArtifactTypeEntity): Promise<string | null> {
    // Check if current artifact type has a DriverClass
    if (artifactType.DriverClass) {
      return artifactType.DriverClass;
    }

    // No DriverClass on current type - check if it has a parent
    if (artifactType.ParentID) {
      const parentType = await this.getArtifactTypeById(artifactType.ParentID);

      if (parentType) {
        // Recursively check parent
        return await this.resolveDriverClassForType(parentType);
      }
    }

    // Reached root with no DriverClass
    return null;
  }

  /**
   * Loads an artifact type by ID
   */
  private async getArtifactTypeById(id: string): Promise<MJArtifactTypeEntity | null> {
    try {
      const md = this.ProviderToUse;
      const artifactType = await md.GetEntityObject<MJArtifactTypeEntity>('MJ: Artifact Types', this.CurrentUser);
      const loaded = await artifactType.Load(id);

      if (loaded) {
        return artifactType;
      }

      return null;
    } catch (err) {
      console.error('Error loading artifact type by ID:', err);
      return null;
    }
  }

  /**
   * Format JSON content using ParseJSONRecursive for deep parsing and formatting
   */
  private formatJSON(content: string): string {
    try {
      // First parse the JSON string to an object
      const obj = JSON.parse(content);

      // Then use ParseJSONRecursive to extract any inline JSON strings
      const parseOptions: ParseJSONOptions = {
        extractInlineJson: true,
        maxDepth: 100,
        debug: false
      };
      const parsed = ParseJSONRecursive(obj, parseOptions);

      // Finally stringify with formatting
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      // Fallback to simple parse/stringify if ParseJSONRecursive fails
      try {
        const obj = JSON.parse(content);
        return JSON.stringify(obj, null, 2);
      } catch (e2) {
        // If even simple parse fails, return as-is
        return content;
      }
    }
  }

  /**
   * Get icon class for a tab
   */
  public GetTabIcon(tabName: string): string | null {
    // Base tabs
    const baseIcons: Record<string, string> = {
      'Display': 'fas fa-eye',
      'Code': 'fas fa-code',
      'JSON': 'fas fa-file-code',
      'Details': 'fas fa-info-circle',
      'Links': 'fas fa-link'
    };

    if (baseIcons[tabName]) {
      return baseIcons[tabName];
    }

    // Check plugin tabs
    const plugin = this.pluginViewer?.pluginInstance;
    if (plugin?.GetAdditionalTabs) {
      const pluginTab = plugin.GetAdditionalTabs().find((t: ArtifactViewerTab) => t.label === tabName);
      if (pluginTab?.icon) {
        return 'fas ' + pluginTab.icon; // Ensure full Font Awesome class
      }
    }

    return null;
  }

  /**
   * Set active tab
   */
  public SetActiveTab(tabName: string): void {
    this.ActiveTab = tabName.toLowerCase();
  }

  /**
   * Track artifact usage event
   */
  private async trackArtifactUsage(usageType: 'Viewed' | 'Opened' | 'Shared' | 'Saved' | 'Exported'): Promise<void> {
    try {
      if (!this.artifactVersion?.ID || !this.CurrentUser?.ID) {
        return;
      }

      const md = this.ProviderToUse;
      const usage = await md.GetEntityObject<MJArtifactUseEntity>('MJ: Artifact Uses');

      usage.ArtifactVersionID = this.artifactVersion.ID;
      usage.UserID = this.CurrentUser.ID;
      usage.UsageType = usageType;
      usage.UsageContext = JSON.stringify({
        viewContext: this.ViewContext,
        contextCollectionId: this.ContextCollectionId,
        timestamp: new Date().toISOString()
      });

      // Save asynchronously - don't block UI
      usage.Save().catch(error => {
        console.error('Failed to track artifact usage:', error);
      });

    } catch (error) {
      console.error('Error tracking artifact usage:', error);
    }
  }

  /**
   * Get the icon for this artifact using the centralized icon service.
   * Fallback priority: Plugin icon > Metadata icon > Hardcoded mapping > Generic icon
   */
  /** Cached icon class — set once after artifact loads to avoid mid-cycle flicker */
  public ArtifactIcon: string = 'fa-file';

  /** @deprecated Use {@link ArtifactIcon}. */
  public get artifactIcon(): string {
    return this.ArtifactIcon;
  }
  /** @deprecated Use {@link ArtifactIcon}. */
  public set artifactIcon(value: string) {
    this.ArtifactIcon = value;
  }

  /** Update the cached icon from the loaded artifact */
  private updateArtifactIcon(): void {
    this.ArtifactIcon = this.Artifact
      ? this.artifactIconService.getArtifactIcon(this.Artifact)
      : 'fa-file';
  }

  /**
   * Capture the current snapshot and emit an analyze event.
   * The parent component handles routing this to an agent conversation.
   */
  public OnAnalyze(): void {
    const snapshot = this.GetCurrentStateSnapshot();
    if (snapshot && this.Artifact) {
      this.AnalyzeRequested.emit({
        artifactId: this.Artifact.ID,
        snapshot
      });
    } else {
      this.notificationService.CreateSimpleNotification(
        'No data available to analyze',
        'warning',
        3000
      );
    }
  }

  /**
   * Passthrough to the active plugin's GetCurrentStateSnapshot().
   * Returns null if no plugin is loaded or the plugin has no snapshot.
   */
  public GetCurrentStateSnapshot(): DataSnapshot | null {
    return this.pluginViewer?.pluginInstance?.GetCurrentStateSnapshot() ?? null;
  }
}
