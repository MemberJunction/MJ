# MemberJunction Actions Framework

This directory contains the packages that make up the MemberJunction Actions Framework, a comprehensive system for defining, executing, and managing custom business logic within the MemberJunction platform.

## Overview

The Actions Framework provides a flexible, extensible architecture for implementing business logic that can be triggered manually, on a schedule, or in response to entity lifecycle events. Actions can perform any custom processing needed by your application, from simple data transformations to complex integrations with external systems.

## Package Structure

### Core Framework Packages

- **[@memberjunction/actions-base](./Base)** - Base classes and interfaces for the Actions framework, including `ActionEngineBase`, `EntityActionEngineBase`, and the `BaseAction` abstract class that all actions extend.

- **[@memberjunction/actions](./Engine)** - The main Actions execution engine that coordinates action discovery, filtering, execution, and logging. Includes server-side implementations and entity action support.

### Action Implementation Packages

- **[@memberjunction/core-actions](./CoreActions)** - Core system actions including:
  - Send Single Message - Send communications through various providers
  - Vectorize Entity - Create AI embeddings for entity data
  - External Change Detection - Detect and replay external database changes

- **[@memberjunction/generated-actions](../GeneratedActions)** - Auto-generated action subclasses based on database metadata. This package is automatically maintained by the MemberJunction code generation system.

### Integration Actions

- **[@memberjunction/actions-apollo](./ApolloEnrichment)** - Integration with Apollo.io for enriching organization and contact data. Includes batch processing and technology tracking capabilities.

- **[@memberjunction/actions-content-autotag](./ContentAutotag)** - Content autotagging and vectorization action that can process local files, RSS feeds, and websites to automatically categorize and create searchable embeddings.

### Scheduling and Automation

- **[@memberjunction/scheduled-actions](./ScheduledActions)** - Engine for scheduling actions to run at specific times or intervals using cron expressions or predefined schedules (daily, weekly, monthly, yearly).

- **[@memberjunction/scheduled-actions-server](./ScheduledActionsServer)** - HTTP server that executes scheduled actions based on database configuration. Provides REST API for manual execution and monitoring.

## Key Concepts

### Actions
Actions are discrete units of business logic that:
- Extend the `BaseAction` class
- Define their parameters and return types
- Can be executed standalone or as part of entity operations
- Support transactions and error handling
- Are discoverable through the MemberJunction metadata system

### Entity Actions
Special actions that operate on entity records:
- Can be triggered on Create, Update, or Delete events
- Support single record or batch operations
- Can validate data before persistence
- Integrate with the entity permission system

### Action Filters
Control which actions are available:
- Filter by category, entity, user permissions
- Support custom filtering logic
- Enable multi-tenant scenarios

### Scheduled Actions
Actions that run automatically:
- Support cron expressions for complex schedules
- Can use static parameters or dynamic SQL queries
- Track execution history and status
- Handle failures with configurable retry logic

## Getting Started

### Basic Action Implementation

```typescript
import { BaseAction, ActionParam } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';

@RegisterClass(BaseAction, 'MyCustomAction')
export class MyCustomAction extends BaseAction {
    override async Execute(params: ActionParam[]): Promise<ActionResult> {
        // Your custom logic here
        const inputValue = this.GetParamValue('InputParam', params);
        
        // Process the action
        const result = await this.processData(inputValue);
        
        return {
            Success: true,
            Result: result,
            Message: 'Action completed successfully'
        };
    }
}
```

### Using the Action Engine

```typescript
import { ActionEngineServer } from '@memberjunction/actions';

// Get the singleton instance
const engine = ActionEngineServer.Instance;

// Execute an action
const result = await engine.RunAction('MyCustomAction', [
    { Name: 'InputParam', Value: 'test data' }
]);
```

## Architecture

The Actions Framework follows these architectural principles:

1. **Extensibility** - New actions can be added without modifying core framework code
2. **Metadata-Driven** - Actions are discovered and configured through database metadata
3. **Type Safety** - Full TypeScript support with strongly-typed parameters and results
4. **Transaction Support** - Actions can participate in database transactions
5. **Security** - Integrated with MemberJunction's permission system
6. **Observability** - Comprehensive logging and execution tracking

## Best Practices

1. **Action Design**
   - Keep actions focused on a single responsibility
   - Use descriptive names that clearly indicate the action's purpose
   - Define clear parameter schemas
   - Return meaningful error messages

2. **Error Handling**
   - Always handle exceptions gracefully
   - Use the action result's Success flag and Message properties
   - Log errors for debugging

3. **Performance**
   - Consider batch operations for entity actions
   - Use transactions appropriately
   - Implement pagination for large data sets

4. **Testing**
   - Test actions in isolation
   - Verify parameter validation
   - Test error scenarios

## Integration

The Actions Framework integrates with:
- **Entity System** - Trigger actions on entity lifecycle events
- **Communication Framework** - Send emails, SMS, and other communications
- **AI Framework** - Leverage AI models for intelligent processing
- **Scheduled Jobs** - Run actions on a schedule
- **API Layer** - Expose actions through GraphQL/REST endpoints

## Contributing

When contributing to the Actions Framework:
1. Follow the established patterns in existing actions
2. Include comprehensive documentation
3. Add unit tests for new functionality
4. Update this README if adding new packages
5. Ensure backward compatibility

## License

All packages in the Actions Framework are part of the MemberJunction open-source project and follow the same licensing terms as the parent project.