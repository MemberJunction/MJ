# @memberjunction/ng-file-storage

Angular components for managing file storage in MemberJunction applications. This package provides a complete file management system with categories, file upload, and grid display capabilities integrated with MemberJunction's file storage providers.

## Features

- **Category Management**: Create, rename, and organize file categories in a tree structure
- **File Grid**: Display files with sorting, filtering and pagination
- **File Upload**: Easy file uploading with progress tracking
- **File Operations**: Download, delete, and edit file metadata
- **Drag and Drop**: Move files between categories with drag and drop support
- **Integration**: Seamless integration with MemberJunction's file storage system
- **Provider Support**: Works with multiple file storage providers (Azure Blob, AWS S3, etc.)
- **Overwrite Protection**: Confirmation dialog when overwriting existing files
- **Status Management**: Track file upload status (Pending, Uploaded, Failed)
- **Type Safety**: Full TypeScript support with MemberJunction entities

## Installation

```bash
npm install @memberjunction/ng-file-storage
```

**Note**: This package requires Angular 21 or later and the following MemberJunction packages:
- `@memberjunction/core` (^2.43.0)
- `@memberjunction/core-entities` (^2.43.0)
- `@memberjunction/global` (^2.43.0)
- `@memberjunction/graphql-dataprovider` (^2.43.0)

## Prerequisites

Before using this package, ensure your MemberJunction database has:
- File Storage Providers configured and active
- File Categories entity permissions for users
- Files entity permissions for users
- Proper GraphQL endpoints configured

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

## Component Reference

### CategoryTreeComponent (`mj-files-category-tree`)

A tree view component for managing file categories.

#### Selector
```typescript
selector: 'mj-files-category-tree'
```

#### Outputs

| Output | Type | Description |
|--------|------|-------------|
| `categorySelected` | `EventEmitter<string \| undefined>` | Emitted when a category is selected in the tree |

#### Public Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|----------|
| `createNewCategory()` | Opens dialog to create a new category | None | `Promise<void>` |
| `deleteCategory(fileCategory: FileCategoryEntity)` | Deletes a category with error handling | `fileCategory: FileCategoryEntity` | `Promise<void>` |
| `handleDrop(e: TreeItemAddRemoveArgs)` | Handles drag and drop to move categories | `e: TreeItemAddRemoveArgs` | `Promise<void>` |
| `Refresh()` | Refreshes the category tree data | None | `Promise<void>` |
| `clearSelection()` | Clears the current selection | None | `void` |
| `saveNewCategory()` | Saves a new category | None | `Promise<void>` |
| `saveRename()` | Saves category rename | None | `Promise<void>` |
| `cancelRename()` | Cancels category rename | None | `void` |

### FilesGridComponent (`mj-files-grid`)

A grid component for displaying and managing files with support for inline editing and file operations.

#### Selector
```typescript
selector: 'mj-files-grid'
```

#### Inputs

| Input | Type | Description | Default |
|-------|------|-------------|----------|
| `CategoryID` | `string \| undefined` | The ID of the category to filter files by | `undefined` |

#### Public Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|----------|
| `downloadFile(file: FileEntity)` | Downloads file using provider's download URL | `file: FileEntity` | `Promise<void>` |
| `deleteFile(file: FileEntity)` | Deletes file with confirmation | `file: FileEntity` | `Promise<void>` |
| `saveEditFile()` | Saves changes to file metadata | None | `Promise<void>` |
| `resetEditFile()` | Cancels editing file metadata | None | `void` |
| `handleFileUpload(e: FileUploadEvent)` | Handles file upload events | `e: FileUploadEvent` | `void` |
| `canBeDeleted(file: FileEntity)` | Checks if file can be deleted | `file: FileEntity` | `boolean` |
| `Refresh()` | Refreshes the files grid data | None | `Promise<void>` |

### FileUploadComponent (`mj-files-file-upload`)

A component for uploading files with provider integration and overwrite protection.

#### Selector
```typescript
selector: 'mj-files-file-upload'
```

#### Inputs

| Input | Type | Description | Default |
|-------|------|-------------|----------|
| `disabled` | `boolean` | Whether the upload component is disabled | `false` |
| `CategoryID` | `string \| undefined` | The category ID to assign to uploaded files | `undefined` |

#### Outputs

| Output | Type | Description |
|--------|------|-------------|
| `uploadStarted` | `EventEmitter<void>` | Emitted when file upload starts |
| `fileUpload` | `EventEmitter<FileUploadEvent>` | Emitted when a file is uploaded (success or failure) |

#### Public Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|----------|
| `Confirm()` | Confirms file overwrite and proceeds with upload | None | `void` |
| `CancelConfirm()` | Cancels file overwrite and deletes pending record | None | `Promise<void>` |
| `Refresh()` | Loads default file storage provider | None | `Promise<void>` |
| `SelectEventHandler(e: SelectEvent)` | Handles file selection | `e: SelectEvent` | `Promise<void>` |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `IsUploading` | `boolean` | Indicates if files are currently being uploaded |

## Types

### FileUploadEvent

```typescript
export type FileUploadEvent = 
  | { success: true; file: FileEntity }
  | { success: false; file: FileInfo };
```

This type represents the result of a file upload operation, containing either a successful FileEntity or a failed FileInfo object.

## File Upload Flow

1. User selects a file using the file upload component
2. Component creates a preliminary file record in the MemberJunction system
3. If a file with the same name exists, a confirmation dialog is shown
4. On confirmation, the file is uploaded to the storage provider
5. After successful upload, the file record status is updated to "Uploaded"
6. The component emits a fileUpload event with success status and file details

## Styling

The components use Kendo UI components for consistent styling and include basic CSS that can be overridden in your application.

## Advanced Usage

### Custom File Grid with Actions

```typescript
import { Component, ViewChild } from '@angular/core';
import { FilesGridComponent, FileUploadEvent } from '@memberjunction/ng-file-storage';
import { FileEntity } from '@memberjunction/core-entities';

@Component({
  template: `
    <div class="file-manager">
      <div class="toolbar">
        <button (click)="refreshFiles()">Refresh</button>
        <mj-files-file-upload 
          [CategoryID]="categoryId"
          (fileUpload)="onFileUploaded($event)">
        </mj-files-file-upload>
      </div>
      
      <mj-files-grid #filesGrid
        [CategoryID]="categoryId">
      </mj-files-grid>
    </div>
  `
})
export class CustomFileManagerComponent {
  @ViewChild('filesGrid') filesGrid!: FilesGridComponent;
  categoryId = 'some-category-id';
  
  refreshFiles() {
    this.filesGrid.Refresh();
  }
  
  onFileUploaded(event: FileUploadEvent) {
    if (event.success) {
      console.log('File uploaded:', event.file.Name);
      // The grid automatically adds the file, no refresh needed
    }
  }
}
```

### Programmatic Category Management

```typescript
import { Component, ViewChild } from '@angular/core';
import { CategoryTreeComponent } from '@memberjunction/ng-file-storage';
import { Metadata } from '@memberjunction/core';
import { FileCategoryEntity } from '@memberjunction/core-entities';

@Component({
  template: `
    <mj-files-category-tree #categoryTree
      (categorySelected)="onCategorySelected($event)">
    </mj-files-category-tree>
  `
})
export class CategoryManagerComponent {
  @ViewChild('categoryTree') categoryTree!: CategoryTreeComponent;
  
  async createCategoryProgrammatically(name: string, parentId?: string) {
    const md = new Metadata();
    const category = await md.GetEntityObject<FileCategoryEntity>('File Categories');
    category.NewRecord();
    category.Name = name;
    category.ParentID = parentId;
    
    if (await category.Save()) {
      // Refresh the tree to show new category
      await this.categoryTree.Refresh();
    }
  }
  
  onCategorySelected(categoryId?: string) {
    console.log('Selected category:', categoryId);
  }
}
```

## Module Exports

The `FileStorageModule` exports the following components:
- `CategoryTreeComponent`
- `FilesGridComponent`
- `FileUploadComponent`

## Dependencies

### MemberJunction Dependencies
- `@memberjunction/core` (^2.43.0): Core metadata and entity access
- `@memberjunction/core-entities` (^2.43.0): File-related entity types
- `@memberjunction/global` (^2.43.0): Global utilities
- `@memberjunction/graphql-dataprovider` (^2.43.0): GraphQL data operations
- `@memberjunction/ng-container-directives` (^2.43.0): Container directives
- `@memberjunction/ng-shared` (^2.43.0): Shared Angular services

### Kendo UI Dependencies
- `@progress/kendo-angular-buttons` (^16.2.0)
- `@progress/kendo-angular-dialog` (^16.2.0)
- `@progress/kendo-angular-dropdowns` (^16.2.0)
- `@progress/kendo-angular-grid` (^16.2.0)
- `@progress/kendo-angular-indicators` (^16.2.0)
- `@progress/kendo-angular-menu` (^16.2.0)
- `@progress/kendo-angular-treeview` (^16.2.0)
- `@progress/kendo-angular-upload` (^16.2.0)

### Other Dependencies
- `tslib` (^2.3.0)
- `zod` (^3.23.4): Schema validation

## Build and Development

### Building the Package
```bash
cd packages/Angular/Generic/file-storage
npm run build
```

### Watch Mode
```bash
npm run watch
```

### Integration with MemberJunction

This package integrates with:
- **File Storage Providers**: Automatically uses the highest priority active provider
- **GraphQL API**: Uses MemberJunction's GraphQL layer for all operations
- **Entity Framework**: Leverages MemberJunction's entity system for type safety
- **Permissions**: Respects entity-level permissions for Files and File Categories

## Notes

- File deletion is restricted based on upload status and age (10 minutes for pending files)
- The component automatically handles file overwrite scenarios with user confirmation
- All file operations are tracked with status updates (Pending → Uploaded)
- File download uses provider-specific signed URLs for security
- Category operations support drag-and-drop reorganization
- Components include loading states for all async operations