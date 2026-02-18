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

- Angular 21+
- @memberjunction/core
- @memberjunction/core-entities
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

## Custom Form Development Guide

### **Core Architecture & Setup**
- **Location**: Custom forms live in `packages/Angular/Explorer/core-entity-forms/src/lib/custom/{EntityName}/`
- **File Structure**: 
  - `{entity-name}-form.component.ts` (main logic)
  - `{entity-name}-form.component.html` (template)
- **Inheritance**: Extend generated form components (e.g., `TemplateFormComponent`) which inherit from `BaseFormComponent`
- **Registration**: Use `@RegisterClass(BaseFormComponent, 'EntityName')` decorator
- **Module Integration**: Add to `custom-forms.module.ts` declarations, exports, and import required Kendo modules

### **Entity & Data Management**
- **Strong Typing**: Never use `any` - always use proper entity types (`TemplateEntity`, `TemplateCategoryEntity`)
- **Entity Creation**: Use `Metadata.GetEntityObject<EntityType>('EntityName')` pattern
- **Data Loading**: Use `RunView` with `ResultType='entity_object'` and generic typing
- **Cache Integration**: Leverage engine caches like `TemplateEngineBase.Instance.TemplateContentTypes`

### **Angular Best Practices**
- **Modern Syntax**: Always use `@if`, `@for`, `@switch` instead of structural directives
- **Track Functions**: Include `track` in `@for` loops for performance
- **Component Integration**: Use Kendo UI components for consistency (textbox, textarea, dropdownlist, combobox, numerictextbox, button)

### **Save Lifecycle & Validation**
- **Override SaveRecord()**: Handle complex saving by overriding `SaveRecord(StopEditModeAfterSave: boolean)`
- **Related Entity Creation**: Create related entities (categories) BEFORE calling `super.SaveRecord()`
- **Duplicate Prevention**: Implement validation like `trim().toLowerCase()` comparison for category names
- **Error Handling**: Use `MJNotificationService.Instance.CreateSimpleNotification()` for user feedback
- **State Management**: Respect `EditMode` state, implement proper change tracking

### **UI/UX Patterns**
- **Layout**: Use `mjFillContainer` directive with `bottomMargin` for proper container sizing
- **Form Fields**: Use `mj-form-field` for individual fields; avoid problematic `mj-form-section` properties
- **Responsive Design**: CSS Grid and Flexbox for layouts
- **Visual Feedback**: Implement hover effects, loading states, progress indicators
- **Smart Controls**: Conditional displays (e.g., show "New" badge for unsaved records, content type names for saved)

### **Development Workflow**
- **Package Building**: Always run `npm run build` in specific package directory for TypeScript checking
- **Workspace Management**: Never `npm install` in package directories - always at repo root
- **Dependencies**: Add to individual package.json, then `npm install` at root
- **Styling**: Add custom CSS to `src/shared/form-styles.css`

### **Advanced Features Implemented**
- **Dynamic Content Management**: Multiple related entities (Template Contents) with priority-based ordering
- **Type-Safe Dropdowns**: Filter invalid options, auto-select defaults
- **Smart Validation**: Prevent duplicates with normalized comparisons
- **User Feedback**: Comprehensive notification system for success/warning/error states
- **State Synchronization**: Proper coordination between main entity and related entity saves

### **Common Patterns & Anti-Patterns**
✅ **Do:**
- Use strong typing throughout
- Respect MemberJunction entity patterns
- Implement comprehensive error handling
- Provide clear user feedback
- Follow modern Angular syntax

❌ **Avoid:**
- Using `any` types
- Bypassing `Metadata.GetEntityObject()`
- Ignoring `EditMode` state
- Using outdated Angular syntax
- Running `npm install` in package directories
- Creating duplicate entities without validation

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

### Core Dependencies
- @angular/common
- @angular/core
- @angular/forms
- @memberjunction/core
- @memberjunction/core-entities
- @memberjunction/ng-base-forms

### UI Component Dependencies
- @memberjunction/ng-form-toolbar
- @memberjunction/ng-tabstrip
- @memberjunction/ng-container-directives
- @memberjunction/ng-code-editor
- @memberjunction/ng-timeline
- @memberjunction/ng-join-grid
- @progress/kendo-angular-grid
- @progress/kendo-angular-dropdowns
- @progress/kendo-angular-dialog

### AI & Notification Dependencies
- @memberjunction/ai
- @memberjunction/ng-notifications
- @memberjunction/graphql-dataprovider

## AI Agent Type UI Customization

### Overview

The AI Agent Type UI Customization feature allows AI Agent Types to define custom form sections or complete form overrides in the AI Agent form UI. This enables different agent types (like Flow, Analysis, Support, etc.) to have specialized UI components tailored to their specific configuration needs.

### Database Schema

The `AIAgentType` table includes three columns for UI customization (added in v2.76):

- `UIFormSectionKey` (NVARCHAR(500) NULL) - Registration key for custom form section component
- `UIFormKey` (NVARCHAR(500) NULL) - Registration key for complete form override component  
- `UIFormSectionExpandedByDefault` (BIT NOT NULL DEFAULT 1) - Whether custom section starts expanded

### Implementation Details

#### Dynamic Component Loading

The AI Agent form (`ai-agent-form.component.ts`) implements dynamic loading:
- Loads the agent type when the form initializes
- Checks for `UIFormSectionKey` on the agent type
- Dynamically loads and instantiates the custom section component
- Propagates `EditMode` changes to the custom section

#### Component Registration

Custom form sections must:
- Extend `BaseFormSectionComponent`
- Use `@RegisterClass` decorator with key pattern: `AI Agents.{SectionKey}`
- Implement standard form section lifecycle

Example:
```typescript
@RegisterClass(BaseFormSectionComponent, 'AI Agents.FlowAgentSection')
export class FlowAgentFormSectionComponent extends BaseFormSectionComponent {
    // Implementation
}
```

#### Flow Agent Example

The `FlowAgentFormSectionComponent` demonstrates a complete implementation:
- Loads AIAgentStep and AIAgentStepPath entities for the agent
- Displays workflow steps and paths in a structured view
- Shows starting steps with special highlighting
- Provides refresh functionality in edit mode
- Includes status indicators (Active/Pending/Disabled)
- Shows action input/output mappings

### Usage Guide

#### Creating a Custom Form Section

1. **Create the Component**
   ```typescript
   @Component({
       selector: 'mj-custom-agent-section',
       template: `...`,
       styles: [`...`]
   })
   @RegisterClass(BaseFormSectionComponent, 'AI Agents.CustomSection')
   export class CustomAgentSectionComponent extends BaseFormSectionComponent {
       // Access this.record for the current AIAgentEntity
       // Use this.EditMode to determine read/write state
   }
   ```

2. **Register in Module**
   - Add to declarations and exports in `custom-forms.module.ts`
   - Export from `public-api.ts` if needed externally

3. **Update Agent Type**
   ```sql
   UPDATE AIAgentType
   SET UIFormSectionKey = 'CustomSection',
       UIFormSectionExpandedByDefault = 1
   WHERE Name = 'YourAgentType';
   ```

#### Complete Form Override

For complete form replacement (not just a section), use `UIFormKey`:
```sql
UPDATE AIAgentType
SET UIFormKey = 'CustomCompleteForm'
WHERE Name = 'YourAgentType';
```

The custom form component should extend `BaseFormComponent` instead.

### Architecture

#### Component Hierarchy
```
AIAgentFormComponent (generated)
  └── AIAgentFormComponentExtended (custom)
        └── Dynamic Custom Section (via ViewContainerRef)
              └── FlowAgentFormSectionComponent (or other custom section)
```

#### Data Flow
1. Form loads agent record
2. Form queries agent type for UI customization keys
3. Form uses MJGlobal.ClassFactory to resolve component class
4. Form creates component instance in ViewContainerRef
5. Form passes record and EditMode to custom component
6. Custom component manages its own UI and data loading

### Best Practices

1. **Lazy Loading**: Custom sections should load their data only when needed
2. **Error Handling**: Handle data loading errors gracefully with user feedback
3. **Edit Mode**: Respect EditMode for read-only vs editable states
4. **Performance**: Use batch queries (RunViews) for loading related data
5. **Styling**: Follow existing MJ UI patterns and styles
6. **Type Safety**: Always use proper entity types, never `any`

### Future Enhancements

1. **Visual Flow Editor**: Integrate a proper flow visualization library (when Angular 21 compatible)
2. **Drag & Drop**: Allow visual workflow editing with drag and drop
3. **Conditional UI**: Show/hide sections based on agent configuration
4. **Template Library**: Pre-built custom sections for common agent types

## IS-A Type Hierarchy Visualization

The enhanced entity form provides comprehensive visualization of IS-A (inheritance) relationships between entities. This feature helps users understand type hierarchies and navigate entity inheritance chains.

### Visual Indicators

When viewing an entity that participates in IS-A relationships, the form displays several visual elements:

1. **Purple Hierarchy Badges**: Entities with IS-A relationships display purple badges with hierarchy icons indicating their role:
   - Parent entities show child entity counts
   - Child entities display their inheritance relationships

2. **Parent Entity Breadcrumb**: For child entities, a breadcrumb navigation shows the complete inheritance chain from the root parent down to the current entity. Users can click any parent in the chain to navigate to that entity.

3. **Field Source Indicators**: Individual fields show which parent entity they originated from. This helps users understand where each field is defined in the inheritance hierarchy.

4. **IS-A Hierarchy Visualization Panel**: A dedicated panel displays the complete type tree, showing:
   - All parent entities in the chain
   - All child entities (siblings in the hierarchy)
   - Relationships between entities
   - Navigation capabilities to any entity in the tree

5. **IS-A Settings Panel**: A collapsible panel allows users to manage the IS-A relationship:
   - View current parent entity assignment
   - Change the parent entity (in edit mode)
   - Configure inheritance settings
   - Understand relationship constraints

### Navigation Features

- Click on parent entity badges to navigate up the hierarchy
- Click on child entity badges to explore derived types
- Use the breadcrumb navigation for quick access to any parent
- Access the full hierarchy tree for comprehensive visualization

### Implementation Details

The IS-A visualization is built into the generated entity forms and automatically activates when an entity has IS-A relationships defined in the metadata. No additional configuration is required beyond setting up the IS-A relationships in the database schema.

For more information on IS-A relationships and implementation, see:
- [IS-A Relationships Documentation](../../../../MJCore/docs/isa-relationships.md)

## Virtual Entity UI

Virtual entities in MemberJunction are read-only entities backed by database views rather than physical tables. The entity forms provide specialized UI to clearly indicate virtual entity status and limitations.

### Visual Indicators

Virtual entities are displayed with distinctive visual elements:

1. **Purple Badge with Eye Icon**: A prominent badge labeled "Virtual Entity (Read-Only)" appears at the top of the form, featuring an eye icon to indicate the view-based nature.

2. **Underlying View Name**: The form displays the name of the database view that powers the virtual entity, helping users understand the data source.

3. **Disabled Actions**: Virtual entities do not show Create, Edit, or Delete buttons, as these operations are not supported for read-only views.

### Functional Characteristics

Virtual entities behave identically to regular entities for read operations:

- **RunView Queries**: Works exactly like regular entities for loading data
- **Entity Loading**: Can load individual records using standard entity loading mechanisms
- **Metadata Access**: Full metadata support for fields, relationships, and properties
- **Grid Display**: Can be displayed in grids and lists like regular entities

The key distinction is that mutation operations (Create, Update, Delete) are blocked at runtime, ensuring data integrity for view-based entities.

### Use Cases

Virtual entities are commonly used for:
- Aggregated reporting data
- Complex joined views for efficient querying
- Denormalized read-optimized views
- Cross-entity summary information
- Calculated or derived data sets

### Implementation Details

Virtual entities are defined by setting the `IsVirtualEntity` flag in the entity metadata. The form UI automatically detects this flag and applies the appropriate read-only restrictions and visual indicators.

For more information on virtual entities and implementation, see:
- [Virtual Entities Documentation](../../../../MJCore/docs/virtual-entities.md)

