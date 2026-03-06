import { Component, ViewEncapsulation } from '@angular/core';
import { Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
/**
 * Artifact Resource - displays versioned content artifacts
 * Wraps the artifact-viewer-panel component for tab-based display
 * Supports reports, dashboards, forms, and other artifact types
 */
@RegisterClass(BaseResourceComponent, 'ArtifactResource')
@Component({
  standalone: false,
  selector: 'mj-artifact-resource',
  template: `
    <div class="artifact-container">
      @if (currentUser && artifactId) {
        <mj-artifact-viewer-panel
          [artifactId]="artifactId"
          [currentUser]="currentUser"
          [environmentId]="environmentId"
          [showSaveToCollection]="true"
          [canShare]="true"
          [canEdit]="true">
        </mj-artifact-viewer-panel>
      }
    </div>
    `,
  styles: [`
    .artifact-container {
      display: flex;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
  `],
  encapsulation: ViewEncapsulation.None
})
export class ArtifactResource extends BaseResourceComponent {
  public currentUser: any = null;
  public artifactId: string = '';
  public environmentId: string = '';

  ngOnInit() {
    const md = new Metadata();
    this.currentUser = md.CurrentUser;

    // Get artifact ID from resource data
    if (this.Data && this.Data.ResourceRecordID) {
      this.artifactId = this.Data.ResourceRecordID;
    }

    // Get environment ID (default to empty string if not available)
    this.environmentId = '';  // TODO: Get from configuration if needed

    setTimeout(() => this.NotifyLoadComplete(), 100);
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    // Try to load artifact name from database
    if (data.ResourceRecordID) {
      try {
        const md = new Metadata();
        const artifact = await md.GetEntityObject<any>('MJ: Conversation Artifacts');
        await artifact.Load(data.ResourceRecordID);
        return artifact.Name || `Artifact - ${data.ResourceRecordID}`;
      } catch (error) {
        console.error('Error loading artifact name:', error);
      }
    }
    return 'Artifact';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-file-code';
  }
}
