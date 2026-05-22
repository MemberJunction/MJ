import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
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
  MJViewToggleComponent,
  MJStatBadgeComponent,
} from '@memberjunction/ng-ui-components';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { ListManagementModule } from '@memberjunction/ng-list-management';

// Lists Components
import { ListsMyListsResource } from './Lists/components/lists-my-lists-resource.component';
import { ListsBrowseResource } from './Lists/components/lists-browse-resource.component';
import { ListsCategoriesResource } from './Lists/components/lists-categories-resource.component';
import { ListsOperationsResource } from './Lists/components/lists-operations-resource.component';
import { ListsSharedWithMeResource } from './Lists/components/lists-shared-with-me-resource.component';
import { VennDiagramComponent } from './Lists/components/venn-diagram/venn-diagram.component';
import { ListSetOperationsService } from './Lists/services/list-set-operations.service';

/**
 * ListsDashboardsModule — Lists feature area: my lists, browse,
 * categories, operations, shared-with-me, and Venn diagram visualization.
 */
@NgModule({
  declarations: [
    ListsMyListsResource,
    ListsBrowseResource,
    ListsCategoriesResource,
    ListsOperationsResource,
    ListsSharedWithMeResource,
    VennDiagramComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
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
    MJViewToggleComponent,
    MJStatBadgeComponent,
    ContainerDirectivesModule,
    SharedGenericModule,
    ListManagementModule
  ],
  providers: [
    ListSetOperationsService
  ],
  exports: [
    ListsMyListsResource,
    ListsBrowseResource,
    ListsCategoriesResource,
    ListsOperationsResource,
    ListsSharedWithMeResource,
    VennDiagramComponent
  ]
})
export class ListsDashboardsModule { }
