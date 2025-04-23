# @memberjunction/ng-core-entity-forms

The `@memberjunction/ng-core-entity-forms` package provides a comprehensive set of Angular form components for all core MemberJunction entities. It includes both auto-generated form components based on entity metadata and custom form components with enhanced functionality for specific entities.

## Features

- Pre-built form components for all MemberJunction core entities
- Automatically generated forms with consistent UI across the platform
- Custom form implementations for complex entities
- Support for detail sections, tabs, and specialized form layouts
- Integration with MemberJunction's metadata system
- Tree-shake safe implementation for production builds
- Form components following MemberJunction's design patterns

## Installation

```bash
npm install @memberjunction/ng-core-entity-forms
```

## Requirements

- Angular 18+
- @memberjunction/core
- @memberjunction/core-entities
- @memberjunction/ng-explorer-core
- @memberjunction/ng-base-forms
- Various MemberJunction and Kendo UI components

## Usage

The package includes two main modules:

1. `CoreGeneratedFormsModule` - Contains all auto-generated form components
2. `MemberJunctionCoreEntityFormsModule` - Contains custom form components

### Basic Setup

Import the necessary modules in your application module:

```typescript
import { 
  CoreGeneratedFormsModule, 
  MemberJunctionCoreEntityFormsModule 
} from '@memberjunction/ng-core-entity-forms';

@NgModule({
  imports: [
    // other imports...
    CoreGeneratedFormsModule,
    MemberJunctionCoreEntityFormsModule
  ],
})
export class YourModule { }
```

### Using Generated Forms

Generated forms are dynamically loaded based on entity names. The typical pattern is to use a component factory to create the appropriate form component:

```typescript
import { Component, ViewChild, ViewContainerRef, ComponentFactoryResolver } from '@angular/core';
import { Metadata } from '@memberjunction/core';

@Component({
  selector: 'app-entity-form-container',
  template: '<ng-container #formContainer></ng-container>'
})
export class EntityFormContainerComponent {
  @ViewChild('formContainer', { read: ViewContainerRef }) formContainer!: ViewContainerRef;
  
  constructor(
    private componentFactoryResolver: ComponentFactoryResolver,
    private metadata: Metadata
  ) {}
  
  async loadEntityForm(entityName: string, recordId: any) {
    // Clear the container
    this.formContainer.clear();
    
    // Get the form component class for the entity
    const formComponent = await this.metadata.GetEntityFormComponent(entityName);
    if (formComponent) {
      // Create the component
      const factory = this.componentFactoryResolver.resolveComponentFactory(formComponent);
      const componentRef = this.formContainer.createComponent(factory);
      
      // Set inputs
      componentRef.instance.recordId = recordId;
      
      // Initialize the form
      await componentRef.instance.ngOnInit();
    }
  }
}
```

### Using Custom Forms

Custom forms can be used directly in your templates:

```html
<!-- For the extended Entity form -->
<mj-entities-form 
  [recordId]="entityId" 
  [showToolbar]="true"
  (saved)="onEntitySaved($event)">
</mj-entities-form>

<!-- For the extended EntityAction form -->
<mj-entity-action-form
  [recordId]="actionId"
  [showToolbar]="true"
  (saved)="onActionSaved($event)">
</mj-entity-action-form>
```

## Architecture

### Generated Forms

The `CoreGeneratedFormsModule` contains multiple sub-modules that collectively register all generated form components. Each entity has:

1. A main form component (e.g., `EntityFormComponent`)
2. Multiple section components (e.g., `EntityDetailsComponent`, `EntityTopComponent`)
3. A loader function to prevent tree-shaking (e.g., `LoadEntityFormComponent()`)

### Custom Forms

The `MemberJunctionCoreEntityFormsModule` contains extended form components that provide additional functionality beyond the auto-generated forms:

1. `EntityFormExtendedComponent` - Enhanced form for Entity management
2. `EntityActionExtendedFormComponent` - Enhanced form for EntityAction management
3. `ActionTopComponentExtended` - Custom top section for Action forms

## Forms Structure

Each entity form typically follows this structure:

1. A main form component that extends `BaseFormComponent`
2. Multiple section components for different aspects of the entity
3. A tabbed interface for complex entities
4. Integration with grids, dropdowns, and other UI components

## Key Components

| Component | Description |
|-----------|-------------|
| Entity forms | Forms for managing metadata entities (Entity, EntityField, etc.) |
| Action forms | Forms for managing actions and workflows |
| User forms | Forms for user management and permissions |
| Integration forms | Forms for external system integrations |
| AI-related forms | Forms for AI models, prompts, and agents |
| Content forms | Forms for content management |
| Communication forms | Forms for messaging and notifications |

## Notes

- Form components are dynamically instantiated at runtime based on entity names
- Custom loader functions are used to prevent tree-shaking in production builds
- The package is designed to work with the MemberJunction Explorer application
- Forms rely on metadata from the `@memberjunction/core` package for field definitions

## Dependencies

- @angular/common
- @angular/core
- @angular/forms
- @memberjunction/core
- @memberjunction/core-entities
- @memberjunction/ng-explorer-core
- @memberjunction/ng-base-forms
- @memberjunction/ng-form-toolbar
- @memberjunction/ng-tabstrip
- @memberjunction/ng-container-directives
- @memberjunction/ng-code-editor
- @memberjunction/ng-timeline
- @memberjunction/ng-join-grid
- @progress/kendo-angular-grid
- @progress/kendo-angular-dropdowns