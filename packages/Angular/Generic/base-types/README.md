# @memberjunction/ng-base-types

Foundational types and base classes for Angular components in the MemberJunction ecosystem, providing common functionality and type definitions.

## Overview

This package provides essential building blocks for Angular applications using MemberJunction:
- **BaseAngularComponent**: Abstract base class providing standardized provider management
- **Event Types**: Common event definitions for form component coordination
- **Type Safety**: Full TypeScript support with strict typing

## Installation

```bash
npm install @memberjunction/ng-base-types
```

## Features

### Abstract Base Component
- Centralized provider management for data access
- Automatic provider inheritance throughout component trees
- Support for multiple concurrent API connections

### Form Event System
- Standardized event types for form component communication
- Support for save/delete operations coordination
- Pending changes management

### TypeScript Support
- Full type definitions for all exports
- Strict mode compatible
- Enhanced IDE intellisense

## API Documentation

### BaseAngularComponent

Abstract base class that all MemberJunction Angular components should extend:

```typescript
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'my-component',
  templateUrl: './my-component.html'
})
export class MyComponent extends BaseAngularComponent implements OnInit {
  ngOnInit() {
    // Access the metadata provider
    const metadata = this.ProviderToUse;
    
    // Use RunView functionality
    const viewProvider = this.RunViewToUse;
    
    // Execute queries
    const queryProvider = this.RunQueryToUse;
    
    // Run reports
    const reportProvider = this.RunReportToUse;
  }
}
```

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `Provider` | `IMetadataProvider \| null` | Optional custom provider instance. If not specified, uses the default global provider. |

#### Getter Methods

| Method | Return Type | Description |
|--------|-------------|-------------|
| `ProviderToUse` | `IMetadataProvider` | Returns the Provider if specified, otherwise returns the default Metadata.Provider |
| `RunViewToUse` | `IRunViewProvider` | Returns the provider cast as IRunViewProvider for running views |
| `RunQueryToUse` | `IRunQueryProvider` | Returns the provider cast as IRunQueryProvider for executing queries |
| `RunReportToUse` | `IRunReportProvider` | Returns the provider cast as IRunReportProvider for running reports |

### Form Component Events

#### BaseFormComponentEventCodes

Constants for event type identification:

```typescript
const BaseFormComponentEventCodes = {
  BASE_CODE: 'BaseFormComponent_Event',
  EDITING_COMPLETE: 'EDITING_COMPLETE',
  REVERT_PENDING_CHANGES: 'REVERT_PENDING_CHANGES',
  POPULATE_PENDING_RECORDS: 'POPULATE_PENDING_RECORDS'
}
```

#### Event Classes

##### BaseFormComponentEvent

Base class for all form component events:

```typescript
class BaseFormComponentEvent {
  subEventCode: string;      // Event type identifier
  elementRef: any;           // Reference to the emitting element
  returnValue: any;          // Optional return value
}
```

##### FormEditingCompleteEvent

Specialized event emitted when form editing is complete:

```typescript
class FormEditingCompleteEvent extends BaseFormComponentEvent {
  subEventCode: string = BaseFormComponentEventCodes.EDITING_COMPLETE;
  pendingChanges: PendingRecordItem[] = [];
}
```

##### PendingRecordItem

Represents a record pending save or delete:

```typescript
class PendingRecordItem {
  entityObject: BaseEntity;           // The entity to be processed
  action: 'save' | 'delete' = 'save'; // Action to perform
}
```

## Usage Examples

### Implementing a Component with Custom Provider

```typescript
import { Component, OnInit } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

@Component({
  selector: 'app-custom-provider',
  template: `
    <div>
      <child-component [Provider]="customProvider"></child-component>
    </div>
  `
})
export class CustomProviderComponent extends BaseAngularComponent implements OnInit {
  customProvider: GraphQLDataProvider;

  ngOnInit() {
    // Create a custom provider for a different API endpoint
    this.customProvider = new GraphQLDataProvider({
      endpoint: 'https://api.example.com/graphql',
      headers: {
        'Authorization': 'Bearer YOUR_TOKEN'
      }
    });
  }
}
```

### Handling Form Events

```typescript
import { Component, EventEmitter, Output } from '@angular/core';
import { 
  BaseAngularComponent,
  BaseFormComponentEvent,
  BaseFormComponentEventCodes,
  FormEditingCompleteEvent,
  PendingRecordItem
} from '@memberjunction/ng-base-types';

@Component({
  selector: 'app-form-handler',
  template: `...`
})
export class FormHandlerComponent extends BaseAngularComponent {
  @Output() formEvent = new EventEmitter<BaseFormComponentEvent>();

  async handleFormSubmit(entities: BaseEntity[]) {
    // Create the event
    const event = new FormEditingCompleteEvent();
    
    // Add pending changes
    event.pendingChanges = entities.map(entity => ({
      entityObject: entity,
      action: 'save' as const
    }));
    
    // Emit the event
    this.formEvent.emit(event);
  }

  onFormEvent(event: BaseFormComponentEvent) {
    switch (event.subEventCode) {
      case BaseFormComponentEventCodes.EDITING_COMPLETE:
        const editEvent = event as FormEditingCompleteEvent;
        this.processPendingChanges(editEvent.pendingChanges);
        break;
        
      case BaseFormComponentEventCodes.REVERT_PENDING_CHANGES:
        this.revertChanges();
        break;
        
      case BaseFormComponentEventCodes.POPULATE_PENDING_RECORDS:
        this.populateRecords();
        break;
    }
  }

  private async processPendingChanges(changes: PendingRecordItem[]) {
    for (const item of changes) {
      try {
        if (item.action === 'save') {
          await item.entityObject.Save();
        } else if (item.action === 'delete') {
          await item.entityObject.Delete();
        }
      } catch (error) {
        console.error(`Failed to ${item.action} entity:`, error);
      }
    }
  }
}
```

### Using Multiple Providers in an Application

```typescript
import { Component } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

@Component({
  selector: 'app-multi-tenant',
  template: `
    <div class="tenant-a">
      <user-list [Provider]="tenantAProvider"></user-list>
    </div>
    <div class="tenant-b">
      <user-list [Provider]="tenantBProvider"></user-list>
    </div>
  `
})
export class MultiTenantComponent extends BaseAngularComponent {
  tenantAProvider = new GraphQLDataProvider({
    endpoint: 'https://tenant-a.example.com/graphql'
  });
  
  tenantBProvider = new GraphQLDataProvider({
    endpoint: 'https://tenant-b.example.com/graphql'
  });
}
```

## Dependencies

### Runtime Dependencies
- `@memberjunction/core`: Core MemberJunction functionality
- `@memberjunction/core-entities`: Entity definitions
- `@memberjunction/global`: Global utilities
- `tslib`: TypeScript runtime helpers

### Peer Dependencies
- `@angular/common`: ^18.0.2
- `@angular/core`: ^18.0.2

## Build Configuration

This package uses Angular's `ngc` compiler for building:

```bash
npm run build
```

The package is configured with:
- No side effects for better tree-shaking
- Full TypeScript declarations
- Angular Ivy compatibility

## Integration with MemberJunction

This package is designed to work seamlessly with other MemberJunction packages:

- **@memberjunction/core**: Provides the entity and provider interfaces
- **@memberjunction/graphql-dataprovider**: Default data provider implementation
- **@memberjunction/ng-\***: Other Angular-specific packages that extend BaseAngularComponent

## Best Practices

1. **Always extend BaseAngularComponent** for MemberJunction Angular components
2. **Use the provider getters** instead of directly accessing Metadata or RunView classes
3. **Emit standardized events** using the provided event classes for better interoperability
4. **Handle errors appropriately** when processing pending changes
5. **Pass providers down the component tree** when working with multiple API endpoints

## Migration Guide

If upgrading from a previous version:

1. Update all components to extend `BaseAngularComponent`
2. Replace direct `Metadata` usage with `this.ProviderToUse`
3. Update event handling to use the standardized event types
4. Remove any custom provider management code in favor of the built-in system

## Known Issues

- The `RunQueryToUse` and `RunReportToUse` getters in the current implementation have incomplete type casting. Ensure your provider implements all required interfaces.

## Contributing

When contributing to this package:
1. Maintain backward compatibility
2. Add tests for new functionality
3. Update this README with new features
4. Follow the MemberJunction coding standards

## License

ISC