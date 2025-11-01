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

### Generated Actions & Child Actions

**AI-Powered Action Creation**: MemberJunction can automatically generate action implementations from natural language descriptions. This is particularly powerful for creating **child actions** - entity-specific wrappers around generic parent actions.

#### What Are Child Actions?

Child actions are specialized versions of parent actions that:
- Reference a parent action via the `ParentID` field
- Provide type-safe, narrowly-scoped interfaces
- Are typically generated by AI but can be manually written
- Execute independently (no special engine handling required)
- Support multi-level hierarchies (actions can have children, grandchildren, etc.)

#### How AI Generation Works

1. **Create Action Record**: Set `Type='Generated'` and write a `UserPrompt` describing what you want
2. **Optional Parent**: Set `ParentID` to create a child action that wraps a parent
3. **AI Generates Code**: When you save, AI automatically generates TypeScript implementation
4. **Review & Approve**: Generated code is saved to database for review
5. **Build**: Approved actions are included in the next build

#### The Child Action Pattern

The most powerful use case is creating **entity-specific child actions** around generic parent actions:

**Parent Action**: "Create Record" (requires EntityName parameter, complex Fields object)
**Generated Child**: "Create Conversation Record" (simple entity-specific parameters)

**Quick Example**:
```yaml
Name: Create Conversation Record
Type: Generated
ParentID: <Create Record action ID>
UserPrompt: Create a record in the Conversations entity using parameters
            from this action and maps to the parent Create Record action
```

**Result**: A working action with entity-specific parameters (UserID, Type, Name, etc.) and proper validation, error handling, and output parameters - all generated automatically.

**⚠️ Important Architectural Note: Composition, Not Inheritance**

Despite the name "child action," **this is NOT TypeScript class inheritance**. It's a **composition pattern**:

```typescript
// ✅ How it actually works
@RegisterClass(BaseAction, "Create Conversation Record")
export class Create_Conversation_Record_Action extends BaseAction {
    //                                            ^^^^^^^^^^^ Always BaseAction!

    protected override async InternalRunAction(params: RunActionParams) {
        // Maps child parameters to parent format
        const mappedParams: ActionParam[] = [
            { Name: 'EntityName', Type: 'Input', Value: 'Conversations' },
            { Name: 'Fields', Type: 'Input', Value: { UserID, Type, ... } }
        ];

        // Invokes parent via ActionEngine (runtime composition)
        const parentAction = ActionEngineServer.Instance.Actions.find(a =>
            a.ID === '2504e288-adf7-4913-a627-aa14276baa55'
        );
        return await ActionEngineServer.Instance.RunAction({
            Action: parentAction, Params: mappedParams, ContextUser: params.ContextUser
        });
    }
}

// ❌ NOT THIS - No TypeScript inheritance
export class Create_Conversation_Record_Action extends Create_Record_Action { }
```

**See Real Generated Examples:**
- [Create Conversation Record](./CoreActions/src/generated/action_subclasses.ts#L98-L215) - Full implementation
- [Get AI Model Cost](./CoreActions/src/generated/action_subclasses.ts#L218-L317) - Another example

For detailed explanation of why we use composition over inheritance, see [GENERATED-ACTIONS.md](./GENERATED-ACTIONS.md#important-composition-not-inheritance).

#### Benefits of Child Actions

- **Type Safety**: Each entity field is a distinct, typed parameter
- **Discoverability**: Users see "Create Conversation Record" not generic "Create Record"
- **Simpler Interface**: No need to specify EntityName or build Fields object
- **Entity Validation**: Required fields enforced based on entity schema
- **Better Workflows**: Workflow designers get intuitive, entity-specific actions
- **Security**: Parent actions can be restricted while children have controlled access
- **Metadata-Driven**: Parent relationship in database, can change without recompiling
- **AI Code Generation**: Child actions receive parent context for better code generation

#### Common Child Action Patterns

**1. Type Specialization** (most common - usually AI-generated):
- Parent: `Create Record` - Generic action accepting any entity
- Child: `Create Customer` - Strongly-typed with customer-specific parameters
- Child: `Create Order` - Strongly-typed with order-specific parameters

**2. Scope Restriction** (usually manually written):
- Parent: `File Access` - General file system access (not exposed to agents)
- Child: `Read Log Files` - Can only read `.log` files from `/var/logs/`
- Child: `Read User Documents` - Limited to user's document directory

**3. Parameter Transformation**:
- Parent: Generic action with complex parameter format
- Child: Simplified parameters with automatic transformation to parent format

#### When to Use Generated Actions

**✅ Good Use Cases**:
- Entity-specific CRUD wrappers (Create User, Get Order, Update Invoice)
- Parameter mapping between external APIs and MJ entities
- Simple validation + CRUD operations
- Actions with straightforward business logic

**❌ Better as Custom Actions**:
- Complex multi-step workflows
- External integrations with special requirements
- Performance-critical operations
- Security-sensitive operations

#### UserPrompt Patterns

**Simple CRUD Wrapper**:
```
Create a record in the [EntityName] entity using parameters from this
action and maps to the parent Create Record action and its format for parameters
```

**With Validation**:
```
Create a record in the Users entity. Validate that Email is valid format
and Password is at least 8 characters. Map to parent Create Record action.
```

**With Calculated Fields**:
```
Create an Invoice record. Calculate Subtotal as sum of LineItems amounts.
Calculate TaxAmount as Subtotal * TaxRate. Calculate TotalAmount as
Subtotal + TaxAmount. Map to parent Create Record action.
```

#### Complete Documentation

For comprehensive documentation including:
- Detailed architecture explanation
- Step-by-step creation guide
- UserPrompt best practices
- Code review workflow
- Troubleshooting guide
- Complete examples

**See: [GENERATED-ACTIONS.md](./GENERATED-ACTIONS.md)**

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

The MemberJunction Actions Framework provides actions in three categories:

### 1. Pre-Built Actions (40+)

Ready-to-use actions for common operations:

1. **Send Single Message** - Universal communication across providers (email, SMS, etc.)
2. **Execute AI Prompt** - Run MemberJunction AI prompts with model selection
3. **HTTP Request** - Make API calls with authentication support
4. **Vectorize Entity** - Create searchable AI embeddings for any entity
5. **Web Search** - Search the web using DuckDuckGo API
6. **Data Mapper** - Transform data between different formats
7. **Conditional** - Control flow based on conditions
8. **Loop** - Iterate over collections or ranges

For the complete list with detailed documentation, see the [Core Actions README](./CoreActions/readme.md).

### 2. Generated Actions (AI-Powered)

Create custom actions by describing them in plain English:
- **Entity-Specific CRUD**: Auto-generate wrappers for any entity (Create User, Get Order, etc.)
- **Parameter Mapping**: Transform external API parameters to MJ entity fields
- **Business Logic**: Simple validation and calculated fields
- **No Code Required**: AI writes the TypeScript implementation for you

Example: Create an action that validates email format and password strength before creating a User record - just describe it in the UserPrompt field.

See [GENERATED-ACTIONS.md](./GENERATED-ACTIONS.md) for complete guide.

### 3. Custom Actions

Write your own TypeScript actions for specialized needs:
- Complex business workflows
- External system integrations
- Performance-critical operations
- Security-sensitive operations

See [Basic Action Implementation](#basic-action-implementation) below for getting started.

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

**First, Consider Using Generated Actions**: Before writing a custom action, check if AI generation would work:
- Is this entity-specific CRUD? → Use Generated Actions
- Simple validation + database operation? → Use Generated Actions
- Complex workflow or external integration? → Write Custom Action

**For Custom Actions**:
1. Choose the appropriate package or create a new one
2. Extend `BaseAction` from `@memberjunction/actions`
3. Use `@RegisterClass` decorator for automatic discovery
4. Define clear parameter schemas
5. Implement comprehensive error handling
6. Add detailed JSDoc comments
7. Create unit tests

**For Generated Actions**:
1. Create Action record with `Type='Generated'`
2. Write clear, specific `UserPrompt`
3. Set `ParentID` if creating child action
4. Review generated code in database
5. Test thoroughly
6. Approve via `CodeApprovalStatus='Approved'`
7. Document any custom usage patterns

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