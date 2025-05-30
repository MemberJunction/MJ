# @memberjunction/ng-entity-communications

This Angular component package provides a user interface for selecting message templates, previewing communications, and sending messages to entity recipients within the MemberJunction framework. It enables users to preview how templates will look when applied to real data before sending communications.

## Features

- **Template Selection**: Browse and select from available active message templates
- **Message Preview**: Preview messages with actual entity data before sending
- **Multi-recipient Support**: Preview communications for multiple recipients with navigation controls
- **Dialog Integration**: Includes a dialog wrapper component for easy modal integration
- **Navigation Controls**: VCR-style controls to browse through multiple preview messages
- **Template Filtering**: Filter templates based on SQL expressions
- **Real-time Template Processing**: Integrates with MemberJunction's template engine for dynamic content
- **Provider Integration**: Works with communication providers like SendGrid

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
import { EntityInfo, Metadata, RunViewParams } from '@memberjunction/core';
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
  
  constructor() {
    // Initialize metadata and entity info
    const md = new Metadata();
    this.customerEntityInfo = md.Entities.find(e => e.Name === 'Customers')!;
    
    // Set up view parameters to get active customers who haven't been contacted recently
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

## Component Features

### Template Loading
- Templates are loaded with their content from the database
- Only active templates are shown (based on `IsActive` flag and `ActiveAt` date)
- Additional filtering can be applied via the `templateFilter` input
- Template content entities are loaded and associated with each template

### Message Preview Generation
- Uses the EntityCommunicationsEngineClient to generate previews
- Integrates with communication providers (e.g., SendGrid)
- Processes templates against entity data to show real previews
- Supports both HTML body and subject line templates
- Runs in preview-only mode without actually sending messages

### Navigation Controls
- VCR-style navigation buttons (first, previous, next, last)
- Current position indicator showing "X of Y" messages
- Buttons are automatically disabled at boundaries
- Font Awesome icons for navigation buttons

## Process Flow

1. **Template Selection Phase**:
   - Component loads all active templates filtered by the `templateFilter` expression
   - User sees a list of available templates
   - Clicking a template moves to the preview phase

2. **Preview Generation Phase**:
   - Selected template is processed against the entity data from `runViewParams`
   - EntityCommunicationsEngineClient generates preview messages for each record
   - Loading indicator shows during processing

3. **Preview Navigation Phase**:
   - User can navigate through all generated preview messages
   - Each preview shows the processed subject and HTML body
   - Back button returns to template selection

4. **Dialog Interaction** (when using window component):
   - OK/Cancel buttons control the dialog
   - DialogClosed event indicates user's choice

## Styling

The component includes CSS styling with the following key classes:
- `.step-1`: Template selection view styling
- `.step-2`: Preview display view styling  
- `.vcr-controls`: Navigation button container
- `.template-preview`: Preview content container
- `.subject-line`: Email subject preview styling
- `.preview-body`: Email body preview styling

These styles can be customized or overridden in your application.

## Dependencies

### Core Dependencies
- `@memberjunction/core`: Metadata, entity framework, and view execution
- `@memberjunction/core-entities`: Entity type definitions including TemplateContentEntity
- `@memberjunction/global`: Global utilities and event system
- `@memberjunction/communication-types`: Message types, communication engines, and providers
- `@memberjunction/entity-communications-base`: EntityCommunicationParams interface
- `@memberjunction/entity-communications-client`: Client-side communication processing engine
- `@memberjunction/templates-base-types`: Template engine and extended template types
- `@memberjunction/ng-container-directives`: Container directive utilities
- `@memberjunction/ng-shared`: Shared Angular utilities

### Angular Dependencies
- `@angular/common`: Angular common module (v18.0.2)
- `@angular/core`: Angular core framework (v18.0.2)
- `@angular/forms`: Form support (v18.0.2)
- `@angular/router`: Routing support (v18.0.2)

### Kendo UI Dependencies
- `@progress/kendo-angular-buttons`: Button components (v16.2.0)
- `@progress/kendo-angular-dialog`: Dialog/window components (v16.2.0)
- `@progress/kendo-angular-listbox`: Listbox component (v16.2.0)
- `@progress/kendo-angular-indicators`: Loading indicators (v16.2.0)

## Important Notes

### Current Limitations
- The component currently hardcodes the SendGrid provider and Email message type
- Subject template is hardcoded to 'Test Subject Template'
- From address is hardcoded in the preview generation

### Future Enhancements
Consider making the following configurable:
- Communication provider selection
- Message type selection
- From address configuration
- Subject template selection
- Support for text body templates in addition to HTML