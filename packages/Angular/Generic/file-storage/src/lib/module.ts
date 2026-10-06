import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { AgGridModule } from 'ag-grid-angular';
import {
  MJButtonDirective,
  MJDialogComponent,
  MJDialogActionsComponent,
  MJEmptyStateComponent,
  MJAlertComponent,
  MJPageHeaderComponent,
  MJPageLayoutComponent,
  MjSlidePanelComponent,
} from '@memberjunction/ng-ui-components';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { CredentialsModule } from '@memberjunction/ng-credentials';
import { CategoryTreeComponent } from './category-tree/category-tree';
import { FileUploadComponent } from './file-upload/file-upload';
import { FilesGridComponent } from './files-grid/files-grid';
import { FileBrowserComponent } from './file-browser/file-browser.component';
import { FileBrowserDemoComponent } from './file-browser/file-browser-demo.component';
import { FileBrowserResource } from './file-browser/file-browser-resource.component';
import { StorageProvidersListComponent } from './file-browser/storage-providers-list.component';
import { FolderTreeComponent } from './file-browser/folder-tree.component';
import { FileGridComponent } from './file-browser/file-grid.component';
import { RecordAttachmentsComponent } from './record-attachments/record-attachments.component';
import { StorageAdminDialogComponent } from './admin/storage-admin-dialog.component';

@NgModule({
  declarations: [
    CategoryTreeComponent,
    FilesGridComponent,
    FileUploadComponent,
    FileBrowserComponent,
    FileBrowserDemoComponent,
    FileBrowserResource,
    StorageProvidersListComponent,
    FolderTreeComponent,
    FileGridComponent,
    RecordAttachmentsComponent,
    StorageAdminDialogComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    AgGridModule,
    ContainerDirectivesModule,
    SharedGenericModule,
    CredentialsModule,
    MJButtonDirective,
    MJDialogComponent,
    MJDialogActionsComponent,
    MJEmptyStateComponent,
    MJAlertComponent,
    MJPageHeaderComponent,
    MJPageLayoutComponent,
    MjSlidePanelComponent,
  ],
  exports: [
    CategoryTreeComponent,
    FilesGridComponent,
    FileUploadComponent,
    FileBrowserComponent,
    FileBrowserDemoComponent,
    FileBrowserResource,
    RecordAttachmentsComponent,
    StorageAdminDialogComponent,
  ],
})
export class FileStorageModule {}
