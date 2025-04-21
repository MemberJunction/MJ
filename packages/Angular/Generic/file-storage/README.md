# File Storage Components

A set of Angular components for managing file storage in MemberJunction applications. This package provides a complete file management system with categories, file upload, and grid display.

## Features

- **Category Management**: Create, rename, and organize file categories in a tree structure
- **File Grid**: Display files with sorting, filtering and pagination
- **File Upload**: Easy file uploading with progress tracking
- **File Operations**: Download, delete, and edit file metadata
- **Drag and Drop**: Move files between categories with drag and drop
- **Integration**: Seamless integration with MemberJunction's file storage system
- **Provider Support**: Works with multiple file storage providers
- **Overwrite Protection**: Confirmation dialog when overwriting existing files

## Installation

```bash
npm install @memberjunction/ng-file-storage
```

## Usage

### Import the Module

```typescript
import { FileStorageModule } from '@memberjunction/ng-file-storage';

@NgModule({
  imports: [
    FileStorageModule,
    // other imports
  ],
  // ...
})
export class YourModule { }
```

### Basic Component Usage

```html
<!-- File management interface with category tree and file grid -->
<div class="file-manager-container">
  <div class="category-panel">
    <mj-files-category-tree
      (categorySelected)="selectedCategoryId = $event">
    </mj-files-category-tree>
  </div>
  
  <div class="files-panel">
    <mj-files-grid
      [CategoryID]="selectedCategoryId">
    </mj-files-grid>
  </div>
</div>
```

### File Upload Component

```html
<!-- Standalone file upload component -->
<mj-files-file-upload
  [CategoryID]="selectedCategoryId"
  (uploadStarted)="handleUploadStarted()"
  (fileUpload)="handleFileUploaded($event)">
</mj-files-file-upload>
```

### TypeScript Component Example

```typescript
import { Component } from '@angular/core';
import { FileUploadEvent } from '@memberjunction/ng-file-storage';
import { SharedService } from '@memberjunction/ng-shared';

@Component({
  selector: 'app-document-manager',
  template: `
    <h2>Document Manager</h2>
    
    <div class="file-manager">
      <div class="categories">
        <h3>Categories</h3>
        <mj-files-category-tree
          (categorySelected)="onCategorySelected($event)">
        </mj-files-category-tree>
      </div>
      
      <div class="files">
        <h3>Files in {{ currentCategoryName || 'All Categories' }}</h3>
        <mj-files-grid
          [CategoryID]="selectedCategoryId">
        </mj-files-grid>
      </div>
    </div>
  `,
  styles: [`
    .file-manager {
      display: flex;
      height: 600px;
    }
    .categories {
      width: 300px;
      border-right: 1px solid #ccc;
      padding-right: 20px;
    }
    .files {
      flex: 1;
      padding-left: 20px;
    }
  `]
})
export class DocumentManagerComponent {
  selectedCategoryId?: string;
  currentCategoryName?: string;
  
  constructor(private sharedService: SharedService) {}
  
  onCategorySelected(categoryId?: string) {
    this.selectedCategoryId = categoryId;
    // You could load the category name here if needed
  }
  
  handleFileUploaded(event: FileUploadEvent) {
    if (event.success) {
      this.sharedService.CreateSimpleNotification(
        `File "${event.file.Name}" uploaded successfully`,
        'success'
      );
    } else {
      this.sharedService.CreateSimpleNotification(
        `Failed to upload file "${event.file.name}"`,
        'error'
      );
    }
  }
}
```

## API Reference

### CategoryTreeComponent

A tree view component for managing file categories.

#### Outputs

- `categorySelected`: EventEmitter<string | undefined> - Emitted when a category is selected in the tree

#### Methods

- `createNewCategory()`: Opens dialog to create a new category
- `deleteCategory(fileCategory: FileCategoryEntity)`: Deletes a category
- `handleDrop(e: TreeItemAddRemoveArgs)`: Handles drag and drop of categories
- `Refresh()`: Refreshes the category tree data

### FilesGridComponent

A grid component for displaying and managing files.

#### Inputs

- `CategoryID`: string | undefined - The ID of the category to filter files by

#### Methods

- `downloadFile(file: FileEntity)`: Downloads the specified file
- `deleteFile(file: FileEntity)`: Deletes the specified file
- `saveEditFile()`: Saves changes to a file's metadata
- `resetEditFile()`: Cancels editing a file's metadata
- `Refresh()`: Refreshes the files grid data

### FileUploadComponent

A component for uploading files.

#### Inputs

- `disabled`: boolean - Whether the upload component is disabled
- `CategoryID`: string | undefined - The category ID to assign to uploaded files

#### Outputs

- `uploadStarted`: EventEmitter<void> - Emitted when file upload starts
- `fileUpload`: EventEmitter<FileUploadEvent> - Emitted when a file is uploaded (success or failure)

#### Methods

- `Confirm()`: Confirms file overwrite
- `CancelConfirm()`: Cancels file overwrite
- `Refresh()`: Refreshes the file upload component state

## File Upload Flow

1. User selects a file using the file upload component
2. Component creates a preliminary file record in the MemberJunction system
3. If a file with the same name exists, a confirmation dialog is shown
4. On confirmation, the file is uploaded to the storage provider
5. After successful upload, the file record status is updated to "Uploaded"
6. The component emits a fileUpload event with success status and file details

## Styling

The components use Kendo UI components for consistent styling and include basic CSS that can be overridden in your application.

## Dependencies

- `@memberjunction/core`: For metadata and entity access
- `@memberjunction/core-entities`: For file-related entity types
- `@memberjunction/global`: For global utilities
- `@memberjunction/graphql-dataprovider`: For GraphQL data operations
- `@progress/kendo-angular-upload`: For file upload UI
- `@progress/kendo-angular-grid`: For file grid display
- `@progress/kendo-angular-treeview`: For category tree view