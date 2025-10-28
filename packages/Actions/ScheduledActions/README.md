# @memberjunction/scheduled-actions

A powerful scheduling engine for MemberJunction that enables system administrators to schedule any defined action for recurring or one-time future execution using cron expressions.

## Overview

The `@memberjunction/scheduled-actions` package provides a robust scheduling system that integrates with MemberJunction's action framework. It allows you to:

- Schedule any MemberJunction action for automated execution
- Define recurring schedules using cron expressions or simplified scheduling types
- Pass static or dynamic parameters to scheduled actions
- Execute SQL statements to populate action parameters dynamically
- Manage scheduled actions through the MemberJunction metadata system

## Installation

This package is part of the MemberJunction framework. Install it using npm:

```bash
npm install @memberjunction/scheduled-actions
```

## Key Features

- **Flexible Scheduling**: Support for daily, weekly, monthly, yearly, or custom cron-based schedules
- **Dynamic Parameters**: Action parameters can be static values or dynamically populated from SQL queries
- **Timezone Support**: Built-in timezone handling for scheduled executions
- **Integration**: Seamless integration with MemberJunction's action and metadata systems
- **Type Safety**: Full TypeScript support with strong typing

## Usage

### Basic Usage

```typescript
import { ScheduledActionEngine } from '@memberjunction/scheduled-actions';
import { UserInfo } from '@memberjunction/core';

// Get the singleton instance
const engine = ScheduledActionEngine.Instance;

// Execute all due scheduled actions
const contextUser = new UserInfo(); // Your authenticated user
const results = await engine.ExecuteScheduledActions(contextUser);

// Execute a specific scheduled action by name
const result = await engine.ExecuteScheduledAction('Daily Report Generation', contextUser);
```

### Configuration

The engine automatically loads scheduled actions and their parameters from the MemberJunction metadata system:

```typescript
// Force refresh of cached metadata
await engine.Config(true, contextUser);

// Access loaded scheduled actions
const actions = engine.ScheduledActions;
const params = engine.ScheduledActionParams;
```

### Creating Scheduled Actions

Scheduled actions are defined in the MemberJunction metadata system. Each scheduled action includes:

- **Name**: Unique identifier for the scheduled action
- **ActionID**: Reference to the MemberJunction action to execute
- **Type**: Scheduling type (Daily, Weekly, Monthly, Yearly, or Custom)
- **CronExpression**: Cron expression for execution timing (auto-generated for non-custom types)
- **Timezone**: Timezone for schedule evaluation
- **Status**: Active/Inactive status

### Parameter Types

Scheduled action parameters support two value types:

1. **Static**: Fixed values or JSON objects
   ```typescript
   // Static scalar value
   { ValueType: 'Static', Value: '42' }
   
   // Static JSON object
   { ValueType: 'Static', Value: '{"key": "value", "nested": {"prop": 123}}' }
   ```

2. **SQL Statement**: Dynamic values from SQL queries
   ```typescript
   { ValueType: 'SQL Statement', Value: 'SELECT COUNT(*) FROM Users WHERE Active = 1' }
   ```

### Schedule Types

The package supports several predefined schedule types that automatically generate appropriate cron expressions:

- **Daily**: Runs every day at midnight
- **Weekly**: Runs on a specific day of the week
- **Monthly**: Runs on a specific day of the month
- **Yearly**: Runs on a specific day and month each year
- **Custom**: Uses a manually defined cron expression

### Cron Expression Format

For custom schedules, use standard cron expressions:

```
┌───────────── second (0 - 59)
│ ┌───────────── minute (0 - 59)
│ │ ┌───────────── hour (0 - 23)
│ │ │ ┌───────────── day of month (1 - 31)
│ │ │ │ ┌───────────── month (1 - 12)
│ │ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)
│ │ │ │ │ │
│ │ │ │ │ │
* * * * * *
```

Example: `0 30 9 * * 1-5` runs at 9:30 AM every weekday

## API Reference

### ScheduledActionEngine

The main class for managing and executing scheduled actions.

#### Properties

- `ScheduledActions: ScheduledActionEntityExtended[]` - Array of all scheduled actions
- `ScheduledActionParams: ScheduledActionParamEntity[]` - Array of all scheduled action parameters
- `Instance: ScheduledActionEngine` - Singleton instance (static)

#### Methods

##### `Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<boolean>`
Loads or refreshes the scheduled actions metadata.

##### `ExecuteScheduledActions(contextUser: UserInfo): Promise<ActionResult[]>`
Executes all scheduled actions that are due based on their cron expressions.

##### `ExecuteScheduledAction(actionName: string, contextUser: UserInfo): Promise<ActionResult>`
Executes a specific scheduled action by name.

##### `IsActionDue(scheduledAction: ScheduledActionEntityExtended, evalTime: Date): boolean` (static)
Determines if a scheduled action is due for execution at the given time.

## Dependencies

This package depends on:

- `@memberjunction/core` - Core MemberJunction functionality
- `@memberjunction/core-entities` - Entity definitions
- `@memberjunction/actions` - Action execution framework
- `@memberjunction/sqlserver-dataprovider` - SQL Server data provider
- `@memberjunction/core-actions` - Core action implementations
- `cron-parser` - Cron expression parsing

## Integration with MemberJunction

The scheduled actions system integrates seamlessly with other MemberJunction components:

1. **Actions Framework**: Executes any action defined in the MemberJunction actions system
2. **Metadata System**: Stores and retrieves scheduled action configurations
3. **Entity System**: Uses MemberJunction entities for data persistence
4. **Security**: Respects user permissions through the UserInfo context

## Example: Creating a Daily Report

```typescript
// 1. Define your action in the MemberJunction actions system
// 2. Create a scheduled action record:
const scheduledAction = {
    Name: 'Daily Sales Report',
    ActionID: 'your-action-id',
    Type: 'Daily',
    Status: 'Active',
    Timezone: 'America/New_York'
};

// 3. Define parameters if needed:
const param = {
    ScheduledActionID: 'scheduled-action-id',
    ActionParamID: 'param-id',
    ValueType: 'SQL Statement',
    Value: 'SELECT DATEADD(day, -1, GETDATE())' // Yesterday's date
};

// 4. The action will automatically run daily at midnight
```

## Building

To build the package:

```bash
npm run build
```

The compiled JavaScript files will be output to the `dist/` directory.

## Development

For development with hot reloading:

```bash
npm start
```

## License

This package is part of MemberJunction and is licensed under the ISC license.

## Support

For issues, questions, or contributions, please visit the [MemberJunction GitHub repository](https://github.com/MemberJunction/MJ).