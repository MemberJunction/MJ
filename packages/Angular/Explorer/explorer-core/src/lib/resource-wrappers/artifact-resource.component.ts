import { Component, ViewEncapsulation, inject } from '@angular/core';
import { DataSnapshot, Metadata, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData, MJEnvironmentEntityExtended } from '@memberjunction/core-entities';
import { AnalyzeArtifactService, InteractiveFormApplyService } from '@memberjunction/ng-artifacts';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import { MJNotificationService } from '@memberjunction/ng-notifications';

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
          [canEdit]="true"
          (analyzeRequested)="onAnalyzeRequested($event)"
          (applyFormRequested)="onApplyFormRequested($event)">
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
  private readonly analyzeService = inject(AnalyzeArtifactService);
  private readonly applyService = inject(InteractiveFormApplyService);

  /**
   * Apply-to-my-form handler — see InteractiveFormApplyService.
   * Confirms with the user, then routes to Create or Modify depending on
   * whether an Active override already exists for this entity+user.
   */
  async onApplyFormRequested(event: { spec: unknown; entityName: string }): Promise<void> {
    await this.applyService.ConfirmAndApply(
      event.spec as ComponentSpec,
      event.entityName,
      this.ProviderToUse,
    );
  }

  public currentUser: UserInfo | null = null;
  public artifactId: string = '';
  public environmentId: string = '';

  ngOnInit() {
    super.ngOnInit();
    const md = this.ProviderToUse;
    this.currentUser = md.CurrentUser;

    // Get artifact ID from resource data
    if (this.Data && this.Data.ResourceRecordID) {
      this.artifactId = this.Data.ResourceRecordID;
    }

    // Environment ID — use the configured environment if present, otherwise
    // fall back to the default environment. Must be a valid UUID since
    // downstream saves (e.g. AnalyzeArtifactService creating artifacts)
    // require a non-empty EnvironmentID.
    this.environmentId = (this.Data?.Configuration?.['environmentId'] as string | undefined)
        || MJEnvironmentEntityExtended.DefaultEnvironmentID;

    setTimeout(() => this.NotifyLoadComplete(), 100);
  }

  /**
   * Handler for the Analyze button on the artifact viewer panel.
   * Creates a Data Snapshot artifact from the live viewer state, opens a
   * new conversation with it attached as input, and routes the user there.
   */
  async onAnalyzeRequested(event: { artifactId: string; snapshot: DataSnapshot }): Promise<void> {
    if (!this.currentUser) return;

    try {
      const result = await this.analyzeService.StartAnalysisConversation({
        snapshot: event.snapshot,
        currentUser: this.currentUser,
        environmentId: this.environmentId,
      });

      // Route to the new conversation in the Conversations nav item
      await this.navigationService.OpenNavItemByName('Conversations', {
        conversationId: result.conversationId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start analysis conversation';
      MJNotificationService.Instance.CreateSimpleNotification(message, 'error', 5000);
    }
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    // Try to load artifact name from database
    if (data.ResourceRecordID) {
      try {
        const md = this.ProviderToUse;
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
