# Scheduled Jobs System - TODO

## HIGH PRIORITY

### Security & Correctness

#### 1. SQL Injection in Lock Management [CRITICAL]
**File**: `packages/Scheduling/engine/src/ScheduledJobEngine.ts:418-427`
**Issue**: Lock acquisition uses string interpolation, creating SQL injection vulnerability.

**Solution**: Convert to parameterized queries:
```typescript
const sql = `
    UPDATE [${schema}].[ScheduledJob]
    SET
        LockToken = @lockToken,
        LockedAt = SYSDATETIMEOFFSET(),
        LockedByInstance = @instanceId,
        ExpectedCompletionAt = @expectedCompletion
    WHERE ID = @jobId
      AND LockToken IS NULL;
`;
const result = await provider.ExecuteSQL(sql, {
    lockToken, instanceId,
    expectedCompletion: expectedCompletion.toISOString(),
    jobId: job.ID
});
```

#### 2. Hardcoded Schema Name [HIGH]
**File**: `packages/Scheduling/engine/src/ScheduledJobEngine.ts:419`
**Issue**: Schema hardcoded as `[dbo]` instead of using provider configuration.

**Solution**: Get schema from provider:
```typescript
const provider = Metadata.Provider as any;
const schema = provider.SchemaName || provider.schema || 'dbo';
const sql = `UPDATE [${schema}].[ScheduledJob]...`;
```

#### 3. Missing Notification Implementation [HIGH]
**File**: `packages/Scheduling/engine/src/NotificationManager.ts:20-49`
**Issue**: Entire notification system is a TODO stub.

**Solutions** (pick one):
1. Integrate with MJ's CommunicationEngine when available
2. Throw NotImplementedError so users know it doesn't work yet
3. Create placeholder notification entities for future processing

#### 4. QueuedAt Field Misuse [HIGH]
**File**: `packages/Scheduling/engine/src/ScheduledJobEngine.ts:482-501`
**Issue**: Queued jobs marked as 'Running' immediately; no queue processor exists.

**Solution**:
1. Add 'Queued' to ScheduledJobRunStatus enum in base-types
2. Set Status to 'Queued' instead of 'Running'
3. Only set StartedAt when actually starting
4. Implement queue processor OR document as future enhancement

#### 5. Missing Timeout Enforcement [HIGH]
**File**: `packages/Scheduling/engine/src/ScheduledJobEngine.ts:218-286`
**Issue**: Jobs can run indefinitely despite ExpectedCompletionAt being set.

**Solution**: Use Promise.race with timeout:
```typescript
const timeoutMs = 10 * 60 * 1000; // Should come from job.TimeoutMinutes
const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Job execution timeout')), timeoutMs)
);

try {
    const result = await Promise.race([
        plugin.Execute(context),
        timeoutPromise
    ]);
} catch (error) {
    if (error.message === 'Job execution timeout') {
        run.Status = 'Timeout';
    }
}
```

#### 6. No Cancellation Support [HIGH]
**File**: `packages/Scheduling/engine/src/ScheduledJobEngine.ts`
**Issue**: 'Cancelled' status exists but no way to cancel running jobs.

**Solution**: Add CancelJob method with AbortController:
```typescript
private activeExecutions = new Map<string, AbortController>();

public async CancelJob(runId: string): Promise<boolean> {
    const controller = this.activeExecutions.get(runId);
    if (!controller) return false;

    controller.abort();
    this.activeExecutions.delete(runId);

    // Update run status to Cancelled
    // ...
    return true;
}
```

#### 7. Missing Retry Logic [HIGH]
**File**: `packages/Scheduling/engine/src/ScheduledJobEngine.ts`
**Issue**: No automatic retry for failed jobs (schema likely has MaxRetries field).

**Solution**: Implement retry wrapper:
```typescript
private async executeJobWithRetries(
    job: ScheduledJobEntity,
    contextUser: UserInfo,
    attemptNumber: number = 1
): Promise<ScheduledJobRunEntity> {
    try {
        return await this.executeJob(job, contextUser);
    } catch (error) {
        if (job.MaxRetries && attemptNumber < job.MaxRetries) {
            const retryDelayMs = (job.RetryIntervalMinutes || 5) * 60 * 1000;
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
            return await this.executeJobWithRetries(job, contextUser, attemptNumber + 1);
        }
        throw error;
    }
}
```

#### 8. Lock Acquisition Race Condition [HIGH]
**File**: `packages/Scheduling/engine/src/ScheduledJobEngine.ts:396-443`
**Issue**: TOCTOU - checks lock before atomic SQL update.

**Solution**: Remove early check, rely entirely on atomic SQL:
```typescript
private async tryAcquireLock(job: ScheduledJobEntity): Promise<boolean> {
    // Remove the if (job.LockToken != null) check
    // Let SQL handle both fresh locks AND stale lock cleanup atomically:
    const sql = `
        UPDATE ...
        WHERE ID = @jobId
          AND (LockToken IS NULL OR ExpectedCompletionAt < SYSDATETIMEOFFSET());
    `;
}
```

---

## MEDIUM PRIORITY

### Functionality & Features

#### 9. Incomplete Cron Validation [MEDIUM]
**File**: `packages/Scheduling/engine/src/CronExpressionHelper.ts:75-102`
**Issue**: Doesn't prevent overly frequent expressions like `* * * * * *`.

**Solution**: Add frequency check (minimum 1 minute between executions).

#### 10. Missing Metrics and Observability [MEDIUM]
**File**: `packages/Scheduling/engine/src/ScheduledJobEngine.ts`
**Issue**: No metrics for monitoring (execution times, failures, queue depth).

**Solution**: Add GetMetrics() method and track key metrics.

#### 11. No Bulk Operations [MEDIUM]
**File**: `packages/Scheduling/engine/src/ScheduledJobEngine.ts:118-140`
**Issue**: Jobs execute sequentially; no concurrent processing.

**Solution**: Process in batches with Promise.allSettled:
```typescript
public async ExecuteScheduledJobs(
    contextUser: UserInfo,
    maxConcurrent: number = 5
): Promise<ScheduledJobRunEntity[]> {
    const dueJobs = this.ScheduledJobs.filter(job => this.isJobDue(job));

    const runs: ScheduledJobRunEntity[] = [];
    for (let i = 0; i < dueJobs.length; i += maxConcurrent) {
        const batch = dueJobs.slice(i, i + maxConcurrent);
        const batchRuns = await Promise.allSettled(
            batch.map(job => this.executeJob(job, contextUser))
        );
        // Collect successful runs
    }
    return runs;
}
```

#### 12. Memory Leak in Polling [MEDIUM]
**File**: `packages/Scheduling/engine/src/ScheduledJobEngine.ts:52-106`
**Issue**: Recursive setTimeout pattern could accumulate memory.

**Solution**: Use explicit cleanup and non-recursive pattern with `finally` blocks.

#### 13. Weak Configuration Type Safety [MEDIUM]
**File**: `packages/Scheduling/base-types/src/types.ts:32-34`
**Issue**: Base interface uses `[key: string]: any`.

**Solution**: Use discriminated union types:
```typescript
export type ScheduledJobConfiguration =
    | AgentJobConfiguration
    | ActionJobConfiguration;
```

#### 14. Missing Date Validation [MEDIUM]
**File**: `packages/Scheduling/base-engine/src/SchedulingEngineBase.ts:138-168`
**Issue**: NextRunAt could be in the past, causing negative intervals.

**Solution**: Skip jobs with past NextRunAt in UpdatePollingInterval().

#### 15. No Health Check [MEDIUM]
**File**: `packages/Scheduling/engine/src/ScheduledJobEngine.ts`
**Issue**: No way to check if engine is healthy.

**Solution**: Add GetHealthStatus() method returning:
```typescript
{
    healthy: boolean;
    pollingActive: boolean;
    lastPollTime?: Date;
    activeJobs: number;
    lockedJobs: number;
    staleJobs: number;
    issues: string[];
}
```

#### 16. Missing Provider Type Check [MEDIUM]
**File**: `packages/Scheduling/engine/src/ScheduledJobEngine.ts:414`
**Issue**: Assumes Metadata.Provider exists and supports ExecuteSQL.

**Solution**: Add defensive checks before casting.

#### 17. No Plugin Discovery [MEDIUM]
**File**: `packages/Scheduling/engine/src/drivers/index.ts`
**Issue**: Drivers must be manually registered.

**Solution**: Document third-party plugin pattern using RegisterClass + ClassFactory.

#### 18. SQL Server Coupling [MEDIUM]
**File**: `packages/Scheduling/engine/src/drivers/ActionScheduledJobDriver.ts:208`
**Issue**: Casts specifically to SQLServerDataProvider.

**Solution**: Use generic provider interface instead of specific provider type.

#### 19. Missing Configuration Options [MEDIUM]
**File**: `packages/Scheduling/engine/src/ScheduledJobEngine.ts`
**Issue**: No way to configure timeouts, concurrency, intervals.

**Solution**: Add SchedulingEngineConfig interface and Configure() method.

#### 20. No Job History Cleanup [MEDIUM]
**File**: N/A (missing feature)
**Issue**: ScheduledJobRun records accumulate indefinitely.

**Solution**: Add CleanupOldJobRuns(retentionDays) method.

#### 21. Missing Return Type Annotation [MEDIUM]
**File**: `packages/Scheduling/engine/src/ScheduledJobEngine.ts:205-213`
**Issue**: executeJob can return null but type says ScheduledJobRunEntity.

**Solution**: Change return type to `Promise<ScheduledJobRunEntity | null>`.

---

## NOTES

### Positive Findings
- ✅ Excellent type safety (no `any` types)
- ✅ Clean three-tier architecture
- ✅ Follows MJ patterns (BaseEngine, ClassFactory)
- ✅ Good TSDoc coverage
- ✅ Builds successfully
- ✅ Plugin architecture well-designed

### Out of Scope (Document for Future)
- Job dependencies/workflows
- Job priority queues
- Comprehensive test suite (no tests exist)
- Package READMEs
- Migration documentation
- Graceful shutdown mechanism

### Integration Checklist
Before integrating into MJServer:
- [ ] Fix HIGH priority security issues (#1, #2)
- [ ] Decide on notification approach (#3)
- [ ] Fix or remove Queue mode (#4)
- [ ] Add timeout enforcement (#5)
- [ ] Test locking with multiple instances
- [ ] Document known limitations
