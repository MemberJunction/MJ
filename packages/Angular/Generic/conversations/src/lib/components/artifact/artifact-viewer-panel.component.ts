import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { UserInfo, Metadata, RunView } from '@memberjunction/core';
import { ArtifactEntity, ArtifactVersionEntity } from '@memberjunction/core-entities';
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
  @Input() initialVersionNumber?: number; // Version to load on init
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

    // Load artifact with initial version number if provided
    await this.loadArtifact(this.initialVersionNumber);
  }

  async ngOnChanges(changes: SimpleChanges) {
    // Reload artifact when artifactId changes
    if (changes['artifactId'] && !changes['artifactId'].firstChange) {
      await this.loadArtifact();
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

  onCopyToClipboard(): void {
    if (this.jsonContent) {
      navigator.clipboard.writeText(this.jsonContent);
    }
  }

  toggleVersionDropdown(): void {
    if (this.allVersions.length > 1) {
      this.showVersionDropdown = !this.showVersionDropdown;
    }
  }

  selectVersion(version: ArtifactVersionEntity): void {
    this.artifactVersion = version;
    this.selectedVersionNumber = version.VersionNumber || 1;
    this.jsonContent = version.Content || '{}';
    this.showVersionDropdown = false;
    console.log(`📦 Switched to version ${this.selectedVersionNumber}`);
  }

  onClose(): void {
    this.closed.emit();
  }
}
