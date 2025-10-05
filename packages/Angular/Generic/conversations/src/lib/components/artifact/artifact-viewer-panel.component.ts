import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { UserInfo, Metadata, RunView } from '@memberjunction/core';
import { ArtifactEntity, ArtifactVersionEntity } from '@memberjunction/core-entities';

@Component({
  selector: 'mj-artifact-viewer-panel',
  templateUrl: './artifact-viewer-panel.component.html',
  styleUrls: ['./artifact-viewer-panel.component.css']
})
export class ArtifactViewerPanelComponent implements OnInit {
  @Input() artifactId!: string;
  @Input() currentUser!: UserInfo;

  public artifact: ArtifactEntity | null = null;
  public artifactVersion: ArtifactVersionEntity | null = null;
  public isLoading = true;
  public error: string | null = null;
  public jsonContent = '';

  async ngOnInit() {
    await this.loadArtifact();
  }

  private async loadArtifact(): Promise<void> {
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

      // Load latest version
      const rv = new RunView();
      const result = await rv.RunView<ArtifactVersionEntity>({
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: `ArtifactID='${this.artifactId}'`,
        OrderBy: 'VersionNumber DESC',
        ResultType: 'entity_object'
      }, this.currentUser);

      if (result.Success && result.Results && result.Results.length > 0) {
        this.artifactVersion = result.Results[0];
        this.jsonContent = this.artifactVersion.Content || '{}';
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
}
