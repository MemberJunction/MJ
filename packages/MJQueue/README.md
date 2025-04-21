# MemberJunction Queue

A library for creating and managing server-side queues in MemberJunction applications. This package provides a framework for task queuing, background processing, and asynchronous job execution.

## Overview

The `@memberjunction/queue` package offers a flexible architecture for implementing persistent queues in MemberJunction applications. It enables:

- Creation of background processing queues
- Task prioritization and scheduling
- Persistent storage of queue items in the database
- Retrying failed tasks with configurable policies
- Distributed queue processing across multiple server instances
- Monitoring and management of queue status

## Installation

```bash
npm install @memberjunction/queue
```

## Dependencies

This package relies on the following MemberJunction packages:
- `@memberjunction/core` - Core functionality
- `@memberjunction/global` - Global utilities
- `@memberjunction/core-entities` - Entity definitions
- `@memberjunction/ai` - AI functionality (for AI-related queues)
- `@memberjunction/aiengine` - AI Engine integration

## Key Components

### QueueBase

The `QueueBase` class is the foundation for all queue implementations, providing:

- Queue item registration and tracking
- Processing lifecycle management
- Error handling and retry logic
- Status reporting and logging

### QueueManager

The `QueueManager` class manages multiple queues in an application:

- Registers and initializes queues
- Schedules queue processing
- Provides centralized queue access
- Supports prioritization across queues

### TaskBase

The `TaskBase` class is the parent class for all queue tasks, with:

- Task metadata and parameters
- Execution status tracking
- Retry information
- Result storage

### Specialized Queue Implementations

- `AIModelInferenceQueue`: Manages AI model inference requests
- `EntityProcessingQueue`: Processes entity-related tasks
- `NotificationQueue`: Handles notification delivery
- `GenericQueue`: Multi-purpose queue for general tasks

## Usage

### Basic Queue Usage

```typescript
import { 
  QueueManager, 
  QueueBase, 
  TaskBase, 
  TaskStatus 
} from '@memberjunction/queue';

// Initialize the queue manager (typically done at application startup)
const queueManager = QueueManager.getInstance();

// Define a simple task
class EmailTask extends TaskBase {
  recipient: string;
  subject: string;
  body: string;

  constructor(recipient: string, subject: string, body: string) {
    super();
    this.recipient = recipient;
    this.subject = subject;
    this.body = body;
  }
}

// Implement a custom queue
class EmailQueue extends QueueBase {
  constructor() {
    super('EmailQueue', 'Handles email sending tasks');
  }

  // Implement the processing logic
  protected async processTask(task: EmailTask): Promise<boolean> {
    try {
      // Actual implementation would use an email service
      console.log(`Sending email to ${task.recipient}`);
      console.log(`Subject: ${task.subject}`);
      console.log(`Body: ${task.body}`);
      
      // Return true if processing succeeded
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }
}

// Register the queue
queueManager.registerQueue(new EmailQueue());

// Start queue processing
queueManager.startProcessing();

// Add a task to the queue
async function sendEmailLater(recipient: string, subject: string, body: string) {
  const task = new EmailTask(recipient, subject, body);
  await queueManager.getQueue('EmailQueue').addTask(task);
}

// Usage
sendEmailLater(
  'user@example.com',
  'Welcome to MemberJunction',
  'Thank you for registering with MemberJunction!'
);
```

### Creating a Custom Queue Implementation

```typescript
import { QueueBase, TaskBase, LoggingLevel } from '@memberjunction/queue';
import { BaseEntity } from '@memberjunction/core';

// Define a custom task type
class DataSyncTask extends TaskBase {
  entityName: string;
  recordId: number;
  sourceSystem: string;
  
  constructor(entityName: string, recordId: number, sourceSystem: string) {
    super();
    this.entityName = entityName;
    this.recordId = recordId;
    this.sourceSystem = sourceSystem;
    
    // Set task options
    this.maxRetries = 3; // Allow 3 retries
    this.priority = 2;   // Higher priority (lower number = higher priority)
  }
}

// Implement the queue
class DataSynchronizationQueue extends QueueBase {
  constructor() {
    super('DataSyncQueue', 'Synchronizes data with external systems');
    
    // Configure queue settings
    this.maxConcurrentTasks = 5;
    this.processingInterval = 60000; // Process every minute
    this.loggingLevel = LoggingLevel.Detailed;
  }
  
  protected async processTask(task: DataSyncTask): Promise<boolean> {
    // Validate task
    if (!task.entityName || !task.recordId || !task.sourceSystem) {
      this.logError(`Invalid task parameters: ${JSON.stringify(task)}`);
      return false;
    }
    
    try {
      // Get entity metadata and create instance
      const md = BaseEntity.getEntityMetadata(task.entityName);
      const entity = BaseEntity.createByEntityName(task.entityName);
      
      // Load the entity
      const loaded = await entity.load(task.recordId);
      if (!loaded) {
        this.logWarning(`Entity ${task.entityName} with ID ${task.recordId} not found`);
        return false;
      }
      
      // Perform synchronization (implementation details)
      this.logInfo(`Synchronizing ${task.entityName} #${task.recordId} with ${task.sourceSystem}`);
      
      // In a real implementation, you would call external APIs here
      
      // Update entity with synchronized data
      await entity.save();
      
      return true;
    } catch (error) {
      this.logError(`Error synchronizing data: ${error}`);
      
      // If this is a retriable error, return false to trigger retry
      return false;
    }
  }
}
```

### Queue Manager Configuration

```typescript
import { QueueManager, LoggingLevel } from '@memberjunction/queue';

// Get the singleton instance
const queueManager = QueueManager.getInstance();

// Configure queue manager
queueManager.configure({
  globalMaxConcurrentTasks: 20,
  defaultLoggingLevel: LoggingLevel.Normal,
  defaultProcessingInterval: 30000,
  databaseCleanupInterval: 86400000, // Clean up completed tasks daily
});

// Register multiple queues
queueManager.registerQueue(new EmailQueue());
queueManager.registerQueue(new DataSynchronizationQueue());
queueManager.registerQueue(new NotificationQueue());

// Start processing on all queues
queueManager.startProcessing();

// Or start selectively
queueManager.startProcessing(['EmailQueue', 'NotificationQueue']);

// Stop processing when needed
queueManager.stopProcessing();
```

## Database Schema

This package relies on database tables to store queue and task information. The required tables are:

- `__mj.Queue` - Stores queue definitions
- `__mj.QueueTask` - Stores individual tasks
- `__mj.QueueTaskExecution` - Tracks task execution history

These tables should be automatically created during MemberJunction schema installation.

## License

ISC