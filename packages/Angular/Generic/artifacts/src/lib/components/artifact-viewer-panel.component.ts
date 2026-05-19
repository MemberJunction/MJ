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
import { RecentAccessService } from '@memberjunction/ng-shared-generic';

@Component({
  standalone: false,
  selector: 'mj-artifact-viewer-panel',
  templateUrl: './artifact-viewer-panel.component.html',
  styleUrls: ['./artifact-viewer-panel.component.css']
})
export class ArtifactViewerPanelComponent extends BaseAngularComponent implements OnInit, OnChanges, OnDestroy  {
  @Input() artifactId!: string;
  @Input() currentUser!: UserInfo;
  @Input() environmentId!: string;
  @Input() versionNumber?: number; // Version to display
  @Input() showSaveToCollection: boolean = true; // Control whether Save to Collection button is shown
  @Input() showHeader: boolean = true; // Control whether the header section is shown
  @Input() showTabs: boolean = true; // Control whether the tab navigation is shown (false = show only Display tab content)
  @Input() showCloseButton: boolean = true; // Control whether the close button is shown in header
  @Input() showMaximizeButton: boolean = true; // Control whether the maximize/restore button is shown in header
  @Input() refreshTrigger?: Subject<{artifactId: string; versionNumber: number}>;
  @Input() viewContext: 'conversation' | 'collection' | null = null; // Where artifact is being viewed
  @Input() contextCollectionId?: string; // If viewing in collection, which collection
  @Input() canShare?: boolean; // Whether user can share this artifact
  @Input() canEdit?: boolean; // Whether user can edit this artifact
  @Input() isMaximized: boolean = false; // Whether the panel is currently maximized
  @Output() closed = new EventEmitter<void>();
  @Output() saveToCollectionRequested = new EventEmitter<{artifactId: string; excludedCollectionIds: string[]}>();
  @Output() navigateToLink = new EventEmitter<{type: 'conversation' | 'collection'; id: string; artifactId?: string; versionNumber?: number; versionId?: string}>();
  @Output() shareRequested = new EventEmitter<string>(); // Emits artifactId when share is clicked
  @Output() maximizeToggled = new EventEmitter<void>(); // Emits when user clicks maximize/restore button
  @Output() openEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();
  @Output() navigationRequest = new EventEmitter<NavigationRequest>();
  @Output() analyzeRequested = new EventEmitter<{ artifactId: string; snapshot: DataSnapshot }>();

  @ViewChild(ArtifactTypePluginViewerComponent) pluginViewer?: ArtifactTypePluginViewerComponent;

  private destroy$ = new Subject<void>();

  public artifact: MJArtifactEntity | null = null;
  public artifactVersion: MJArtifactVersionEntity | null = null;
  public allVersions: MJArtifactVersionEntity[] = [];
  public selectedVersionNumber: number = 1;
  public isLoading = true;
  public error: string | null = null;
  public jsonContent = '';
  public showVersionDropdown = false;
  public artifactCollections: MJCollectionArtifactEntity[] = []; // All collections for ALL versions
  public currentVersionCollections: MJCollectionArtifactEntity[] = []; // Collections containing CURRENT version only
  public primaryCollection: MJCollectionEntity | null = null;

  // Tabbed interface
  public activeTab: string = 'display'; // Changed to string to support dynamic tabs
  public displayMarkdown: string | null = null;
  public displayHtml: string | null = null;
  public versionAttributes: MJArtifactVersionAttributeEntity[] = [];
  private artifactTypeDriverClass: string | null = null;
  /** Populated from ArtifactType.ContentCategory. Used to suppress the JSON tab for
   *  binary file-type artifacts — driven by metadata, not hardcoded plugin overrides. */
  private artifactContentCategory: 'File' | 'Text' | null = null;

  // Links tab data
  public originConversation: MJConversationEntity | null = null;
  public allCollections: MJCollectionEntity[] = [];
  public hasAccessToOriginConversation: boolean = false;
  public originConversationVersionId: string | null = null; // Version ID that came from origin conversation

  // Dynamic tabs from plugin
  public get allTabs(): string[] {
    const tabs: string[] = [];

    // Only add Display tab if there's content to display
    if (this.hasDisplayTab) {
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
    if (!removalsLower.includes('links') && this.linksToShow.length > 0) {
      tabs.push('Links');
    }

    return tabs;
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
        return { label: 'JSON', contentType: 'json', content: this.jsonContent, language: 'json' };
      case 'details':
        return { label: 'Details', contentType: 'html', content: this.displayMarkdown || this.displayHtml || '' };
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
    private artifactIconService: ArtifactIconService
  ) {
    super();
    this.recentAccessService = new RecentAccessService();
  }

  async ngOnInit() {
    // Subscribe to refresh trigger for dynamic version changes
    if (this.refreshTrigger) {
      this.refreshTrigger.pipe(takeUntil(this.destroy$)).subscribe(async (data) => {
        if (data.artifactId === this.artifactId) {
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
      await this.loadArtifact(this.versionNumber);

      // Track that user viewed this artifact (deferred so it runs after the load)
      if (this.artifactVersion?.ID && this.currentUser) {
        this.trackArtifactUsage('Viewed');
        // Also log to User Record Logs for recents feature (fire-and-forget)
        this.recentAccessService.logAccess('MJ: Artifacts', this.artifactId, 'artifact');
      }
    }, 0);
  }

  async ngOnChanges(changes: SimpleChanges) {
    // Reload artifact when artifactId changes
    if (changes['artifactId'] && !changes['artifactId'].firstChange) {
      await this.loadArtifact(this.versionNumber);
    }

    // Switch to new version when versionNumber changes (but artifactId stays the same)
    if (changes['versionNumber'] && !changes['versionNumber'].firstChange) {
      const newVersionNumber = changes['versionNumber'].currentValue;
      if (newVersionNumber != null) {
        // Check if we have metadata for this version (allVersions has lightweight metadata)
        const targetVersion = this.allVersions.find(v => v.VersionNumber === newVersionNumber);
        if (targetVersion) {
          this.selectedVersionNumber = (targetVersion.VersionNumber as number) || 1;

          // Load full content for the selected version
          const fullVersion = await this.loadVersionContent(targetVersion.ID);
          if (fullVersion) {
            this.artifactVersion = fullVersion;
            this.jsonContent = this.FormatJSON(fullVersion.Content || '{}');
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

  private async loadArtifact(targetVersionNumber?: number): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;

      // Clear links data from previous artifact to prevent stale Links tab
      this.clearLinksData();

      const md = this.ProviderToUse;

      // Load artifact — assign to local first to avoid mid-cycle icon flicker
      const artifactEntity = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', this.currentUser);
      const loaded = await artifactEntity.Load(this.artifactId);

      if (!loaded) {
        this.error = 'Failed to load artifact';
        return;
      }
      this.artifact = artifactEntity;

      // PERF: Batch load version metadata, collection associations, and conversation links
      // in a single RunViews call. Content is excluded here — loaded on-demand for the selected version.
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const batchResults = await rv.RunViews([
        {
          // [0] Version metadata (lightweight — no Content field)
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ArtifactID='${this.artifactId}'`,
          OrderBy: 'VersionNumber DESC',
          Fields: ['ID', 'ArtifactID', 'VersionNumber', 'Name', 'Description', '__mj_CreatedAt', '__mj_UpdatedAt'],
          ResultType: 'simple'
        },
        {
          // [1] Collection associations for all versions of this artifact
          EntityName: 'MJ: Collection Artifacts',
          ExtraFilter: `ArtifactVersionID IN (
            SELECT ID FROM [__mj].[vwArtifactVersions] WHERE ArtifactID='${this.artifactId}'
          )`,
          Fields: ['ID', 'CollectionID', 'ArtifactVersionID', 'Sequence'],
          ResultType: 'simple'
        },
        {
          // [2] Conversation detail artifact links (for Links tab)
          EntityName: 'MJ: Conversation Detail Artifacts',
          ExtraFilter: `ArtifactVersionID IN (
            SELECT ID FROM [__mj].[vwArtifactVersions] WHERE ArtifactID='${this.artifactId}'
          )`,
          Fields: ['ID', 'ConversationDetailID', 'ArtifactVersionID'],
          MaxRows: 1,
          ResultType: 'simple'
        }
      ], this.currentUser);

      const [versionsResult, collectionsResult, convDetailResult] = batchResults;

      if (!versionsResult.Success || !versionsResult.Results || versionsResult.Results.length === 0) {
        this.error = 'No artifact version found';
        return;
      }

      // Store version metadata as simple objects (used for dropdown display)
      this.allVersions = versionsResult.Results as MJArtifactVersionEntity[];

      // Determine which version to display
      let selectedVersion: Record<string, unknown> | undefined;
      if (targetVersionNumber) {
        selectedVersion = versionsResult.Results.find(
          (v: Record<string, unknown>) => v.VersionNumber === targetVersionNumber
        );
      }
      // Fall back to latest version (first in DESC order)
      const versionToLoad = selectedVersion || versionsResult.Results[0];
      this.selectedVersionNumber = (versionToLoad.VersionNumber as number) || 1;

      // PERF: Start artifact type resolution and selected version content load in parallel
      const [, selectedVersionEntity] = await Promise.all([
        this.loadArtifactType(),
        this.loadVersionContent(versionToLoad.ID as string)
      ]);

      if (selectedVersionEntity) {
        this.artifactVersion = selectedVersionEntity;
        this.jsonContent = this.FormatJSON(selectedVersionEntity.Content || '{}');
      } else {
        this.error = 'Failed to load artifact version content';
        return;
      }

      // PERF: Process collection and links data in parallel (uses already-fetched batch data)
      await Promise.all([
        this.processCollectionAssociations(collectionsResult),
        this.processLinksData(collectionsResult, convDetailResult)
      ]);

      // Load version attributes (depends on selected version being set)
      await this.loadVersionAttributes();
    } catch (err) {
      console.error('Error loading artifact:', err);
      this.error = 'Error loading artifact: ' + (err as Error).message;
    } finally {
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
      const versionEntity = await md.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', this.currentUser);
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
    this.allCollections = [];
    this.originConversation = null;
    this.hasAccessToOriginConversation = false;
    this.originConversationVersionId = null;
  }

  private async loadArtifactType(): Promise<void> {
    // Reset on every load so a previous artifact's values don't bleed into the next
    this.artifactTypeDriverClass = null;
    this.artifactContentCategory = null;

    if (!this.artifact?.Type) {
      return;
    }

    try {
      await ArtifactMetadataEngine.Instance.Config(false, this.currentUser);

      const artifactType = ArtifactMetadataEngine.Instance.FindArtifactType(this.artifact.Type);
      if (artifactType) {
        // Resolve DriverClass by traversing parent hierarchy if needed
        this.artifactTypeDriverClass = await this.resolveDriverClassForType(artifactType);
        this.artifactContentCategory = artifactType.ContentCategory;
      }
    } catch (err) {
      console.error('Error loading artifact type:', err);
      // Don't fail the whole load if we can't get the artifact type
    }
  }

  private async loadVersionAttributes(): Promise<void> {
    if (!this.artifactVersion) return;

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJArtifactVersionAttributeEntity>({
        EntityName: 'MJ: Artifact Version Attributes',
        ExtraFilter: `ArtifactVersionID='${this.artifactVersion.ID}'`,
        ResultType: 'simple'
      }, this.currentUser);

      if (result.Success && result.Results) {
        this.versionAttributes = result.Results;

        // Check for displayMarkdown or displayHtml attributes
        const displayMarkdownAttr = this.versionAttributes.find(a => a.Name?.toLowerCase() === 'displaymarkdown');
        const displayHtmlAttr = this.versionAttributes.find(a => a.Name?.toLowerCase() === 'displayhtml');

        // Parse values - they might be JSON-encoded strings
        this.displayMarkdown = this.parseAttributeValue(displayMarkdownAttr?.Value);
        this.displayHtml = this.parseAttributeValue(displayHtmlAttr?.Value);

        // Clean up double-escaped characters in HTML (from LLM generation)
        if (this.displayHtml) {
          this.displayHtml = this.cleanEscapedCharacters(this.displayHtml);
        }

        // Set active tab to the first available tab
        this.setActiveTabToFirstAvailable();
      }
    } catch (err) {
      console.error('Error loading version attributes:', err);
    } finally {
      this.cdr.detectChanges(); // zone.js 0.15: async RunView doesn't trigger CD
    }
  }

  get displayName(): string {
    if (this.artifactVersion?.Name) {
      return this.artifactVersion.Name;
    }
    return this.artifact?.Name || 'Artifact';
  }

  get displayDescription(): string | null {
    if (this.artifactVersion?.Description) {
      return this.artifactVersion.Description;
    }
    return this.artifact?.Description || null;
  }

  get hasDisplayTab(): boolean {
    // Show Display tab if:
    // 1. We have a plugin AND it reports having content to display, OR
    // 2. We have displayMarkdown or displayHtml attributes from extract rules
    //
    // Note: hasDisplayContent defaults to false in base class, so plugins must
    // explicitly opt-in by overriding to return true when they have content.
    // This prevents showing Display tab before plugin loads or when plugin has no content.
    const pluginHasContent = this.pluginViewer?.pluginInstance?.hasDisplayContent ?? false;

    return pluginHasContent || !!this.displayMarkdown || !!this.displayHtml;
  }

  get hasPlugin(): boolean {
    // Check if the artifact type has a DriverClass configured
    // If DriverClass is set, we have a plugin available
    return !!this.artifactTypeDriverClass;
  }

  get hasJsonTab(): boolean {
    // Query plugin directly (no cache needed - plugin always exists when it should)
    const pluginInstance = this.pluginViewer?.pluginInstance;
    return pluginInstance?.parentShouldShowRawContent || false;
  }

  get artifactTypeName(): string {
    return this.artifact?.Type || '';
  }

  get contentType(): string | undefined {
    // Try to get content type from artifact type or attributes
    const contentTypeAttr = this.versionAttributes.find(a => a.Name?.toLowerCase() === 'contenttype');
    return contentTypeAttr?.Value || undefined;
  }

  get filteredAttributes(): MJArtifactVersionAttributeEntity[] {
    // Filter out displayMarkdown and displayHtml as they're shown in the Display tab
    return this.versionAttributes.filter(attr => {
      const name = attr.Name?.toLowerCase();
      return name !== 'displaymarkdown' && name !== 'displayhtml';
    });
  }

  setActiveTab(tab: 'display' | 'json' | 'details' | 'links'): void {
    this.activeTab = tab;
  }

  /**
   * Sets the active tab to the first available tab in the list.
   * Called when tabs change or when the currently active tab becomes unavailable.
   */
  private setActiveTabToFirstAvailable(): void {
    const tabs = this.allTabs;
    if (tabs.length > 0) {
      // If current tab is still available, keep it; otherwise switch to first
      const currentTabStillAvailable = tabs.some(t => t.toLowerCase() === this.activeTab.toLowerCase());
      if (!currentTabStillAvailable) {
        this.activeTab = tabs[0].toLowerCase();
      }
    } else {
      // Fallback to details if no tabs available (shouldn't happen)
      this.activeTab = 'details';
    }
  }

  /**
   * Called when a plugin's async tab data changes (e.g., ComponentArtifactViewer loads
   * the full spec from the registry after initial render with a stripped spec).
   * Forces re-evaluation of allTabs so new tab labels render correctly.
   */
  onTabsChanged(): void {
    // If Display tab just became available (e.g., after plugin async load),
    // switch to it — it should be the default when present.
    const tabs = this.allTabs;
    if (tabs.length > 0 && tabs[0].toLowerCase() === 'display' && this.activeTab !== 'display') {
      this.activeTab = 'display';
    }
    this.cdr.detectChanges(); // zone.js 0.15: plugin emitted tabsChanged, force CD to re-evaluate allTabs
  }

  /**
   * Called when the plugin viewer finishes loading.
   * Selects the first available tab now that plugin tabs are available.
   */
  onPluginLoaded(): void {
    // Now that plugin is loaded, we have accurate tab information
    // Always select the first tab since this is the initial load
    const tabs = this.allTabs;
    if (tabs.length > 0) {
      this.activeTab = tabs[0].toLowerCase();
    }
    this.cdr.detectChanges(); // zone.js 0.15: plugin loaded via async callback, force CD
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
    collectionsResult?: { Success: boolean; Results: Record<string, unknown>[] }
  ): Promise<void> {
    if (!this.artifactId) return;

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
            SELECT ID FROM [__mj].[vwArtifactVersions] WHERE ArtifactID='${this.artifactId}'
          )`,
          Fields: ['ID', 'CollectionID', 'ArtifactVersionID', 'Sequence'],
          ResultType: 'simple'
        }, this.currentUser);
        collectionRows = (result.Success ? result.Results : []) as Record<string, unknown>[];
      }

      // Store as simple objects — these are read-only display data
      this.artifactCollections = collectionRows as unknown as MJCollectionArtifactEntity[];

      // Filter to get only collections containing the CURRENT version
      const currentVersionId = this.artifactVersion?.ID;
      if (currentVersionId) {
        const currentIdStr = String(currentVersionId).toLowerCase();
        this.currentVersionCollections = collectionRows.filter(ca => {
          const versionIdStr = String(ca['ArtifactVersionID'] || ca.ArtifactVersionID || '').toLowerCase();
          return versionIdStr && currentIdStr && versionIdStr === currentIdStr;
        }) as unknown as MJCollectionArtifactEntity[];
      } else {
        this.currentVersionCollections = [];
      }

      // Load the primary collection details if exists
      if (this.artifactCollections.length > 0) {
        const collectionId = (collectionRows[0] as Record<string, unknown>).CollectionID as string ||
                             (this.artifactCollections[0] as unknown as Record<string, unknown>).CollectionID as string;
        if (collectionId) {
          const md = this.ProviderToUse;
          this.primaryCollection = await md.GetEntityObject<MJCollectionEntity>('MJ: Collections', this.currentUser);
          await this.primaryCollection.Load(collectionId);
        }
      } else {
        this.primaryCollection = null;
      }
    } catch (err) {
      console.error('Error processing collection associations:', err);
    } finally {
      this.cdr.detectChanges();
    }
  }

  /**
   * @deprecated Use processCollectionAssociations() instead. Kept as a shim for callers
   * that don't have pre-fetched data (e.g., selectVersion, saveToCollections).
   */
  private async loadCollectionAssociations(): Promise<void> {
    return this.processCollectionAssociations();
  }

  get isInCollection(): boolean {
    return this.currentVersionCollections.length > 0;
  }

  /**
   * Get collection IDs that already contain the current version
   * Used to exclude them from the save picker
   */
  get currentVersionCollectionIds(): string[] {
    return this.currentVersionCollections.map(ca => ca.CollectionID);
  }

  onCopyToClipboard(): void {
    // Get content from the currently active tab instead of always copying jsonContent
    const tabData = this.GetTabContent(this.activeTab);
    if (tabData?.content) {
      navigator.clipboard.writeText(tabData.content);
    } else if (this.jsonContent) {
      // Fallback to jsonContent if tab content not found
      navigator.clipboard.writeText(this.jsonContent);
    }
  }

  onCopyDisplayContent(): void {
    const content = this.displayHtml || this.displayMarkdown;
    if (content) {
      navigator.clipboard.writeText(content).catch(err => {
        console.error('Failed to copy to clipboard:', err);
      });
    }
  }

  onPrintDisplayContent(): void {
    // Try to delegate to the plugin viewer's print method
    if (this.pluginViewer?.pluginInstance) {
      const plugin = this.pluginViewer.pluginInstance as any;
      if (typeof plugin.printHtml === 'function') {
        plugin.printHtml();
        return;
      }
    }

    // Fallback: create a temporary print window with displayHtml or displayMarkdown
    const content = this.displayHtml || this.displayMarkdown;
    if (content) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        if (this.displayHtml) {
          printWindow.document.write(content);
        } else if (this.displayMarkdown) {
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

  toggleVersionDropdown(): void {
    if (this.allVersions.length > 1) {
      this.showVersionDropdown = !this.showVersionDropdown;
    }
  }

  async selectVersion(version: MJArtifactVersionEntity): Promise<void> {
    this.selectedVersionNumber = (version.VersionNumber as number) || 1;
    this.showVersionDropdown = false;

    // Load full content for the selected version (allVersions only has metadata)
    const fullVersion = await this.loadVersionContent(version.ID);
    if (fullVersion) {
      this.artifactVersion = fullVersion;
      this.jsonContent = this.FormatJSON(fullVersion.Content || '{}');
    }

    // Load attributes and collection data in parallel
    await Promise.all([
      this.loadVersionAttributes(),
      this.loadCollectionAssociations(),
      this.loadLinksData()
    ]);

    this.cdr.detectChanges();
  }

  async onSaveToLibrary(): Promise<void> {
    // Always show the collection picker modal
    // Artifacts can be saved to multiple collections
    this.saveToCollectionRequested.emit({
      artifactId: this.artifactId,
      excludedCollectionIds: this.excludedCollectionIds
    });
  }

  get excludedCollectionIds(): string[] {
    // Return IDs of collections that already contain the CURRENT VERSION
    // This allows saving different versions to the same collection
    const excluded = this.currentVersionCollections
      .filter(ca => ca.CollectionID)
      .map(ca => String(ca.CollectionID));
    return excluded;
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
        }, this.currentUser);

        if (existingResult.Success && existingResult.Results && existingResult.Results.length > 0) {
          continue;
        }

        // Create junction record with version ID
        const collectionArtifact = await md.GetEntityObject<MJCollectionArtifactEntity>('MJ: Collection Artifacts', this.currentUser);
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
    convDetailResult?: { Success: boolean; Results: Record<string, unknown>[] }
  ): Promise<void> {
    if (!this.artifactId) return;

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
            SELECT ID FROM [__mj].[vwArtifactVersions] WHERE ArtifactID='${this.artifactId}'
          )`,
          Fields: ['ID', 'CollectionID', 'ArtifactVersionID'],
          ResultType: 'simple'
        }, this.currentUser);
        collectionRows = (result.Success ? result.Results : []) as Record<string, unknown>[];
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
        }, this.currentUser);

        if (collectionsEntityResult.Success && collectionsEntityResult.Results) {
          this.allCollections = collectionsEntityResult.Results as unknown as MJCollectionEntity[];
        }
      }

      // Use pre-fetched conversation detail artifact data or fetch if not provided
      let convDetailRows: Record<string, unknown>[] = [];
      if (convDetailResult?.Success && convDetailResult.Results) {
        convDetailRows = convDetailResult.Results;
      } else {
        const versionIds = this.allVersions.map(v => v.ID);
        if (versionIds.length > 0) {
          const versionFilter = versionIds.map(id => `ArtifactVersionID='${id}'`).join(' OR ');
          const result = await rv.RunView<{ ID: string; ConversationDetailID: string; ArtifactVersionID: string }>({
            EntityName: 'MJ: Conversation Detail Artifacts',
            ExtraFilter: versionFilter,
            Fields: ['ID', 'ConversationDetailID', 'ArtifactVersionID'],
            MaxRows: 1,
            ResultType: 'simple'
          }, this.currentUser);
          convDetailRows = (result.Success ? result.Results : []) as Record<string, unknown>[];
        }
      }

      // Load origin conversation if we have a link
      if (convDetailRows.length > 0) {
        const conversationDetailId = (convDetailRows[0]['ConversationDetailID'] || convDetailRows[0].ConversationDetailID) as string;
        const artifactVersionId = (convDetailRows[0]['ArtifactVersionID'] || convDetailRows[0].ArtifactVersionID) as string;

        this.originConversationVersionId = artifactVersionId;

        // Load conversation detail to get conversation ID
        const conversationDetail = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', this.currentUser);
        const detailLoaded = await conversationDetail.Load(conversationDetailId);

        if (detailLoaded && conversationDetail.ConversationID) {
          const conversation = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', this.currentUser);
          const loaded = await conversation.Load(conversationDetail.ConversationID);

          if (loaded) {
            this.originConversation = conversation;

            // Check if user has access (is owner or participant)
            const userIsOwner = UUIDsEqual(conversation.UserID, this.currentUser.ID);

            const participantResult = await rv.RunView({
              EntityName: 'MJ: Conversation Details',
              ExtraFilter: `ConversationID='${conversation.ID}' AND UserID='${this.currentUser.ID}'`,
              MaxRows: 1,
              Fields: ['ID'],
              ResultType: 'simple'
            }, this.currentUser);

            const userIsParticipant = participantResult.Success &&
                                       participantResult.Results &&
                                       participantResult.Results.length > 0;

            this.hasAccessToOriginConversation = userIsOwner || userIsParticipant;
          }
        }
      }
    } catch (error) {
      console.error('Error loading links data:', error);
    } finally {
      this.cdr.detectChanges();
    }
  }

  /**
   * @deprecated Use processLinksData() instead. Kept as shim for callers without pre-fetched data.
   */
  private async loadLinksData(): Promise<void> {
    return this.processLinksData();
  }

  get linksToShow(): Array<{type: 'conversation' | 'collection'; id: string; name: string; hasAccess: boolean}> {
    const links: Array<{type: 'conversation' | 'collection'; id: string; name: string; hasAccess: boolean}> = [];

    // Get current version ID being viewed
    const currentVersionId = this.artifactVersion?.ID;

    // RULE: In conversation context, show ONLY collection links
    // RULE: In collection context, show ONLY conversation links
    if (this.viewContext === 'conversation') {
      // Show all collections containing this artifact (any version)
      for (const collection of this.allCollections) {
        links.push({
          type: 'collection',
          id: collection.ID,
          name: collection.Name,
          hasAccess: true
        });
      }
    } else if (this.viewContext === 'collection') {
      // Show origin conversation if it exists
      // Show for ALL versions of the artifact, not just the original version that was added
      if (this.originConversation) {
        links.push({
          type: 'conversation',
          id: this.originConversation.ID,
          name: this.originConversation.Name || 'Untitled Conversation',
          hasAccess: this.hasAccessToOriginConversation
        });
      }
    }
    // If viewContext is null, show nothing (no links)

    return links;
  }

  /**
   * Navigate to a linked conversation or collection
   */
  onNavigateToLink(link: {type: 'conversation' | 'collection'; id: string; name: string; hasAccess: boolean}): void {
    if (!link.hasAccess) {
      return;
    }

    // Include artifact ID, version number, and version ID so destination can show the artifact with correct URL
    this.navigateToLink.emit({
      type: link.type,
      id: link.id,
      artifactId: this.artifactId,
      versionNumber: this.selectedVersionNumber,
      versionId: this.artifactVersion?.ID
    });
  }

  onClose(): void {
    this.closed.emit();
  }

  onShare(): void {
    this.shareRequested.emit(this.artifactId);
  }

  onMaximizeToggle(): void {
    this.maximizeToggled.emit();
  }

  /**
   * Handle entity record open request from artifact viewer plugin (React component)
   * Propagates the event up to parent components
   */
  onOpenEntityRecord(event: {entityName: string; compositeKey: CompositeKey}): void {
    this.openEntityRecord.emit(event);
  }

  /**
   * Handle navigation request from artifact viewer plugin.
   * Propagates the event up to parent components for app-level navigation.
   */
  onNavigationRequest(event: NavigationRequest): void {
    this.navigationRequest.emit(event);
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
      const artifactType = await md.GetEntityObject<MJArtifactTypeEntity>('MJ: Artifact Types', this.currentUser);
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
  private FormatJSON(content: string): string {
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
    this.activeTab = tabName.toLowerCase();
  }

  /**
   * Track artifact usage event
   */
  private async trackArtifactUsage(usageType: 'Viewed' | 'Opened' | 'Shared' | 'Saved' | 'Exported'): Promise<void> {
    try {
      if (!this.artifactVersion?.ID || !this.currentUser?.ID) {
        return;
      }

      const md = this.ProviderToUse;
      const usage = await md.GetEntityObject<MJArtifactUseEntity>('MJ: Artifact Uses');

      usage.ArtifactVersionID = this.artifactVersion.ID;
      usage.UserID = this.currentUser.ID;
      usage.UsageType = usageType;
      usage.UsageContext = JSON.stringify({
        viewContext: this.viewContext,
        contextCollectionId: this.contextCollectionId,
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
  public artifactIcon: string = 'fa-file';

  /** Update the cached icon from the loaded artifact */
  private updateArtifactIcon(): void {
    this.artifactIcon = this.artifact
      ? this.artifactIconService.getArtifactIcon(this.artifact)
      : 'fa-file';
  }

  /**
   * Capture the current snapshot and emit an analyze event.
   * The parent component handles routing this to an agent conversation.
   */
  public OnAnalyze(): void {
    const snapshot = this.GetCurrentStateSnapshot();
    if (snapshot && this.artifact) {
      this.analyzeRequested.emit({
        artifactId: this.artifact.ID,
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
