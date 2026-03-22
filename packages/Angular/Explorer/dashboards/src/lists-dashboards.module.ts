import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { GridModule } from '@progress/kendo-angular-grid';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { DialogsModule, WindowModule } from '@progress/kendo-angular-dialog';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { ListManagementModule } from '@memberjunction/ng-list-management';

// Lists Components
import { ListsMyListsResource } from './Lists/components/lists-my-lists-resource.component';
import { ListsBrowseResource } from './Lists/components/lists-browse-resource.component';
import { ListsCategoriesResource } from './Lists/components/lists-categories-resource.component';
import { ListsOperationsResource } from './Lists/components/lists-operations-resource.component';
import { VennDiagramComponent } from './Lists/components/venn-diagram/venn-diagram.component';
import { ListSetOperationsService } from './Lists/services/list-set-operations.service';

/**
 * ListsDashboardsModule — Lists feature area: my lists, browse,
 * categories, operations, and Venn diagram visualization.
 */
@NgModule({
  declarations: [
    ListsMyListsResource,
    ListsBrowseResource,
    ListsCategoriesResource,
    ListsOperationsResource,
    VennDiagramComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonsModule,
    GridModule,
    DropDownsModule,
    DialogsModule,
    WindowModule,
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
    VennDiagramComponent
  ]
})
export class ListsDashboardsModule { }
