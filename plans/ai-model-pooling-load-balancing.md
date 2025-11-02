# AI Model Pooling and Load Balancing System

**Status:** Design Review
**Created:** 2025-10-31
**Author:** Claude
**Related Packages:** `@memberjunction/ai-prompts`, `@memberjunction/ai`, `@memberjunction/ai-core-plus`

---

## Executive Summary

This document describes the architecture for a **global, server-level pooling and load balancing system** for AI model execution in MemberJunction. The system enables:

- **Proactive load distribution** across multiple vendors and API keys
- **Intelligent queueing** when rate limits are reached
- **Sophisticated health tracking** with automatic recovery
- **Multiple API keys per vendor** for scale
- **Opt-in activation** with zero impact on existing prompts

This moves MemberJunction from a **reactive failover model** (retry after failure) to a **proactive pooling model** (distribute load before failures occur).

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Goals & Non-Goals](#goals--non-goals)
3. [Architecture Overview](#architecture-overview)
4. [Database Schema](#database-schema)
5. [Core Components](#core-components)
6. [Health Tracking System](#health-tracking-system)
7. [Rate Limiting & Queueing](#rate-limiting--queueing)
8. [Load Balancing Strategies](#load-balancing-strategies)
9. [Integration with AIPromptRunner](#integration-with-aipromptrunner)
10. [Configuration Examples](#configuration-examples)
11. [Backward Compatibility](#backward-compatibility)
12. [Implementation Phases](#implementation-phases)
13. [Testing Strategy](#testing-strategy)
14. [Open Questions](#open-questions)

---

## Problem Statement

### Current System (Reactive Failover)

The existing MemberJunction AI system executes prompts using a **failover strategy**:

1. Select a single model/vendor pair
2. Execute the prompt
3. **If it fails**, retry with a different vendor/model
4. Repeat until success or max attempts reached

**Limitations:**

- **Reactive:** Only tries alternatives after failure
- **Single API key per vendor:** Can't scale beyond one account per vendor
- **No rate limit awareness:** Hits rate limits before backing off
- **No queueing:** Fails immediately if vendor is overloaded
- **Health tracking is transient:** Doesn't remember vendor issues between requests
- **Inefficient for high volume:** Can't distribute load proactively

### Desired System (Proactive Pooling)

A **global pool management system** that:

1. **Pools vendors/keys before execution** based on model
2. **Distributes load intelligently** across available capacity
3. **Queues requests** when at capacity (instead of failing)
4. **Tracks vendor health** and routes around unhealthy vendors
5. **Supports multiple API keys** per vendor for scale
6. **Respects rate limits** across all keys/vendors

---

## Goals & Non-Goals

### Goals

✅ **Proactive Load Distribution:** Spread requests across vendors/keys before any failures
✅ **Global Queue Management:** Queue requests when all capacity is exhausted
✅ **Multi-Key Support:** Multiple API keys per vendor (different plans/accounts)
✅ **Intelligent Health Tracking:** Distinguish network, auth, rate limit, and service errors
✅ **Automatic Recovery:** Circuit breakers with progressive health checks
✅ **Opt-In Activation:** Zero impact on existing prompts without pool configuration
✅ **Backward Compatible:** No breaking changes to existing APIs
✅ **Model-Specific Pools:** Independent queues per model
✅ **Configuration Flexibility:** Support multiple load balancing strategies
✅ **Observability:** Comprehensive logging and metrics

### Non-Goals

❌ **Persisting health state:** In-memory only (can add later if needed)
❌ **Cross-server coordination:** Single-server scope (future: Redis/shared state)
❌ **Cost optimization algorithms:** Manual priority configuration only
❌ **Predictive rate limiting:** Reactive only (future: ML-based prediction)
❌ **Vendor-specific optimizations:** Generic interface only

---

## Architecture Overview

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        AIPromptRunner                            │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 1. Check if prompt has PoolID configured                   │ │
│  │                                                             │ │
│  │ IF PoolID exists:                                           │ │
│  │   → Route to ModelPoolManager (NEW SYSTEM)                 │ │
│  │                                                             │ │
│  │ ELSE:                                                       │ │
│  │   → Use existing direct execution (UNCHANGED)              │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
         ┌────────────────────────────────────────┐
         │      ModelPoolManager (Singleton)      │
         │  - Manages all pools globally          │
         │  - One instance per server             │
         │  - Lives for entire server lifetime    │
         └────────────────────────────────────────┘
                              │
                              ▼
         ┌────────────────────────────────────────┐
         │  ModelExecutionPool (One per Model)    │
         │  - Independent queue per model         │
         │  - Tracks model-specific capacity      │
         │  - Contains vendor pools               │
         └────────────────────────────────────────┘
                              │
                              ▼
         ┌────────────────────────────────────────┐
         │ VendorAPIKeyPool (One per Vendor)      │
         │  - Multiple API keys per vendor        │
         │  - Rate limit tracking per key         │
         │  - Load balancing across keys          │
         └────────────────────────────────────────┘
                              │
                              ▼
         ┌────────────────────────────────────────┐
         │   VendorHealthTracker (In-Memory)      │
         │  - Tracks health status                │
         │  - Circuit breakers                    │
         │  - Automatic recovery                  │
         └────────────────────────────────────────┘
```

### Component Hierarchy

```
Server Startup
    └─> ModelPoolManager.initialize()
         └─> Singleton instance created
         └─> Health tracker initialized
         └─> Pool configurations loaded from DB

Request Processing
    └─> AIPromptRunner.ExecutePrompt(params)
         │
         ├─> No PoolID?
         │   └─> Execute directly (existing code path)
         │
         └─> Has PoolID?
             └─> ModelPoolManager.executeRequest(task)
                 └─> Get or create ModelExecutionPool for model
                     │
                     ├─> Capacity available?
                     │   └─> Select vendor/key and execute
                     │
                     └─> At capacity?
                         └─> Enqueue with timeout
                             └─> Process when capacity available
```

---

## Database Schema

### New Entities

#### AIModelVendorPool
Defines a pool of vendors for a specific model with queueing configuration.

```sql
CREATE TABLE [__mj].[AIModelVendorPool] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    [ModelID] UNIQUEIDENTIFIER NOT NULL,
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [MaxWaitTimeMS] INT NOT NULL DEFAULT 60000,  -- Queue timeout
    [MaxParallelRequests] INT NULL,               -- Null = unlimited
    [LoadBalancingStrategy] NVARCHAR(50) NOT NULL DEFAULT 'RoundRobin',
        -- Options: 'RoundRobin', 'LeastBusy', 'Weighted', 'Random', 'Priority'
    [IsActive] BIT NOT NULL DEFAULT 1,
    [__mj_CreatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT [FK_AIModelVendorPool_Model]
        FOREIGN KEY ([ModelID]) REFERENCES [__mj].[AIModel]([ID])
);

CREATE INDEX [IX_AIModelVendorPool_ModelID]
    ON [__mj].[AIModelVendorPool]([ModelID]);
```

**Extended Properties:**
```sql
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Defines a pool of vendors for load balancing and queueing AI model requests',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIModelVendorPool';
```

#### AIModelVendorPoolMember
Associates vendors with pools and defines their participation settings.

```sql
CREATE TABLE [__mj].[AIModelVendorPoolMember] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    [PoolID] UNIQUEIDENTIFIER NOT NULL,
    [VendorID] UNIQUEIDENTIFIER NOT NULL,
    [Priority] INT NOT NULL DEFAULT 100,           -- Lower = higher priority
    [Weight] INT NULL,                             -- For weighted strategies (1-100)
    [MaxParallelRequests] INT NULL,                -- Per-vendor limit
    [IsActive] BIT NOT NULL DEFAULT 1,
    [__mj_CreatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT [FK_AIModelVendorPoolMember_Pool]
        FOREIGN KEY ([PoolID]) REFERENCES [__mj].[AIModelVendorPool]([ID]) ON DELETE CASCADE,
    CONSTRAINT [FK_AIModelVendorPoolMember_Vendor]
        FOREIGN KEY ([VendorID]) REFERENCES [__mj].[AIVendor]([ID]),
    CONSTRAINT [UQ_AIModelVendorPoolMember_PoolVendor]
        UNIQUE ([PoolID], [VendorID])
);

CREATE INDEX [IX_AIModelVendorPoolMember_PoolID]
    ON [__mj].[AIModelVendorPoolMember]([PoolID]);
CREATE INDEX [IX_AIModelVendorPoolMember_VendorID]
    ON [__mj].[AIModelVendorPoolMember]([VendorID]);
```

#### AIVendorAPIKey
Stores multiple API keys per vendor with rate limit configurations.

```sql
CREATE TABLE [__mj].[AIVendorAPIKey] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    [VendorID] UNIQUEIDENTIFIER NOT NULL,
    [KeyName] NVARCHAR(255) NOT NULL,              -- E.g., "Cerebras Production Plan 1"
    [APIKeyValue] NVARCHAR(MAX) NOT NULL,          -- Encrypted
    [RateLimitTPM] INT NULL,                       -- Tokens per minute
    [RateLimitRPM] INT NULL,                       -- Requests per minute
    [RateLimitScope] NVARCHAR(50) NOT NULL DEFAULT 'ModelSpecific',
        -- Options: 'ModelSpecific', 'AllModels'
    [Priority] INT NOT NULL DEFAULT 100,           -- Lower = higher priority
    [IsActive] BIT NOT NULL DEFAULT 1,
    [Notes] NVARCHAR(MAX) NULL,
    [__mj_CreatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT [FK_AIVendorAPIKey_Vendor]
        FOREIGN KEY ([VendorID]) REFERENCES [__mj].[AIVendor]([ID]) ON DELETE CASCADE,
    CONSTRAINT [UQ_AIVendorAPIKey_VendorName]
        UNIQUE ([VendorID], [KeyName])
);

CREATE INDEX [IX_AIVendorAPIKey_VendorID]
    ON [__mj].[AIVendorAPIKey]([VendorID]);
CREATE INDEX [IX_AIVendorAPIKey_IsActive]
    ON [__mj].[AIVendorAPIKey]([IsActive]) WHERE [IsActive] = 1;
```

**Security Note:** `APIKeyValue` should be encrypted at rest. Implementation should use existing MJ encryption utilities.

#### AIVendorHealthEvent (Optional - Observability)
Logs significant health events for debugging and analytics. **Write-only, not used for runtime decisions.**

```sql
CREATE TABLE [__mj].[AIVendorHealthEvent] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    [VendorID] UNIQUEIDENTIFIER NOT NULL,
    [APIKeyID] UNIQUEIDENTIFIER NULL,
    [EventType] NVARCHAR(50) NOT NULL,
        -- Options: 'CircuitOpened', 'CircuitClosed', 'NetworkUnreachable',
        --          'Recovered', 'RateLimitHit', 'ServiceError', 'AuthFailure'
    [EventDetails] NVARCHAR(MAX) NULL,             -- JSON
    [Timestamp] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT [FK_AIVendorHealthEvent_Vendor]
        FOREIGN KEY ([VendorID]) REFERENCES [__mj].[AIVendor]([ID]),
    CONSTRAINT [FK_AIVendorHealthEvent_APIKey]
        FOREIGN KEY ([APIKeyID]) REFERENCES [__mj].[AIVendorAPIKey]([ID])
);

CREATE INDEX [IX_AIVendorHealthEvent_VendorID]
    ON [__mj].[AIVendorHealthEvent]([VendorID]);
CREATE INDEX [IX_AIVendorHealthEvent_Timestamp]
    ON [__mj].[AIVendorHealthEvent]([Timestamp] DESC);
```

### Modified Entities

#### AIPromptModel (Add PoolID)
Add optional foreign key to pool configuration.

```sql
ALTER TABLE [__mj].[AIPromptModel]
ADD [PoolID] UNIQUEIDENTIFIER NULL,
    CONSTRAINT [FK_AIPromptModel_Pool]
        FOREIGN KEY ([PoolID]) REFERENCES [__mj].[AIModelVendorPool]([ID]);

CREATE INDEX [IX_AIPromptModel_PoolID]
    ON [__mj].[AIPromptModel]([PoolID]);
```

**Migration Impact:**
- All existing records will have `PoolID = NULL` (no pooling)
- No behavioral changes for existing prompts
- Opt-in by setting `PoolID` to a valid pool

---

## Core Components

### 1. ModelPoolManager (Singleton)

**Purpose:** Global coordinator for all model pools. Lives for the entire server lifetime.

**Location:** `/packages/AI/Prompts/src/ModelPoolManager.ts`

```typescript
export class ModelPoolManager {
  private static instance: ModelPoolManager;
  private pools: Map<string, ModelExecutionPool> = new Map();
  private healthTracker: VendorHealthTracker;
  private initialized: boolean = false;

  private constructor() {
    this.healthTracker = new VendorHealthTracker();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ModelPoolManager {
    if (!ModelPoolManager.instance) {
      ModelPoolManager.instance = new ModelPoolManager();
    }
    return ModelPoolManager.instance;
  }

  /**
   * Initialize pool manager (called on server startup)
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    LogStatus('Initializing ModelPoolManager...');

    // Load all pool configurations from database
    await this.loadPoolConfigurations();

    // Initialize health tracker
    await this.healthTracker.initialize();

    this.initialized = true;
    LogStatus('ModelPoolManager initialized');
  }

  /**
   * Execute a request through the pooling system
   */
  public async executeRequest(
    task: PooledExecutionTask
  ): Promise<ExecutionTaskResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const modelId = task.modelId;
    const pool = await this.getOrCreatePool(modelId);

    return await pool.executeRequest(task);
  }

  /**
   * Get or create a pool for a model
   */
  private async getOrCreatePool(modelId: string): Promise<ModelExecutionPool> {
    if (!this.pools.has(modelId)) {
      const config = await this.loadPoolConfigForModel(modelId);
      const pool = new ModelExecutionPool(config, this.healthTracker);
      this.pools.set(modelId, pool);
    }
    return this.pools.get(modelId)!;
  }

  /**
   * Graceful shutdown (drain queues)
   */
  public async shutdown(timeoutMS: number = 30000): Promise<void> {
    LogStatus('Shutting down ModelPoolManager...');

    const shutdownPromises = Array.from(this.pools.values()).map(pool =>
      pool.shutdown(timeoutMS)
    );

    await Promise.all(shutdownPromises);

    LogStatus('ModelPoolManager shutdown complete');
  }

  /**
   * Get health status for all vendors
   */
  public getHealthStatus(): Map<string, VendorHealthInfo> {
    return this.healthTracker.getAllHealthStatus();
  }

  /**
   * Get pool statistics for monitoring
   */
  public getPoolStatistics(): PoolStatistics[] {
    return Array.from(this.pools.entries()).map(([modelId, pool]) => ({
      modelId,
      queueLength: pool.getQueueLength(),
      activeRequests: pool.getActiveRequestCount(),
      totalProcessed: pool.getTotalProcessed(),
      averageWaitTimeMS: pool.getAverageWaitTime(),
    }));
  }
}
```

### 2. ModelExecutionPool

**Purpose:** Manages execution queue and vendor selection for a single model.

**Location:** `/packages/AI/Prompts/src/ModelExecutionPool.ts`

```typescript
export class ModelExecutionPool {
  private queue: PriorityQueue<PooledExecutionTask>;
  private vendorPools: Map<string, VendorAPIKeyPool> = new Map();
  private config: AIModelVendorPoolEntity;
  private healthTracker: VendorHealthTracker;
  private activeRequests: number = 0;
  private isProcessing: boolean = false;
  private statistics: PoolStatistics;

  constructor(config: AIModelVendorPoolEntity, healthTracker: VendorHealthTracker) {
    this.config = config;
    this.healthTracker = healthTracker;
    this.queue = new PriorityQueue((a, b) => a.priority - b.priority);
    this.statistics = new PoolStatistics();
  }

  /**
   * Execute a request (queue if at capacity)
   */
  public async executeRequest(task: PooledExecutionTask): Promise<ExecutionTaskResult> {
    // Check cancellation
    if (task.cancellationToken?.aborted) {
      return this.createCancelledResult(task, 'user_requested');
    }

    // Check if we have capacity
    const hasCapacity = this.hasCapacity();

    if (hasCapacity) {
      // Execute immediately
      return await this.executeTaskNow(task);
    } else {
      // Enqueue and wait
      return await this.enqueueAndWait(task);
    }
  }

  /**
   * Check if pool has available capacity
   */
  private hasCapacity(): boolean {
    if (this.config.MaxParallelRequests == null) {
      return true;  // Unlimited
    }
    return this.activeRequests < this.config.MaxParallelRequests;
  }

  /**
   * Execute task immediately (capacity available)
   */
  private async executeTaskNow(task: PooledExecutionTask): Promise<ExecutionTaskResult> {
    this.activeRequests++;
    const startTime = new Date();

    try {
      // Select vendor/API key
      const selection = await this.selectVendorAndKey(task);

      if (!selection) {
        throw new Error('No healthy vendor available');
      }

      // Execute with selected vendor/key
      const result = await this.executeWithVendor(task, selection);

      // Track success
      this.healthTracker.recordSuccess(selection.vendorId, selection.keyId);
      this.statistics.recordSuccess(Date.now() - startTime.getTime());

      return result;

    } catch (error) {
      // Track failure
      const errorInfo = ErrorAnalyzer.analyze(error);
      this.statistics.recordFailure(Date.now() - startTime.getTime());

      throw error;

    } finally {
      this.activeRequests--;

      // Process queue if items waiting
      if (this.queue.size() > 0) {
        this.processQueue();
      }
    }
  }

  /**
   * Enqueue task and wait for capacity
   */
  private async enqueueAndWait(task: PooledExecutionTask): Promise<ExecutionTaskResult> {
    return new Promise((resolve, reject) => {
      const timeoutMS = task.timeout || this.config.MaxWaitTimeMS;
      const queuedAt = Date.now();

      // Create timeout
      const timeoutHandle = setTimeout(() => {
        this.queue.remove(queuedTask);
        reject(new Error(`Queue timeout after ${timeoutMS}ms`));
      }, timeoutMS);

      // Create queued task wrapper
      const queuedTask: QueuedTask = {
        ...task,
        queuedAt,
        timeoutHandle,
        resolve: (result) => {
          clearTimeout(timeoutHandle);
          const waitTime = Date.now() - queuedAt;
          this.statistics.recordQueueWait(waitTime);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeoutHandle);
          reject(error);
        }
      };

      // Add to queue
      this.queue.enqueue(queuedTask);

      // Start processing if not already running
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process queued tasks (continuously running)
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.size() > 0 && this.hasCapacity()) {
      const queuedTask = this.queue.dequeue();
      if (!queuedTask) break;

      // Execute in background (don't await)
      this.executeTaskNow(queuedTask)
        .then(result => queuedTask.resolve(result))
        .catch(error => queuedTask.reject(error));
    }

    this.isProcessing = false;
  }

  /**
   * Select best vendor and API key for this request
   */
  private async selectVendorAndKey(
    task: PooledExecutionTask
  ): Promise<VendorKeySelection | null> {
    const members = await this.getActivePoolMembers();

    // Filter by health
    const healthyMembers = members.filter(member =>
      this.healthTracker.isHealthy(member.VendorID)
    );

    if (healthyMembers.length === 0) {
      return null;
    }

    // Apply load balancing strategy
    const selectedMember = this.applyLoadBalancingStrategy(healthyMembers, task);

    // Get vendor's API key pool
    const vendorPool = await this.getVendorPool(selectedMember.VendorID);

    // Select available API key
    const selectedKey = vendorPool.selectAvailableKey(task.estimatedTokens);

    if (!selectedKey) {
      // Vendor has no available capacity
      return null;
    }

    return {
      vendorId: selectedMember.VendorID,
      keyId: selectedKey.id,
      vendor: selectedMember.Vendor,
      apiKey: selectedKey
    };
  }

  /**
   * Apply configured load balancing strategy
   */
  private applyLoadBalancingStrategy(
    members: AIModelVendorPoolMemberEntity[],
    task: PooledExecutionTask
  ): AIModelVendorPoolMemberEntity {

    switch (this.config.LoadBalancingStrategy) {
      case 'RoundRobin':
        return this.selectRoundRobin(members);

      case 'LeastBusy':
        return this.selectLeastBusy(members);

      case 'Weighted':
        return this.selectWeighted(members);

      case 'Random':
        return members[Math.floor(Math.random() * members.length)];

      case 'Priority':
        return this.selectByPriority(members);

      default:
        return this.selectByPriority(members);
    }
  }

  // ... other methods (shutdown, statistics, etc.)
}
```

### 3. VendorAPIKeyPool

**Purpose:** Manages multiple API keys for a single vendor with rate limit tracking.

**Location:** `/packages/AI/Prompts/src/VendorAPIKeyPool.ts`

```typescript
export class VendorAPIKeyPool {
  private vendorId: string;
  private apiKeys: Map<string, APIKeyWithTracker> = new Map();
  private roundRobinIndex: number = 0;

  constructor(vendorId: string) {
    this.vendorId = vendorId;
  }

  /**
   * Initialize pool with API keys from database
   */
  public async initialize(): Promise<void> {
    const rv = new RunView();
    const result = await rv.RunView<AIVendorAPIKeyEntity>({
      EntityName: 'AI Vendor API Keys',
      ExtraFilter: `VendorID='${this.vendorId}' AND IsActive=1`,
      OrderBy: 'Priority ASC',
      ResultType: 'entity_object'
    });

    if (result.Success) {
      for (const keyEntity of result.Results) {
        const tracker = new RateLimitTracker(
          keyEntity.RateLimitTPM,
          keyEntity.RateLimitRPM,
          keyEntity.RateLimitScope
        );

        this.apiKeys.set(keyEntity.ID, {
          entity: keyEntity,
          tracker,
          activeRequests: 0
        });
      }
    }
  }

  /**
   * Select an available API key that can accommodate the request
   */
  public selectAvailableKey(estimatedTokens: number): APIKeyInfo | null {
    const keys = Array.from(this.apiKeys.values())
      .filter(k => k.entity.IsActive)
      .sort((a, b) => a.entity.Priority - b.entity.Priority);

    // Try each key in priority order
    for (const keyWithTracker of keys) {
      if (keyWithTracker.tracker.canAccommodate(estimatedTokens)) {
        return {
          id: keyWithTracker.entity.ID,
          value: keyWithTracker.entity.APIKeyValue,
          vendorId: this.vendorId,
          tracker: keyWithTracker.tracker
        };
      }
    }

    return null;  // No key has capacity
  }

  /**
   * Record usage for a specific key
   */
  public recordUsage(keyId: string, tokens: number, requests: number = 1): void {
    const key = this.apiKeys.get(keyId);
    if (key) {
      key.tracker.recordUsage(tokens, requests);
    }
  }

  /**
   * Get aggregate capacity across all keys
   */
  public getAggregateCapacity(): { availableTPM: number, availableRPM: number } {
    let totalTPM = 0;
    let totalRPM = 0;

    for (const key of this.apiKeys.values()) {
      const capacity = key.tracker.getAvailableCapacity();
      totalTPM += capacity.tokens;
      totalRPM += capacity.requests;
    }

    return { availableTPM: totalTPM, availableRPM: totalRPM };
  }

  /**
   * Get number of active API keys
   */
  public getActiveKeyCount(): number {
    return Array.from(this.apiKeys.values()).filter(k => k.entity.IsActive).length;
  }
}
```

### 4. RateLimitTracker

**Purpose:** Tracks token/request usage for a single API key using sliding windows.

**Location:** `/packages/AI/Prompts/src/RateLimitTracker.ts`

```typescript
export class RateLimitTracker {
  private tokenWindow: SlidingWindow;
  private requestWindow: SlidingWindow;
  private limitTPM: number | null;
  private limitRPM: number | null;
  private scope: 'ModelSpecific' | 'AllModels';

  constructor(
    limitTPM: number | null,
    limitRPM: number | null,
    scope: 'ModelSpecific' | 'AllModels'
  ) {
    this.limitTPM = limitTPM;
    this.limitRPM = limitRPM;
    this.scope = scope;

    // Create sliding windows (60 second window)
    this.tokenWindow = new SlidingWindow(60000);
    this.requestWindow = new SlidingWindow(60000);
  }

  /**
   * Check if this key can accommodate a request
   */
  public canAccommodate(estimatedTokens: number): boolean {
    const now = Date.now();

    // Check TPM limit
    if (this.limitTPM != null) {
      const currentTPM = this.tokenWindow.getCount(now);
      if (currentTPM + estimatedTokens > this.limitTPM) {
        return false;
      }
    }

    // Check RPM limit
    if (this.limitRPM != null) {
      const currentRPM = this.requestWindow.getCount(now);
      if (currentRPM + 1 > this.limitRPM) {
        return false;
      }
    }

    return true;
  }

  /**
   * Record actual usage
   */
  public recordUsage(tokens: number, requests: number = 1): void {
    const now = Date.now();
    this.tokenWindow.add(now, tokens);
    this.requestWindow.add(now, requests);
  }

  /**
   * Get available capacity
   */
  public getAvailableCapacity(): { tokens: number, requests: number } {
    const now = Date.now();

    const tokensUsed = this.tokenWindow.getCount(now);
    const requestsUsed = this.requestWindow.getCount(now);

    return {
      tokens: this.limitTPM != null ? Math.max(0, this.limitTPM - tokensUsed) : Infinity,
      requests: this.limitRPM != null ? Math.max(0, this.limitRPM - requestsUsed) : Infinity
    };
  }

  /**
   * Reset all counters (for testing)
   */
  public reset(): void {
    this.tokenWindow.clear();
    this.requestWindow.clear();
  }
}

/**
 * Sliding window counter for rate limiting
 */
class SlidingWindow {
  private windowMS: number;
  private entries: Array<{ timestamp: number, count: number }> = [];

  constructor(windowMS: number) {
    this.windowMS = windowMS;
  }

  /**
   * Add a count to the window
   */
  public add(timestamp: number, count: number): void {
    this.entries.push({ timestamp, count });
    this.prune(timestamp);
  }

  /**
   * Get total count within window
   */
  public getCount(now: number): number {
    this.prune(now);
    return this.entries.reduce((sum, entry) => sum + entry.count, 0);
  }

  /**
   * Remove entries outside window
   */
  private prune(now: number): void {
    const cutoff = now - this.windowMS;
    this.entries = this.entries.filter(entry => entry.timestamp > cutoff);
  }

  /**
   * Clear all entries
   */
  public clear(): void {
    this.entries = [];
  }
}
```

---

## Health Tracking System

### VendorHealthTracker

**Purpose:** In-memory health tracking with error-specific recovery strategies. **No persistence.**

**Location:** `/packages/AI/Prompts/src/VendorHealthTracker.ts`

### Health States

```typescript
enum VendorHealthStatus {
  Healthy = 'Healthy',                      // Operating normally
  Degraded = 'Degraded',                    // Some failures, still usable
  RateLimited = 'RateLimited',              // At capacity (not unhealthy)
  NetworkUnreachable = 'NetworkUnreachable', // Can't reach endpoint
  ServiceError = 'ServiceError',            // 500/503 responses
  AuthenticationFailed = 'AuthenticationFailed', // Invalid API key
  CircuitOpen = 'CircuitOpen',              // Temporarily disabled
  ManuallyDisabled = 'Disabled'             // Admin disabled
}
```

### Error Recovery Strategies

```typescript
enum ErrorRecoveryStrategy {
  ImmediateRetry = 'ImmediateRetry',               // Transient, try again now
  BackoffRetry = 'BackoffRetry',                   // Wait then retry
  HealthCheckRequired = 'HealthCheckRequired',     // Ping/test before retry
  CircuitBreaker = 'CircuitBreaker',               // Disable temporarily
  ManualIntervention = 'ManualIntervention'        // Admin must fix
}
```

### Error Type → Recovery Strategy Mapping

| Error Type | Recovery Strategy | Action |
|------------|------------------|--------|
| **NetworkError** | HealthCheckRequired | TCP ping → Health check → Test API call |
| **Timeout** | HealthCheckRequired | Same as NetworkError |
| **ServiceUnavailable (503)** | CircuitBreaker | Disable for 60s, half-open after 2min |
| **InternalError (500)** | CircuitBreaker | Same as 503 |
| **RateLimit (429)** | ImmediateRetry | Not a failure, just wait for capacity |
| **Authentication (401)** | ManualIntervention | Disable key, notify admin |
| **Forbidden (403)** | ManualIntervention | Same as 401 |
| **InvalidRequest (400)** | ImmediateRetry | Request issue, not vendor issue |
| **Other** | BackoffRetry | Generic exponential backoff |

### Circuit Breaker Pattern

```typescript
interface CircuitBreakerConfig {
  cooldownMS: number;              // Time to stay open (e.g., 60000)
  halfOpenTestMS: number;          // Time until half-open test (e.g., 120000)
  failureThreshold: number;        // Failures before opening (e.g., 5)
  successThreshold: number;        // Successes to close (e.g., 3)
}

enum CircuitState {
  Closed = 'Closed',       // Normal operation
  Open = 'Open',           // Disabled, rejecting requests
  HalfOpen = 'HalfOpen'    // Testing recovery with single request
}
```

**Circuit Breaker Flow:**
1. **Closed:** Normal operation, track failures
2. **Open → Half-Open:** After cooldown, allow one test request
3. **Half-Open → Closed:** If test succeeds, resume normal operation
4. **Half-Open → Open:** If test fails, return to Open state

### Health Check Process

For **NetworkUnreachable** status:

```typescript
async performHealthCheck(vendorId: string): Promise<boolean> {
  // Step 1: TCP ping to endpoint
  const pingResult = await this.pingEndpoint(vendor.APIBaseURL);
  if (!pingResult.success) {
    return false;  // Still unreachable
  }

  // Step 2: Call health endpoint (if available)
  if (vendor.HealthCheckEndpoint) {
    const healthResult = await this.callHealthEndpoint(vendor);
    if (!healthResult.success) {
      return false;
    }
  }

  // Step 3: Minimal API test
  const testResult = await this.testMinimalAPICall(vendor, apiKey);
  if (testResult.success) {
    this.updateHealthStatus(vendorId, VendorHealthStatus.Healthy);
    return true;
  }

  return false;
}
```

**Schedule:**
- Initial cooldown: 30 seconds
- Retry interval: 60 seconds
- Max attempts: 10 (10 minutes)
- After max attempts: Manual intervention required

### Implementation

```typescript
export class VendorHealthTracker {
  private healthState: Map<string, VendorHealthInfo> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private recoveryTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Record an error and determine recovery strategy
   */
  public async recordError(
    vendorId: string,
    apiKeyId: string,
    error: AIErrorInfo
  ): Promise<ErrorRecoveryStrategy> {

    const strategy = this.determineRecoveryStrategy(error);
    const health = this.getOrCreateHealthInfo(vendorId);

    // Update failure tracking
    health.consecutiveFailures++;
    health.consecutiveSuccesses = 0;
    health.lastFailedRequest = new Date();

    switch (strategy) {
      case ErrorRecoveryStrategy.HealthCheckRequired:
        this.updateStatus(vendorId, VendorHealthStatus.NetworkUnreachable);
        await this.scheduleHealthCheck(vendorId, {
          cooldownMS: 30000,
          retryInterval: 60000,
          maxAttempts: 10
        });
        break;

      case ErrorRecoveryStrategy.CircuitBreaker:
        this.updateStatus(vendorId, VendorHealthStatus.ServiceError);
        this.openCircuit(vendorId, {
          cooldownMS: 60000,
          halfOpenTestMS: 120000,
          failureThreshold: 5,
          successThreshold: 3
        });
        break;

      case ErrorRecoveryStrategy.ManualIntervention:
        this.updateStatus(vendorId, VendorHealthStatus.AuthenticationFailed);
        // TODO: Notify administrators
        break;

      case ErrorRecoveryStrategy.ImmediateRetry:
        if (error.type === 'RateLimit') {
          this.updateStatus(vendorId, VendorHealthStatus.RateLimited);
        }
        break;

      case ErrorRecoveryStrategy.BackoffRetry:
        this.updateStatus(vendorId, VendorHealthStatus.Degraded);
        break;
    }

    // Log event (async, non-blocking)
    this.logHealthEvent(vendorId, apiKeyId, error, strategy);

    return strategy;
  }

  /**
   * Record a successful request
   */
  public recordSuccess(vendorId: string, apiKeyId: string): void {
    const health = this.getOrCreateHealthInfo(vendorId);

    health.consecutiveSuccesses++;
    health.consecutiveFailures = 0;
    health.lastSuccessfulRequest = new Date();

    // Check if we should close circuit breaker
    const circuit = this.circuitBreakers.get(vendorId);
    if (circuit && circuit.state === CircuitState.HalfOpen) {
      circuit.recordSuccess();
      if (circuit.state === CircuitState.Closed) {
        this.updateStatus(vendorId, VendorHealthStatus.Healthy);
      }
    } else if (health.status !== VendorHealthStatus.Healthy) {
      // Recovered from degraded state
      this.updateStatus(vendorId, VendorHealthStatus.Healthy);
    }
  }

  /**
   * Check if vendor is healthy enough to use
   */
  public isHealthy(vendorId: string): boolean {
    const health = this.healthState.get(vendorId);
    if (!health) return true;  // Unknown = assume healthy

    return health.status === VendorHealthStatus.Healthy ||
           health.status === VendorHealthStatus.Degraded ||
           health.status === VendorHealthStatus.RateLimited;  // Rate limit is temporary
  }

  /**
   * Get current health status
   */
  public getHealthStatus(vendorId: string): VendorHealthInfo | null {
    return this.healthState.get(vendorId) || null;
  }

  /**
   * Get all vendor health statuses
   */
  public getAllHealthStatus(): Map<string, VendorHealthInfo> {
    return new Map(this.healthState);
  }

  // ... private methods for circuit breaker, health checks, etc.
}
```

---

## Rate Limiting & Queueing

### Queueing Behavior

```typescript
interface QueueConfig {
  maxWaitTimeMS: number;              // Timeout for queued requests
  maxQueueSize?: number;              // Max queued items (null = unlimited)
  priorityLevels: number;             // Number of priority tiers
}

interface QueuedTask extends PooledExecutionTask {
  queuedAt: number;                   // Timestamp queued
  timeoutHandle: NodeJS.Timeout;      // Timeout timer
  resolve: (result: ExecutionTaskResult) => void;
  reject: (error: Error) => void;
}
```

### Priority Queue

Tasks are ordered by priority (lower number = higher priority):

```typescript
class PriorityQueue<T extends { priority: number }> {
  private items: T[] = [];

  enqueue(item: T): void {
    // Insert in priority order
    let inserted = false;
    for (let i = 0; i < this.items.length; i++) {
      if (item.priority < this.items[i].priority) {
        this.items.splice(i, 0, item);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this.items.push(item);
    }
  }

  dequeue(): T | undefined {
    return this.items.shift();
  }

  size(): number {
    return this.items.length;
  }

  remove(item: T): boolean {
    const index = this.items.indexOf(item);
    if (index !== -1) {
      this.items.splice(index, 1);
      return true;
    }
    return false;
  }
}
```

### Rate Limit Aggregation

For vendors with **cross-model rate limits** (like OpenAI):

```typescript
class VendorRateLimitAggregator {
  private vendorTrackers: Map<string, AggregateTracker> = new Map();

  /**
   * Check if vendor has capacity across ALL models
   */
  public checkVendorCapacity(vendorId: string, estimatedTokens: number): boolean {
    const tracker = this.vendorTrackers.get(vendorId);
    if (!tracker) return true;  // No cross-model limits

    return tracker.canAccommodate(estimatedTokens);
  }

  /**
   * Record usage against vendor's aggregate limit
   */
  public recordVendorUsage(vendorId: string, tokens: number): void {
    const tracker = this.vendorTrackers.get(vendorId);
    if (tracker) {
      tracker.recordUsage(tokens);
    }
  }
}
```

---

## Load Balancing Strategies

### Supported Strategies

#### 1. Round Robin
Distribute requests evenly across vendors in order.

```typescript
private selectRoundRobin(members: AIModelVendorPoolMemberEntity[]): AIModelVendorPoolMemberEntity {
  const index = this.roundRobinIndex % members.length;
  this.roundRobinIndex++;
  return members[index];
}
```

#### 2. Least Busy
Send to vendor with fewest active requests.

```typescript
private selectLeastBusy(members: AIModelVendorPoolMemberEntity[]): AIModelVendorPoolMemberEntity {
  return members.reduce((least, current) => {
    const leastActive = this.getActiveRequestCount(least.VendorID);
    const currentActive = this.getActiveRequestCount(current.VendorID);
    return currentActive < leastActive ? current : least;
  });
}
```

#### 3. Weighted
Select based on configured weights (1-100).

```typescript
private selectWeighted(members: AIModelVendorPoolMemberEntity[]): AIModelVendorPoolMemberEntity {
  const totalWeight = members.reduce((sum, m) => sum + (m.Weight || 1), 0);
  const random = Math.random() * totalWeight;

  let cumulative = 0;
  for (const member of members) {
    cumulative += (member.Weight || 1);
    if (random <= cumulative) {
      return member;
    }
  }

  return members[members.length - 1];
}
```

#### 4. Random
Randomly select from available vendors.

```typescript
private selectRandom(members: AIModelVendorPoolMemberEntity[]): AIModelVendorPoolMemberEntity {
  const index = Math.floor(Math.random() * members.length);
  return members[index];
}
```

#### 5. Priority
Always prefer lower priority number (highest priority).

```typescript
private selectByPriority(members: AIModelVendorPoolMemberEntity[]): AIModelVendorPoolMemberEntity {
  return members.reduce((highest, current) =>
    current.Priority < highest.Priority ? current : highest
  );
}
```

---

## Integration with AIPromptRunner

### Modified ExecutePrompt Method

```typescript
// In AIPromptRunner.ts

public async ExecutePrompt<T = unknown>(params: AIPromptParams): Promise<AIPromptRunResult<T>> {
  // ... existing validation ...

  // NEW: Check for pool configuration
  const poolConfig = await this.getPoolConfiguration(params);

  if (poolConfig) {
    // Route to pool manager
    return await this.executeViaPool(params, poolConfig);
  } else {
    // Use existing direct execution (unchanged)
    return await this.executeDirect(params);
  }
}

/**
 * Check if prompt uses pooling
 */
private async getPoolConfiguration(params: AIPromptParams): Promise<PoolConfig | null> {
  // Load AIPromptModel records for this prompt
  const rv = new RunView();
  const result = await rv.RunView<AIPromptModelEntity>({
    EntityName: 'AI Prompt Models',
    ExtraFilter: `PromptID='${params.prompt.ID}'`,
    ResultType: 'entity_object'
  });

  if (!result.Success) return null;

  // Find first model with PoolID configured
  const pooledModel = result.Results.find(pm => pm.PoolID != null);

  if (!pooledModel?.PoolID) return null;

  // Load pool configuration
  const pool = await this.metadata.GetEntityObject<AIModelVendorPoolEntity>(
    'AI Model Vendor Pools',
    this.contextUser
  );

  await pool.Load(pooledModel.PoolID);

  if (!pool.IsActive) return null;

  return {
    poolId: pool.ID,
    modelId: pool.ModelID,
    maxWaitTimeMS: pool.MaxWaitTimeMS,
    maxParallelRequests: pool.MaxParallelRequests
  };
}

/**
 * Execute via pool manager
 */
private async executeViaPool<T>(
  params: AIPromptParams,
  poolConfig: PoolConfig
): Promise<AIPromptRunResult<T>> {

  const poolManager = ModelPoolManager.getInstance();

  // Create pooled task
  const task: PooledExecutionTask = {
    taskId: uuidv4(),
    modelId: poolConfig.modelId,
    params,
    renderedPrompt: '', // Will be rendered by pool
    estimatedTokens: this.estimateTokens(params),
    priority: params.priority || 100,
    timeout: params.poolTimeout || poolConfig.maxWaitTimeMS,
    cancellationToken: params.cancellationToken,
    onProgress: params.onProgress,
    onStreaming: params.onStreaming
  };

  try {
    // Submit to pool
    const result = await poolManager.executeRequest(task);

    // Convert to AIPromptRunResult
    return this.convertPoolResultToPromptResult<T>(result, params);

  } catch (error) {
    // Handle queue timeout or other pool errors
    LogError(`Pool execution failed: ${error.message}`);
    throw error;
  }
}

/**
 * Execute directly (existing code path)
 */
private async executeDirect<T>(params: AIPromptParams): Promise<AIPromptRunResult<T>> {
  // ALL EXISTING LOGIC UNCHANGED
  // This is the current implementation
  return await this.currentImplementation(params);
}
```

---

## Configuration Examples

### Example 1: Simple Pool (No Pooling)

**Use Case:** Standard prompt that doesn't need pooling.

```typescript
// Prompt configuration (unchanged)
AIPrompt {
  ID: 'prompt-123',
  Name: 'Simple Summarization',
  // ... other fields ...
}

AIPromptModel {
  PromptID: 'prompt-123',
  ModelID: 'model-gpt4',
  Priority: 100,
  PoolID: null  // ← No pooling
}
```

**Behavior:** Uses existing direct execution path. Zero changes.

### Example 2: Basic Pool (Single Vendor)

**Use Case:** High-volume prompt that needs queueing.

```sql
-- Create pool
INSERT INTO AIModelVendorPool (ID, ModelID, Name, MaxWaitTimeMS, LoadBalancingStrategy)
VALUES ('pool-456', 'model-gpt4', 'GPT-4 Basic Pool', 60000, 'Priority');

-- Add OpenAI to pool
INSERT INTO AIModelVendorPoolMember (PoolID, VendorID, Priority)
VALUES ('pool-456', 'vendor-openai', 10);

-- Link prompt to pool
UPDATE AIPromptModel
SET PoolID = 'pool-456'
WHERE PromptID = 'prompt-high-volume';
```

**Behavior:**
- Queues requests when at capacity
- Max wait: 60 seconds
- Uses priority-based selection (only one vendor, so no effect)

### Example 3: Multi-Vendor Pool with Load Balancing

**Use Case:** OSS-120B model available from Cerebras and Groq.

```sql
-- Create pool for OSS-120B
INSERT INTO AIModelVendorPool (ID, ModelID, Name, MaxWaitTimeMS, MaxParallelRequests, LoadBalancingStrategy)
VALUES ('pool-oss120b', 'model-oss120b', 'OSS-120B Production Pool', 60000, 100, 'LeastBusy');

-- Add Cerebras (preferred)
INSERT INTO AIModelVendorPoolMember (PoolID, VendorID, Priority, MaxParallelRequests)
VALUES ('pool-oss120b', 'vendor-cerebras', 10, 60);

-- Add Groq (fallback)
INSERT INTO AIModelVendorPoolMember (PoolID, VendorID, Priority, MaxParallelRequests)
VALUES ('pool-oss120b', 'vendor-groq', 20, 40);
```

**Behavior:**
- Max 100 parallel requests across all vendors
- Cerebras: max 60 requests
- Groq: max 40 requests
- Uses "LeastBusy" strategy to distribute load
- Prefers Cerebras (priority 10) when equal

### Example 4: Multiple API Keys Per Vendor

**Use Case:** Scale with multiple Cerebras plans.

```sql
-- Add multiple API keys for Cerebras
INSERT INTO AIVendorAPIKey (VendorID, KeyName, APIKeyValue, RateLimitTPM, RateLimitRPM, RateLimitScope, Priority)
VALUES
  ('vendor-cerebras', 'Cerebras Production Plan 1', 'sk-...', 100000, 1000, 'ModelSpecific', 10),
  ('vendor-cerebras', 'Cerebras Production Plan 2', 'sk-...', 100000, 1000, 'ModelSpecific', 20),
  ('vendor-cerebras', 'Cerebras Dev Plan', 'sk-...', 50000, 500, 'ModelSpecific', 30);

-- Add keys for Groq
INSERT INTO AIVendorAPIKey (VendorID, KeyName, APIKeyValue, RateLimitTPM, RateLimitRPM, RateLimitScope, Priority)
VALUES
  ('vendor-groq', 'Groq Enterprise 1', 'gsk-...', 80000, 800, 'ModelSpecific', 10),
  ('vendor-groq', 'Groq Enterprise 2', 'gsk-...', 80000, 800, 'ModelSpecific', 20);
```

**Behavior:**
- Pool has 5 total API keys (3 Cerebras + 2 Groq)
- Load balances across all keys based on rate limits
- Uses highest priority available key
- Tracks TPM/RPM per key independently

### Example 5: Weighted Load Balancing

**Use Case:** Prefer cheaper vendor but use expensive vendor when needed.

```sql
-- Create pool with weighted strategy
INSERT INTO AIModelVendorPool (ID, ModelID, Name, LoadBalancingStrategy)
VALUES ('pool-weighted', 'model-claude3', 'Claude-3 Cost-Optimized Pool', 'Weighted');

-- Add vendors with weights
INSERT INTO AIModelVendorPoolMember (PoolID, VendorID, Priority, Weight)
VALUES
  ('pool-weighted', 'vendor-anthropic-direct', 10, 30),  -- 30% of traffic (expensive)
  ('pool-weighted', 'vendor-aws-bedrock', 20, 70);       -- 70% of traffic (cheaper)
```

**Behavior:**
- 70% of requests go to AWS Bedrock (cheaper)
- 30% go to Anthropic Direct (faster, more expensive)
- Automatic distribution based on weights

---

## Backward Compatibility

### Compatibility Matrix

| Scenario | PoolID Value | Behavior | Impact |
|----------|--------------|----------|--------|
| **Existing Prompt** | NULL | Direct execution (existing code path) | Zero |
| **New Prompt (No Pool)** | NULL | Direct execution | Zero |
| **New Prompt (With Pool)** | Valid ID | Pool execution | Opt-in |
| **Pool Disabled** | Valid ID but IsActive=0 | Falls back to direct execution | Graceful degradation |
| **Pool Not Found** | Invalid ID | Falls back to direct execution + warning | Graceful degradation |

### Migration Strategy

**Phase 1:** Database schema deployment
- Deploy new tables via migration
- All existing prompts have `PoolID = NULL`
- Zero behavioral changes

**Phase 2:** Code deployment
- Deploy pool manager code
- Singleton initializes on first use (lazy)
- Pool routing checks PoolID before activating

**Phase 3:** Gradual rollout
- Create pools for specific models
- Update select prompts to use pools
- Monitor performance and health
- Expand to more prompts over time

**Rollback Plan:**
- Set `IsActive = 0` on all pools
- System falls back to direct execution
- No code changes needed

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

**Goal:** Database schema and basic pool infrastructure.

**Tasks:**
1. ✅ Create database migration
   - New tables: AIModelVendorPool, AIModelVendorPoolMember, AIVendorAPIKey
   - Modify: AIPromptModel (add PoolID)
   - Optional: AIVendorHealthEvent
2. ✅ Generate entity classes via CodeGen
3. ✅ Create ModelPoolManager singleton (stub)
4. ✅ Add pool routing logic to AIPromptRunner
   - Check PoolID
   - Route to pool or direct execution
5. ✅ Unit tests for routing logic

**Deliverable:** Pool routing works but always falls back to direct execution.

### Phase 2: Health Tracking (Week 2)

**Goal:** Implement sophisticated health tracking system.

**Tasks:**
1. ✅ Create VendorHealthTracker class
   - Error type analysis
   - Recovery strategy determination
   - Circuit breaker implementation
2. ✅ Implement health check system
   - Network ping
   - API health endpoint
   - Minimal test request
3. ✅ Add health status API endpoints
   - GET /api/vendor-health
   - GET /api/vendor-health/:vendorId
4. ✅ Integration tests with simulated failures

**Deliverable:** Health tracking system operational but not yet affecting routing.

### Phase 3: Rate Limiting & Pooling (Week 3)

**Goal:** Implement rate limit tracking and vendor/key pooling.

**Tasks:**
1. ✅ Create RateLimitTracker with sliding windows
2. ✅ Create VendorAPIKeyPool
   - Multi-key management
   - Key selection logic
   - Usage tracking
3. ✅ Create ModelExecutionPool
   - Queue management
   - Capacity checking
   - Vendor/key selection
4. ✅ Implement load balancing strategies
   - RoundRobin, LeastBusy, Weighted, Random, Priority
5. ✅ Integration tests with mock vendors

**Deliverable:** Complete pooling system operational.

### Phase 4: Testing & Rollout (Week 4)

**Goal:** Comprehensive testing and gradual production rollout.

**Tasks:**
1. ✅ End-to-end integration tests
   - Multi-vendor scenarios
   - Queue timeout scenarios
   - Health degradation scenarios
2. ✅ Performance testing
   - High-volume load tests
   - Queue performance under load
3. ✅ Create monitoring dashboards
   - Pool statistics
   - Vendor health status
   - Queue depths and wait times
4. ✅ Documentation
   - Admin guide for pool configuration
   - Troubleshooting guide
5. ✅ Production rollout
   - Phase 1: Internal prompts only
   - Phase 2: Low-traffic customer prompts
   - Phase 3: High-traffic prompts
   - Phase 4: All prompts (optional)

**Deliverable:** Production-ready pooling system with observability.

---

## Testing Strategy

### Unit Tests

```typescript
// ModelPoolManager.test.ts
describe('ModelPoolManager', () => {
  it('should create singleton instance', () => {
    const instance1 = ModelPoolManager.getInstance();
    const instance2 = ModelPoolManager.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should initialize pools from database', async () => {
    // ... test pool loading ...
  });

  it('should route to correct pool based on model', async () => {
    // ... test pool selection ...
  });
});

// RateLimitTracker.test.ts
describe('RateLimitTracker', () => {
  it('should allow requests within TPM limit', () => {
    const tracker = new RateLimitTracker(100000, 1000, 'ModelSpecific');
    expect(tracker.canAccommodate(50000)).toBe(true);
    tracker.recordUsage(50000);
    expect(tracker.canAccommodate(50000)).toBe(true);
    tracker.recordUsage(50000);
    expect(tracker.canAccommodate(1000)).toBe(false); // Exceeded
  });

  it('should reset after window expires', async () => {
    // ... test sliding window ...
  });
});

// VendorHealthTracker.test.ts
describe('VendorHealthTracker', () => {
  it('should open circuit after threshold failures', async () => {
    // ... test circuit breaker ...
  });

  it('should schedule health checks for network errors', async () => {
    // ... test health check scheduling ...
  });

  it('should recover vendor after successful health check', async () => {
    // ... test recovery ...
  });
});
```

### Integration Tests

```typescript
// PoolIntegration.test.ts
describe('Pool Integration', () => {
  it('should queue requests when at capacity', async () => {
    // Create pool with MaxParallelRequests=2
    // Submit 5 requests
    // Verify 2 execute immediately, 3 queue
    // Verify queued requests execute when capacity available
  });

  it('should distribute load across vendors', async () => {
    // Create pool with 2 vendors (RoundRobin)
    // Submit 10 requests
    // Verify each vendor gets ~5 requests
  });

  it('should route around unhealthy vendor', async () => {
    // Mark vendor1 as unhealthy
    // Submit requests
    // Verify all go to vendor2
  });

  it('should use multiple API keys from same vendor', async () => {
    // Add 3 keys to vendor
    // Submit requests exceeding single key limit
    // Verify load spreads across keys
  });
});
```

### Performance Tests

```typescript
// Performance.test.ts
describe('Performance', () => {
  it('should handle 1000 concurrent requests', async () => {
    const requests = Array(1000).fill(null).map(() =>
      promptRunner.ExecutePrompt(testParams)
    );

    const start = Date.now();
    await Promise.all(requests);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(30000); // 30s for 1000 requests
  });

  it('should maintain low latency under load', async () => {
    // Measure p50, p95, p99 latencies
  });
});
```

---

## Open Questions

### 1. Cross-Server Coordination

**Question:** If running multiple MJAPI instances, should they share pool state?

**Options:**
- **A)** Each server has independent pools (simpler, current design)
- **B)** Shared state via Redis (complex, better coordination)
- **C)** Hybrid (health state shared, queues independent)

**Recommendation:** Start with (A), add (B) if needed later.

### 2. Cost Tracking

**Question:** Should we track estimated costs per vendor/key?

**Options:**
- **A)** No cost tracking (current design)
- **B)** Track and report costs (observability only)
- **C)** Cost-aware routing (prefer cheaper vendors)

**Recommendation:** Start with (A), add (B) for observability later.

### 3. Admin UI

**Question:** Should we build admin UI for pool management?

**Options:**
- **A)** Database-only configuration
- **B)** GraphQL API + Explorer UI integration
- **C)** Dedicated admin dashboard

**Recommendation:** Start with (A), add (B) when usage grows.

### 4. Vendor-Specific Optimizations

**Question:** Should we support vendor-specific rate limit headers?

**Examples:**
- OpenAI returns `x-ratelimit-remaining-tokens` header
- Anthropic returns retry-after headers

**Options:**
- **A)** Ignore vendor headers (generic only)
- **B)** Parse and use vendor headers (more accurate)

**Recommendation:** Start with (A), add (B) for specific vendors if needed.

### 5. Prediction & Learning

**Question:** Should we predict rate limit exhaustion?

**Options:**
- **A)** Reactive only (current design)
- **B)** Predict based on historical patterns
- **C)** ML-based prediction

**Recommendation:** Start with (A), consider (B) if patterns emerge.

---

## Success Metrics

### Key Performance Indicators

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Queue Wait Time (p95)** | < 5 seconds | Time from enqueue to execution start |
| **Vendor Health Uptime** | > 99.5% | % of time at least one vendor is healthy |
| **Rate Limit Hit Rate** | < 1% | % of requests that hit rate limit |
| **Queue Timeout Rate** | < 0.1% | % of requests that timeout in queue |
| **Load Distribution Variance** | < 20% | Variance in requests per vendor |
| **Recovery Time** | < 2 minutes | Time from failure to recovery |

### Monitoring Dashboards

**Dashboard 1: Pool Health**
- Queue depth per model
- Active requests per model
- Average wait time (p50, p95, p99)
- Queue timeout rate

**Dashboard 2: Vendor Health**
- Vendor health status (color-coded)
- Circuit breaker state
- Consecutive failures per vendor
- Last successful request timestamp

**Dashboard 3: Rate Limits**
- TPM usage per vendor
- RPM usage per vendor
- Available capacity
- Rate limit hit events

**Dashboard 4: Load Distribution**
- Requests per vendor (bar chart)
- Requests per API key (bar chart)
- Load balancing strategy effectiveness

---

## Appendix

### Type Definitions

```typescript
interface PooledExecutionTask {
  taskId: string;
  modelId: string;
  params: AIPromptParams;
  renderedPrompt: string;
  estimatedTokens: number;
  priority: number;
  timeout: number;
  cancellationToken?: AbortSignal;
  onProgress?: (progress: any) => void;
  onStreaming?: (chunk: string) => void;
}

interface VendorKeySelection {
  vendorId: string;
  keyId: string;
  vendor: AIVendorEntity;
  apiKey: APIKeyInfo;
}

interface APIKeyInfo {
  id: string;
  value: string;
  vendorId: string;
  tracker: RateLimitTracker;
}

interface VendorHealthInfo {
  vendorId: string;
  status: VendorHealthStatus;
  lastHealthCheck: Date;
  lastSuccessfulRequest: Date;
  lastFailedRequest: Date;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  circuitState: CircuitState;
  recoveryAttempts: number;
}

interface PoolStatistics {
  modelId: string;
  queueLength: number;
  activeRequests: number;
  totalProcessed: number;
  averageWaitTimeMS: number;
  successRate: number;
  failureRate: number;
}
```

---

## Conclusion

This design provides a comprehensive, production-ready pooling and load balancing system for MemberJunction's AI execution layer. Key highlights:

✅ **Opt-in activation** - Zero impact on existing prompts
✅ **Global coordination** - Single pool manager per server
✅ **Intelligent health tracking** - Error-specific recovery strategies
✅ **Multi-key support** - Scale beyond single API keys
✅ **Sophisticated queueing** - Handle rate limits gracefully
✅ **Flexible load balancing** - Multiple strategies supported
✅ **Backward compatible** - No breaking changes
✅ **Observable** - Comprehensive metrics and logging
✅ **Testable** - Clear unit and integration test strategy

The system moves MemberJunction from reactive failover to proactive load distribution, enabling higher reliability, better resource utilization, and improved scalability for AI-powered workloads.

---

**Next Steps:**
1. Review and approve design
2. Create database migration
3. Begin Phase 1 implementation
4. Iterate based on feedback
