# Entity Communications Component

This Angular component package provides a UI for selecting message templates, previewing communications, and sending messages to entity recipients within the MemberJunction framework.

## Features

- **Template Selection**: Browse and select from available message templates
- **Message Preview**: Preview messages with actual data before sending
- **Multi-recipient Support**: Preview communications for multiple recipients
- **Dialog Integration**: Includes a dialog component for easy integration
- **Navigation Controls**: Browse through multiple preview messages
- **Template Filtering**: Filter templates based on specific criteria
- **Customizable**: Extensive configuration options for the component

## Installation

```bash
npm install @memberjunction/ng-entity-communications
```

## Usage

### Import the Module

```typescript
import { EntityCommunicationsModule } from '@memberjunction/ng-entity-communications';

@NgModule({
  imports: [
    EntityCommunicationsModule,
    // other imports
  ],
  // ...
})
export class YourModule { }
```

### Basic Component Usage

```html
<!-- Use the preview component directly -->
<mj-entity-communications-preview
  [entityInfo]="entityInfo"
  [runViewParams]="runViewParams"
  [templateFilter]="'TemplateType = ''Email''' "
  (templateSelected)="onTemplateSelected($event)">
</mj-entity-communications-preview>
```

### Dialog Component Usage

```html
<!-- Use the preview in a dialog window -->
<button kendoButton (click)="showPreviewDialog()">
  Preview Communications
</button>

<mj-entity-communications-preview-window
  *ngIf="previewDialogVisible"
  [entityInfo]="entityInfo"
  [runViewParams]="runViewParams"
  [DialogVisible]="previewDialogVisible"
  [Title]="'Email Preview'"
  (DialogClosed)="onPreviewDialogClosed($event)">
</mj-entity-communications-preview-window>
```

### TypeScript Component Example

```typescript
import { Component } from '@angular/core';
import { EntityInfo, RunViewParams } from '@memberjunction/core';
import { TemplateEntityExtended } from '@memberjunction/templates-base-types';

@Component({
  selector: 'app-customer-communication',
  template: `
    <button kendoButton (click)="previewCustomerEmails()">
      Preview Customer Emails
    </button>
    
    <mj-entity-communications-preview-window
      *ngIf="showPreview"
      [entityInfo]="customerEntityInfo"
      [runViewParams]="customerViewParams"
      [DialogVisible]="showPreview"
      [Title]="'Customer Email Preview'"
      (DialogClosed)="onPreviewClosed($event)">
    </mj-entity-communications-preview-window>
  `
})
export class CustomerCommunicationComponent {
  showPreview = false;
  customerEntityInfo: EntityInfo;
  customerViewParams: RunViewParams;
  
  constructor(private metadataService: YourMetadataService) {
    // Initialize entity info
    this.customerEntityInfo = metadataService.getEntityInfo('Customers');
    
    // Set up view parameters to get active customers
    this.customerViewParams = {
      EntityName: 'Customers',
      ExtraFilter: 'IsActive = 1 AND LastContactDate < DATEADD(month, -3, GETDATE())',
      OrderBy: 'LastContactDate ASC',
      ResultType: 'entity_object'
    };
  }
  
  previewCustomerEmails() {
    this.showPreview = true;
  }
  
  onPreviewClosed(confirmed: boolean) {
    this.showPreview = false;
    
    if (confirmed) {
      // User confirmed - you could initiate the actual sending here
      console.log('User confirmed sending emails');
    }
  }
  
  onTemplateSelected(template: TemplateEntityExtended) {
    console.log('Selected template:', template.Name);
  }
}
```

## API Reference

### EntityCommunicationsPreviewComponent

This is the main component for displaying the template selection and preview interface.

#### Inputs

- `entityInfo`: EntityInfo - Information about the entity for which communications will be sent
- `runViewParams`: RunViewParams - Parameters for running a view to retrieve entity data
- `templateFilter`: string - SQL filter expression to filter available templates

#### Outputs

- `templateSelected`: EventEmitter<TemplateEntityExtended> - Emitted when a template is selected

### EntityCommunicationsPreviewWindowComponent

This component wraps the preview component in a Kendo dialog window.

#### Inputs

- `DialogVisible`: boolean - Controls the visibility of the dialog
- `Title`: string - Title of the dialog window (default: 'Communications Preview')
- `Width`: number - Width of the dialog (default: 650)
- `Height`: number - Height of the dialog (default: 600)
- `MinWidth`: number - Minimum width of the dialog (default: 400)
- `MinHeight`: number - Minimum height of the dialog (default: 350)
- `Resizable`: boolean - Whether the dialog is resizable (default: true)
- `entityInfo`: EntityInfo - Information about the entity
- `runViewParams`: RunViewParams - Parameters for running a view

#### Outputs

- `DialogClosed`: EventEmitter<boolean> - Emitted when the dialog is closed (true if confirmed, false if canceled)

## Process Flow

1. The component displays a list of available templates based on the provided filter
2. User selects a template to preview
3. The component fetches data using the provided entity and view parameters
4. The template is applied to each record in the dataset to generate preview messages
5. User can navigate through the preview messages to see how the communication will appear for each recipient
6. In a dialog context, user can confirm or cancel the operation

## Styling

The component includes basic CSS styling that can be customized or overridden in your application.

## Dependencies

- `@memberjunction/core`: For metadata and entity access
- `@memberjunction/core-entities`: For entity types
- `@memberjunction/global`: For global utilities
- `@memberjunction/communication-types`: For message types and interfaces
- `@memberjunction/entity-communications-base`: For base communication classes
- `@memberjunction/entity-communications-client`: For client-side communication engine
- `@memberjunction/templates-base-types`: For template-related interfaces