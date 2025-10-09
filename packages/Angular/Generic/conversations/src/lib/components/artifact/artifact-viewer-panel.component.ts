import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { UserInfo, Metadata, RunView, LogError } from '@memberjunction/core';
import { ArtifactEntity, ArtifactVersionEntity, ArtifactVersionAttributeEntity, CollectionEntity, CollectionArtifactEntity } from '@memberjunction/core-entities';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

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
  @Input() refreshTrigger?: Subject<{artifactId: string; versionNumber: number}>;
  @Output() closed = new EventEmitter<void>();

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

  // Tabbed interface
  public activeTab: 'display' | 'json' | 'details' = 'display';
  public displayMarkdown: string | null = null;
  public displayHtml: string | null = null;
  public versionAttributes: ArtifactVersionAttributeEntity[] = [];

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

      const md = new Metadata();

      // Load artifact
      this.artifact = await md.GetEntityObject<ArtifactEntity>('MJ: Artifacts', this.currentUser);
      const loaded = await this.artifact.Load(this.artifactId);

      if (!loaded) {
        this.error = 'Failed to load artifact';
        return;
      }

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

        // Set default tab based on available display attributes
        if (this.displayMarkdown || this.displayHtml) {
          this.activeTab = 'display';
        } else if (this.artifact?.Type?.toLowerCase() === 'json' || this.jsonContent) {
          this.activeTab = 'json';
        } else {
          this.activeTab = 'details';
        }

        console.log(`📦 Loaded ${this.versionAttributes.length} attributes, displayMarkdown=${!!this.displayMarkdown}, displayHtml=${!!this.displayHtml}, activeTab=${this.activeTab}`);
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
    return !!(this.displayMarkdown || this.displayHtml);
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
        alert('Failed to load collections. Please try again.');
      }
    } catch (err) {
      console.error('Error loading collections:', err);
      alert('Error loading collections. Please try again.');
    }
  }

  async createNewCollection(): Promise<void> {
    if (!this.newCollectionName.trim()) {
      alert('Please enter a collection name');
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
      } else {
        alert('Failed to create collection. Please try again.');
      }
    } catch (err) {
      console.error('Error creating collection:', err);
      LogError(err);
      alert('Error creating collection. Please try again.');
    } finally {
      this.isCreatingCollection = false;
    }
  }

  async saveToSelectedCollection(): Promise<void> {
    if (!this.selectedCollectionId) {
      alert('Please select a collection');
      return;
    }

    if (!this.artifactId) {
      alert('No artifact to save');
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
        alert('This artifact is already in the selected collection');
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
        alert(`Artifact saved to ${collectionName} successfully!`);
        this.showLibraryDialog = false;
        this.selectedCollectionId = null;
      } else {
        alert('Failed to save artifact to collection. Please try again.');
      }
    } catch (err) {
      console.error('Error saving to collection:', err);
      LogError(err);
      alert('Error saving artifact to collection. Please try again.');
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
}
