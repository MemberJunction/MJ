# @memberjunction/actions

The `@memberjunction/actions` library provides the core server-side infrastructure for the MemberJunction Actions Framework. It includes base classes for actions and filters, the action execution engine, and support for entity-specific actions.

## Overview

The Actions Framework is a powerful system for creating reusable, parameterized business logic that can be executed on demand. Actions are "verbs" in the MemberJunction ecosystem - they perform specific tasks and can be triggered through various mechanisms including entity events, API calls, or scheduled jobs.

**IMPORTANT:** This library should only be imported on the server side.

## Key Features

- **Action Engine**: Central execution engine for running actions with parameter validation, filtering, and logging
- **Entity Actions**: Actions that can be triggered on entity lifecycle events (create, update, delete)
- **Code Generation**: AI-powered automatic code generation for actions based on natural language prompts
- **Action Filters**: Pre-execution filters to control when actions should run
- **Transaction Support**: Built-in transaction management for complex multi-step operations
- **Comprehensive Logging**: Automatic logging of all action executions with parameters and results

## Installation

```bash
npm install @memberjunction/actions
```

## Dependencies

This package depends on several other MemberJunction packages:
- `@memberjunction/global` - Global utilities and class factory
- `@memberjunction/core` - Core MJ functionality and base classes
- `@memberjunction/actions-base` - Base types and interfaces for actions
- `@memberjunction/core-entities` - Entity definitions
- `@memberjunction/ai` - AI integration capabilities
- `@memberjunction/aiengine` - AI engine functionality
- `@memberjunction/doc-utils` - Documentation utilities

## Usage

### Creating a Custom Action

To create a custom action, extend the `BaseAction` class and implement the `InternalRunAction` method:

```typescript
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';

@RegisterClass(BaseAction, 'MyCustomAction')
export class MyCustomAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        // Access input parameters
        const inputParam = params.Params.find(p => p.Name === 'InputValue');
        
        // Perform your action logic
        const result = await this.performBusinessLogic(inputParam?.Value);
        
        // Return the result
        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: 'Action completed successfully',
            Params: params.Params // Include any output parameters
        };
    }
    
    private async performBusinessLogic(value: any): Promise<any> {
        // Your custom logic here
        return value;
    }
}
```

### Running Actions with ActionEngine

The `ActionEngineServer` class provides the main interface for executing actions:

```typescript
import { ActionEngineServer } from '@memberjunction/actions';
import { RunActionParams } from '@memberjunction/actions-base';

// Get the singleton instance
const engine = ActionEngineServer.Instance;

// Configure the engine (only needs to be done once)
await engine.Config(false, currentUser);

// Run an action by ID
const result = await engine.RunActionByID({
    ActionID: 'your-action-id',
    ContextUser: currentUser,
    Params: [
        { Name: 'InputParam', Value: 'some value', Type: 'string' }
    ]
});

// Run an action with full parameters
const params: RunActionParams = {
    Action: actionEntity, // ActionEntity instance
    ContextUser: currentUser,
    Filters: [], // Optional filters
    Params: [
        { Name: 'InputParam', Value: 'some value', Type: 'string' }
    ]
};

const result = await engine.RunAction(params);
```

### Entity Actions

Entity Actions are triggered automatically during entity lifecycle events. To work with entity actions, use the `EntityActionEngineServer`:

```typescript
import { EntityActionEngineServer } from '@memberjunction/actions';
import { EntityActionInvocationParams } from '@memberjunction/actions-base';

const entityActionEngine = EntityActionEngineServer.Instance;

// Run an entity action
const params: EntityActionInvocationParams = {
    EntityAction: entityActionEntity,
    InvocationType: invocationTypeEntity, // e.g., 'BeforeCreate', 'AfterUpdate'
    EntityObject: entityInstance,
    ContextUser: currentUser
};

const result = await entityActionEngine.RunEntityAction(params);
```

### Creating Custom Action Filters

Action filters determine whether an action should run. Create custom filters by extending `BaseActionFilter`:

```typescript
import { BaseActionFilter } from '@memberjunction/actions';
import { RunActionParams } from '@memberjunction/actions-base';
import { ActionFilterEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';

@RegisterClass(BaseActionFilter, 'MyCustomFilter')
export class MyCustomFilter extends BaseActionFilter {
    protected async InternalRun(
        params: RunActionParams, 
        filter: ActionFilterEntity
    ): Promise<boolean> {
        // Implement your filter logic
        // Return true to allow action execution, false to skip
        return params.ContextUser.IsActive === true;
    }
}
```

## API Reference

### Classes

#### ActionEngineServer

The main engine for executing actions.

**Methods:**
- `RunAction(params: RunActionParams): Promise<ActionResult>` - Executes an action with full control over parameters
- `RunActionByID(params: RunActionByNameParams): Promise<ActionResult>` - Convenience method to run an action by its ID
- `Config(forceRefresh?: boolean, contextUser?: UserInfo): Promise<void>` - Configures the engine (inherited from base)

#### BaseAction

Abstract base class for all actions.

**Methods:**
- `Run(params: RunActionParams): Promise<ActionResultSimple>` - Public method called by the engine
- `InternalRunAction(params: RunActionParams): Promise<ActionResultSimple>` - Abstract method to implement action logic

#### EntityActionEngineServer

Engine specifically for entity-related actions.

**Methods:**
- `RunEntityAction(params: EntityActionInvocationParams): Promise<EntityActionResult>` - Executes an entity action

#### BaseActionFilter

Abstract base class for action filters.

**Methods:**
- `Run(params: RunActionParams, filter: ActionFilterEntity): Promise<boolean>` - Public method called by the engine
- `InternalRun(params: RunActionParams, filter: ActionFilterEntity): Promise<boolean>` - Abstract method to implement filter logic

#### ActionEntityServerEntity

Server-side entity class for Actions with AI-powered code generation.

**Key Features:**
- Automatic code generation from natural language prompts
- Code validation and improvement through AI
- Library dependency management
- Transaction-safe save operations

### Types and Interfaces

The package exports all types from `@memberjunction/actions-base`, including:

- `RunActionParams` - Parameters for running an action
- `ActionResult` - Detailed result of action execution
- `ActionResultSimple` - Simplified action result
- `ActionParam` - Parameter definition for actions
- `EntityActionInvocationParams` - Parameters for entity actions
- `EntityActionResult` - Result of entity action execution

## Entity Action Invocation Types

The framework supports various invocation types for entity actions:

### Single Record Operations
- `Read` - Triggered when reading an entity
- `BeforeCreate` - Before creating a new record
- `AfterCreate` - After creating a new record
- `BeforeUpdate` - Before updating a record
- `AfterUpdate` - After updating a record
- `BeforeDelete` - Before deleting a record
- `AfterDelete` - After deleting a record

### Multiple Record Operations
- `List` - Actions operating on a list of records
- `View` - Actions operating on records from a view

### Validation
- `Validate` - Special invocation type for validation logic

## Code Generation

The framework includes sophisticated AI-powered code generation capabilities:

1. **Natural Language Input**: Define action behavior using plain English in the `UserPrompt` field
2. **Automatic Code Generation**: The system generates TypeScript code based on your prompt
3. **Code Validation**: Generated code is automatically validated and improved
4. **Library Management**: Automatic tracking and importing of required libraries

Example workflow:
```typescript
// In your database, create an Action record with:
// Name: "SendWelcomeEmail"
// Type: "Generated"
// UserPrompt: "Send a welcome email to a new user with their name and registration date"

// The system will automatically generate the implementation code
```

## Best Practices

1. **Action Naming**: Use clear, descriptive names for actions (e.g., `SendInvoiceEmail`, `CalculateOrderTotal`)

2. **Parameter Design**: Design action parameters to be reusable and flexible:
   ```typescript
   params: [
       { Name: 'EmailTemplate', Type: 'string', ValueType: 'Scalar' },
       { Name: 'RecipientUser', Type: 'User', ValueType: 'BaseEntity Sub-Class' },
       { Name: 'EmailSent', Type: 'boolean', ValueType: 'Scalar', IsInput: false }
   ]
   ```

3. **Error Handling**: Always include proper error handling in your actions:
   ```typescript
   try {
       // Action logic
       return { Success: true, ResultCode: 'SUCCESS', Message: 'Completed' };
   } catch (error) {
       return { Success: false, ResultCode: 'ERROR', Message: error.message };
   }
   ```

4. **Logging**: The framework automatically logs action executions, but include additional logging for debugging:
   ```typescript
   import { LogError, LogStatus } from '@memberjunction/core';
   
   LogStatus('Starting custom action processing...');
   ```

5. **Transaction Management**: Use transaction groups for multi-step operations:
   ```typescript
   const tg = await metadata.CreateTransactionGroup();
   try {
       // Multiple operations
       await tg.Submit();
   } catch (error) {
       // Automatic rollback on error
   }
   ```

## Integration with Other MJ Packages

This package integrates seamlessly with:

- **@memberjunction/core**: Provides base entity functionality and metadata access
- **@memberjunction/ai**: Enables AI-powered code generation
- **@memberjunction/core-entities**: Provides strongly-typed entity classes
- **@memberjunction/global**: Manages class registration and instantiation

## Advanced Topics

### Custom Action Engines

You can create custom action engines by extending `ActionEngineServer`:

```typescript
@RegisterClass(BaseEngine, 'ActionEngineBase', 1) // Higher priority
export class CustomActionEngine extends ActionEngineServer {
    protected async ValidateInputs(params: RunActionParams): Promise<boolean> {
        // Custom validation logic
        return super.ValidateInputs(params);
    }
    
    protected async RunFilters(params: RunActionParams): Promise<boolean> {
        // Custom filter logic
        return super.RunFilters(params);
    }
}
```

### Script Evaluation in Entity Actions

Entity actions support dynamic script evaluation for parameter mapping:

```typescript
// In EntityActionParam configuration:
{
    ValueType: 'Script',
    Value: `
        const user = EntityActionContext.entityObject;
        EntityActionContext.result = user.Email.toUpperCase();
    `
}
```

## Troubleshooting

1. **Action Not Found**: Ensure your action class is properly registered with `@RegisterClass`
2. **Code Generation Fails**: Check that AI models are configured and API keys are set
3. **Filter Not Running**: Verify filter is associated with the action in metadata
4. **Entity Action Not Triggering**: Confirm invocation type matches the entity operation

## License

This package is part of the MemberJunction ecosystem. See the main repository for license information. 