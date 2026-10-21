import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ArtifactsModule } from '@memberjunction/ng-artifacts';
import {
  ArtifactCollectionPickerModalComponent,
  ArtifactShareModalComponent,
} from '@memberjunction/ng-conversations';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import {
  MJAlertComponent,
  MJButtonDirective,
  MJDialogActionsComponent,
  MJDialogComponent,
  MJDropdownComponent,
  MJFilterFieldComponent,
  MJFilterPanelComponent,
  MJFilterPopoverComponent,
  MJNumericInputComponent,
  MJPageBodyComponent,
  MJPageHeaderComponent,
  MJPageLayoutComponent,
  MJPageSearchComponent,
  MJRefreshButtonComponent,
  MJStatBadgeComponent,
} from '@memberjunction/ng-ui-components';
import { VSCopilotPanelComponent } from './VideoStudio/components/vs-copilot-panel.component';
import { VSSetupHealthCardComponent } from './VideoStudio/components/vs-setup-health-card.component';
import { VideoStudioArchetypesResourceComponent } from './VideoStudio/resources/video-studio-archetypes-resource.component';
import { VideoStudioBrandKitsResourceComponent } from './VideoStudio/resources/video-studio-brand-kits-resource.component';
import { VideoStudioProductionsResourceComponent } from './VideoStudio/resources/video-studio-productions-resource.component';
import { VideoStudioStudioResourceComponent } from './VideoStudio/resources/video-studio-studio-resource.component';

/**
 * VideoStudioDashboardsModule — feature module providing the Video Studio
 * application resource components:
 * - `VideoStudioProductionsResourceComponent` (`VideoStudioProductionsResource`)
 * - `VideoStudioStudioResourceComponent` (`VideoStudioStudioResource`)
 * - `VideoStudioBrandKitsResourceComponent` (`VideoStudioBrandKitsResource`)
 * - `VideoStudioArchetypesResourceComponent` (`VideoStudioArchetypesResource`)
 */
@NgModule({
  declarations: [
    VideoStudioProductionsResourceComponent,
    VideoStudioStudioResourceComponent,
    VideoStudioBrandKitsResourceComponent,
    VideoStudioArchetypesResourceComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    SharedGenericModule,
    ArtifactsModule,
    ArtifactShareModalComponent,
    ArtifactCollectionPickerModalComponent,
    VSCopilotPanelComponent,
    VSSetupHealthCardComponent,
    MJAlertComponent,
    MJButtonDirective,
    MJDialogComponent,
    MJDialogActionsComponent,
    MJDropdownComponent,
    MJNumericInputComponent,
    MJPageLayoutComponent,
    MJPageHeaderComponent,
    MJPageBodyComponent,
    MJPageSearchComponent,
    MJFilterPopoverComponent,
    MJFilterPanelComponent,
    MJFilterFieldComponent,
    MJRefreshButtonComponent,
    MJStatBadgeComponent,
  ],
  exports: [
    VideoStudioProductionsResourceComponent,
    VideoStudioStudioResourceComponent,
    VideoStudioBrandKitsResourceComponent,
    VideoStudioArchetypesResourceComponent,
    VSCopilotPanelComponent,
    VSSetupHealthCardComponent,
  ],
})
export class VideoStudioDashboardsModule {}

export {
  VideoStudioProductionsResourceComponent,
  VideoStudioStudioResourceComponent,
  VideoStudioBrandKitsResourceComponent,
  VideoStudioArchetypesResourceComponent,
  VSCopilotPanelComponent,
  VSSetupHealthCardComponent,
};


