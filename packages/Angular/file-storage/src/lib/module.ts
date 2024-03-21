import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

// Kendo UI Angular imports
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ExcelExportModule } from '@progress/kendo-angular-excel-export';
import { GridModule } from '@progress/kendo-angular-grid';
import { IconsModule } from '@progress/kendo-angular-icons';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { LabelModule } from '@progress/kendo-angular-label';
import { TreeViewModule } from '@progress/kendo-angular-treeview';


import { FormsModule } from '@angular/forms';
import { CompareRecordsModule } from '@memberjunction/ng-compare-records';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { UploadsModule } from '@progress/kendo-angular-upload';
import { CategoryTreeComponent } from './category-tree/category-tree';
import { FileUploadComponent } from './file-upload/file-upload';
import { FilesGridComponent } from './files-grid/files-grid';

@NgModule({
  declarations: [CategoryTreeComponent, FilesGridComponent, FileUploadComponent],
  imports: [
    CommonModule,
    TreeViewModule,
    FormsModule,
    DialogsModule,
    ExcelExportModule,
    CompareRecordsModule,
    ContainerDirectivesModule,
    ButtonsModule,
    IconsModule,
    LabelModule,
    GridModule,
    DropDownsModule,
    BrowserModule,
    BrowserAnimationsModule,
    InputsModule,
    UploadsModule,
  ],
  exports: [CategoryTreeComponent, FilesGridComponent],
})
export class FileStorageModule {}