# MemberJunction Actions Framework

This directory contains the packages that make up the MemberJunction Actions Framework, a comprehensive system for defining, executing, and managing custom business logic within the MemberJunction platform.

## Overview

The Actions Framework provides a flexible, extensible architecture for implementing business logic that can be triggered manually, on a schedule, or in response to entity lifecycle events. Actions can perform any custom processing needed by your application, from simple data transformations to complex integrations with external systems.

## Package Structure

### Core Framework Packages

- **[@memberjunction/actions-base](./Base)** - Base classes and interfaces for the Actions framework
  - Singleton patterns: `ActionEngineBase` and `EntityActionEngineBase`
  - Type-safe context support for multi-user environments
  - Extended entity classes with lazy-loaded relationships
  - Code generation integration
  - [See full documentation](./Base/README.md)

- **[@memberjunction/actions](./Engine)** - The main Actions execution engine
  - Server-side action discovery and execution
  - Entity lifecycle action support (Create/Update/Delete)
  - Transaction management and error handling
  - AI-powered code generation for new actions
  - Action filtering and permission system
  - [See full documentation](./Engine/readme.md)

### Action Implementation Packages

- **[@memberjunction/core-actions](./CoreActions)** - Comprehensive collection of 40+ pre-built actions across 11 categories:
  - **Communication**: Send messages via email/SMS, Slack/Teams webhooks
  - **AI Integration**: Execute AI prompts, create vector embeddings
  - **Data Transformation**: Parse CSV/JSON/XML, aggregate data, map fields
  - **File Operations**: Generate/extract PDFs, read/write Excel, compress files
  - **Web Integration**: Search web, extract metadata, validate URLs
  - **Integration**: HTTP requests, GraphQL queries, OAuth flows, API rate limiting
  - **Workflow Control**: Conditional logic, loops, parallel execution, retry mechanisms
  - **Utilities**: External change detection, QR codes, business days calculator
  - **Security**: Password strength evaluation
  - **Demo Actions**: Weather, stock prices, unit conversion, text analysis
  - [See detailed documentation](./CoreActions/readme.md) for complete action reference

- **[@memberjunction/generated-actions](../GeneratedActions)** - Auto-generated action subclasses based on database metadata. This package is automatically maintained by the MemberJunction code generation system.

### Integration Actions

- **[@memberjunction/actions-apollo](./ApolloEnrichment)** - Apollo.io data enrichment integration
  - Enrich accounts with company information and technology stacks
  - Enrich contacts with verified emails and employment history
  - Batch processing with automatic rate limit handling
  - Technology detection and tracking
  - [See full documentation](./ApolloEnrichment/README.md)

- **[@memberjunction/actions-content-autotag](./ContentAutotag)** - Automated content tagging and vectorization
  - Process local files, RSS feeds, and websites
  - Automatic categorization using configurable tagging strategies
  - Optional AI vector embeddings for searchability
  - Combined autotag + vectorize action for efficiency
  - [See full documentation](./ContentAutotag/README.md)

### Scheduling and Automation

- **[@memberjunction/scheduled-actions](./ScheduledActions)** - Scheduling engine for recurring action execution
  - Cron expression support for complex schedules
  - Predefined schedules (daily, weekly, monthly, yearly)
  - Dynamic parameter population via SQL queries
  - Timezone-aware scheduling
  - Integration with MJ metadata system
  - [See full documentation](./ScheduledActions/README.md)

- **[@memberjunction/scheduled-actions-server](./ScheduledActionsServer)** - HTTP server for scheduled action execution
  - Express-based REST API
  - Manual and automated execution endpoints
  - Concurrent execution control
  - Environment-based configuration
  - Security with optional API key authentication
  - [See full documentation](./ScheduledActionsServer/README.md)

## Key Concepts

### Actions
Actions are discrete units of business logic that:
- Extend the `BaseAction` class
- Define their parameters and return types
- Can be executed standalone or as part of entity operations
- Support transactions and error handling
- Are discoverable through the MemberJunction metadata system

### Child Actions
Child actions provide type-safe specializations of more generic parent actions:
- **Purpose**: Create strongly-typed, narrowly-scoped versions of generic actions
- **Inheritance**: Child actions reference their parent via `ParentID` field
- **Independent Execution**: Children execute as standalone actions (no special engine handling)
- **Multi-level Support**: Actions can have children, grandchildren, etc.

#### Examples:

1. **Type Specialization**:
   - Parent: `CreateRecord` - Generic action accepting JSON payload
   - Child: `CreateCustomer` - Strongly-typed with specific parameters for customer fields
   - Child: `CreateOrder` - Strongly-typed with order-specific parameters

2. **Scope Restriction**:
   - Parent: `FileAccess` - General file system access (not exposed to agents)
   - Child: `ReadLogFiles` - Can only read `.log` files from `/var/logs/`
   - Child: `ReadUserDocuments` - Limited to user's document directory

#### Benefits:
- **Security**: Parent actions can be restricted while children have controlled access
- **Type Safety**: Strong typing for specific use cases
- **AI Code Generation**: Child actions receive parent context for better code generation
- **Discoverability**: Narrowly-scoped actions are easier to understand and use

#### AI Code Generation:
When generating child actions, the AI automatically:
- Creates appropriate action parameters based on the specialization
- Generates action result codes for different outcomes
- Implements scope restrictions in the generated code
- Maintains consistency with the parent action's behavior

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

## Available Actions

The MemberJunction Actions Framework includes 40+ pre-built actions. Here are some highlights:

### Most Commonly Used Actions

1. **Send Single Message** - Universal communication across providers (email, SMS, etc.)
2. **Execute AI Prompt** - Run MemberJunction AI prompts with model selection
3. **HTTP Request** - Make API calls with authentication support
4. **Vectorize Entity** - Create searchable AI embeddings for any entity
5. **Web Search** - Search the web using DuckDuckGo API
6. **Data Mapper** - Transform data between different formats
7. **Conditional** - Control flow based on conditions
8. **Loop** - Iterate over collections or ranges

For the complete list of actions with detailed documentation, see the [Core Actions README](./CoreActions/readme.md).

## Getting Started

### Installation

```bash
# Install the core framework
npm install @memberjunction/actions @memberjunction/actions-base

# Install pre-built actions
npm install @memberjunction/core-actions

# For scheduled actions
npm install @memberjunction/scheduled-actions @memberjunction/scheduled-actions-server
```

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

// Execute with context (for multi-user environments)
const contextResult = await engine.RunAction('MyCustomAction', [
    { Name: 'InputParam', Value: 'test data' }
], contextUser);
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

## Quick Reference

### Common Action Patterns

```typescript
// Execute multiple actions in sequence
await engine.RunAction('Loop', [
    { Name: 'Items', Value: ['item1', 'item2', 'item3'] },
    { Name: 'ActionName', Value: 'ProcessItem' }
]);

// Conditional execution
await engine.RunAction('Conditional', [
    { Name: 'Condition', Value: 'user.role === "admin"' },
    { Name: 'TrueAction', Value: 'AdminAction' },
    { Name: 'FalseAction', Value: 'UserAction' }
]);

// Parallel execution
await engine.RunAction('Parallel Execute', [
    { Name: 'Actions', Value: ['Action1', 'Action2', 'Action3'] }
]);

// Send notifications
await engine.RunAction('Send Single Message', [
    { Name: 'MessageTypeID', Value: 'email-type-id' },
    { Name: 'RecipientEmail', Value: 'user@example.com' },
    { Name: 'Subject', Value: 'Notification' },
    { Name: 'Body', Value: 'Your message here' }
]);
```

### Useful Resources

- **Detailed Package Documentation**: Each package has comprehensive README
- **Core Actions Catalog**: [40+ pre-built actions](./CoreActions/readme.md)
- **API Reference**: Generated TypeDoc documentation in each package
- **Examples**: Demo actions in [CoreActions/src/custom/demo](./CoreActions/src/custom/demo)

## Contributing

When contributing to the Actions Framework:

### For New Actions
1. Choose the appropriate package or create a new one
2. Extend `BaseAction` from `@memberjunction/actions`
3. Use `@RegisterClass` decorator for automatic discovery
4. Define clear parameter schemas
5. Implement comprehensive error handling
6. Add detailed JSDoc comments
7. Create unit tests

### For Framework Improvements
1. Follow TypeScript best practices
2. Maintain backward compatibility
3. Update relevant documentation
4. Add migration guides for breaking changes
5. Include performance considerations

### Documentation Standards
- Include code examples for all features
- Document all parameters and return types
- Add troubleshooting sections
- Keep README files up to date

### Testing Requirements
- Unit tests for all new functionality
- Integration tests for complex actions
- Performance tests for data-intensive operations

## License

All packages in the Actions Framework are part of the MemberJunction open-source project and follow the same licensing terms as the parent project.