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
| **Test Harness Components** | **Interactive testing interfaces for AI agents and prompts** |

## AI Test Harness System

This package includes a comprehensive test harness system for AI Agents and AI Prompts, providing developers with powerful tools for testing, debugging, and validating AI components.

### Test Harness Components

#### 1. AI Agent Test Harness (`AIAgentTestHarnessComponent`)

A full-featured testing interface for AI agents with the following capabilities:

**Core Features:**
- **Interactive Chat Interface**: Real-time conversation with AI agents
- **Streaming Support**: Live streaming of agent responses with elapsed time tracking
- **Data Context Management**: Configure variables passed to agents during execution
- **Template Data Management**: Manage template variables for agent prompts
- **Conversation Persistence**: Save/load conversations with full state restoration
- **Import/Export**: JSON-based conversation backup and sharing
- **Content Formatting**: Automatic detection and rendering of Markdown, JSON, and plain text
- **Raw Content Toggle**: View both processed and raw AI responses
- **Error Handling**: Comprehensive error display and user feedback

**Usage Example:**
```html
<mj-ai-agent-test-harness 
  [aiAgent]="myAgent"
  [isVisible]="true"
  (visibilityChange)="onVisibilityChanged($event)">
</mj-ai-agent-test-harness>
```

**Data Context Configuration:**
```typescript
// Configure variables passed to the agent
this.testHarness.dataContextVariables = [
  { name: 'userId', value: 'user-123', type: 'string' },
  { name: 'department', value: 'Engineering', type: 'string' },
  { name: 'priority', value: '1', type: 'number' }
];
```

#### 2. AI Prompt Test Harness (`AIPromptTestHarnessComponent`)

A specialized testing interface for AI prompts with template variable management:

**Core Features:**
- **Prompt Testing**: Execute prompts with different AI models
- **Template Variable Management**: Configure and test prompt variables
- **Model Selection**: Choose from available AI models for testing
- **Rendered Prompt Preview**: View how templates render with current variables
- **Conversation Management**: Similar conversation features as agent harness
- **Variable Auto-Detection**: Automatically detect variables in prompt templates

**Usage Example:**
```html
<mj-ai-prompt-test-harness 
  [aiPrompt]="myPrompt"
  [template]="promptTemplate"
  [templateContent]="templateContent"
  [isVisible]="true">
</mj-ai-prompt-test-harness>
```

#### 3. Test Harness Dialog Service (`TestHarnessDialogService`)

A centralized service for opening test harnesses in modal dialogs:

**Features:**
- **Configurable Dialogs**: Custom sizing, titles, and initial data
- **Agent Loading**: Load agents by ID or use existing entities
- **Dimension Support**: Viewport units (vw, vh) and pixel dimensions
- **Initial Data Setup**: Pre-populate context and template variables

**Usage Examples:**
```typescript
// Open AI Agent test harness
const dialogRef = this.testHarnessService.openAgentTestHarness({
  agentId: 'agent-123',
  title: 'Test My Agent',
  width: '90vw',
  height: '80vh',
  initialDataContext: { 
    userId: 'user-456',
    department: 'Engineering'
  }
});

// Open AI Prompt test harness
const dialogRef = this.testHarnessService.openPromptTestHarness({
  promptId: 'prompt-789',
  selectedModelId: 'gpt-4',
  initialTemplateVariables: { 
    name: 'Alice',
    context: 'Customer support inquiry'
  }
});

// Convenience methods
await this.testHarnessService.openAgentById('agent-123');
await this.testHarnessService.openPromptById('prompt-456');
```

### Enhanced AI Agent Form

The AI Agent form (`AIAgentFormComponentExtended`) includes integrated test harness access:

**Features:**
- **Built-in Test Button**: Direct access to test harness from agent form
- **Related Entity Management**: View sub-agents, prompts, actions, and execution history
- **Status Indicators**: Visual status badges and execution mode icons
- **Navigation Support**: Links to related entities
- **Execution History**: Recent runs with timing and status information

**Enhanced Capabilities:**
```typescript
// Open test harness from form
this.openTestHarness(); // Validates agent is saved first

// View execution status
this.getExecutionStatusIcon(status); // Returns appropriate FontAwesome icon
this.getExecutionStatusColor(status); // Returns status color

// Format timing information
this.formatExecutionTime(milliseconds); // Human-readable time format
```

### Conversation Management

Both test harnesses include comprehensive conversation management:

**Features:**
- **Auto-Save**: Conversations automatically save during active sessions
- **Manual Save**: Save conversations with custom names
- **Load/Restore**: Restore complete conversation state including variables
- **Export/Import**: JSON-based conversation portability
- **Storage Limits**: Automatic cleanup (50 conversation limit)

**Export Format:**
```json
{
  "agent": {
    "id": "agent-123",
    "name": "Customer Service Agent",
    "description": "Handles customer inquiries"
  },
  "messages": [...],
  "dataContext": {
    "userId": "user-456",
    "department": "Support"
  },
  "templateData": {
    "customerName": "John Doe"
  },
  "exportedAt": "2024-01-15T10:30:00.000Z"
}
```

### Content Rendering System

Advanced content formatting with automatic type detection:

**Supported Formats:**
- **Markdown**: Headers, lists, code blocks, links, emphasis
- **JSON**: Syntax highlighting and pretty formatting
- **Plain Text**: Clean text rendering with line breaks

**Content Type Detection:**
```typescript
// Automatically detects content type
const contentType = this.detectContentType(content);
// Returns: 'markdown' | 'json' | 'text'

// Renders content appropriately
const safeHtml = this.getFormattedContent(message);
```

### Integration Points

The test harness system integrates seamlessly with:

- **MemberJunction Entity System**: Uses proper entity loading patterns
- **GraphQL Data Provider**: Executes agents and prompts via GraphQL mutations
- **Notification Service**: User feedback for actions and errors
- **LocalStorage**: Conversation persistence across sessions
- **Kendo UI Dialogs**: Professional modal interfaces

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
- @memberjunction/ng-explorer-core
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

### Test Harness Components

The test harness system introduces several new components and services:

| Component/Service | Purpose |
|------------------|---------|
| `AIAgentTestHarnessComponent` | Interactive chat interface for testing AI agents |
| `AIPromptTestHarnessComponent` | Template variable testing for AI prompts |
| `AIAgentTestHarnessDialogComponent` | Modal dialog wrapper for agent testing |
| `AIPromptTestHarnessDialogComponent` | Modal dialog wrapper for prompt testing |
| `TestHarnessDialogService` | Centralized service for opening test harness dialogs |
| `AIAgentFormComponentExtended` | Enhanced AI agent form with integrated test harness |

### New Dependencies Added for Test Harness:
- **Angular DomSanitizer**: Safe HTML rendering for formatted content
- **RxJS Subjects**: Component lifecycle and event management
- **LocalStorage**: Conversation persistence across sessions
- **File API**: Import/export functionality for conversations