import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

// Kendo UI Angular imports
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { DialogsModule } from '@progress/kendo-angular-dialog';
import { ExcelExportModule } from '@progress/kendo-angular-excel-export';
import { GridModule } from '@progress/kendo-angular-grid';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { LabelModule } from '@progress/kendo-angular-label';
import { MenusModule } from '@progress/kendo-angular-menu';
import { TreeViewModule } from '@progress/kendo-angular-treeview';

import { FormsModule } from '@angular/forms';
import { CompareRecordsModule } from '@memberjunction/ng-compare-records';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { UploadsModule } from '@progress/kendo-angular-upload';
import { CategoryTreeComponent } from './category-tree/category-tree';
import { FileUploadComponent } from './file-upload/file-upload';
import { FilesGridComponent } from './files-grid/files-grid';
import { FileBrowserComponent } from './file-browser/file-browser.component';
import { FileBrowserDemoComponent } from './file-browser/file-browser-demo.component';
import { FileBrowserResource } from './file-browser/file-browser-resource.component';
import { StorageProvidersListComponent } from './file-browser/storage-providers-list.component';
import { FolderTreeComponent } from './file-browser/folder-tree.component';
import { FileGridComponent } from './file-browser/file-grid.component';

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
    FileGridComponent
  ],
  imports: [
    CommonModule,
    TreeViewModule,
    FormsModule,
    DialogsModule,
    ExcelExportModule,
    CompareRecordsModule,
    ContainerDirectivesModule,
    SharedGenericModule,
    ButtonsModule,
    LabelModule,
    GridModule,
    DropDownsModule,
    BrowserModule,
    BrowserAnimationsModule,
    InputsModule,
    UploadsModule,
    MenusModule,
    IndicatorsModule,
  ],
  exports: [
    CategoryTreeComponent,
    FilesGridComponent,
    FileUploadComponent,
    FileBrowserComponent,
    FileBrowserDemoComponent,
    FileBrowserResource
  ],
})
export class FileStorageModule {}
