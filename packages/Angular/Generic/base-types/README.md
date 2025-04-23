# @memberjunction/ng-base-types

Foundational types and base classes for Angular components in the MemberJunction ecosystem, providing common functionality and type definitions.

## Features

- Abstract base component for Angular integration
- Provider management for data access
- Common event types and coordination
- Form component event handling

## Installation

```bash
npm install @memberjunction/ng-base-types
```

## Usage

### BaseAngularComponent

Abstract base class for all MemberJunction Angular components:

```typescript
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

@Component({
  selector: 'your-component',
  templateUrl: './your.component.html',
  styleUrls: ['./your.component.css']
})
export class YourComponent extends BaseAngularComponent {
  // Your component implementation

  ngOnInit() {
    // Access providers through the base class
    const metadata = this.ProviderToUse;
    
    // Run views through the base class
    const viewProvider = this.RunViewToUse;
  }
}
```

The BaseAngularComponent provides:

- Provider management for connecting to different MemberJunction API instances
- Accessor methods for different provider types:
  - `ProviderToUse`: Access the metadata provider
  - `RunViewToUse`: Access the RunView provider
  - `RunQueryToUse`: Access the RunQuery provider
  - `RunReportToUse`: Access the RunReport provider

### Form Component Events

Types for coordinating events between form components:

```typescript
import { 
  BaseFormComponentEventCodes, 
  BaseFormComponentEvent,
  FormEditingCompleteEvent,
  PendingRecordItem
} from '@memberjunction/ng-base-types';

// Listen for form events
handleFormEvent(event: BaseFormComponentEvent) {
  switch(event.subEventCode) {
    case BaseFormComponentEventCodes.EDITING_COMPLETE:
      const editEvent = event as FormEditingCompleteEvent;
      // Process pending changes
      editEvent.pendingChanges.forEach(item => {
        if (item.action === 'save') {
          // Save the entity
          item.entityObject.Save();
        } else if (item.action === 'delete') {
          // Delete the entity
          item.entityObject.Delete();
        }
      });
      break;
      
    case BaseFormComponentEventCodes.REVERT_PENDING_CHANGES:
      // Handle reverting changes
      break;
      
    case BaseFormComponentEventCodes.POPULATE_PENDING_RECORDS:
      // Handle populating pending records
      break;
  }
}

// Create and emit a form event
const event = new FormEditingCompleteEvent();
event.pendingChanges = [
  { entityObject: myEntity, action: 'save' }
];
someEventEmitter.emit(event);
```

## Provider Configuration

You can customize the data providers used by components by setting the Provider input:

```typescript
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

// In your component template
<your-component [Provider]="customProvider"></your-component>

// In your component class
customProvider = new GraphQLDataProvider({
  endpoint: 'https://your-custom-endpoint/graphql',
  // other configuration options
});
```

This allows different components to connect to different MemberJunction API instances within the same application.