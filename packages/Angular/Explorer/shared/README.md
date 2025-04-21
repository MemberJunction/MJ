# @memberjunction/ng-shared

Utility functions and reusable components used across MemberJunction Explorer Angular packages.

> **Note**: This package is intended for internal use within MJ Explorer and should not be used independently outside of the MemberJunction Explorer application.

## Features

- Shared services for consistent application behavior
- Base components for navigation and resource management
- Resource type management
- Notification system integration
- Event management
- DOM utilities

## Installation

```bash
npm install @memberjunction/ng-shared
```

## Key Components

### SharedService

A singleton service that provides:

- Application-wide state management
- Resource type handling
- User notifications
- Markdown to HTML conversion
- DOM utilities
- Notification creation and management

```typescript
import { SharedService } from '@memberjunction/ng-shared';

// Get singleton instance
const service = SharedService.Instance;

// Create a notification
service.CreateSimpleNotification('Operation completed successfully', 'success', 3000);
```

### Base Components

#### BaseNavigationComponent

Base class for all MJ Explorer navigation components that can be displayed from a route:

```typescript
import { BaseNavigationComponent } from '@memberjunction/ng-shared';

export class YourNavigationComponent extends BaseNavigationComponent {
  // Your component implementation
}
```

#### BaseResourceComponent

Extended base class for components that work with MemberJunction resources:

```typescript
import { BaseResourceComponent } from '@memberjunction/ng-shared';

export class YourResourceComponent extends BaseResourceComponent {
  // Required abstract methods
  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    // Your implementation
    return 'Resource Name';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    // Your implementation
    return 'fa-icon-class';
  }
}
```

## Utilities

### Format Utilities

```typescript
// Convert Markdown to HTML list
const htmlList = service.ConvertMarkdownStringToHtmlList('Unordered', '- Item 1\n- Item 2');
```

### DOM Utilities

```typescript
// Check if one element is a descendant of another
const isDescendant = SharedService.IsDescendant(parentRef, childRef);

// Trigger manual resize events
service.InvokeManualResize(50);
```

### Resource Type Helpers

```typescript
// Get resource type by name
const resourceType = service.ResourceTypeByName('reports');

// Convert between route segments and resource type names
const routeSegment = service.mapResourceTypeNameToRouteSegment('user views');
const resourceTypeName = service.mapResourceTypeRouteSegmentToName('view');
```

## Events

The module includes predefined event codes for standardized application event handling:

```typescript
import { EventCodes } from '@memberjunction/ng-shared';

// Example event code
const eventCode = EventCodes.ViewClicked;
```