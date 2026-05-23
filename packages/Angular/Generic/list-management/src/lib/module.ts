import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// MJ UI Components
import {
  MJButtonDirective,
  MJDialogComponent,
  MJDialogActionsComponent,
  MJDropdownComponent
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

// Services
import { ListManagementService } from './services/list-management.service';
import { ListSharingService } from './services/list-sharing.service';

/**
 * Module providing list management components for MemberJunction.
 */
@NgModule({
  declarations: [
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
    ContainerDirectivesModule,
    SharedGenericModule
  ],
  exports: [
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
