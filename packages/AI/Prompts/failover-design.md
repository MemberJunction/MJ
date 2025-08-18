# AIPromptRunner Failover System Design

## Executive Summary

This document outlines the design for an intelligent failover system in the AIPromptRunner class that provides automatic resilience against provider outages, rate limits, and service degradation. The system leverages the enhanced error handling capabilities added to the MemberJunction AI framework to make intelligent decisions about when and how to failover between AI providers.

## Goals

1. **Automatic Resilience**: Handle transient failures without manual intervention
2. **Transparency**: Track all failover attempts for debugging and analysis
3. **Flexibility**: Support different failover strategies for different use cases
4. **Simplicity**: Work out-of-the-box with sensible defaults
5. **Extensibility**: Provide clear extension points for custom behavior

## Design Principles

- **Progressive Enhancement**: Basic prompts work with zero configuration
- **Leverage Existing Systems**: Use AIPromptModel for vendor ordering preferences
- **Non-Breaking**: All changes are backward compatible
- **Clear Documentation**: Protected methods with comprehensive JSDoc
- **Performance Conscious**: Smart delays and retry limits

## Architecture Overview

### System Components

1. **Enhanced AIPrompt Table**: New columns for failover configuration
2. **Enhanced AIPromptRun Table**: New columns for failover tracking
3. **Protected Methods in AIPromptRunner**: Granular extension points
4. **Intelligent Error Analysis**: Leverages new ErrorAnalyzer capabilities

### Data Flow

```
1. Execute Prompt
   ↓
2. Check Failover Configuration
   ↓
3. Select Initial Model/Vendor (existing logic)
   ↓
4. Execute with Model
   ↓
5. If Error: Analyze Error Type
   ↓
6. If Should Failover: Select Next Candidate
   ↓
7. Delay and Retry
   ↓
8. Track All Attempts in AIPromptRun
```

## Database Schema Changes

### AIPrompt Table Enhancements

```sql
-- Add failover configuration columns with CHECK constraints and defaults
ALTER TABLE ${flyway:defaultSchema}.AIPrompt ADD
    -- Core failover strategy
    FailoverStrategy NVARCHAR(50) NOT NULL DEFAULT 'Automatic' 
        CHECK (FailoverStrategy IN ('Automatic', 'Manual', 'Disabled')),
    
    -- Maximum number of failover attempts (not including initial attempt)
    MaxFailoverAttempts INT NOT NULL DEFAULT 3 
        CHECK (MaxFailoverAttempts BETWEEN 0 AND 10),
    
    -- Base delay between failover attempts in seconds
    FailoverDelaySeconds INT NOT NULL DEFAULT 10 
        CHECK (FailoverDelaySeconds BETWEEN 0 AND 300),
    
    -- Strategy for selecting next model/vendor combination
    FailoverModelStrategy NVARCHAR(50) NOT NULL DEFAULT 'SameModelOtherVendor' 
        CHECK (FailoverModelStrategy IN ('SameModelOtherVendor', 'NextBestModel', 'ByPowerRank')),
    
    -- Scope of errors that trigger failover
    FailoverErrorScope NVARCHAR(50) NOT NULL DEFAULT 'Retriable' 
        CHECK (FailoverErrorScope IN ('None', 'Critical', 'Retriable', 'All'));
```

#### Column Descriptions

- **FailoverStrategy**:
  - `Automatic`: System automatically attempts failover based on error analysis
  - `Manual`: Failover only when explicitly requested via params
  - `Disabled`: No failover attempts, fail immediately

- **MaxFailoverAttempts**: 
  - Number of additional attempts after initial failure
  - Default of 3 provides good balance between resilience and performance

- **FailoverDelaySeconds**:
  - Base delay between attempts (may be adjusted based on error type)
  - Default of 10 seconds prevents hammering services while staying responsive

- **FailoverModelStrategy**:
  - `SameModelOtherVendor`: Try same model with different inference provider
  - `NextBestModel`: Move to next model in priority order
  - `ByPowerRank`: Re-evaluate all options by power rank

- **FailoverErrorScope**:
  - `None`: No automatic failover based on errors
  - `Critical`: Only failover on rate limits and service unavailable (429, 503)
  - `Retriable`: Failover on all retriable errors (default)
  - `All`: Attempt failover on any error except auth/invalid request

### AIPromptRun Table Enhancements

```sql
-- Add failover tracking columns (nullable - only populated when failover occurs)
ALTER TABLE ${flyway:defaultSchema}.AIPromptRun ADD
    -- Number of failover attempts made (0 if no failover)
    FailoverAttemptCount INT NULL,
    
    -- JSON array of vendor/model combinations attempted
    FailoverVendorAttempts NVARCHAR(MAX) NULL,
    
    -- JSON array of unique error types encountered
    FailoverErrorTypes NVARCHAR(MAX) NULL,
    
    -- Total time spent on failover attempts in milliseconds
    TotalFailoverDurationMS INT NULL,
    
    -- Originally selected vendor/model (before any failover)
    OriginalVendorID UNIQUEIDENTIFIER NULL,
    OriginalModelID UNIQUEIDENTIFIER NULL;
```

#### JSON Structure Examples

**FailoverVendorAttempts**:
```json
[
  {
    "attemptNumber": 1,
    "modelId": "uuid-1",
    "modelName": "Claude 3.5 Sonnet",
    "vendorId": "uuid-2",
    "vendorName": "Anthropic",
    "errorType": "RateLimit",
    "duration": 1234
  },
  {
    "attemptNumber": 2,
    "modelId": "uuid-1",
    "modelName": "Claude 3.5 Sonnet",
    "vendorId": "uuid-3",
    "vendorName": "AWS Bedrock",
    "errorType": null,
    "duration": 2345,
    "success": true
  }
]
```

**FailoverErrorTypes**:
```json
["RateLimit", "ServiceUnavailable"]
```

## Implementation Design

### Core Types

```typescript
interface FailoverConfiguration {
  strategy: 'Automatic' | 'Manual' | 'Disabled';
  maxAttempts: number;
  delaySeconds: number;
  modelStrategy: 'SameModelOtherVendor' | 'NextBestModel' | 'ByPowerRank';
  errorScope: 'None' | 'Critical' | 'Retriable' | 'All';
}

interface FailoverAttempt {
  attemptNumber: number;
  modelId: string;
  modelName: string;
  vendorId?: string;
  vendorName: string;
  startTime: Date;
  endTime?: Date;
  errorType?: string;
  success?: boolean;
}
```

### Protected Methods for Extension

The following protected methods provide granular control points for subclasses:

#### 1. getFailoverConfiguration
```typescript
/**
 * Extracts failover configuration from prompt entity and params.
 * Override to provide custom configuration logic or dynamic configuration.
 * 
 * @example
 * ```typescript
 * protected override getFailoverConfiguration(
 *   prompt: AIPromptEntityExtended,
 *   params: AIPromptParams
 * ): FailoverConfiguration {
 *   const config = super.getFailoverConfiguration(prompt, params);
 *   // Disable failover during business hours for cost control
 *   const hour = new Date().getHours();
 *   if (hour >= 9 && hour <= 17) {
 *     config.maxAttempts = 1;
 *   }
 *   return config;
 * }
 * ```
 */
protected getFailoverConfiguration(
  prompt: AIPromptEntityExtended,
  params: AIPromptParams
): FailoverConfiguration
```

#### 2. shouldAttemptFailover
```typescript
/**
 * Determines if failover should be attempted based on the error and configuration.
 * Override to implement custom failover decision logic.
 * 
 * @example
 * ```typescript
 * protected override shouldAttemptFailover(
 *   result: ChatResult,
 *   config: FailoverConfiguration,
 *   attemptNumber: number
 * ): boolean {
 *   // Add custom logic to skip failover for specific error messages
 *   if (result.errorMessage?.includes('quota exceeded for month')) {
 *     return false; // Don't failover on monthly quotas
 *   }
 *   return super.shouldAttemptFailover(result, config, attemptNumber);
 * }
 * ```
 */
protected shouldAttemptFailover(
  result: ChatResult,
  config: FailoverConfiguration,
  attemptNumber: number
): boolean
```

#### 3. calculateFailoverDelay
```typescript
/**
 * Calculates the delay before the next failover attempt.
 * Override to implement custom delay strategies.
 * 
 * @example
 * ```typescript
 * protected override calculateFailoverDelay(
 *   errorInfo: AIErrorInfo | undefined,
 *   baseDelaySeconds: number,
 *   attemptNumber: number
 * ): number {
 *   // Use linear backoff instead of exponential
 *   return baseDelaySeconds * attemptNumber;
 * }
 * ```
 */
protected calculateFailoverDelay(
  errorInfo: AIErrorInfo | undefined,
  baseDelaySeconds: number,
  attemptNumber: number
): number
```

#### 4. selectFailoverCandidates
```typescript
/**
 * Filters and reorders candidates for the next failover attempt.
 * Override to implement custom candidate selection logic.
 * 
 * @example
 * ```typescript
 * protected override async selectFailoverCandidates(
 *   allCandidates: ModelVendorCandidate[],
 *   failedAttempts: FailoverAttempt[],
 *   config: FailoverConfiguration,
 *   lastError: ChatResult | null
 * ): Promise<ModelVendorCandidate[]> {
 *   let candidates = await super.selectFailoverCandidates(...arguments);
 *   
 *   // Prefer specific vendors during off-hours
 *   const hour = new Date().getHours();
 *   if (hour < 6 || hour > 22) {
 *     candidates = candidates.filter(c => 
 *       c.vendorName === 'Groq' || c.vendorName === 'Together'
 *     );
 *   }
 *   
 *   return candidates;
 * }
 * ```
 */
protected async selectFailoverCandidates(
  allCandidates: ModelVendorCandidate[],
  failedAttempts: FailoverAttempt[],
  config: FailoverConfiguration,
  lastError: ChatResult | null
): Promise<ModelVendorCandidate[]>
```

#### 5. logFailoverAttempt
```typescript
/**
 * Logs a failover attempt for tracking and debugging.
 * Override to implement custom logging or monitoring.
 * 
 * @example
 * ```typescript
 * protected override logFailoverAttempt(
 *   attempt: FailoverAttempt,
 *   errorInfo: AIErrorInfo | undefined,
 *   config: FailoverConfiguration
 * ): void {
 *   super.logFailoverAttempt(attempt, errorInfo, config);
 *   
 *   // Send to monitoring system
 *   this.metrics.recordFailover({
 *     modelId: attempt.modelId,
 *     vendorId: attempt.vendorId,
 *     errorType: errorInfo?.errorType,
 *     attemptNumber: attempt.attemptNumber
 *   });
 * }
 * ```
 */
protected logFailoverAttempt(
  attempt: FailoverAttempt,
  errorInfo: AIErrorInfo | undefined,
  config: FailoverConfiguration
): void
```

## Failover Strategies

### SameModelOtherVendor

Best for scenarios where model consistency is important:
- Maintains output format/style consistency
- Useful for open-source models available from multiple providers
- Example: Claude on Anthropic → Claude on Bedrock → Claude on Vertex

### NextBestModel

Best for maximum availability:
- Moves to next model in priority order
- Leverages AIPromptModel configuration
- Example: Claude 3.5 → GPT-4 → Gemini Pro

### ByPowerRank

Best for quality-first scenarios:
- Re-evaluates all options by power rank
- May retry same model if it's highest ranked
- Example: After failure, reconsider all options

## Error Scope Configuration

### Critical (Most Conservative)
- Only fails over on clear infrastructure issues
- Rate limits (429) and Service Unavailable (503)
- Best for: Cost-sensitive applications

### Retriable (Default)
- Fails over on all potentially transient errors
- Includes: RateLimit, ServiceUnavailable, InternalServerError, NetworkError
- Best for: Most applications

### All (Most Aggressive)
- Attempts failover on any error except clear client errors
- Excludes only: Authentication, InvalidRequest
- Best for: Mission-critical applications

### None
- Disables automatic error-based failover
- Only manual failover triggers apply
- Best for: Testing or specific control requirements

## Example Configurations

### High Availability Configuration
```sql
UPDATE AIPrompt SET
  FailoverStrategy = 'Automatic',
  MaxFailoverAttempts = 5,
  FailoverDelaySeconds = 5,
  FailoverModelStrategy = 'SameModelOtherVendor',
  FailoverErrorScope = 'All'
WHERE Name = 'Critical Customer Query';
```

### Cost-Conscious Configuration
```sql
UPDATE AIPrompt SET
  FailoverStrategy = 'Automatic',
  MaxFailoverAttempts = 2,
  FailoverDelaySeconds = 15,
  FailoverModelStrategy = 'NextBestModel',
  FailoverErrorScope = 'Critical'
WHERE CategoryID = @BudgetCategoryId;
```

### Quality-First Configuration
```sql
UPDATE AIPrompt SET
  FailoverStrategy = 'Automatic',
  MaxFailoverAttempts = 4,
  FailoverDelaySeconds = 10,
  FailoverModelStrategy = 'ByPowerRank',
  FailoverErrorScope = 'Retriable'
WHERE Name = 'Executive Summary Generator';
```

## Monitoring and Debugging

### Key Metrics to Track

1. **Failover Rate**: `FailoverAttemptCount > 0` / Total Runs
2. **Failover Success Rate**: Successful failovers / Total failover attempts
3. **Common Error Patterns**: Aggregate FailoverErrorTypes
4. **Vendor Reliability**: Group by OriginalVendorID with failure counts
5. **Failover Duration Impact**: Average TotalFailoverDurationMS

### Example Monitoring Queries

```sql
-- Failover summary by prompt
SELECT 
  p.Name as PromptName,
  COUNT(*) as TotalRuns,
  COUNT(CASE WHEN r.FailoverAttemptCount > 0 THEN 1 END) as FailoverRuns,
  AVG(r.FailoverAttemptCount) as AvgFailoverAttempts,
  AVG(r.TotalFailoverDurationMS) as AvgFailoverDuration
FROM AIPromptRun r
JOIN AIPrompt p ON r.PromptID = p.ID
WHERE r.RunAt >= DATEADD(day, -7, GETUTCDATE())
GROUP BY p.Name
ORDER BY FailoverRuns DESC;

-- Most common failover error types
SELECT 
  ErrorType,
  COUNT(*) as Occurrences
FROM AIPromptRun
CROSS APPLY OPENJSON(FailoverErrorTypes) 
  WITH (ErrorType NVARCHAR(50) '$')
WHERE FailoverErrorTypes IS NOT NULL
  AND RunAt >= DATEADD(day, -7, GETUTCDATE())
GROUP BY ErrorType
ORDER BY Occurrences DESC;
```

## Implementation Phases

### Phase 1: Core Implementation (Week 1)
- Database schema changes
- Core failover logic in AIPromptRunner
- Basic error scope handling
- Tracking in AIPromptRun

### Phase 2: Strategy Implementation (Week 2)
- SameModelOtherVendor strategy
- NextBestModel strategy
- ByPowerRank strategy
- Comprehensive testing

### Phase 3: UI Integration (Week 3)
- Prompt configuration UI updates
- Failover tracking visualization
- Run details showing failover attempts

### Phase 4: Advanced Features (Week 4)
- Custom delay strategies
- Advanced monitoring dashboard
- Performance optimization
- Documentation and examples

## Testing Strategy

### Unit Tests
- Each protected method in isolation
- Different error scenarios
- Configuration validation
- Delay calculations

### Integration Tests
- Full failover scenarios
- Multiple provider failures
- Tracking data accuracy
- Performance impact

### End-to-End Tests
- Real provider failures
- Network interruption simulation
- Rate limit scenarios
- Long-running failover chains

## Performance Considerations

1. **Candidate Caching**: Cache model/vendor candidates during failover loop
2. **Parallel Preparation**: Pre-warm next candidate while current executes
3. **Smart Delays**: Use jitter to prevent thundering herd
4. **Early Termination**: Stop if error indicates no point in retrying
5. **Connection Pooling**: Reuse HTTP connections across attempts

## Security Considerations

1. **API Key Validation**: Re-validate keys before each failover attempt
2. **Audit Trail**: Complete tracking of all attempts for compliance
3. **Error Sanitization**: Don't leak sensitive data in error messages
4. **Rate Limit Respect**: Honor provider rate limit headers

## Future Enhancements

1. **Circuit Breaker Pattern**: Temporarily disable failing vendors
2. **Predictive Failover**: Pre-emptively switch based on patterns
3. **Cost Optimization**: Factor in cost when selecting failover candidates
4. **SLA Tracking**: Monitor and report on availability metrics
5. **Multi-Region Support**: Failover across geographic regions

## Conclusion

This failover system provides a robust, flexible solution for handling AI provider failures while maintaining simplicity and extensibility. By leveraging existing MemberJunction systems and providing clear extension points, it enables both automatic resilience and fine-grained control when needed.