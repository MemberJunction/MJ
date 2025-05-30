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
- Angular pipes for text and URL formatting

## Installation

```bash
npm install @memberjunction/ng-shared
```

## Dependencies

### Peer Dependencies
- `@angular/common`: ^18.0.2
- `@angular/core`: ^18.0.2
- `rxjs`: ^7.8.1

### Core Dependencies
- `@memberjunction/core`: Provides core functionality and metadata management
- `@memberjunction/core-entities`: Entity definitions and resource management
- `@memberjunction/ng-notifications`: Notification system integration
- `@memberjunction/ng-base-types`: Base Angular component types
- `@memberjunction/graphql-dataprovider`: GraphQL data provider for API communication
- `@progress/kendo-angular-notification`: UI notification components

## Module Import

```typescript
import { MemberJunctionSharedModule } from '@memberjunction/ng-shared';

@NgModule({
  imports: [
    MemberJunctionSharedModule
    // ... other imports
  ]
})
export class YourModule { }
```

## Key Components

### SharedService

A singleton service that provides application-wide functionality:

```typescript
import { SharedService } from '@memberjunction/ng-shared';

// Get singleton instance
const service = SharedService.Instance;

// Access session ID
const sessionId = service.SessionId;

// Access resource types
const viewResourceType = service.ViewResourceType;
const recordResourceType = service.RecordResourceType;
const dashboardResourceType = service.DashboardResourceType;
const reportResourceType = service.ReportResourceType;
const searchResultsResourceType = service.SearchResultsResourceType;
const listResourceType = service.ListResourceType;

// Get resource type by ID or name
const resourceTypeById = service.ResourceTypeByID('some-id');
const resourceTypeByName = service.ResourceTypeByName('reports');

// Format column values
const formattedValue = service.FormatColumnValue(column, value, maxLength, '...');

// Create notifications (Note: prefer MJNotificationService for new code)
service.CreateSimpleNotification('Operation completed', 'success', 3000);

// Convert between route segments and resource type names
const routeSegment = service.mapResourceTypeNameToRouteSegment('user views'); // returns 'view'
const resourceTypeName = service.mapResourceTypeRouteSegmentToName('view'); // returns 'user views'
```

### Base Components

#### BaseNavigationComponent

Base class for all MJ Explorer navigation components that can be displayed from a route:

```typescript
import { Component } from '@angular/core';
import { BaseNavigationComponent } from '@memberjunction/ng-shared';

@Component({
  selector: 'app-your-navigation',
  templateUrl: './your-navigation.component.html'
})
export class YourNavigationComponent extends BaseNavigationComponent {
  // Inherits from BaseAngularComponent
  // Provides foundation for routable components
}
```

#### BaseResourceComponent

Extended base class for components that work with MemberJunction resources:

```typescript
import { Component } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';

@Component({
  selector: 'app-your-resource',
  templateUrl: './your-resource.component.html'
})
export class YourResourceComponent extends BaseResourceComponent {
  // Access resource data
  ngOnInit() {
    console.log(this.Data); // ResourceData object
  }

  // Required abstract methods
  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    // Return display name based on resource data
    return `Resource: ${data.ResourceRecordID}`;
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    // Return Font Awesome icon class
    return 'fa-solid fa-file';
  }

  // Lifecycle notifications
  protected onLoad() {
    this.NotifyLoadStarted();
    // ... load resource data
    this.NotifyLoadComplete();
  }

  // Handle resource save
  protected async saveResource() {
    const entity = await this.getResourceEntity();
    if (await entity.Save()) {
      this.ResourceRecordSaved(entity);
    }
  }
}
```

## Angular Pipes

### URLPipe (formatUrl)

Ensures URLs have proper protocol prefix:

```typescript
// In template
<a [href]="website | formatUrl">Visit Site</a>

// Transforms:
// "example.com" → "https://example.com"
// "http://example.com" → "http://example.com" (unchanged)
```

### SimpleTextFormatPipe (formatText)

Converts plain text formatting to HTML:

```typescript
// In template
<div [innerHTML]="description | formatText"></div>

// Transforms:
// "Line 1\nLine 2" → "Line 1<br>Line 2"
// "Text\tIndented" → "Text&nbsp;&nbsp;&nbsp;&nbsp;Indented"
```

## Utilities

### Format Utilities

```typescript
// Convert Markdown list to HTML
const htmlList = service.ConvertMarkdownStringToHtmlList('Unordered', '- Item 1\n- Item 2');
// Result: <ul><li>Item 1</li><li>Item 2</li></ul>

const orderedList = service.ConvertMarkdownStringToHtmlList('Ordered', '1. First\n2. Second');
// Result: <ol><li>First</li><li>Second</li></ol>
```

### DOM Utilities

```typescript
// Check if one element is a descendant of another
const isDescendant = SharedService.IsDescendant(parentRef, childRef);

// Trigger manual window resize event (useful for responsive components)
service.InvokeManualResize(50); // 50ms delay
```

### Push Status Updates

```typescript
// Subscribe to server push updates
service.PushStatusUpdates().subscribe(status => {
  console.log('Server status:', status);
});
```

## Event Codes

Predefined event codes for standardized application event handling:

```typescript
import { EventCodes } from '@memberjunction/ng-shared';

// Available event codes:
EventCodes.ViewClicked              // User clicked on a view
EventCodes.EntityRecordClicked      // User clicked on an entity record
EventCodes.AddDashboard            // Request to add a dashboard
EventCodes.AddReport               // Request to add a report
EventCodes.AddQuery                // Request to add a query
EventCodes.ViewCreated             // View was created
EventCodes.ViewUpdated             // View was updated
EventCodes.RunSearch               // Execute a search
EventCodes.ViewNotifications       // View notifications panel
EventCodes.PushStatusUpdates       // Server push status updates
EventCodes.UserNotificationsUpdated // User notifications changed
EventCodes.CloseCurrentTab         // Close current tab
EventCodes.ListCreated             // List was created
EventCodes.ListClicked             // User clicked on a list
```

## Integration with Other MJ Packages

This package seamlessly integrates with:

- **@memberjunction/core**: Uses Metadata for entity access and logging
- **@memberjunction/core-entities**: Works with ResourceTypeEntity, UserNotificationEntity, and ResourceData
- **@memberjunction/ng-notifications**: Delegates notification functionality to the dedicated notification service
- **@memberjunction/global**: Uses global event system and utilities

## Migration Notes

### Deprecated Methods

Several notification-related methods in SharedService are deprecated in favor of MJNotificationService:

```typescript
// Deprecated
SharedService.UserNotifications
SharedService.UnreadUserNotifications
SharedService.UnreadUserNotificationCount
service.CreateNotification(...)
SharedService.RefreshUserNotifications()
service.CreateSimpleNotification(...)

// Use instead
import { MJNotificationService } from '@memberjunction/ng-notifications';

MJNotificationService.UserNotifications
MJNotificationService.UnreadUserNotifications
MJNotificationService.UnreadUserNotificationCount
mjNotificationService.CreateNotification(...)
MJNotificationService.RefreshUserNotifications()
mjNotificationService.CreateSimpleNotification(...)
```

## Build

To build this package:

```bash
cd packages/Angular/Explorer/shared
npm run build
```

The build uses Angular's `ngc` compiler and outputs to the `dist` directory.