# MemberJunction External Change Detection

A powerful library for detecting and reconciling changes made to entities by external systems or integrations in MemberJunction applications.

## Overview

The `@memberjunction/external-change-detection` package provides functionality to detect when records in your MemberJunction entities have been modified by external systems, third-party integrations, or direct database changes that bypass the MemberJunction application logic. This helps maintain data integrity and ensures that your application can react appropriately to external modifications.

## Key Features

- Detect external changes to entity records
- Compare current state with previous snapshots
- Generate detailed change reports
- Support for field-level change detection
- Configurable change detection criteria
- Ability to replay/apply detected changes
- Built-in optimization for large datasets

## Installation

```bash
npm install @memberjunction/external-change-detection
```

## Dependencies

This package relies on the following MemberJunction packages:
- `@memberjunction/core`
- `@memberjunction/core-entities`
- `@memberjunction/global`
- `@memberjunction/sqlserver-dataprovider`

## Basic Usage

```typescript
import { ExternalChangeDetector } from '@memberjunction/external-change-detection';
import { User } from '@memberjunction/core-entities';

async function detectChanges() {
  // Create change detector instance
  const detector = new ExternalChangeDetector();
  
  // Run detection for the User entity
  const changes = await detector.detectChanges({
    entityName: 'User',
    captureTimeLimit: 30, // minutes
  });
  
  // Process detected changes
  console.log(`Detected ${changes.length} changes in User entity`);
  
  // Replay changes if needed
  if (changes.length > 0) {
    await detector.replayChanges(changes);
  }
}

detectChanges();
```

## Eligible Entities

Not all entities support external change detection. For an entity to be eligible for change detection:

1. The entity must have a TrackChanges property set to true in the metadata
2. The entity must have a LastUpdated or LastModifiedDate field
3. The entity must have the required fields for tracking history

You can check if an entity is eligible using:

```typescript
import { ExternalChangeDetector } from '@memberjunction/external-change-detection';

const detector = new ExternalChangeDetector();
const isEligible = await detector.isEntityEligibleForChangeDetection('User');

console.log(`User entity is eligible for change detection: ${isEligible}`);
```

## Detecting Changes

### Simple Detection

```typescript
import { ExternalChangeDetector } from '@memberjunction/external-change-detection';

const detector = new ExternalChangeDetector();
const changes = await detector.detectChanges({
  entityName: 'Customer',
  captureTimeLimit: 60 // Look back 60 minutes
});
```

### Filtering by Record IDs

```typescript
import { ExternalChangeDetector } from '@memberjunction/external-change-detection';

const detector = new ExternalChangeDetector();
const changes = await detector.detectChanges({
  entityName: 'Product',
  recordIDs: [1001, 1002, 1003], // Only check these specific records
  captureTimeLimit: 24 * 60 // Look back 24 hours
});
```

### Setting Change Criteria

```typescript
import { ExternalChangeDetector, ExternalChangeDetectorCriteria } from '@memberjunction/external-change-detection';

const criteria: ExternalChangeDetectorCriteria = {
  entityName: 'Order',
  captureTimeLimit: 120, // 2 hours
  includeFieldNames: ['Status', 'TotalAmount', 'CustomerID'], // Only check these fields
  excludeFieldNames: ['UpdatedBy', 'InternalNotes'] // Ignore changes to these fields
};

const detector = new ExternalChangeDetector();
const changes = await detector.detectChanges(criteria);
```

## Replaying Changes

Once changes are detected, you can replay or apply them through the MemberJunction application to ensure that all business logic is properly executed:

```typescript
import { ExternalChangeDetector } from '@memberjunction/external-change-detection';

async function syncChanges() {
  const detector = new ExternalChangeDetector();
  
  // Detect changes
  const changes = await detector.detectChanges({
    entityName: 'Invoice',
    captureTimeLimit: 720 // 12 hours
  });
  
  if (changes.length > 0) {
    // Apply the detected changes through MemberJunction
    const results = await detector.replayChanges(changes);
    
    // Log results
    console.log(`Applied ${results.successCount} changes successfully`);
    console.log(`Failed to apply ${results.failureCount} changes`);
    
    if (results.failureCount > 0) {
      console.error('Failures:', results.failures);
    }
  }
}
```

## Return Types

### ExternalChangeResult

```typescript
interface ExternalChangeResult {
  entityName: string;
  recordID: number;
  fieldChanges: ExternalFieldChange[];
  errorMessage?: string;
}
```

### ExternalFieldChange

```typescript
interface ExternalFieldChange {
  fieldName: string;
  oldValue: any;
  newValue: any;
}
```

### ReplayChangesResult

```typescript
interface ReplayChangesResult {
  successCount: number;
  failureCount: number;
  successes: ReplayChangeSuccess[];
  failures: ReplayChangeFailure[];
}
```

## Server-Side Usage

This library is primarily intended for server-side applications, often running as scheduled jobs or services that periodically check for external changes and reconcile them.

Example of setting up a scheduled check:

```typescript
import { ExternalChangeDetector } from '@memberjunction/external-change-detection';
import { EntityInfo } from '@memberjunction/core';

async function scheduleChangeDetection() {
  const detector = new ExternalChangeDetector();
  
  // Get all entities that support change detection
  const metadata = new EntityInfo();
  const entities = await metadata.getEntitiesWithTrackChanges();
  
  // Check each eligible entity
  for (const entity of entities) {
    try {
      const isEligible = await detector.isEntityEligibleForChangeDetection(entity.Name);
      
      if (isEligible) {
        console.log(`Checking ${entity.Name} for external changes...`);
        
        const changes = await detector.detectChanges({
          entityName: entity.Name,
          captureTimeLimit: 24 * 60 // Daily check
        });
        
        if (changes.length > 0) {
          await detector.replayChanges(changes);
          console.log(`Applied ${changes.length} changes to ${entity.Name}`);
        }
      }
    } catch (error) {
      console.error(`Error processing ${entity.Name}:`, error);
    }
  }
}
```

## Performance Considerations

For large entities with many records, change detection can be resource-intensive. Consider using these optimization strategies:

1. Use smaller `captureTimeLimit` values
2. Filter by specific `recordIDs` when possible
3. Use `includeFieldNames` to limit which fields are checked
4. Schedule detection jobs during off-peak hours
5. Process entities in batches
6. Implement error handling and retry logic

## License

ISC