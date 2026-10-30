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
  MJDatepickerComponent,
  MJDialogActionsComponent,
  MJDialogComponent,
  MJDropdownComponent,
  MJEmptyStateComponent,
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
import { VSAudioOptionsComponent } from './VideoStudio/components/vs-audio-options.component';
import { VSCopilotPanelComponent } from './VideoStudio/components/vs-copilot-panel.component';
import { VSProductionBriefComponent } from './VideoStudio/components/vs-production-brief.component';
import { VSSetupHealthCardComponent } from './VideoStudio/components/vs-setup-health-card.component';
import { VSStudioSlideInComponent } from './VideoStudio/components/vs-studio-slide-in.component';
import { VideoStudioArchetypesResourceComponent } from './VideoStudio/resources/video-studio-archetypes-resource.component';
import { VideoStudioBrandKitsResourceComponent } from './VideoStudio/resources/video-studio-brand-kits-resource.component';
import { VideoStudioProductionsResourceComponent } from './VideoStudio/resources/video-studio-productions-resource.component';

/**
 * VideoStudioDashboardsModule — feature module providing the Video Studio
 * application resource components:
 * - `VideoStudioProductionsResourceComponent` (`VideoStudioProductionsResource`)
 * - `VideoStudioBrandKitsResourceComponent` (`VideoStudioBrandKitsResource`)
 * - `VideoStudioArchetypesResourceComponent` (`VideoStudioArchetypesResource`)
 */
@NgModule({
  declarations: [
    VideoStudioProductionsResourceComponent,
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
    VSAudioOptionsComponent,
    VSProductionBriefComponent,
    VSCopilotPanelComponent,
    VSStudioSlideInComponent,
    VSSetupHealthCardComponent,
    MJAlertComponent,
    MJButtonDirective,
    MJDatepickerComponent,
    MJDialogComponent,
    MJDialogActionsComponent,
    MJDropdownComponent,
    MJEmptyStateComponent,
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
    VideoStudioBrandKitsResourceComponent,
    VideoStudioArchetypesResourceComponent,
    VSAudioOptionsComponent,
    VSProductionBriefComponent,
    VSCopilotPanelComponent,
    VSStudioSlideInComponent,
    VSSetupHealthCardComponent,
  ],
})
export class VideoStudioDashboardsModule {}

export {
  VideoStudioProductionsResourceComponent,
  VideoStudioBrandKitsResourceComponent,
  VideoStudioArchetypesResourceComponent,
  VSAudioOptionsComponent,
  VSProductionBriefComponent,
  VSCopilotPanelComponent,
  VSStudioSlideInComponent,
  VSSetupHealthCardComponent,
};



