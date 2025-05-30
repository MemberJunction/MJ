# @memberjunction/core-actions

The `@memberjunction/core-actions` library provides a collection of pre-built actions that are essential to the MemberJunction framework. These actions handle common operations like sending messages, detecting external changes, and vectorizing entities for AI processing.

## Overview

This package contains both custom-built and generated actions that extend the MemberJunction Actions framework. It provides ready-to-use implementations for core functionality that many MemberJunction applications require.

## Important Note

**This library should only be imported on the server side.** It contains server-specific dependencies and functionality that are not suitable for client-side applications.

## Installation

```bash
npm install @memberjunction/core-actions
```

## Available Actions

### 1. Send Single Message Action

Provides a simple wrapper around the MemberJunction Communication Framework to send single messages through various communication providers.

**Class:** `SendSingleMessageAction`  
**Registration Name:** `"Send Single Message"`

**Parameters:**
- `Subject` (string): The subject of the message
- `Body` (string): The body content of the message
- `To` (string): The recipient's address
- `From` (string): The sender's address
- `Provider` (string): The name of the Communication Provider to use
- `MessageType` (string): The name of the Message Type within the provider

**Example Usage:**

```typescript
import { SendSingleMessageAction } from '@memberjunction/core-actions';
import { ActionEngine } from '@memberjunction/actions';

// Execute the action through the Action Engine
const result = await ActionEngine.RunAction({
    ActionName: 'Send Single Message',
    Params: [
        { Name: 'Subject', Value: 'Welcome to MemberJunction' },
        { Name: 'Body', Value: 'Thank you for joining our platform!' },
        { Name: 'To', Value: 'user@example.com' },
        { Name: 'From', Value: 'noreply@memberjunction.com' },
        { Name: 'Provider', Value: 'SendGrid' },
        { Name: 'MessageType', Value: 'Email' }
    ],
    ContextUser: currentUser
});

if (result.Success) {
    console.log('Message sent successfully');
} else {
    console.error('Failed to send message:', result.Message);
}
```

### 2. Vectorize Entity Action

Enables vectorization of entity data for AI and machine learning operations. This action integrates with MemberJunction's AI vector synchronization system to create vector embeddings of entity records.

**Class:** `VectorizeEntityAction`  
**Registration Name:** `"Vectorize Entity"`

**Parameters:**
- `EntityNames` (string | string[]): Entity name(s) to vectorize. Can be:
  - A single entity name as a string
  - Multiple entity names as a comma-separated string
  - An array of entity names

**Example Usage:**

```typescript
import { VectorizeEntityAction } from '@memberjunction/core-actions';
import { ActionEngine } from '@memberjunction/actions';

// Vectorize a single entity
const singleResult = await ActionEngine.RunAction({
    ActionName: 'Vectorize Entity',
    Params: [
        { Name: 'EntityNames', Value: 'Customers' }
    ],
    ContextUser: currentUser
});

// Vectorize multiple entities
const multiResult = await ActionEngine.RunAction({
    ActionName: 'Vectorize Entity',
    Params: [
        { Name: 'EntityNames', Value: 'Customers,Products,Orders' }
    ],
    ContextUser: currentUser
});

// Or using an array
const arrayResult = await ActionEngine.RunAction({
    ActionName: 'Vectorize Entity',
    Params: [
        { Name: 'EntityNames', Value: ['Customers', 'Products', 'Orders'] }
    ],
    ContextUser: currentUser
});
```

### 3. External Change Detection Action

Detects and replays changes from external systems that have modified data outside of the MemberJunction framework. This is crucial for maintaining data consistency when external systems directly modify the database.

**Class:** `ExternalChangeDetectionAction`  
**Registration Name:** `"Run External Change Detection"`

**Parameters:**
- `EntityList` (string, optional): Comma-separated list of entity names to check for changes. If not provided, all eligible entities will be processed.

**Example Usage:**

```typescript
import { ExternalChangeDetectionAction } from '@memberjunction/core-actions';
import { ActionEngine } from '@memberjunction/actions';

// Check specific entities for changes
const specificResult = await ActionEngine.RunAction({
    ActionName: 'Run External Change Detection',
    Params: [
        { Name: 'EntityList', Value: 'Customers,Orders,Invoices' }
    ],
    ContextUser: currentUser
});

// Check all eligible entities
const allResult = await ActionEngine.RunAction({
    ActionName: 'Run External Change Detection',
    Params: [],
    ContextUser: currentUser
});

if (specificResult.Success) {
    console.log('External changes detected and replayed successfully');
} else {
    console.error('Change detection failed:', specificResult.Message);
}
```

## Integration with MemberJunction Actions Framework

All actions in this package extend the `BaseAction` class from `@memberjunction/actions` and are automatically registered with the MemberJunction class factory system using the `@RegisterClass` decorator.

To use these actions, you typically interact with them through the `ActionEngine` rather than instantiating them directly:

```typescript
import { ActionEngine } from '@memberjunction/actions';

// The actions are automatically registered when the module is loaded
const result = await ActionEngine.RunAction({
    ActionName: 'Action Name Here',
    Params: [...],
    ContextUser: user
});
```

## Dependencies

This package depends on several core MemberJunction packages:

- `@memberjunction/global` - Global utilities and class registration
- `@memberjunction/core` - Core MemberJunction functionality
- `@memberjunction/core-entities` - Entity definitions
- `@memberjunction/actions` - Base action framework
- `@memberjunction/communication-engine` - Communication framework
- `@memberjunction/external-change-detection` - Change detection engine
- `@memberjunction/ai-vector-sync` - AI vectorization functionality
- `@memberjunction/content-autotagging` - Content tagging capabilities

## Building and Development

To build this package:

```bash
# From the package directory
npm run build

# Or from the repository root using Turbo
turbo build --filter="@memberjunction/core-actions"
```

The package uses TypeScript and compiles to JavaScript with type definitions included.

## Result Handling

All actions return an `ActionResultSimple` object with the following structure:

```typescript
interface ActionResultSimple {
    Success: boolean;      // Whether the action completed successfully
    Message?: string;      // Error message or additional information
    ResultCode: string;    // Either "SUCCESS" or "FAILED"
}
```

Always check the `Success` property before proceeding with dependent operations.

## Server-Side Only

This package contains server-side dependencies and should never be imported in client-side code. It relies on:
- Database connections
- File system access
- Server-side API integrations
- Heavy computational processes

For client-side action needs, refer to client-safe action packages in the MemberJunction ecosystem. 