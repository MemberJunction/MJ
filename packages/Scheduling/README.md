# MemberJunction Scheduled Jobs System

A robust, distributed scheduling system for MemberJunction that enables automated execution of agents, actions, and custom workflows on cron-based schedules. Built with enterprise-grade features including distributed locking, adaptive polling, and comprehensive observability.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Packages](#packages)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [Job Types](#job-types)
- [Configuration](#configuration)
- [Database Schema](#database-schema)
- [Actions API](#actions-api)
- [Best Practices](#best-practices)
- [Monitoring & Observability](#monitoring--observability)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)
- [Related Documentation](#related-documentation)

## Overview

The MemberJunction Scheduled Jobs system provides:

- **Cron-Based Scheduling**: Flexible scheduling using standard cron expressions
- **Distributed Locking**: Multi-server coordination with atomic lock acquisition
- **Adaptive Polling**: Dynamic polling intervals based on job schedules
- **Multiple Execution Modes**: Skip, Queue, and Concurrent concurrency strategies
- **Plugin Architecture**: Extensible driver system for Agent and Action execution
- **Comprehensive Actions API**: 6 custom actions for programmatic job management
- **Full Audit Trail**: Complete execution history with timing and error details

### Key Features

✅ **Enterprise-Ready**: Designed for multi-server deployments with proper concurrency control
✅ **Type-Safe**: Full TypeScript implementation with strong typing throughout
✅ **Metadata-Driven**: Leverages MemberJunction's metadata system for configuration
✅ **Extensible**: Plugin-based architecture allows custom job types
✅ **Observable**: Built-in logging, execution tracking, and statistics
✅ **Zero-Config**: Works out of the box with sensible defaults

## Architecture

The system uses a three-tier architecture for optimal separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                        MJServer                              │
│  ┌────────────────────────────────────────────────────┐     │
│  │         ScheduledJobsService (Lifecycle)           │     │
│  └────────────────────────────────────────────────────┘     │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              scheduling-engine (Server-Only)                 │
│  ┌────────────────────────────────────────────────────┐     │
│  │  ScheduledJobEngine                                │     │
│  │  • Polling Loop                                    │     │
│  │  • Lock Acquisition/Release                        │     │
│  │  • Job Execution Orchestration                     │     │
│  │  • Run Tracking                                    │     │
│  └────────────────────────────────────────────────────┘     │
│  ┌────────────────────────────────────────────────────┐     │
│  │  Drivers (Plugins)                                 │     │
│  │  • AgentScheduledJobDriver                         │     │
│  │  • ActionScheduledJobDriver                        │     │
│  └────────────────────────────────────────────────────┘     │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│        scheduling-engine-base (Metadata Cache)               │
│  ┌────────────────────────────────────────────────────┐     │
│  │  SchedulingEngineBase                              │     │
│  │  • Metadata Caching                                │     │
│  │  • Polling Interval Calculation                    │     │
│  │  • NextRunAt Management                            │     │
│  └────────────────────────────────────────────────────┘     │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│         scheduling-base-types (Core Types)                   │
│  • Interfaces                                                │
│  • Enums                                                     │
│  • Configuration Types                                       │
└──────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Polling Loop**: ScheduledJobEngine polls for due jobs based on adaptive interval
2. **Lock Acquisition**: Attempts atomic lock using database UPDATE WHERE clause
3. **Driver Execution**: Routes to appropriate driver (Agent or Action)
4. **Run Tracking**: Creates ScheduledJobRun record with timing and results
5. **Lock Release**: Clears lock fields after execution completes
6. **Metadata Refresh**: Periodically reloads job definitions and types

## Packages

### [`base-types`](./base-types)
**Type definitions and interfaces used across all scheduling packages.**

Core types and interfaces with zero dependencies beyond `@memberjunction/global`. Use this package when you need to reference scheduling types without pulling in the full engine.

**Key Exports**:
- `IScheduledJobDriver` - Plugin interface for job execution
- `ScheduledJobConfiguration` - Job configuration interface
- `ConcurrencyMode` - Skip | Queue | Concurrent
- `ExecutionContext` - Runtime context passed to drivers

**Dependencies**: `@memberjunction/global` only

---

### [`base-engine`](./base-engine)
**Metadata caching layer and polling interval calculation.**

Extends MemberJunction's BaseEngine pattern to provide efficient metadata caching for job types and job definitions. Calculates adaptive polling intervals based on the narrowest active job schedule.

**Key Features**:
- Metadata caching with automatic refresh
- Dynamic polling interval calculation (1 minute - 1 week)
- NextRunAt management for cron schedules
- Timezone-aware date handling

**Dependencies**:
- `@memberjunction/global`
- `@memberjunction/core`
- `@memberjunction/core-entities`
- `@memberjunction/scheduling-base-types`

**Key Classes**:
- `SchedulingEngineBase` - Abstract base with caching and interval logic

---

### [`engine`](./engine)
**Server-side execution engine (Node.js only).**

The core scheduling engine that handles polling, locking, job execution, and run tracking. **Only runs on the server** - never include in client bundles.

**Key Features**:
- Adaptive polling loop with configurable intervals
- Distributed locking with atomic SQL operations
- Stale lock detection and cleanup
- Concurrency mode enforcement (Skip/Queue/Concurrent)
- Driver-based job execution
- Comprehensive execution logging

**Dependencies**:
- All base package dependencies
- `cron-parser` for cron expression evaluation
- `@memberjunction/ai-agents` for agent execution
- `@memberjunction/actions` for action execution

**Key Classes**:
- `ScheduledJobEngine` - Main execution engine
- `AgentScheduledJobDriver` - Executes AI agents
- `ActionScheduledJobDriver` - Executes MJ actions
- `BaseScheduledJob` - Abstract base for custom drivers
- `CronExpressionHelper` - Cron utilities
- `NotificationManager` - Job notification system (TODO)

---

### [`actions`](./actions)
**Programmatic API for managing scheduled jobs.**

Six custom MemberJunction Actions that enable AI agents, workflows, and external systems to query, create, update, delete, and execute scheduled jobs programmatically.

**Actions Provided**:
1. **Query Scheduled Jobs** - Search/filter jobs with flexible criteria
2. **Create Scheduled Job** - Create jobs with cron validation
3. **Update Scheduled Job** - Partial updates with change tracking
4. **Delete Scheduled Job** - Delete with constraint validation
5. **Execute Scheduled Job Now** - Trigger immediate execution
6. **Get Scheduled Job Statistics** - Analytics and metrics

**Dependencies**:
- `@memberjunction/actions`
- `@memberjunction/actions-base`
- `@memberjunction/core`
- `@memberjunction/core-entities`
- `@memberjunction/scheduling-base-types`
- `cron-parser`

**Key Classes**:
- `BaseJobAction` - Shared validation and utilities
- `QueryScheduledJobsAction` - Query implementation
- `CreateScheduledJobAction` - Create implementation
- `UpdateScheduledJobAction` - Update implementation
- `DeleteScheduledJobAction` - Delete implementation
- `ExecuteScheduledJobNowAction` - Execute implementation
- `GetScheduledJobStatisticsAction` - Statistics implementation

**Metadata**: See [`/metadata/actions/.scheduling-actions.json`](../../metadata/actions/.scheduling-actions.json)

## Quick Start

### Installation

The scheduling system is integrated into MJServer by default. No separate installation is required.

### Enabling Scheduled Jobs

1. **Configure MJServer** (`mj.config.cjs`):

```javascript
module.exports = {
  scheduledJobs: {
    enabled: true,
    systemUserEmail: 'system@yourdomain.com',
    maxConcurrentJobs: 5,
    defaultLockTimeout: 600000,  // 10 minutes
    staleLockCleanupInterval: 300000  // 5 minutes
  }
};
```

2. **Start MJServer**:

```bash
npm run start:api
```

You'll see output like:
```
📅 Scheduled Jobs: 3 active job(s), polling every 1 minute(s)
```

### Creating Your First Job

#### Via SQL

```sql
-- Get the Agent job type ID
DECLARE @AgentJobTypeID UNIQUEIDENTIFIER = (
    SELECT ID FROM [__mj].[ScheduledJobType] WHERE Name = 'Agent'
);

-- Get your agent ID
DECLARE @AgentID UNIQUEIDENTIFIER = (
    SELECT ID FROM [__mj].[AIAgent] WHERE Name = 'Daily Report Generator'
);

-- Create the scheduled job
INSERT INTO [__mj].[ScheduledJob] (
    ID,
    JobTypeID,
    Name,
    Description,
    CronExpression,
    Timezone,
    Status,
    Configuration
)
VALUES (
    NEWID(),
    @AgentJobTypeID,
    'Daily Report - 8 AM',
    'Generate daily reports every morning at 8 AM',
    '0 8 * * *',  -- 8 AM every day
    'UTC',
    'Active',
    JSON_OBJECT('AgentID': @AgentID)
);
```

#### Via Actions API

```graphql
mutation CreateJob {
  RunAction(
    ActionName: "Create Scheduled Job"
    Params: [
      { Name: "Name", Value: "Daily Report - 8 AM" }
      { Name: "JobTypeID", Value: "F3C4A5B6-..." }
      { Name: "CronExpression", Value: "0 8 * * *" }
      { Name: "Status", Value: "Active" }
      { Name: "Description", Value: "Generate daily reports" }
    ]
  ) {
    Success
    Message
    Params {
      Name
      Value
    }
  }
}
```

## Core Concepts

### Cron Expressions

Standard 5-field cron syntax:

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday = 0)
│ │ │ │ │
* * * * *
```

**Examples**:
- `0 8 * * *` - Every day at 8:00 AM
- `*/15 * * * *` - Every 15 minutes
- `0 9 * * 1` - Every Monday at 9:00 AM
- `0 0 1 * *` - First day of every month at midnight
- `30 2 * * 0` - Every Sunday at 2:30 AM

### Distributed Locking

Jobs use database-level locking to prevent concurrent execution across multiple servers:

**Lock Fields**:
- `LockToken` - Unique GUID identifying the lock holder
- `LockedAt` - When lock was acquired
- `LockedByInstance` - Server instance identifier
- `ExpectedCompletionAt` - When lock should expire

**Lock Lifecycle**:
1. **Acquire**: Atomic `UPDATE ... WHERE LockToken IS NULL`
2. **Execute**: Run job with lock held
3. **Release**: Clear lock fields after completion
4. **Cleanup**: Detect stale locks past ExpectedCompletionAt

**Stale Lock Detection**:
Jobs with `ExpectedCompletionAt` in the past are considered stale and automatically cleaned up on the next poll cycle.

### Concurrency Modes

Control how jobs behave when already running:

**Skip** (Default)
```
Job due, already locked → Skip this execution
```
Use for: Non-critical periodic tasks

**Queue**
```
Job due, already locked → Create queued run for later
```
Use for: Important tasks that must eventually run

**Concurrent**
```
Job due, already locked → Execute anyway (allows parallel runs)
```
Use for: Independent tasks that can safely run in parallel

### Adaptive Polling

The engine dynamically adjusts its polling interval based on active jobs:

```typescript
// Finds the narrowest schedule among active jobs
const minInterval = Math.min(...jobs.map(j => nextExecution - now));

// Polls at half the interval (bounded by 1 min - 1 week)
pollingInterval = clamp(minInterval / 2, 60000, 604800000);
```

**Example**:
- Jobs scheduled: Daily, Hourly, Every 5 minutes
- Narrowest: 5 minutes = 300,000ms
- Polling interval: 150,000ms (2.5 minutes)

This ensures timely execution while minimizing database load.

### NextRunAt Calculation

Jobs maintain a `NextRunAt` timestamp calculated from their cron expression:

```typescript
// Calculated on job creation and after each execution
const nextRun = cronParser.parseExpression(job.CronExpression, {
    currentDate: new Date(),
    tz: job.Timezone
}).next().toDate();

job.NextRunAt = nextRun;
```

**Benefits**:
- Efficient queries (simple timestamp comparison)
- Timezone-aware scheduling
- No runtime cron parsing overhead

## Job Types

### Agent Jobs

Execute AI agents on a schedule. Agents can perform complex, multi-step tasks with memory and context.

**Configuration**:
```json
{
  "AgentID": "F3C4A5B6-7C8D-9E0F-1A2B-3C4D5E6F7A8B"
}
```

**Driver**: `AgentScheduledJobDriver`

**Example Use Cases**:
- Daily data analysis reports
- Periodic content generation
- Scheduled customer outreach
- Automated data quality checks

### Action Jobs

Execute MemberJunction Actions on a schedule. Actions are focused, single-purpose operations.

**Configuration**:
```json
{
  "ActionName": "Vectorize Entity",
  "Parameters": [
    { "Name": "EntityNames", "Value": "Documents" },
    { "Name": "MaxRecords", "Value": "1000" }
  ]
}
```

**Driver**: `ActionScheduledJobDriver`

**Example Use Cases**:
- Nightly data synchronization
- Periodic cache warmup
- Scheduled backups
- Automated cleanup tasks

### Custom Job Types

Create custom job types by implementing the `IScheduledJobDriver` interface:

```typescript
import { BaseScheduledJob } from '@memberjunction/scheduling-engine';
import { RegisterClass } from '@memberjunction/global';

@RegisterClass(BaseScheduledJob, 'My Custom Job Type')
export class MyCustomJobDriver extends BaseScheduledJob {
    public async Execute(context: ExecutionContext): Promise<JobExecutionResult> {
        // Your custom logic here
        return {
            Success: true,
            Message: 'Job completed successfully'
        };
    }
}
```

Then register your driver in the database:

```sql
INSERT INTO [__mj].[ScheduledJobType] (ID, Name, Description, DriverClass)
VALUES (
    NEWID(),
    'My Custom Job Type',
    'Description of what this job type does',
    '__MyCustomJobDriver'
);
```

## Configuration

### MJServer Configuration

Configure scheduled jobs in `mj.config.cjs`:

```javascript
module.exports = {
  scheduledJobs: {
    // Enable/disable the scheduling system
    enabled: true,

    // System user for job execution context
    systemUserEmail: 'system@yourdomain.com',

    // Maximum concurrent job executions
    maxConcurrentJobs: 5,

    // Default timeout for job execution (milliseconds)
    defaultLockTimeout: 600000,  // 10 minutes

    // How often to check for stale locks (milliseconds)
    staleLockCleanupInterval: 300000  // 5 minutes
  }
};
```

### Job-Level Configuration

Each job has its own configuration stored in the `Configuration` JSON field:

**Agent Job**:
```json
{
  "AgentID": "uuid-of-agent"
}
```

**Action Job**:
```json
{
  "ActionName": "Name of Action",
  "Parameters": [
    { "Name": "Param1", "Value": "value1" },
    { "Name": "Param2", "Value": "value2" }
  ]
}
```

### Environment Variables

Override configuration via environment variables:

```bash
# Enable/disable scheduling
SCHEDULED_JOBS_ENABLED=true

# System user email
SCHEDULED_JOBS_SYSTEM_USER=system@yourdomain.com

# Max concurrent jobs
SCHEDULED_JOBS_MAX_CONCURRENT=10
```

## Database Schema

### Core Tables

**`ScheduledJobType`** - Job type definitions
```sql
ID                UNIQUEIDENTIFIER PRIMARY KEY
Name              NVARCHAR(100)    -- "Agent", "Action", etc.
Description       NVARCHAR(MAX)
DriverClass       NVARCHAR(200)    -- ClassFactory key
IsActive          BIT
```

**`ScheduledJob`** - Job definitions
```sql
ID                UNIQUEIDENTIFIER PRIMARY KEY
JobTypeID         UNIQUEIDENTIFIER FK → ScheduledJobType
Name              NVARCHAR(255)
Description       NVARCHAR(MAX)
CronExpression    NVARCHAR(100)
Timezone          NVARCHAR(50)     -- IANA timezone
StartAt           DATETIME
EndAt             DATETIME
Status            NVARCHAR(20)     -- Active, Disabled, Paused, etc.
Configuration     NVARCHAR(MAX)    -- JSON
ConcurrencyMode   NVARCHAR(20)     -- Skip, Queue, Concurrent
NextRunAt         DATETIME         -- Calculated from cron
LockToken         UNIQUEIDENTIFIER -- Distributed lock
LockedAt          DATETIMEOFFSET
LockedByInstance  NVARCHAR(200)
ExpectedCompletionAt DATETIMEOFFSET
OwnerUserID       UNIQUEIDENTIFIER FK → User
```

**`ScheduledJobRun`** - Execution history
```sql
ID                UNIQUEIDENTIFIER PRIMARY KEY
ScheduledJobID    UNIQUEIDENTIFIER FK → ScheduledJob
StartedAt         DATETIME
CompletedAt       DATETIME
Status            NVARCHAR(20)     -- Running, Completed, Failed, etc.
Success           BIT
ErrorMessage      NVARCHAR(MAX)
Details           NVARCHAR(MAX)    -- JSON execution details
ExecutedByUserID  UNIQUEIDENTIFIER FK → User
QueuedAt          DATETIME
```

### Indexes

```sql
-- Efficient job polling query
CREATE INDEX IX_ScheduledJob_NextRunAt_Status
ON ScheduledJob(NextRunAt, Status)
WHERE Status = 'Active';

-- Lock acquisition
CREATE INDEX IX_ScheduledJob_LockToken
ON ScheduledJob(LockToken)
WHERE LockToken IS NOT NULL;

-- Job run history queries
CREATE INDEX IX_ScheduledJobRun_JobID_StartedAt
ON ScheduledJobRun(ScheduledJobID, StartedAt DESC);
```

## Actions API

All actions are available via GraphQL and follow consistent patterns.

### Query Scheduled Jobs

**Search and filter jobs with flexible criteria.**

```graphql
mutation QueryJobs {
  RunAction(
    ActionName: "Query Scheduled Jobs"
    Params: [
      { Name: "Status", Value: "Active" }
      { Name: "MaxResults", Value: "50" }
    ]
  ) {
    Success
    Message
    Params {
      Name
      Value
    }
  }
}
```

**Parameters**:
- `Status` (optional) - Active, Disabled, Expired, Paused, Pending
- `JobTypeID` (optional) - Filter by job type
- `CreatedAfter` (optional) - ISO date string
- `CreatedBefore` (optional) - ISO date string
- `MaxResults` (optional) - Limit (default: 100)

**Output**:
- `Jobs` - Array of ScheduledJobEntity objects

---

### Create Scheduled Job

**Create a new job with cron validation.**

```graphql
mutation CreateJob {
  RunAction(
    ActionName: "Create Scheduled Job"
    Params: [
      { Name: "Name", Value: "Nightly Backup" }
      { Name: "JobTypeID", Value: "uuid" }
      { Name: "CronExpression", Value: "0 2 * * *" }
      { Name: "Description", Value: "Backs up critical data" }
    ]
  ) {
    Success
    Message
    Params {
      Name
      Value
    }
  }
}
```

**Parameters**:
- `Name` (required) - Job name
- `JobTypeID` (required) - UUID of job type
- `CronExpression` (required) - Valid cron expression
- `Status` (optional) - Default: Active
- `Description` (optional)

**Output**:
- `JobID` - UUID of created job

---

### Update Scheduled Job

**Update existing job (partial updates supported).**

```graphql
mutation UpdateJob {
  RunAction(
    ActionName: "Update Scheduled Job"
    Params: [
      { Name: "JobID", Value: "uuid" }
      { Name: "Status", Value: "Disabled" }
      { Name: "CronExpression", Value: "0 3 * * *" }
    ]
  ) {
    Success
    Message
  }
}
```

**Parameters**:
- `JobID` (required)
- `Name` (optional)
- `CronExpression` (optional)
- `Status` (optional)
- `Description` (optional)

**Result Codes**:
- `SUCCESS` - Updated successfully
- `NO_CHANGES` - No fields were modified
- `NOT_FOUND` - Job doesn't exist

---

### Delete Scheduled Job

**Delete a job with constraint checking.**

```graphql
mutation DeleteJob {
  RunAction(
    ActionName: "Delete Scheduled Job"
    Params: [
      { Name: "JobID", Value: "uuid" }
    ]
  ) {
    Success
    Message
  }
}
```

**Parameters**:
- `JobID` (required)

**Result Codes**:
- `SUCCESS` - Deleted successfully
- `REFERENCE_CONSTRAINT` - Has related records (runs)
- `NOT_FOUND` - Job doesn't exist

---

### Execute Scheduled Job Now

**Trigger immediate execution outside schedule.**

```graphql
mutation ExecuteNow {
  RunAction(
    ActionName: "Execute Scheduled Job Now"
    Params: [
      { Name: "JobID", Value: "uuid" }
    ]
  ) {
    Success
    Message
    Params {
      Name
      Value
    }
  }
}
```

**Parameters**:
- `JobID` (required)

**Output**:
- `RunID` - UUID of created job run

**Note**: Job must have Status = 'Active'

---

### Get Scheduled Job Statistics

**Retrieve execution metrics and analytics.**

```graphql
mutation GetStats {
  RunAction(
    ActionName: "Get Scheduled Job Statistics"
    Params: [
      { Name: "JobID", Value: "uuid" }
      { Name: "DaysBack", Value: "30" }
    ]
  ) {
    Success
    Message
    Params {
      Name
      Value
    }
  }
}
```

**Parameters**:
- `JobID` (optional) - Specific job or all jobs
- `DaysBack` (optional) - Default: 30

**Output**:
- `Statistics` - Array of stats objects:
  ```json
  {
    "JobID": "uuid",
    "JobName": "Daily Report",
    "TotalRuns": 30,
    "SuccessfulRuns": 28,
    "FailedRuns": 2,
    "SuccessRate": 93,
    "AverageDurationSeconds": 45,
    "LastRunAt": "2025-10-14T08:00:00Z",
    "LastRunStatus": "Completed"
  }
  ```

## Best Practices

### Job Design

✅ **DO**:
- Keep jobs idempotent (safe to run multiple times)
- Use specific, descriptive job names
- Set appropriate timeout values
- Log important milestones
- Handle errors gracefully

❌ **DON'T**:
- Create jobs that modify the same data concurrently
- Use overly frequent schedules (< 1 minute)
- Leave jobs in Active status during development
- Store sensitive data in Configuration field

### Cron Expressions

✅ **DO**:
- Use UTC timezone for consistency
- Test expressions with cron-parser before deploying
- Document the intended schedule in Description
- Consider server load when scheduling

❌ **DON'T**:
- Schedule multiple heavy jobs at the same time
- Use `* * * * * *` (every second) - not supported
- Assume server timezone matches your local timezone

### Error Handling

✅ **DO**:
- Return descriptive error messages
- Use appropriate Status codes (Failed, Timeout, Cancelled)
- Log stack traces for debugging
- Set ErrorMessage field on ScheduledJobRun

❌ **DON'T**:
- Throw unhandled exceptions
- Leave jobs in Running status on error
- Suppress errors silently

### Performance

✅ **DO**:
- Batch operations when possible
- Use Skip mode for non-critical jobs
- Monitor execution times via statistics
- Set realistic ExpectedCompletionAt values

❌ **DON'T**:
- Create hundreds of jobs with minute-level schedules
- Run long-running jobs without timeout
- Use Concurrent mode without understanding implications

## Monitoring & Observability

### Console Output

When scheduled jobs are enabled, you'll see:

```
📅 Scheduled Jobs: 5 active job(s), polling every 2 minute(s)

📅 Polling: Checking 5 job(s) at 2025-10-14T08:00:00.123Z
  - Daily Report: NextRunAt=2025-10-14T08:00:00.000Z, Status=Active
    ✓ Job is due, executing...
  ▶️  Starting: Daily Report
  ✅ Completed: Daily Report (3245ms)

📅 Scheduled Jobs: Executed 1 job(s)
```

### Execution History

Query run history:

```sql
SELECT
    sj.Name AS JobName,
    sjr.StartedAt,
    sjr.CompletedAt,
    DATEDIFF(SECOND, sjr.StartedAt, sjr.CompletedAt) AS DurationSeconds,
    sjr.Status,
    sjr.Success,
    sjr.ErrorMessage
FROM [__mj].[ScheduledJobRun] sjr
INNER JOIN [__mj].[ScheduledJob] sj ON sjr.ScheduledJobID = sj.ID
WHERE sjr.StartedAt >= DATEADD(DAY, -7, GETUTCDATE())
ORDER BY sjr.StartedAt DESC;
```

### Statistics via Actions

Use the "Get Scheduled Job Statistics" action to retrieve:
- Total runs over time period
- Success/failure rates
- Average execution duration
- Last run status and timing

### Stale Lock Detection

Check for stale locks:

```sql
SELECT
    ID,
    Name,
    LockToken,
    LockedAt,
    LockedByInstance,
    ExpectedCompletionAt,
    DATEDIFF(MINUTE, ExpectedCompletionAt, GETUTCDATE()) AS MinutesOverdue
FROM [__mj].[ScheduledJob]
WHERE LockToken IS NOT NULL
  AND ExpectedCompletionAt < GETUTCDATE()
ORDER BY ExpectedCompletionAt;
```

## Security Considerations

### Lock Acquisition

The engine uses **atomic SQL operations** for lock acquisition:

```sql
UPDATE [__mj].[ScheduledJob]
SET
    LockToken = @newToken,
    LockedAt = SYSDATETIMEOFFSET(),
    LockedByInstance = @instanceId,
    ExpectedCompletionAt = @expectedCompletion
WHERE ID = @jobId
  AND LockToken IS NULL;
```

This ensures only one server can acquire a lock, even in highly concurrent scenarios.

### Configuration Security

**Sensitive Data**: Never store passwords, API keys, or secrets in the `Configuration` field. Use:
- Environment variables
- MemberJunction's configuration system
- Encrypted storage mechanisms

**User Context**: Jobs execute with a system user context. Ensure the system user has appropriate permissions but not excessive privileges.

### Input Validation

All Actions perform input validation:
- Cron expressions validated with cron-parser
- Status values checked against valid enums
- UUIDs validated for format
- Required parameters enforced

## Troubleshooting

### Jobs Not Executing

**Check 1**: Is scheduling enabled?
```javascript
// mj.config.cjs
scheduledJobs: { enabled: true }
```

**Check 2**: Is job Active?
```sql
SELECT Status FROM [__mj].[ScheduledJob] WHERE ID = @jobId;
-- Should be 'Active'
```

**Check 3**: Is NextRunAt in the past?
```sql
SELECT NextRunAt FROM [__mj].[ScheduledJob] WHERE ID = @jobId;
-- Should be < current time for due jobs
```

**Check 4**: Is job locked by another server?
```sql
SELECT LockToken, LockedByInstance, ExpectedCompletionAt
FROM [__mj].[ScheduledJob] WHERE ID = @jobId;
-- LockToken should be NULL if available
```

### Jobs Stuck in Running

**Cause**: Server crashed during execution or timeout not enforced

**Fix**: Clear stale locks manually:
```sql
UPDATE [__mj].[ScheduledJob]
SET LockToken = NULL,
    LockedAt = NULL,
    LockedByInstance = NULL,
    ExpectedCompletionAt = NULL
WHERE ID = @jobId;
```

Or wait for automatic stale lock cleanup (next poll cycle).

### Execution Errors

**Check Run History**:
```sql
SELECT TOP 10
    ErrorMessage,
    Details,
    StartedAt
FROM [__mj].[ScheduledJobRun]
WHERE ScheduledJobID = @jobId
  AND Success = 0
ORDER BY StartedAt DESC;
```

**Common Issues**:
- Agent/Action not found → Check Configuration field
- Permission denied → Check system user permissions
- Timeout → Increase defaultLockTimeout or optimize job logic
- Invalid configuration → Validate JSON structure

### Polling Too Frequent/Infrequent

**Current Interval**:
Check console output on startup:
```
📅 Scheduled Jobs: 5 active job(s), polling every 2 minute(s)
```

**Interval Calculation**:
Based on narrowest active job schedule. If all jobs are daily, polling will be less frequent.

**Override**: Not currently supported, but polling adapts automatically.

## Related Documentation

### MemberJunction Core
- [Core Package](../../../packages/MJCore/README.md) - Entity system, metadata, RunView
- [Global Package](../../../packages/MJGlobal/README.md) - ClassFactory, RegisterClass
- [Core Entities](../../../packages/MJCoreEntities/README.md) - Generated entity classes

### AI & Agents
- [AI Agents Package](../../../packages/AI/ai-agents/README.md) - Agent execution framework
- [AI Engine](../../../packages/AI/aiengine/README.md) - LLM orchestration
- [AI Vectors](../../../packages/AI/Vectors/README.md) - Vector operations

### Actions System
- [Actions Base](../../../packages/Actions/base/README.md) - Action framework
- [Core Actions](../../../packages/Actions/CoreActions/README.md) - Built-in actions
- [Actions Documentation](https://docs.memberjunction.org/actions) - Official docs

### Server Integration
- [MJServer](../../../packages/MJServer/README.md) - Server configuration
- [MJServer Config](../../../packages/MJAPI/mj.config.cjs) - Example configuration

### Database
- [Migrations](../../../migrations/README.md) - Database schema migrations
- [CodeGen](../../../packages/CodeGen/README.md) - Entity code generation

### External Resources
- [Cron Expression Reference](https://crontab.guru/) - Interactive cron tester
- [cron-parser npm](https://www.npmjs.com/package/cron-parser) - Parser library
- [IANA Timezone Database](https://www.iana.org/time-zones) - Timezone reference

---

## Contributing

When contributing to the scheduling system:

1. **Add Tests**: Include unit tests for new functionality
2. **Update Documentation**: Keep this README and TSDoc comments current
3. **Follow Patterns**: Use existing BaseEngine, BaseScheduledJob patterns
4. **Type Safety**: No `any` types - maintain strong typing
5. **Error Handling**: Always return meaningful error messages

## License

Copyright © MemberJunction.com - ISC License

---

**Need Help?** File issues on [GitHub](https://github.com/MemberJunction/MJ/issues) or reach out on the [MemberJunction Community](https://community.memberjunction.org).
