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
  MJButtonDirective,
  MJDialogActionsComponent,
  MJDialogComponent,
  MJFilterFieldComponent,
  MJFilterPanelComponent,
  MJFilterPopoverComponent,
  MJPageBodyComponent,
  MJPageHeaderComponent,
  MJPageLayoutComponent,
  MJPageSearchComponent,
  MJRefreshButtonComponent,
  MJStatBadgeComponent,
} from '@memberjunction/ng-ui-components';
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
    MJButtonDirective,
    MJDialogComponent,
    MJDialogActionsComponent,
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
  ],
})
export class VideoStudioDashboardsModule {}
