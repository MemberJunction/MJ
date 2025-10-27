import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges, ViewChild, SecurityContext } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { UserInfo, Metadata, RunView, LogError } from '@memberjunction/core';
import { ParseJSONRecursive, ParseJSONOptions } from '@memberjunction/global';
import { ArtifactEntity, ArtifactVersionEntity, ArtifactVersionAttributeEntity, ArtifactTypeEntity, CollectionEntity, CollectionArtifactEntity, ArtifactMetadataEngine, ConversationEntity, ConversationDetailArtifactEntity, ConversationDetailEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ArtifactTypePluginViewerComponent } from './artifact-type-plugin-viewer.component';
import { ArtifactViewerTab } from './base-artifact-viewer.component';
import { marked } from 'marked';

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
  @Input() refreshTrigger?: Subject<{artifactId: string; versionNumber: number}>;
  @Input() viewContext: 'conversation' | 'collection' | null = null; // Where artifact is being viewed
  @Input() contextCollectionId?: string; // If viewing in collection, which collection
  @Input() canShare?: boolean; // Whether user can share this artifact
  @Input() canEdit?: boolean; // Whether user can edit this artifact
  @Output() closed = new EventEmitter<void>();
  @Output() saveToCollectionRequested = new EventEmitter<{artifactId: string; excludedCollectionIds: string[]}>();
  @Output() navigateToLink = new EventEmitter<{type: 'conversation' | 'collection'; id: string}>();
  @Output() shareRequested = new EventEmitter<string>(); // Emits artifactId when share is clicked

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
  public artifactCollections: CollectionArtifactEntity[] = [];
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

  // Dynamic tabs from plugin
  public get allTabs(): string[] {
    // Start with Display tab (cannot be removed)
    const tabs = ['Display'];

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

    // Always add Links tab (unless plugin explicitly removes it)
    if (!removalsLower.includes('links')) {
      tabs.push('Links');
    }

    return tabs;
  }

  public GetTabContent(tabName: string): { type: string; content: string; language?: string } | null {
    // Check if this is a plugin-provided tab (query directly from plugin - no cache needed)
    if (this.pluginViewer?.pluginInstance?.GetAdditionalTabs) {
      const pluginTabs = this.pluginViewer.pluginInstance.GetAdditionalTabs();
      const pluginTab = pluginTabs.find((t: ArtifactViewerTab) =>
        t.label.toLowerCase() === tabName.toLowerCase()
      );

      if (pluginTab) {
        const content = typeof pluginTab.content === 'function'
          ? pluginTab.content()
          : pluginTab.content;

        return {
          type: pluginTab.contentType,
          content: content,
          language: pluginTab.language
        };
      }
    }

    // Handle base tabs
    switch (tabName.toLowerCase()) {
      case 'json':
        return { type: 'json', content: this.jsonContent, language: 'json' };
      case 'details':
        return { type: 'html', content: this.displayMarkdown || this.displayHtml || '' };
      default:
        return null;
    }
  }

  constructor(
    private notificationService: MJNotificationService,
    private sanitizer: DomSanitizer
  ) {}

  async ngOnInit() {
    // Subscribe to refresh trigger for dynamic version changes
    if (this.refreshTrigger) {
      this.refreshTrigger.pipe(takeUntil(this.destroy$)).subscribe(async (data) => {
        if (data.artifactId === this.artifactId) {
          console.log(`📦 Refreshing artifact viewer to version ${data.versionNumber}`);
          // Reload all versions to get any new ones
          await this.loadArtifact(data.versionNumber);
        }
      });
    }

    // Load artifact with specified version if provided
    await this.loadArtifact(this.versionNumber);
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
        console.log(`📦 Version number changed to ${newVersionNumber}, switching version`);
        // Check if we already have this version loaded (avoid reload if possible)
        const targetVersion = this.allVersions.find(v => v.VersionNumber === newVersionNumber);
        if (targetVersion) {
          // Just switch to the version we already have
          this.artifactVersion = targetVersion;
          this.selectedVersionNumber = targetVersion.VersionNumber || 1;
          this.jsonContent = this.FormatJSON(targetVersion.Content || '{}');

          console.log(`📦 Switched to cached version ${this.selectedVersionNumber}`);

          // Load version attributes
          await this.loadVersionAttributes();
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
            console.log(`📦 Loading specified version ${targetVersionNumber}`);
            this.artifactVersion = targetVersion;
            this.selectedVersionNumber = targetVersion.VersionNumber || 1;
            this.jsonContent = this.FormatJSON(targetVersion.Content || '{}');
          } else {
            console.warn(`📦 Version ${targetVersionNumber} not found, defaulting to latest`);
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

        console.log(`📦 Loaded ${this.allVersions.length} versions for artifact ${this.artifactId}, showing v${this.selectedVersionNumber}`);
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
        console.log(`📦 Loaded artifact type "${this.artifact.Type}", DriverClass: ${this.artifactTypeDriverClass || 'none'}`);
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

        // Default to display tab if we have a plugin or extracted display content
        // Otherwise default to JSON tab for JSON types, or Details tab as last resort
        if (this.hasDisplayTab) {
          this.activeTab = 'display';
        } else if (this.jsonContent) {
          this.activeTab = 'json';
        } else {
          this.activeTab = 'details';
        }

        console.log(`📦 Loaded ${this.versionAttributes.length} attributes, displayMarkdown=${!!this.displayMarkdown}, displayHtml=${!!this.displayHtml}, hasDisplayTab=${this.hasDisplayTab}, activeTab=${this.activeTab}`);
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
    // 1. We have a plugin for this artifact type (check if artifact type exists), OR
    // 2. We have displayMarkdown or displayHtml attributes from extract rules
    return this.hasPlugin || !!this.displayMarkdown || !!this.displayHtml;
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
      const result = await rv.RunView<CollectionArtifactEntity>({
        EntityName: 'MJ: Collection Artifacts',
        ExtraFilter: `ArtifactID='${this.artifactId}'`,
        ResultType: 'entity_object'
      }, this.currentUser);

      if (result.Success && result.Results) {
        this.artifactCollections = result.Results;

        // Load the primary collection details if exists
        if (this.artifactCollections.length > 0) {
          const collectionId = this.artifactCollections[0].CollectionID;
          const md = new Metadata();
          this.primaryCollection = await md.GetEntityObject<CollectionEntity>('MJ: Collections', this.currentUser);
          await this.primaryCollection.Load(collectionId);

          console.log(`📦 Artifact is in ${this.artifactCollections.length} collection(s)`);
        } else {
          this.primaryCollection = null;
        }
      }
    } catch (err) {
      console.error('Error loading collection associations:', err);
    }
  }

  get isInCollection(): boolean {
    return this.artifactCollections.length > 0;
  }

  onCopyToClipboard(): void {
    if (this.jsonContent) {
      navigator.clipboard.writeText(this.jsonContent);
    }
  }

  onCopyDisplayContent(): void {
    const content = this.displayHtml || this.displayMarkdown;
    if (content) {
      navigator.clipboard.writeText(content).then(() => {
        console.log('✅ Copied display content to clipboard');
      }).catch(err => {
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
    // Return IDs of collections that already contain this artifact
    return this.artifactCollections.map(ca => ca.CollectionID);
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

      // Save artifact to each selected collection
      for (const collectionId of collectionIds) {
        // Double check it doesn't already exist
        const rv = new RunView();
        const existingResult = await rv.RunView<CollectionArtifactEntity>({
          EntityName: 'MJ: Collection Artifacts',
          ExtraFilter: `CollectionID='${collectionId}' AND ArtifactID='${this.artifactId}'`,
          ResultType: 'entity_object'
        }, this.currentUser);

        if (existingResult.Success && existingResult.Results && existingResult.Results.length > 0) {
          console.log(`Artifact already in collection ${collectionId}, skipping`);
          continue;
        }

        // Create junction record
        const collectionArtifact = await md.GetEntityObject<CollectionArtifactEntity>('MJ: Collection Artifacts', this.currentUser);
        collectionArtifact.CollectionID = collectionId;
        collectionArtifact.ArtifactID = this.artifactId;
        collectionArtifact.Sequence = 0;

        const saved = await collectionArtifact.Save();
        if (saved) {
          successCount++;
        } else {
          console.error(`Failed to save artifact to collection ${collectionId}`);
        }
      }

      if (successCount > 0) {
        console.log(`✅ Saved artifact to ${successCount} collection(s)`);
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

    try {
      const md = new Metadata();
      const rv = new RunView();

      // Load all collections containing this artifact
      const collArtifactsResult = await rv.RunView<CollectionArtifactEntity>({
        EntityName: 'MJ: Collection Artifacts',
        ExtraFilter: `ArtifactID='${this.artifactId}'`,
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

      console.log(`🔗 Loaded links: ${this.allCollections.length} collections, origin conversation: ${this.originConversation?.Name || 'none'}, viewContext: ${this.viewContext}`);
    } catch (error) {
      console.error('Error loading links data:', error);
    }
  }

  get linksToShow(): Array<{type: 'conversation' | 'collection'; id: string; name: string; hasAccess: boolean}> {
    const links: Array<{type: 'conversation' | 'collection'; id: string; name: string; hasAccess: boolean}> = [];

    // Add origin conversation if viewing in collection
    if (this.viewContext === 'collection' && this.originConversation) {
      links.push({
        type: 'conversation',
        id: this.originConversation.ID,
        name: this.originConversation.Name || 'Untitled Conversation',
        hasAccess: this.hasAccessToOriginConversation
      });
    }

    // Add all collections (excluding current context if applicable)
    for (const collection of this.allCollections) {
      if (this.viewContext === 'collection' && collection.ID === this.contextCollectionId) {
        // Skip current collection
        continue;
      }

      links.push({
        type: 'collection',
        id: collection.ID,
        name: collection.Name,
        hasAccess: true // User can see it, so they have access
      });
    }

    return links;
  }

  /**
   * Navigate to a linked conversation or collection
   */
  onNavigateToLink(link: {type: 'conversation' | 'collection'; id: string; name: string; hasAccess: boolean}): void {
    if (!link.hasAccess) {
      return;
    }

    this.navigateToLink.emit({
      type: link.type,
      id: link.id
    });
  }

  onClose(): void {
    this.closed.emit();
  }

  onShare(): void {
    this.shareRequested.emit(this.artifactId);
  }

  /**
   * Resolves the DriverClass for an artifact type by traversing up the parent hierarchy.
   * Returns the first DriverClass found, or null if none found in the hierarchy.
   */
  private async resolveDriverClassForType(artifactType: ArtifactTypeEntity): Promise<string | null> {
    // Check if current artifact type has a DriverClass
    if (artifactType.DriverClass) {
      console.log(`✅ Found DriverClass '${artifactType.DriverClass}' on artifact type '${artifactType.Name}'`);
      return artifactType.DriverClass;
    }

    // No DriverClass on current type - check if it has a parent
    if (artifactType.ParentID) {
      console.log(`🔍 No DriverClass on '${artifactType.Name}', checking parent...`);
      const parentType = await this.getArtifactTypeById(artifactType.ParentID);

      if (parentType) {
        // Recursively check parent
        return await this.resolveDriverClassForType(parentType);
      } else {
        console.warn(`⚠️ Parent artifact type '${artifactType.ParentID}' not found`);
      }
    }

    // Reached root with no DriverClass
    console.log(`❌ No DriverClass found in hierarchy for '${artifactType.Name}'`);
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
   * Render markdown to HTML (for markdown tabs)
   */
  public RenderMarkdown(markdown: string): SafeHtml {
    try {
      const html = marked.parse(markdown);
      return this.sanitizer.sanitize(SecurityContext.HTML, html) || '';
    } catch (e) {
      console.error('Failed to render markdown:', e);
      return markdown;
    }
  }

  /**
   * Set active tab
   */
  public SetActiveTab(tabName: string): void {
    this.activeTab = tabName.toLowerCase();
  }
}
