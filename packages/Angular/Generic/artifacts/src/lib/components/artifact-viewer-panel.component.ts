import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges, ViewChild, ViewContainerRef, ComponentRef, Type } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { UserInfo, Metadata, RunView, LogError, CompositeKey } from '@memberjunction/core';
import { ParseJSONRecursive, ParseJSONOptions } from '@memberjunction/global';
import { ArtifactEntity, ArtifactVersionEntity, ArtifactVersionAttributeEntity, ArtifactTypeEntity, CollectionEntity, CollectionArtifactEntity, ArtifactMetadataEngine, ConversationEntity, ConversationDetailArtifactEntity, ConversationDetailEntity, ArtifactUseEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ArtifactTypePluginViewerComponent } from './artifact-type-plugin-viewer.component';
import { ArtifactViewerTab } from './base-artifact-viewer.component';
import { ArtifactIconService } from '../services/artifact-icon.service';
import { RecentAccessService } from '@memberjunction/ng-shared-generic';

@Component({
  selector: 'mj-artifact-viewer-panel',
  templateUrl: './artifact-viewer-panel.component.html',
  styleUrls: ['./artifact-viewer-panel.component.css']
})
export class ArtifactViewerPanelComponent implements OnInit, OnChanges, OnDestroy {
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

  @ViewChild(ArtifactTypePluginViewerComponent) pluginViewer?: ArtifactTypePluginViewerComponent;

  private destroy$ = new Subject<void>();

  public artifact: ArtifactEntity | null = null;
  public artifactVersion: ArtifactVersionEntity | null = null;
  public allVersions: ArtifactVersionEntity[] = [];
  public selectedVersionNumber: number = 1;
  public isLoading = true;
  public error: string | null = null;
  public jsonContent = '';
  public showVersionDropdown = false;
  public artifactCollections: CollectionArtifactEntity[] = []; // All collections for ALL versions
  public currentVersionCollections: CollectionArtifactEntity[] = []; // Collections containing CURRENT version only
  public primaryCollection: CollectionEntity | null = null;

  // Tabbed interface
  public activeTab: string = 'display'; // Changed to string to support dynamic tabs
  public displayMarkdown: string | null = null;
  public displayHtml: string | null = null;
  public versionAttributes: ArtifactVersionAttributeEntity[] = [];
  private artifactTypeDriverClass: string | null = null;

  // Links tab data
  public originConversation: ConversationEntity | null = null;
  public allCollections: CollectionEntity[] = [];
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

    // Add standard tabs (unless plugin removed them)
    if (!removalsLower.includes('json')) {
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
    private notificationService: MJNotificationService,
    private sanitizer: DomSanitizer,
    private artifactIconService: ArtifactIconService
  ) {
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

    // Load artifact with specified version if provided
    await this.loadArtifact(this.versionNumber);

    // Track that user viewed this artifact
    if (this.artifactVersion?.ID && this.currentUser) {
      this.trackArtifactUsage('Viewed');
      // Also log to User Record Logs for recents feature (fire-and-forget)
      this.recentAccessService.logAccess('MJ: Artifacts', this.artifactId, 'artifact');
    }
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
        // Check if we already have this version loaded (avoid reload if possible)
        const targetVersion = this.allVersions.find(v => v.VersionNumber === newVersionNumber);
        if (targetVersion) {
          // Just switch to the version we already have
          this.artifactVersion = targetVersion;
          this.selectedVersionNumber = targetVersion.VersionNumber || 1;
          this.jsonContent = this.FormatJSON(targetVersion.Content || '{}');

          // Load version attributes
          await this.loadVersionAttributes();

          // Reload collection associations for this version
          await this.loadCollectionAssociations();

          // Reload links data
          await this.loadLinksData();
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

      const md = new Metadata();

      // Load artifact
      this.artifact = await md.GetEntityObject<ArtifactEntity>('MJ: Artifacts', this.currentUser);
      const loaded = await this.artifact.Load(this.artifactId);

      if (!loaded) {
        this.error = 'Failed to load artifact';
        return;
      }

      // Load artifact type to check for DriverClass
      await this.loadArtifactType();

      // Load ALL versions
      const rv = new RunView();
      const result = await rv.RunView<ArtifactVersionEntity>({
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: `ArtifactID='${this.artifactId}'`,
        OrderBy: 'VersionNumber DESC',
        ResultType: 'entity_object'
      }, this.currentUser);

      if (result.Success && result.Results && result.Results.length > 0) {
        this.allVersions = result.Results;

        // If target version specified, try to load it
        if (targetVersionNumber) {
          const targetVersion = this.allVersions.find(v => v.VersionNumber === targetVersionNumber);
          if (targetVersion) {
            this.artifactVersion = targetVersion;
            this.selectedVersionNumber = targetVersion.VersionNumber || 1;
            this.jsonContent = this.FormatJSON(targetVersion.Content || '{}');
          } else {
            // Target version not found, default to latest
            this.artifactVersion = result.Results[0];
            this.selectedVersionNumber = this.artifactVersion.VersionNumber || 1;
            this.jsonContent = this.FormatJSON(this.artifactVersion.Content || '{}');
          }
        } else {
          // No target version, default to latest version (first in DESC order)
          this.artifactVersion = result.Results[0];
          this.selectedVersionNumber = this.artifactVersion.VersionNumber || 1;
          this.jsonContent = this.FormatJSON(this.artifactVersion.Content || '{}');
        }

        // Load version attributes
        await this.loadVersionAttributes();

        // Load collection associations
        await this.loadCollectionAssociations();

        // Load links data
        await this.loadLinksData();
      } else {
        this.error = 'No artifact version found';
      }
    } catch (err) {
      console.error('Error loading artifact:', err);
      this.error = 'Error loading artifact: ' + (err as Error).message;
    } finally {
      this.isLoading = false;
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
    if (!this.artifact?.Type) {
      return;
    }

    try {
      await ArtifactMetadataEngine.Instance.Config(false, this.currentUser);

      const artifactType = ArtifactMetadataEngine.Instance.FindArtifactType(this.artifact.Type);
      if (artifactType) {
        // Resolve DriverClass by traversing parent hierarchy if needed
        this.artifactTypeDriverClass = await this.resolveDriverClassForType(artifactType);
      }
    } catch (err) {
      console.error('Error loading artifact type:', err);
      // Don't fail the whole load if we can't get the artifact type
    }
  }

  private async loadVersionAttributes(): Promise<void> {
    if (!this.artifactVersion) return;

    try {
      const rv = new RunView();
      const result = await rv.RunView<ArtifactVersionAttributeEntity>({
        EntityName: 'MJ: Artifact Version Attributes',
        ExtraFilter: `ArtifactVersionID='${this.artifactVersion.ID}'`,
        ResultType: 'entity_object'
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

  get filteredAttributes(): ArtifactVersionAttributeEntity[] {
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

  private async loadCollectionAssociations(): Promise<void> {
    if (!this.artifactId) return;

    try {
      const rv = new RunView();
      // Load ALL collection associations for ALL versions of this artifact
      const result = await rv.RunView<CollectionArtifactEntity>({
        EntityName: 'MJ: Collection Artifacts',
        ExtraFilter: `ArtifactVersionID IN (
          SELECT ID FROM [__mj].[vwArtifactVersions] WHERE ArtifactID='${this.artifactId}'
        )`,
        ResultType: 'entity_object'
      }, this.currentUser);

      if (result.Success && result.Results) {
        this.artifactCollections = result.Results;

        // Filter to get only collections containing the CURRENT version
        const currentVersionId = this.artifactVersion?.ID;
        if (currentVersionId) {
          // Type-safe comparison: ensure both IDs are strings and match exactly
          const currentIdStr = String(currentVersionId).toLowerCase();

          this.currentVersionCollections = result.Results.filter(ca => {
            const versionIdStr = String(ca.ArtifactVersionID || '').toLowerCase();
            return versionIdStr && currentIdStr && versionIdStr === currentIdStr;
          });
        } else {
          this.currentVersionCollections = [];
        }

        // Load the primary collection details if exists
        if (this.artifactCollections.length > 0) {
          const collectionId = this.artifactCollections[0].CollectionID;
          const md = new Metadata();
          this.primaryCollection = await md.GetEntityObject<CollectionEntity>('MJ: Collections', this.currentUser);
          await this.primaryCollection.Load(collectionId);
        } else {
          this.primaryCollection = null;
        }
      }
    } catch (err) {
      console.error('Error loading collection associations:', err);
    }
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

  async selectVersion(version: ArtifactVersionEntity): Promise<void> {
    this.artifactVersion = version;
    this.selectedVersionNumber = version.VersionNumber || 1;
    this.jsonContent = this.FormatJSON(version.Content || '{}');
    this.showVersionDropdown = false;

    // Load attributes for the selected version
    await this.loadVersionAttributes();

    // CRITICAL FIX: Reload collection associations for this version
    // This ensures bookmark button and Links tab reflect the correct state
    await this.loadCollectionAssociations();

    // Also reload links data to update conversation/collection links
    await this.loadLinksData();
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
   * Called by parent component after user selects collections in the picker.
   * Saves the artifact to the selected collections.
   */
  async saveToCollections(collectionIds: string[]): Promise<boolean> {
    if (!this.artifactId || collectionIds.length === 0) {
      return false;
    }

    try {
      const md = new Metadata();
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
        const rv = new RunView();
        const existingResult = await rv.RunView<CollectionArtifactEntity>({
          EntityName: 'MJ: Collection Artifacts',
          ExtraFilter: `CollectionID='${collectionId}' AND ArtifactVersionID='${currentVersionId}'`,
          ResultType: 'entity_object'
        }, this.currentUser);

        if (existingResult.Success && existingResult.Results && existingResult.Results.length > 0) {
          continue;
        }

        // Create junction record with version ID
        const collectionArtifact = await md.GetEntityObject<CollectionArtifactEntity>('MJ: Collection Artifacts', this.currentUser);
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
   * Load links data: origin conversation and all collections containing this artifact
   */
  private async loadLinksData(): Promise<void> {
    if (!this.artifactId) return;

    // Clear old links data first to prevent stale data from previous artifact
    this.clearLinksData();

    try {
      const md = new Metadata();
      const rv = new RunView();

      // Load all collections containing any version of this artifact
      const collArtifactsResult = await rv.RunView<CollectionArtifactEntity>({
        EntityName: 'MJ: Collection Artifacts',
        ExtraFilter: `ArtifactVersionID IN (
          SELECT ID FROM [__mj].[vwArtifactVersions] WHERE ArtifactID='${this.artifactId}'
        )`,
        ResultType: 'entity_object'
      }, this.currentUser);

      if (collArtifactsResult.Success && collArtifactsResult.Results) {
        // Get unique collection IDs
        const collectionIds = [...new Set(collArtifactsResult.Results.map(ca => ca.CollectionID))];

        if (collectionIds.length > 0) {
          const collectionsFilter = collectionIds.map(id => `ID='${id}'`).join(' OR ');
          const collectionsResult = await rv.RunView<CollectionEntity>({
            EntityName: 'MJ: Collections',
            ExtraFilter: collectionsFilter,
            ResultType: 'entity_object'
          }, this.currentUser);

          if (collectionsResult.Success && collectionsResult.Results) {
            this.allCollections = collectionsResult.Results;
          }
        }
      }

      // Load origin conversation (if artifact came from conversation)
      // Artifacts are linked to conversations via ConversationDetailArtifact -> ConversationDetail -> Conversation
      // Get all version IDs for this artifact
      const versionIds = this.allVersions.map(v => v.ID);

      if (versionIds.length > 0) {
        const versionFilter = versionIds.map(id => `ArtifactVersionID='${id}'`).join(' OR ');
        const convDetailArtifactsResult = await rv.RunView<ConversationDetailArtifactEntity>({
          EntityName: 'MJ: Conversation Detail Artifacts',
          ExtraFilter: versionFilter,
          MaxRows: 1,
          ResultType: 'entity_object'
        }, this.currentUser);

        if (convDetailArtifactsResult.Success && convDetailArtifactsResult.Results && convDetailArtifactsResult.Results.length > 0) {
          const conversationDetailId = convDetailArtifactsResult.Results[0].ConversationDetailID;
          const artifactVersionId = convDetailArtifactsResult.Results[0].ArtifactVersionID;

          // Store which version came from the origin conversation
          this.originConversationVersionId = artifactVersionId;

          // Load the conversation detail to get the conversation ID
          const conversationDetail = await md.GetEntityObject<ConversationDetailEntity>('Conversation Details', this.currentUser);
          const detailLoaded = await conversationDetail.Load(conversationDetailId);

          if (detailLoaded && conversationDetail.ConversationID) {
            const conversation = await md.GetEntityObject<ConversationEntity>('Conversations', this.currentUser);
            const loaded = await conversation.Load(conversationDetail.ConversationID);

            if (loaded) {
              this.originConversation = conversation;

              // Check if user has access (is owner or participant)
              const userIsOwner = conversation.UserID === this.currentUser.ID;

              // Check if user is a participant
              const participantResult = await rv.RunView({
                EntityName: 'Conversation Details',
                ExtraFilter: `ConversationID='${conversation.ID}' AND UserID='${this.currentUser.ID}'`,
                MaxRows: 1,
                ResultType: 'simple'
              }, this.currentUser);

              const userIsParticipant = participantResult.Success &&
                                         participantResult.Results &&
                                         participantResult.Results.length > 0;

              this.hasAccessToOriginConversation = userIsOwner || userIsParticipant;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading links data:', error);
    }
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
   * Resolves the DriverClass for an artifact type by traversing up the parent hierarchy.
   * Returns the first DriverClass found, or null if none found in the hierarchy.
   */
  private async resolveDriverClassForType(artifactType: ArtifactTypeEntity): Promise<string | null> {
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
  private async getArtifactTypeById(id: string): Promise<ArtifactTypeEntity | null> {
    try {
      const md = new Metadata();
      const artifactType = await md.GetEntityObject<ArtifactTypeEntity>('MJ: Artifact Types', this.currentUser);
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

      const md = new Metadata();
      const usage = await md.GetEntityObject<ArtifactUseEntity>('MJ: Artifact Uses');

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
  public getArtifactIcon(): string {
    if (!this.artifact) return 'fa-file';
    return this.artifactIconService.getArtifactIcon(this.artifact);
  }
}
