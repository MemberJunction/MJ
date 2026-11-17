import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// MJ UI Components
import {
  MJButtonDirective,
  MJDialogComponent,
  MJDialogActionsComponent,
  MJDropdownComponent,
  MJEmptyStateComponent,
  MJAlertComponent,
  MJSwitchComponent,
  MjSlidePanelComponent,
  MJStatBadgeComponent,
  MJFilterChipComponent,
  MJComboboxComponent
} from '@memberjunction/ng-ui-components';

// MemberJunction imports
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

// Components
import { AudienceSourcePickerComponent } from './components/audience-source-picker/audience-source-picker.component';
import { AudienceSourceSummaryComponent } from './components/audience-source-summary/audience-source-summary.component';
import { ListAuditLogComponent } from './components/list-audit-log/list-audit-log.component';
import { ListDeltaConfirmComponent } from './components/list-delta-confirm/list-delta-confirm.component';
import { ListInvitationsComponent } from './components/list-invitations/list-invitations.component';
import { ListManagementDialogComponent } from './components/list-management-dialog/list-management-dialog.component';
import { ListShareDialogComponent } from './components/list-share-dialog/list-share-dialog.component';
import { ListStatsComponent } from './components/list-stats/list-stats.component';
import { ListsSharedWithMeComponent } from './components/shared-with-me/shared-with-me.component';
import { SaveViewAsListDialogComponent } from './components/save-view-as-list-dialog/save-view-as-list-dialog.component';
import { TagChipsComponent } from './components/tag-chips/tag-chips.component';
import { ListSourceReviewComponent } from './components/list-source-review/list-source-review.component';
import { ListRefreshHistoryComponent } from './components/list-refresh-history/list-refresh-history.component';
import { ListSourceRefreshPanelComponent } from './components/list-source-refresh-panel/list-source-refresh-panel.component';
import { ListLinkSourceDialogComponent } from './components/list-link-source-dialog/list-link-source-dialog.component';

// Services
import { ListManagementService } from './services/list-management.service';
import { ListSharingService } from './services/list-sharing.service';

/**
 * Module providing list management components for MemberJunction.
 */
@NgModule({
  declarations: [
    ListSourceReviewComponent,
    ListRefreshHistoryComponent,
    ListSourceRefreshPanelComponent,
    ListLinkSourceDialogComponent,
    AudienceSourcePickerComponent,
    AudienceSourceSummaryComponent,
    ListAuditLogComponent,
    ListDeltaConfirmComponent,
    ListInvitationsComponent,
    ListManagementDialogComponent,
    ListShareDialogComponent,
    ListStatsComponent,
    ListsSharedWithMeComponent,
    SaveViewAsListDialogComponent,
    TagChipsComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    MJButtonDirective,
    MJDialogComponent,
    MJDialogActionsComponent,
    MJDropdownComponent,
    MJEmptyStateComponent,
    MJAlertComponent,
    MJSwitchComponent,
    MjSlidePanelComponent,
    MJStatBadgeComponent,
    MJFilterChipComponent,
    MJComboboxComponent,
    ContainerDirectivesModule,
    SharedGenericModule
  ],
  exports: [
    ListSourceReviewComponent,
    ListRefreshHistoryComponent,
    ListSourceRefreshPanelComponent,
    ListLinkSourceDialogComponent,
    AudienceSourcePickerComponent,
    AudienceSourceSummaryComponent,
    ListAuditLogComponent,
    ListDeltaConfirmComponent,
    ListInvitationsComponent,
    ListManagementDialogComponent,
    ListShareDialogComponent,
    ListStatsComponent,
    ListsSharedWithMeComponent,
    SaveViewAsListDialogComponent,
    TagChipsComponent
  ],
  providers: [
    ListManagementService,
    ListSharingService
  ]
})
export class ListManagementModule { }
