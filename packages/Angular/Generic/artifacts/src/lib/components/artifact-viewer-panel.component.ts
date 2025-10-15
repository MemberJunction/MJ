import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { UserInfo, Metadata, RunView, LogError } from '@memberjunction/core';
import { ArtifactEntity, ArtifactVersionEntity, ArtifactVersionAttributeEntity, ArtifactTypeEntity, CollectionEntity, CollectionArtifactEntity, ArtifactMetadataEngine } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ArtifactTypePluginViewerComponent } from './artifact-type-plugin-viewer.component';

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
  @Output() closed = new EventEmitter<void>();

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
  public showLibraryDialog = false;
  public collections: CollectionEntity[] = [];
  public selectedCollectionId: string | null = null;
  public newCollectionName = '';
  public isCreatingCollection = false;
  public isSavingToLibrary = false;
  public artifactCollections: CollectionArtifactEntity[] = [];
  public primaryCollection: CollectionEntity | null = null;

  // Tabbed interface
  public activeTab: 'display' | 'json' | 'details' = 'display';
  public displayMarkdown: string | null = null;
  public displayHtml: string | null = null;
  public versionAttributes: ArtifactVersionAttributeEntity[] = [];
  private artifactTypeDriverClass: string | null = null;

  // Cache plugin state to avoid losing it when switching tabs
  private cachedPluginShouldShowRaw: boolean = false;
  private cachedPluginIsElevated: boolean = false;

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
          this.jsonContent = targetVersion.Content || '{}';

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

      // Reset cached plugin state when loading new artifact
      this.cachedPluginShouldShowRaw = false;
      this.cachedPluginIsElevated = false;

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
            this.jsonContent = targetVersion.Content || '{}';
          } else {
            console.warn(`📦 Version ${targetVersionNumber} not found, defaulting to latest`);
            // Target version not found, default to latest
            this.artifactVersion = result.Results[0];
            this.selectedVersionNumber = this.artifactVersion.VersionNumber || 1;
            this.jsonContent = this.artifactVersion.Content || '{}';
          }
        } else {
          // No target version, default to latest version (first in DESC order)
          this.artifactVersion = result.Results[0];
          this.selectedVersionNumber = this.artifactVersion.VersionNumber || 1;
          this.jsonContent = this.artifactVersion.Content || '{}';
        }

        // Load version attributes
        await this.loadVersionAttributes();

        // Load collection associations
        await this.loadCollectionAssociations();

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
    // Try to get fresh plugin state if plugin viewer is available
    const pluginInstance = this.pluginViewer?.pluginInstance;
    if (pluginInstance) {
      // Update cache with current values
      this.cachedPluginShouldShowRaw = pluginInstance.parentShouldShowRawContent;
      this.cachedPluginIsElevated = pluginInstance.isShowingElevatedDisplay;
    }

    // Use cached value (or current value if plugin is available)
    // This ensures the JSON tab doesn't disappear when switching to it
    return this.cachedPluginShouldShowRaw;
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

  setActiveTab(tab: 'display' | 'json' | 'details'): void {
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
    const content = this.displayMarkdown || this.displayHtml;
    if (content) {
      navigator.clipboard.writeText(content).then(() => {
        console.log('✅ Copied display content to clipboard');
      }).catch(err => {
        console.error('Failed to copy to clipboard:', err);
      });
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
    this.jsonContent = version.Content || '{}';
    this.showVersionDropdown = false;

    // Load attributes for the selected version
    await this.loadVersionAttributes();

    console.log(`📦 Switched to version ${this.selectedVersionNumber}`);
  }

  async onSaveToLibrary(): Promise<void> {
    // If already in a collection, navigate to that collection
    if (this.isInCollection && this.primaryCollection) {
      // TODO: Implement navigation to collection view
      // For now, just log - will need ConversationStateService or similar to navigate
      console.log('Navigate to collection:', this.primaryCollection.Name, this.primaryCollection.ID);
      MJNotificationService.Instance.CreateSimpleNotification(
        `This artifact is saved in collection: ${this.primaryCollection.Name}`,
        'info',
        3000
      );
      return;
    }

    // If not in a collection, show the save dialog
    try {
      // Load user's collections
      const rv = new RunView();
      const result = await rv.RunView<CollectionEntity>({
        EntityName: 'MJ: Collections',
        ExtraFilter: `EnvironmentID='${this.environmentId}'`,
        OrderBy: 'Name',
        ResultType: 'entity_object'
      }, this.currentUser);

      if (result.Success) {
        this.collections = result.Results || [];
        this.showLibraryDialog = true;
      } else {
        console.error('Failed to load collections:', result.ErrorMessage);
        MJNotificationService.Instance.CreateSimpleNotification(
          'Failed to load collections. Please try again.',
          'error'
        );
      }
    } catch (err) {
      console.error('Error loading collections:', err);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error loading collections. Please try again.',
        'error'
      );
    }
  }

  async createNewCollection(): Promise<void> {
    if (!this.newCollectionName.trim()) {
      MJNotificationService.Instance.CreateSimpleNotification(
        'Please enter a collection name',
        'warning',
        2000
      );
      return;
    }

    try {
      this.isCreatingCollection = true;
      const md = new Metadata();
      const collection = await md.GetEntityObject<CollectionEntity>('MJ: Collections', this.currentUser);

      collection.EnvironmentID = this.environmentId;
      collection.Name = this.newCollectionName.trim();
      collection.Description = 'Created from conversation';

      const saved = await collection.Save();

      if (saved) {
        this.collections.push(collection);
        this.selectedCollectionId = collection.ID;
        this.newCollectionName = '';
        console.log('✅ Created new collection:', collection.Name);
        MJNotificationService.Instance.CreateSimpleNotification(
          `Collection "${collection.Name}" created successfully!`,
          'success',
          3000
        );
      } else {
        MJNotificationService.Instance.CreateSimpleNotification(
          'Failed to create collection. Please try again.',
          'error'
        );
      }
    } catch (err) {
      console.error('Error creating collection:', err);
      LogError(err);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error creating collection. Please try again.',
        'error'
      );
    } finally {
      this.isCreatingCollection = false;
    }
  }

  async saveToSelectedCollection(): Promise<void> {
    if (!this.selectedCollectionId) {
      MJNotificationService.Instance.CreateSimpleNotification(
        'Please select a collection',
        'warning',
        2000
      );
      return;
    }

    if (!this.artifactId) {
      MJNotificationService.Instance.CreateSimpleNotification(
        'No artifact to save',
        'error'
      );
      return;
    }

    try {
      this.isSavingToLibrary = true;

      // Check if artifact already exists in this collection
      const rv = new RunView();
      const existingResult = await rv.RunView<CollectionArtifactEntity>({
        EntityName: 'MJ: Collection Artifacts',
        ExtraFilter: `CollectionID='${this.selectedCollectionId}' AND ArtifactID='${this.artifactId}'`,
        ResultType: 'entity_object'
      }, this.currentUser);

      if (existingResult.Success && existingResult.Results && existingResult.Results.length > 0) {
        MJNotificationService.Instance.CreateSimpleNotification(
          'This artifact is already in the selected collection',
          'info',
          3000
        );
        this.showLibraryDialog = false;
        return;
      }

      // Create junction record
      const md = new Metadata();
      const collectionArtifact = await md.GetEntityObject<CollectionArtifactEntity>('MJ: Collection Artifacts', this.currentUser);

      collectionArtifact.CollectionID = this.selectedCollectionId;
      collectionArtifact.ArtifactID = this.artifactId;
      collectionArtifact.Sequence = 0; // Could calculate max sequence + 1 if needed

      const saved = await collectionArtifact.Save();

      if (saved) {
        const collectionName = this.collections.find(c => c.ID === this.selectedCollectionId)?.Name || 'collection';
        console.log(`✅ Saved artifact to ${collectionName}`);
        MJNotificationService.Instance.CreateSimpleNotification(
          `Artifact saved to ${collectionName} successfully!`,
          'success',
          3000
        );
        this.showLibraryDialog = false;
        this.selectedCollectionId = null;

        // Reload collection associations to update the bookmark icon state
        await this.loadCollectionAssociations();
      } else {
        MJNotificationService.Instance.CreateSimpleNotification(
          'Failed to save artifact to collection. Please try again.',
          'error'
        );
      }
    } catch (err) {
      console.error('Error saving to collection:', err);
      LogError(err);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error saving artifact to collection. Please try again.',
        'error'
      );
    } finally {
      this.isSavingToLibrary = false;
    }
  }

  cancelLibraryDialog(): void {
    this.showLibraryDialog = false;
    this.selectedCollectionId = null;
    this.newCollectionName = '';
  }

  onClose(): void {
    this.closed.emit();
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
}
