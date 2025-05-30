# @memberjunction/actions-base

Base classes and interfaces for the MemberJunction Actions framework. This library provides the foundational components for implementing and executing actions across both server and client environments.

## Overview

The Actions framework in MemberJunction provides a flexible, metadata-driven system for executing business logic and operations. This base package contains the core classes and interfaces that enable:

- **Action Engine**: Core engine for loading, configuring, and executing actions
- **Entity Actions**: Actions that operate on specific entities with various invocation contexts
- **Code Generation**: Support for dynamically generated action code with library management
- **Execution Logging**: Built-in logging and result tracking for all action executions

## Installation

```bash
npm install @memberjunction/actions-base
```

## Core Components

### ActionEngineBase

The singleton base class that manages all action metadata and provides the foundation for action execution.

```typescript
import { ActionEngineBase } from '@memberjunction/actions-base';

// Get the singleton instance
const actionEngine = ActionEngineBase.Instance;

// Configure the engine (required before use)
await actionEngine.Config(false, userInfo);

// Access action metadata
const allActions = actionEngine.Actions;
const coreActions = actionEngine.CoreActions;
const actionParams = actionEngine.ActionParams;
const actionFilters = actionEngine.ActionFilters;
```

### EntityActionEngineBase

Manages entity-specific actions and their various invocation contexts (single record, view-based, list-based).

```typescript
import { EntityActionEngineBase } from '@memberjunction/actions-base';

// Get the singleton instance
const entityActionEngine = EntityActionEngineBase.Instance;

// Configure the engine
await entityActionEngine.Config(false, userInfo);

// Get actions for a specific entity
const customerActions = entityActionEngine.GetActionsByEntityName('Customers', 'Active');

// Get actions by invocation type
const viewActions = entityActionEngine.GetActionsByEntityNameAndInvocationType(
    'Orders', 
    'View', 
    'Active'
);
```

## Action Types and Models

### ActionParam

Represents input/output parameters for actions:

```typescript
import { ActionParam } from '@memberjunction/actions-base';

const param: ActionParam = {
    Name: 'CustomerID',
    Value: '12345',
    Type: 'Input' // 'Input' | 'Output' | 'Both'
};
```

### RunActionParams

Configuration for running an action:

```typescript
import { RunActionParams } from '@memberjunction/actions-base';

const runParams: RunActionParams = {
    Action: actionEntity,
    ContextUser: userInfo,
    SkipActionLog: false, // Optional
    Filters: [], // Optional filters to run before action
    Params: [
        { Name: 'Input1', Value: 'test', Type: 'Input' }
    ]
};
```

### ActionResult

The result object returned from action execution:

```typescript
import { ActionResult } from '@memberjunction/actions-base';

// ActionResult contains:
// - Success: boolean indicating if action succeeded
// - Result: ActionResultCodeEntity with the specific result code
// - LogEntry: ActionExecutionLogEntity for tracking
// - Message: Optional message about the outcome
// - Params: All parameters including outputs
```

### EntityActionInvocationParams

Parameters for invoking entity-specific actions:

```typescript
import { EntityActionInvocationParams } from '@memberjunction/actions-base';

const invocationParams: EntityActionInvocationParams = {
    EntityAction: entityActionExtended,
    InvocationType: invocationTypeEntity,
    ContextUser: userInfo,
    // One of these based on invocation type:
    EntityObject: customerEntity, // For single record
    ViewID: 'view-123', // For view-based
    ListID: 'list-456' // For list-based
};
```

## Extended Entity Classes

### ActionEntityExtended

Enhanced action entity with additional functionality:

```typescript
import { ActionEntityExtended } from '@memberjunction/actions-base';

// Provides additional properties:
const action = actionEngine.Actions[0] as ActionEntityExtended;
console.log(action.IsCoreAction); // true if core MJ action
console.log(action.ProgrammaticName); // Code-friendly name
console.log(action.ResultCodes); // Possible result codes
console.log(action.Params); // Action parameters
console.log(action.Libraries); // Required libraries
```

### EntityActionEntityExtended

Enhanced entity action with related data:

```typescript
import { EntityActionEntityExtended } from '@memberjunction/actions-base';

// Provides lazy-loaded related data:
const entityAction = entityActionEngine.EntityActions[0] as EntityActionEntityExtended;
console.log(entityAction.Filters); // Associated filters
console.log(entityAction.Invocations); // Invocation configurations
console.log(entityAction.Params); // Action parameters
```

## Code Generation Support

The framework includes support for generated code with library tracking:

```typescript
import { GeneratedCode, ActionLibrary } from '@memberjunction/actions-base';

// GeneratedCode structure
const generatedCode: GeneratedCode = {
    Success: true,
    Code: 'function execute() { ... }',
    LibrariesUsed: [
        {
            LibraryName: 'lodash',
            ItemsUsed: ['map', 'filter']
        }
    ],
    Comments: 'Processes customer data',
    ErrorMessage: undefined
};
```

## Usage Examples

### Basic Action Engine Configuration

```typescript
import { ActionEngineBase } from '@memberjunction/actions-base';
import { UserInfo } from '@memberjunction/core';

async function initializeActionEngine(user: UserInfo) {
    const engine = ActionEngineBase.Instance;
    
    // Initial configuration
    await engine.Config(false, user);
    
    // Force refresh if needed
    await engine.Config(true, user);
    
    // Access loaded metadata
    console.log(`Loaded ${engine.Actions.length} actions`);
    console.log(`Core actions: ${engine.CoreActions.length}`);
}
```

### Working with Entity Actions

```typescript
import { EntityActionEngineBase } from '@memberjunction/actions-base';

async function getEntityActions(entityName: string, user: UserInfo) {
    const engine = EntityActionEngineBase.Instance;
    await engine.Config(false, user);
    
    // Get all active actions for an entity
    const actions = engine.GetActionsByEntityName(entityName, 'Active');
    
    // Filter by invocation type
    const singleRecordActions = actions.filter(a => 
        a.Invocations.some(i => i.InvocationType === 'Single Record')
    );
    
    return singleRecordActions;
}
```

### Action Parameter Handling

```typescript
import { ActionParam } from '@memberjunction/actions-base';

function prepareActionParams(inputs: Record<string, any>): ActionParam[] {
    return Object.entries(inputs).map(([name, value]) => ({
        Name: name,
        Value: value,
        Type: 'Input'
    }));
}

// Example usage
const params = prepareActionParams({
    CustomerID: '123',
    OrderDate: new Date(),
    TotalAmount: 150.00
});
```

## Dependencies

- `@memberjunction/global`: Global utilities and registration system
- `@memberjunction/core`: Core MemberJunction interfaces and base classes
- `@memberjunction/core-entities`: Entity definitions for MemberJunction metadata

## Integration with Other MemberJunction Packages

This package serves as the foundation for:

- `@memberjunction/actions-server`: Server-side action execution implementation
- `@memberjunction/actions-client`: Client-side action execution
- Custom action implementations in your applications

## Best Practices

1. **Always Configure Before Use**: Call `Config()` on the engine instances before accessing any metadata
2. **Use Singleton Instances**: Always use the `.Instance` property to get engine instances
3. **Handle Async Operations**: All configuration and many operations are asynchronous
4. **Check Action Status**: Filter actions by status ('Active', 'Pending', 'Disabled') when appropriate
5. **Validate Parameters**: Ensure all required input parameters are provided before execution

## TypeScript Support

This package is written in TypeScript and provides full type definitions. All classes and interfaces are properly typed for optimal development experience.

## License

ISC License - see LICENSE file in the root of the repository.