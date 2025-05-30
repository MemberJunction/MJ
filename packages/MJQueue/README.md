# @memberjunction/queue

A flexible queue management system for MemberJunction applications that enables background task processing, job scheduling, and asynchronous execution with database persistence.

## Overview

The `@memberjunction/queue` package provides a robust framework for implementing persistent queues in MemberJunction applications. It offers:

- Database-backed task persistence
- Automatic queue creation and management
- Concurrent task processing with configurable limits
- Heartbeat monitoring for process health
- Type-safe task definitions
- Extensible queue implementations

## Installation

```bash
npm install @memberjunction/queue
```

## Dependencies

This package requires the following MemberJunction packages:

- `@memberjunction/core` - Core functionality and entity management
- `@memberjunction/global` - Global utilities and class registration
- `@memberjunction/core-entities` - Entity type definitions
- `@memberjunction/ai` - AI functionality (for AI-related queues)
- `@memberjunction/aiengine` - AI Engine integration

Additional dependencies:
- `uuid` - For generating unique identifiers

## Core Components

### TaskBase

The `TaskBase` class represents an individual task in a queue:

```typescript
export class TaskBase {
  constructor(
    taskRecord: QueueTaskEntity,
    data: any,
    options: TaskOptions
  )
  
  // Properties
  ID: string              // Unique task identifier
  Status: TaskStatus      // Current task status
  Data: any              // Task payload data
  Options: TaskOptions   // Task configuration
  TaskRecord: QueueTaskEntity // Database entity
}
```

### TaskStatus

Available task statuses:

```typescript
export const TaskStatus = {
  Pending: 'Pending',
  InProgress: 'InProgress',
  Complete: 'Complete',
  Failed: 'Failed',
  Cancelled: 'Cancelled',
} as const;
```

### QueueBase

The abstract `QueueBase` class serves as the foundation for all queue implementations:

```typescript
export abstract class QueueBase {
  constructor(
    QueueRecord: QueueEntity,
    QueueTypeID: string,
    ContextUser: UserInfo
  )
  
  // Public methods
  AddTask(task: TaskBase): boolean
  FindTask(ID: string): TaskBase
  
  // Protected abstract method to implement
  protected abstract ProcessTask(
    task: TaskBase, 
    contextUser: UserInfo
  ): Promise<TaskResult>
}
```

### QueueManager

The `QueueManager` is a singleton that manages all active queues:

```typescript
export class QueueManager {
  // Singleton access
  static get Instance(): QueueManager
  
  // Static methods
  static async Config(contextUser: UserInfo): Promise<void>
  static async AddTask(
    QueueType: string,
    data: any,
    options: any,
    contextUser: UserInfo
  ): Promise<TaskBase | undefined>
  
  // Instance methods
  async AddTask(
    QueueTypeID: string,
    data: any,
    options: any,
    contextUser: UserInfo
  ): Promise<TaskBase | undefined>
}
```

### TaskResult

Structure returned by task processing:

```typescript
export class TaskResult {
  success: boolean      // Whether task completed successfully
  userMessage: string   // User-friendly message
  output: any          // Task output data
  exception: any       // Exception details if failed
}
```

## Usage Examples

### Basic Queue Implementation

Create a custom queue by extending `QueueBase`:

```typescript
import { QueueBase, TaskBase, TaskResult } from '@memberjunction/queue';
import { RegisterClass } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';

// Register your queue with a specific queue type name
@RegisterClass(QueueBase, 'Email Notification')
export class EmailNotificationQueue extends QueueBase {
  protected async ProcessTask(
    task: TaskBase, 
    contextUser: UserInfo
  ): Promise<TaskResult> {
    try {
      // Extract task data
      const { recipient, subject, body } = task.Data;
      
      // Implement your email sending logic here
      console.log(`Sending email to ${recipient}`);
      console.log(`Subject: ${subject}`);
      
      // Simulate email sending
      await this.sendEmail(recipient, subject, body);
      
      // Return success result
      return {
        success: true,
        userMessage: 'Email sent successfully',
        output: { sentAt: new Date() },
        exception: null
      };
    } catch (error) {
      // Return failure result
      return {
        success: false,
        userMessage: `Failed to send email: ${error.message}`,
        output: null,
        exception: error
      };
    }
  }
  
  private async sendEmail(to: string, subject: string, body: string) {
    // Your email service integration here
  }
}
```

### Adding Tasks to Queue

```typescript
import { QueueManager } from '@memberjunction/queue';
import { UserInfo } from '@memberjunction/core';

// Initialize queue manager (typically done once at app startup)
await QueueManager.Config(contextUser);

// Add a task using queue type name
const task = await QueueManager.AddTask(
  'Email Notification',  // Queue type name
  {                     // Task data
    recipient: 'user@example.com',
    subject: 'Welcome to MemberJunction',
    body: 'Thank you for joining!'
  },
  {                     // Task options
    priority: 1
  },
  contextUser
);

if (task) {
  console.log(`Task created with ID: ${task.ID}`);
}
```

### AI Action Queue Example

The package includes built-in queues for AI operations:

```typescript
import { AIActionQueue, EntityAIActionQueue } from '@memberjunction/queue';

// These queues are automatically registered and available for use
// Add an AI action task
const aiTask = await QueueManager.AddTask(
  'AI Action',
  {
    actionName: 'GenerateText',
    prompt: 'Write a product description',
    parameters: { maxTokens: 100 }
  },
  {},
  contextUser
);

// Add an entity-specific AI action
const entityAITask = await QueueManager.AddTask(
  'Entity AI Action',
  {
    entityName: 'Products',
    entityID: 123,
    actionName: 'GenerateDescription'
  },
  {},
  contextUser
);
```

## Database Schema

The queue system requires the following database tables:

### Queue Types Table (`__mj.QueueType`)
Stores definitions of different queue types (e.g., "Email Notification", "AI Action")

### Queues Table (`__mj.Queue`)
Tracks active queue instances with process information:
- Queue type reference
- Process details (PID, platform, hostname)
- Heartbeat timestamp
- Network information

### Queue Tasks Table (`__mj.QueueTask`)
Stores individual tasks:
- Queue reference
- Task status
- Task data (JSON)
- Task options (JSON)
- Output and error information

## Process Management

The QueueManager automatically captures process information for monitoring:
- Process ID (PID)
- Platform and version
- Working directory
- Network interfaces
- Operating system details
- User information
- Heartbeat timestamps

This information helps track queue health and enables failover scenarios.

## Configuration

Queue behavior can be configured through the implementation:

```typescript
export class CustomQueue extends QueueBase {
  private _maxTasks = 5;        // Maximum concurrent tasks
  private _checkInterval = 500;  // Check interval in milliseconds
  
  // Override these values in your constructor
  constructor(QueueRecord: QueueEntity, QueueTypeID: string, ContextUser: UserInfo) {
    super(QueueRecord, QueueTypeID, ContextUser);
    // Customize queue behavior
    this._maxTasks = 10;
    this._checkInterval = 1000;
  }
}
```

## Best Practices

1. **Task Data Structure**: Keep task data serializable as JSON
2. **Error Handling**: Always return proper TaskResult with error details
3. **Queue Registration**: Use `@RegisterClass` decorator for automatic registration
4. **Idempotency**: Design tasks to be safely retryable
5. **Resource Cleanup**: Clean up resources in finally blocks
6. **Monitoring**: Check heartbeat timestamps for queue health

## Integration with MemberJunction

The queue system integrates seamlessly with:
- **Entity System**: Use entities for task data and processing
- **User Context**: All operations respect user permissions
- **Global Registry**: Automatic queue discovery via class registration
- **AI Engine**: Built-in support for AI task processing

## Build & Development

```bash
# Build the package
npm run build

# Development mode with auto-reload
npm run start

# TypeScript compilation only
npm run build
```

## License

ISC