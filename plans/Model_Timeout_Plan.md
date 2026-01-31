# Session: Gemini API Reliability & Error Handling Improvements

**Date Created**: 2026-01-28
**Status**: Bug Identified - Ready for Implementation
**Priority**: High - Production failures affecting user experience

---

## 🚨 Quick Summary (TL;DR)

**Problem**: Network failures when calling Gemini API result in 5-minute timeouts with no failover to alternate models.

**Root Cause**: Bug in `AIPromptRunner.executeModelWithFailover()` (line 2733) - returns failed results immediately without checking `result.success` or attempting failover.

**The Fix**: After calling `executeModel()`, check if `!result.success && result.errorInfo?.canFailover`, then continue to next candidate instead of returning immediately.

**Impact**: 2 out of 3 recent production runs failed with "TypeError: fetch failed" after ~300 seconds. Users saw "No error message" instead of instant failover to working models.

**Next Steps**: Implement Phase 1 (fix failover bug) immediately. Phase 2 (add timeout config) prevents future 5-minute waits.

---

## Executive Summary

Multiple production Skip runs are failing due to intermittent network failures when calling Google's Gemini 3 Flash API. Deep code analysis revealed that MemberJunction's AI infrastructure **already has** comprehensive retry and failover logic, but a bug prevents it from triggering when provider drivers return `ChatResult{success: false}` instead of throwing exceptions.

---

## Problem Statement

### Current Behavior
1. AIPromptRunner sends HTTP request to Gemini API
2. Network failure occurs (fetch fails)
3. System waits for full timeout period (~5 minutes)
4. Returns generic error: "JSON parsing/validation failed: Model execution failed: exception TypeError: fetch failed"
5. Agent run step shows "No error message" to user

### Impact
- **User Experience**: 5-minute wait followed by unhelpful error message
- **Production Reliability**: ~33% failure rate observed in recent runs
- **Debugging**: No visibility into actual failure cause
- **Resource Waste**: Long timeouts consume server resources

---

## Evidence from Production

### Failed Runs

#### Run 1: 61987CA1 - "At-Risk Account Analysis"
- **Query Writer Step Failed**
- Prompt Run ID: `6229C4DC-413F-432C-BDE1-37753BD942AE`
- Duration: 300,731ms (~5 minutes)
- Error: "JSON parsing/validation failed: Model execution failed: exception TypeError: fetch failed"
- Tokens: 0 (request never reached model)

#### Run 3: AF88A36E - "Hiring Stage Performance Summary"
- **Query Writer Step Failed**
- Prompt Run ID: `935333C6-EB3D-4613-8612-682C13D22262`
- Duration: 300,683ms (~5 minutes)
- Error: Same network failure
- Tokens: 0

#### Run 2: F39F4FFE
- **Succeeded** with Gemini API
- Hit cleanJSON type safety bug (already fixed in separate work)

### Failure Pattern
- 2 out of 3 runs failed with identical network errors
- All failures occurred at Query Writer step (Gemini API calls)
- Timeout is consistent at ~300 seconds (5 minutes)
- Zero tokens charged indicates request never reached the model

---

## Root Cause Analysis

### Potential Network Failure Causes
1. **Intermittent Connectivity**: Transient network issues between server and Google API
2. **API Rate Limiting**: Google throttling requests (though usually returns 429, not network error)
3. **DNS Resolution**: Intermittent DNS lookup failures
4. **Certificate/TLS Issues**: SSL handshake failures
5. **Firewall/Proxy**: Network infrastructure blocking or timing out requests
6. **API Endpoint Issues**: Google's API endpoint experiencing problems

### Current Code Gaps
1. **No Retry Logic**: Single attempt per API call
2. **Fixed Timeout**: Hardcoded 5-minute timeout with no configuration
3. **Poor Error Messages**: Generic error doesn't distinguish network vs. API failures
4. **No Fallback**: Can't switch to alternate model/vendor on repeated failures
5. **No Monitoring**: No metrics on AI vendor reliability/latency

---

## Technical Context

### Affected Components

#### Primary: AI Prompts Package
- **Location**: `/packages/AI/Prompts/src/`
- **Key File**: `AIPromptRunner.ts` (4700+ lines)
  - Handles prompt execution orchestration
  - **ALREADY HAS** comprehensive retry logic for:
    - Validation failures (lines 3209-3395)
    - Rate limit errors (lines 3496-3541)
    - Model failover with instant fallover (lines 2689-2800)
  - Uses `ErrorAnalyzer` to categorize errors
  - Supports configurable `MaxRetries`, `RetryStrategy`, `RetryDelayMS` on prompts

#### AI Provider Drivers
- **Location**: `/packages/AI/Providers/`
- **Gemini Provider**: `/packages/AI/Providers/Gemini/src/index.ts` (816 lines)
  - Extends `BaseLLM` from AI Core
  - Uses `@google/genai` SDK (newer SDK)
  - Implements `nonStreamingChatCompletion()` and streaming
  - **NO TIMEOUT CONFIGURATION** visible in driver code
- **Vertex Provider**: `/packages/AI/Providers/Vertex/src/models/vertexLLM.ts` (232 lines)
  - Extends `GeminiLLM` (inherits all Gemini logic)
  - Only difference is authentication (GCP credentials vs API key)
  - Uses same `@google/genai` SDK with `vertexai: true` config

#### Error Analysis Infrastructure
- **Location**: `/packages/AI/Core/src/generic/errorAnalyzer.ts` (398 lines)
- **Purpose**: Sophisticated error categorization system
- **Error Types Detected**:
  - `NetworkError` - detects "network", "timeout", "econnrefused", "dns" in error messages
  - `RateLimit`, `ServiceUnavailable`, `ContextLengthExceeded`, etc.
- **Severity Levels**: `Retriable`, `Transient`, `Fatal`
- **Failover Logic**: Determines if error can be resolved by switching providers

#### Base LLM Class
- **Location**: `/packages/AI/Core/src/generic/baseLLM.ts`
- **Key Method**: `ChatCompletion(params: ChatParams)` - entry point for all LLM calls
- Routes to provider-specific implementations
- **NO TIMEOUT CONFIGURATION** in base class

### Architecture Overview

```
AIPromptRunner (orchestration)
    ↓
BaseLLM.ChatCompletion()
    ↓
[Provider Driver] (GeminiLLM, VertexLLM, OpenAILLM, etc.)
    ↓
Provider SDK (@google/genai, openai, anthropic, etc.)
    ↓
HTTP Client (fetch/axios) → AI Vendor API
```

### Current State - What WORKS

✅ **Retry Logic EXISTS**:
- Validation retries with exponential backoff
- Rate limit retries (up to MaxRetries, default 3)
- Model failover to alternate vendors
- Configurable retry strategies: Fixed, Linear, Exponential

✅ **Error Handling EXISTS**:
- `ErrorAnalyzer` categorizes all errors
- Network errors ARE detected (checks for "network", "timeout", "fetch failed")
- Severity-based retry decisions
- Failover based on error type

✅ **Retry Tracking EXISTS**:
- `ValidationAttemptCount`, `TotalRetryDurationMS` logged
- `FailoverAttempt` tracking with detailed logging
- Comprehensive execution metrics

### Current State - What DOESN'T WORK

❌ **Timeout Configuration MISSING**:
- No configurable timeout at AIPromptRunner level
- No timeout configuration on AIModel entity
- Provider SDKs use their own defaults (~5 minutes for fetch)
- No way to set shorter timeouts for faster failover

❌ **Network-Level Failures Not Retried**:
- Production error: "TypeError: fetch failed" after 300 seconds
- This is a **fetch() failure** before HTTP response received
- ErrorAnalyzer DOES detect this as `NetworkError` (severity: Retriable)
- BUT: The error happens in `nonStreamingChatCompletion()` **BEFORE** failover logic runs
- The catch block returns a ChatResult with `success: false`, but:
  - No retry attempt at the driver level
  - Failover logic in AIPromptRunner only triggers if exception is thrown OR errorInfo.severity === 'Fatal'

### Root Cause Analysis - EXACT BUG IDENTIFIED

**The Bug**: `AIPromptRunner.executeModelWithFailover()` returns failed results without attempting failover to alternate candidates.

#### Code Flow for Network Errors:

1. **GeminiLLM** (lines 366-381) catches fetch failures:
   ```typescript
   catch (e) {
       return {
           success: false,
           statusText: e && e.message ? e.message : "Error",
           errorMessage: e.message,
           exception: e,
           errorInfo: ErrorAnalyzer.analyzeError(e, 'Gemini')  // errorType: 'NetworkError', canFailover: true
       }
   }
   ```

2. **AIPromptRunner.executeModel()** (lines 2951-3164) returns the ChatResult (doesn't throw)

3. **AIPromptRunner.executeModelWithFailover()** (lines 2713-2733):
   ```typescript
   const result = await this.executeModel(...);

   // Success! Update promptRun with failover information if we had prior failures
   if (failoverAttempts.length > 0 && promptRun) {
     this.updatePromptRunWithFailoverSuccess(promptRun, failoverAttempts, candidate.model, candidate.vendorId || null);
   }

   return result;  // ❌ BUG: Returns immediately without checking result.success!
   ```

4. The `catch` block (line 2735) never runs because `executeModel()` didn't throw

5. No failover to the next candidate occurs

#### Why This Happens:

- The failover loop is wrapped in `try/catch` expecting **thrown exceptions**
- But provider drivers (GeminiLLM, OpenAILLM, etc.) **catch errors internally** and return `ChatResult{success: false}`
- The code assumes `executeModel()` either returns success OR throws
- **It never checks `result.success` after the call**

#### The Fix:

After calling `executeModel()` at line 2713, check if the result failed and should trigger failover:

```typescript
const result = await this.executeModel(...);

// Check if the result failed and can be failed over
if (!result.success && result.errorInfo?.canFailover) {
    // Treat as a retriable error - continue to next candidate
    const attemptDuration = Date.now() - attemptStartTime;
    lastError = result.exception || new Error(result.errorMessage || 'Model execution failed');

    const failoverAttempt: FailoverAttempt = {
        attemptNumber: i + 1,
        modelId: candidate.model.ID,
        vendorId: candidate.vendorId,
        error: lastError,
        errorType: result.errorInfo.errorType,
        duration: attemptDuration,
        timestamp: new Date()
    };
    failoverAttempts.push(failoverAttempt);

    // Handle vendor-level errors (Auth, VendorValidation)
    if (result.errorInfo.errorType === 'Authentication' || result.errorInfo.errorType === 'VendorValidationError') {
        allCandidates = this.filterVendorCandidates(...);
    }

    // Apply rate limit retry logic if needed
    if (result.errorInfo.errorType === 'RateLimit') {
        const shouldRetry = await this.handleRateLimitRetry(...);
        if (shouldRetry) continue; // Retry same model
    }

    // Log and continue to next candidate
    this.logFailoverAttempt(prompt.ID, failoverAttempt, i < allCandidates.length - 1);
    continue; // Try next candidate
}

// If we get here, result was successful
if (failoverAttempts.length > 0 && promptRun) {
    this.updatePromptRunWithFailoverSuccess(promptRun, failoverAttempts, candidate.model, candidate.vendorId || null);
}

return result;
```

### Impact of This Bug

- **Network failures** (fetch timeout, DNS errors, connection reset) don't trigger failover
- **Rate limits** returned as ChatResult don't trigger failover
- **Service unavailable** errors don't trigger failover
- User waits 5 minutes for timeout, then gets generic error instead of instant failover to working model

### Additional Improvements Needed

While fixing the failover bug will solve the immediate problem, we should also:

1. **Reduce Timeout**: 5 minutes is too long. Should be configurable (vendor-specific: 30-120 seconds)
2. **Add Timeout Configuration**: Add `RequestTimeoutSeconds` to AIVendor and AIModelVendor entities
3. **Pass Timeout to SDK**: Configure timeout on provider SDK clients (AbortController with timeout signal)
4. **Research-Based Timeouts**: Use realistic timeout values based on vendor characteristics (see Phase 2)

---

## Solution Design

**Key Finding**: MemberJunction already has comprehensive retry and failover infrastructure. The issue is a bug preventing it from triggering, not missing functionality.

### 1. Fix Failover Bug (Phase 1 - COMPLETED)

**Problem**: Provider drivers catch errors internally and return `ChatResult{success: false}`, but `executeModelWithFailover()` only checks for thrown exceptions.

**Solution**:
- Check `result.success` after `executeModel()` call
- If `!result.success && result.errorInfo?.canFailover`, treat as retriable error
- Use shared `processFailoverError()` helper to avoid code duplication
- Continue to next model+vendor candidate in failover loop

**Benefits**:
- Network errors trigger instant failover to alternate models
- Rate limits trigger failover if retry logic is exhausted
- Service unavailable errors fail over immediately
- No 5-minute wait for timeout before trying alternate model

### 2. Add Configurable Timeouts (Phase 2 - Planned)

**Problem**: Provider SDKs default to ~5 minute timeouts, causing long waits before failover.

**Solution**:
- Add `RequestTimeoutSeconds INT NULL` to AIVendor (vendor-level defaults)
- Add `RequestTimeoutSeconds INT NULL` to AIModelVendor (model+vendor overrides)
- Hierarchy: System default (60s) → AIVendor → AIModelVendor
- Pass timeout to provider drivers via ChatParams
- Implement AbortController pattern in each provider driver

**Timeout Values** (research-based, conservative to avoid false timeouts):
- Fast inference (30s): Groq, Cerebras - specialized hardware
- Standard inference (60-90s): xAI, Mistral AI, OpenAI, Azure
- Slow inference (120s): Anthropic, Google, Vertex AI - large context can be slow
- Model-specific overrides (15-75s): Fast model+vendor combinations

**Benefits**:
- Network failures timeout in 30-120s instead of 300s (2.5-10x faster)
- Fast models get even shorter timeouts (15-75s) for rapid failover
- Conservative values prevent false timeouts on slow-but-successful requests

### 3. Enhanced Error Logging (Phase 3 - Planned)

**Current State**: Error messages are generic ("JSON parsing failed") and don't distinguish error types.

**Improvements**:
- Map `errorInfo.errorType` to user-friendly messages
- Include context in LogStatusEx: error type, canFailover, severity
- Log when failover is skipped (no more candidates)
- Ensure error messages propagate to agent run steps correctly

**User-Facing Error Messages**:
- Network failures: "Unable to connect to AI service. This may be a temporary network issue."
- Timeouts: "AI request exceeded timeout. Trying alternate provider..."
- Rate limits: "AI service is rate limiting requests. Switching to alternate provider..."
- Service unavailable: "AI service is temporarily unavailable. Trying alternate provider..."

**Benefits**:
- Users understand what went wrong and what's being done about it
- Production debugging is easier with detailed logs
- Agent run steps show meaningful error context

### 4. Design Decisions Summary

**What We're NOT Doing**:
- ❌ Adding retry logic (already exists at prompt level)
- ❌ Adding FallbackModelID to AIModel (metadata-driven approach is more flexible)
- ❌ Adding RetryMaxAttempts to vendor/model (prompt-level MaxRetries is sufficient)
- ❌ Creating custom retry library (existing infrastructure works)

**What We ARE Doing**:
- ✅ Fix existing failover logic to trigger on failed ChatResults
- ✅ Add configurable timeouts at vendor/model level
- ✅ Improve error messages and logging for production debugging

---


### TypeScript Style
- Use strict mode and explicit typing
- **NEVER** use `any` types (see CRITICAL RULES)
- Use PascalCase for public class members
- Use camelCase for private/protected members

---

## Dependencies & Package Updates

### Packages to Review
- [ ] `@memberjunction/ai-engine` - Core AI execution
- [ ] `@memberjunction/ai-core-plus` - AI configuration
- [ ] `@memberjunction/mjcore-entities` - Entity definitions
- [ ] `@skip-brain/shared` - Error utilities

### Potential New Dependencies
- [ ] `p-retry` - Robust retry library (evaluate vs. custom implementation)
- [ ] `abort-controller` polyfill (if targeting older Node.js)

### Build Commands After Changes
```bash
# Build AI packages
cd /Users/jordanfanapour/Documents/GitHub/MJ/packages/AI/AIEngine && npm run build
cd /Users/jordanfanapour/Documents/GitHub/MJ/packages/AI/Core-Plus && npm run build

# Build core entities (after schema changes)
cd /Users/jordanfanapour/Documents/GitHub/MJ/packages/MJCoreEntities && npm run build

# Test in Skip-Brain
cd /Users/jordanfanapour/Documents/GitHub/MJ/../Skip-Brain/apps/API && npm run build
```

---

## Risk Assessment

### High Risk Items
1. **Retry Logic Loops**: Infinite retry on miscategorized errors
   - Mitigation: Hard cap on retries, careful error categorization

2. **Increased Latency**: Multiple retries increase overall request time
   - Mitigation: Aggressive initial timeout (30-60s), fast backoff

3. **Cost Increase**: Retries may increase API costs
   - Mitigation: Only retry on network failures (no token cost), not model errors

4. **Breaking Changes**: Timeout changes may break existing integrations
   - Mitigation: Use conservative defaults, make configurable

### Medium Risk Items
1. **Migration Failures**: Schema changes may fail on production DB
   - Mitigation: Test migrations on staging first

2. **Fallback Model Compatibility**: Fallback model may not support same features
   - Mitigation: Validate capabilities before fallback, document requirements

3. **Error Message Changes**: Updated errors may break error parsing
   - Mitigation: Maintain backward compatibility in error format

---

## Success Criteria

### Must Have (Phase 1 & 2)
- ✅ Network failures are retried automatically (max 3 attempts)
- ✅ Error messages clearly indicate failure type (network, timeout, etc.)
- ✅ Users see meaningful error messages, not generic "JSON parsing failed"
- ✅ Retry attempts are logged for debugging

### Should Have (Phase 3)
- ✅ Timeout is configurable per model (default: 60s for Gemini)
- ✅ Timeout is enforced correctly (no 5-minute waits)
- ✅ Timeout configuration is documented

### Nice to Have (Phase 4 & 5)
- ✅ Automatic fallback to alternate model after 3 failures
- ✅ Health monitoring dashboard shows AI vendor reliability
- ✅ Alerts trigger when success rate drops below threshold

---

## Questions & Decisions

### Open Questions
1. **Q**: Should retry logic be synchronous (block) or asynchronous (queue)?
   - **A**: TBD - Likely synchronous for simplicity, but need to consider user experience

2. **Q**: What timeout value for Gemini? (Current: 300s, Proposed: 60s)
   - **A**: TBD - Need to test actual response times under load

3. **Q**: Should fallback be automatic or require user confirmation?
   - **A**: TBD - Likely automatic with logging, but may need user preference

4. **Q**: How to handle rate limiting? (Retry or fail fast?)
   - **A**: TBD - Retry with exponential backoff, but cap at X attempts

### Decisions Made
- **None yet** - Will document as we progress

---

## References

### MemberJunction Documentation
- [CLAUDE.md](CLAUDE.md) - Main development guide
- [migrations/CLAUDE.md](migrations/CLAUDE.md) - Migration guidelines
- [packages/Actions/CLAUDE.md](packages/Actions/CLAUDE.md) - Actions design philosophy
- [packages/Angular/CLAUDE.md](packages/Angular/CLAUDE.md) - Angular guidelines

### External Resources
- [Google AI API Error Codes](https://ai.google.dev/api/rest/v1/Status) - Gemini error handling
- [Exponential Backoff Best Practices](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) - AWS guide
- [Retry Pattern](https://docs.microsoft.com/en-us/azure/architecture/patterns/retry) - Azure architecture

---

## Progress Tracking

### Session Statistics
- **Tasks Defined**: 13 (Discovery + 3 implementation phases)
- **Tasks Completed**: 8 (Discovery: 6, Phase 1: 2)
- **Current Phase**: Phase 1 - Fix Failover Bug (67% complete)
- **Next Milestone**: Complete Phase 1 production testing, then begin Phase 2 timeout configuration

### Completion Status
- 🔄 Phase 1: Fix Failover Bug - 2/3 tasks (67% complete)
  - ✅ Task 1.1: Fix executeModelWithFailover() logic
  - ✅ Task 1.2: Add unit tests for failover bug fix
  - ⬜ Task 1.3: Test in production-like environment
- ⬜ Phase 2: Add Timeout Configuration - 0/7 tasks
- ⬜ Phase 3: Enhanced Error Logging - 0/3 tasks

---

## Notes & Learnings

### Key Insights
- Network failures are categorized as "JSON parsing failed" because the response is empty/malformed
- 5-minute timeout is far too long for user experience
- Current error handling doesn't distinguish between error types
- No retry logic exists in current implementation

### Gotchas & Pitfalls
- BaseEntity spread operator doesn't work - use `.GetAll()` instead
- Always pass `contextUser` on server-side entity operations
- Never use `any` types - see CRITICAL RULES
- Function decomposition is mandatory (max 30-40 lines)

---

**End of Session Document**

_This document will be updated as work progresses. Use it to resume work after memory compaction or hand off to another agent._
## Implementation Plan

### ✅ Discovery Phase (COMPLETED)
- [x] Analyzed production failures
- [x] Reviewed AIPromptRunner.ts (4700+ lines)
- [x] Reviewed GeminiLLM and VertexLLM implementations  
- [x] Reviewed ErrorAnalyzer error categorization
- [x] Identified exact bug in executeModelWithFailover() (line 2733)
- [x] Confirmed retry/failover infrastructure already exists

### Phase 1: Fix Failover Bug (CRITICAL - Solves Production Issue)
**Goal**: Network failures and retriable errors trigger failover to alternate models

- [x] **Task 1.1**: Fix executeModelWithFailover() logic ✅ COMPLETED
  - [x] File: `packages/AI/Prompts/src/AIPromptRunner.ts` (line ~2727-2820)
  - [x] After `const result = await this.executeModel(...)`, add success check
  - [x] If `!result.success && result.errorInfo?.canFailover`, treat as retriable error:
    - Create FailoverAttempt record
    - Handle vendor-level errors (filter candidates if Auth/VendorValidation)
    - Handle rate limits (retry same model if applicable)
    - Log failover attempt
    - Continue to next candidate
  - [x] Only return result if `result.success === true`
  - [x] Code compiles successfully with no TypeScript errors

  **Implementation Notes**:
  - Created `processFailoverError()` helper method (~90 lines) to avoid code duplication
  - Refactored both the failed result check (line ~2729) and catch block (line ~2769) to use helper
  - Helper handles all failover logic: vendor filtering, rate limits, fatal errors, errorScope
  - Follows DRY principle - single source of truth for failover error handling
  - Handles all retriable error types: NetworkError, RateLimit, ServiceUnavailable, etc.
  - Rate limit errors use existing `handleRateLimitRetry()` with retry-same-model logic
  - Vendor-level errors (Auth, VendorValidation) filter out all models from that vendor
  - Fatal errors stop immediately (defensive, shouldn't happen with canFailover=true)
  - ErrorScope filtering works correctly
  - Returns decision object: `{shouldRetry, shouldContinue, updatedCandidates}`
  - ~40 lines in each call site (success check + catch block) vs. ~180 lines duplicated

- [x] **Task 1.2**: Add unit tests for failover bug fix ✅ COMPLETED
  - [x] Test network error triggers failover
  - [x] Test rate limit error triggers failover
  - [x] Test successful result doesn't trigger failover
  - [x] Test all candidates exhausted returns last error
  - [x] Test service unavailable triggers failover
  - [x] Test vendor-level error filters all vendor candidates
  - [x] Test errorScope filtering works correctly

  **Implementation Details**:
  - Created comprehensive test suite: [packages/AI/Prompts/src/__tests__/AIPromptRunner.failover.test.ts](packages/AI/Prompts/src/__tests__/AIPromptRunner.failover.test.ts)
  - **Testing Framework**: Jest with TypeScript support (ts-jest)
  - 7 test cases covering all failover scenarios - **ALL PASSING** ✅
  - Tests simulate `executeModelWithFailover` with Phase 1 fix applied
  - Validates network errors, rate limits, service unavailable, and vendor-level errors trigger failover
  - Confirms successful results don't unnecessarily failover
  - Verifies all candidates exhausted returns appropriate error message
  - Tests vendor filtering for authentication/validation errors
  - Validates errorScope configuration filters correctly

  **Running Tests**:
  ```bash
  cd packages/AI/Prompts
  npm test                    # Run all tests
  npm run test:watch         # Watch mode for development
  npm run test:coverage      # With coverage report
  ```

  **Test Configuration**:
  - [jest.config.js](packages/AI/Prompts/jest.config.js) - Jest configuration matching other MJ packages
  - [package.json](packages/AI/Prompts/package.json) - Added Jest dependencies (@types/jest, jest, ts-jest)

- [ ] **Task 1.3**: Test in production-like environment
  - [ ] Simulate network failures (disconnect, slow response)
  - [ ] Verify failover to alternate model occurs
  - [ ] Verify no 5-minute wait times
  - [ ] Check AIPromptRun failover tracking fields populated correctly

### Phase 2: Add Timeout Configuration (Important - Prevents Long Waits)
**Goal**: Reduce timeout from 5 minutes to configurable vendor-specific values

**Design Decision**: Use AIVendor.RequestTimeoutSeconds (vendor-level) with AIModelVendor.RequestTimeoutSeconds (model+vendor override)
- **Rationale**: Timeout is primarily a network/infrastructure characteristic, not model characteristic
- **Hierarchy**: System default (60s) → AIVendor → AIModelVendor
- **Benefits**: Fewer configuration points, consistent within vendor, override for special cases

#### Timeout Research Findings

**Vendor Timeout Characteristics** (based on typical API response times):

| Vendor | Typical Response | Max Expected | Recommended Timeout | Rationale |
|--------|-----------------|--------------|---------------------|-----------|
| **Groq** | 0.5-3s | 10s | **30s** | Specialized fast inference hardware, very consistent |
| **OpenAI** | 2-15s | 30s | **90s** | GPT-4o/Turbo are fast, but GPT-4 can be slower |
| **Anthropic** | 3-30s | 60s | **120s** | Claude Opus can be slow, Haiku/Sonnet are fast |
| **Google AI** | 1-15s | 120s | **120s** | Gemini Flash is fast, but large context can be very slow |
| **Vertex AI** | 1-15s | 120s | **120s** | Same as Google AI, different infrastructure |
| **xAI** | 5-15s | 30s | **60s** | Newer provider, less historical data |
| **DeepSeek** | 10-30s | 120s | **120s** | Can be slow with large context windows |

**Model-Specific Overrides** (AIModelVendor for special cases):

| Model | Vendor | Override Timeout | Rationale |
|-------|--------|-----------------|-----------|
| Gemini Flash | Groq | 15s | Extremely fast combination |
| GPT-3.5 Turbo | OpenAI | 30s | Consistently fast model |
| Claude Haiku | Anthropic | 30s | Fastest Claude model |
| LLaMA 3.x | Groq | 20s | Groq's optimized models |

**Factors Affecting Timeout**:
1. **Context Size**: 100K+ token contexts can add 30-60s to response time
2. **Network Latency**: Add 5-10s buffer for network overhead
3. **Provider Load**: Peak times can increase latency 2-3x
4. **Streaming vs Non-Streaming**: Streaming starts faster but overall time similar
5. **Retry Buffer**: Timeout should be generous enough to avoid false positives

#### Implementation Tasks

- [ ] **Task 2.1**: Database Schema - Add RequestTimeoutSeconds
  - [ ] Create migration: `migrations/v2/V2026012801001__v3.3.x_Add_Timeout_To_Vendor.sql`
    - [ ] Add `ALTER TABLE` statements for both AIVendor and AIModelVendor tables
    - [ ] Add column: `RequestTimeoutSeconds INT NULL` to AIVendor table
    - [ ] Add column: `RequestTimeoutSeconds INT NULL` to AIModelVendor table
    - [ ] Add sp_addextendedproperty descriptions explaining timeout hierarchy and usage
    - [ ] Include UPDATE statements to set vendor-specific timeout defaults (see below)

  **Vendor Timeout Defaults to Set in Migration**:
  ```sql
  -- Fast inference providers (30s)
  UPDATE AIVendor SET RequestTimeoutSeconds = 30 WHERE Name IN ('Groq', 'Cerebras');

  -- Standard inference providers (60-90s)
  UPDATE AIVendor SET RequestTimeoutSeconds = 60 WHERE Name IN ('x.ai', 'Mistral AI', 'Black Forest Labs');
  UPDATE AIVendor SET RequestTimeoutSeconds = 90 WHERE Name IN ('OpenAI', 'Azure', 'OpenRouter', 'HeyGen');

  -- Slow inference providers (120s) - large context can be very slow
  UPDATE AIVendor SET RequestTimeoutSeconds = 120 WHERE Name IN (
    'Anthropic', 'Google', 'Vertex AI', 'Amazon Bedrock', 'Alibaba Cloud', 'Moonshot AI'
  );

  -- Specialized media providers
  UPDATE AIVendor SET RequestTimeoutSeconds = 60 WHERE Name = 'Eleven Labs';
  ```

  - [ ] Create metadata file: `metadata/ai-model-vendors/.ai-model-vendor-timeout-overrides.json`
    - [ ] Define model-specific overrides for fast model+vendor combinations
    - [ ] Use lookup syntax: `"ModelID": "@lookup:MJ: AI Models.Name=Model Name"`
    - [ ] Use lookup for VendorID and TypeID (Inference Provider)
    - [ ] Set `"RequestTimeoutSeconds"` in fields

  **Model-Specific Overrides to Include** (24 fast combinations):
  - Gemini 3 Flash + Google (60s vs 120s vendor default)
  - Gemini 3 Flash + Vertex AI (75s vs 120s vendor default)
  - Claude 3 Haiku + Anthropic (45s vs 120s default) - Fastest Claude model
  - Claude 3.5/3.7/4.5 Sonnet + Anthropic (60s vs 120s default)
  - GPT 3.5/4o/4o-mini + OpenAI (45-60s vs 90s default) - Fast OpenAI models
  - Llama 3/3.1/2 models + Groq (15-25s vs 30s default) - Groq specializes in Llama
  - Llama 3.1/3.3/4 models + Cerebras (20-25s vs 30s default)
  - Qwen 3 models + Cerebras (20-25s vs 30s default)
  - Mistral Small 3.2 + Mistral AI (45s vs 60s default)
  - Grok 4 Fast variants + x.ai (45s vs 60s default) - Speed-optimized

  - [ ] Apply migration to database (flyway migrate or manual SQL execution)
  - [ ] Run CodeGen to update AIVendorEntity and AIModelVendorEntity classes
  - [ ] Run mj-sync to push timeout overrides: `npx mj-sync push --dir=./metadata --filter="ai-model-vendors/.ai-model-vendor-timeout-overrides.json"`

- [ ] **Task 2.2**: Core Infrastructure - Update ChatParams
  - [ ] Add `timeout?: number` field to ChatParams class (`packages/AI/Core/src/generic/chatParams.ts`)
  - [ ] Add JSDoc: "Optional timeout in milliseconds for the chat request. If not specified, provider uses default."
  - [ ] Build @memberjunction/ai package
  - [ ] Verify no breaking changes to existing code

- [ ] **Task 2.3**: AIPromptRunner - Wire Timeout from Metadata
  - [ ] In `executeModelWithFailover()`: Read timeout from hierarchy
    ```typescript
    // Hierarchy: AIModelVendor → AIVendor → system default (60s)
    const timeoutSeconds = candidate.modelVendor?.RequestTimeoutSeconds
      ?? candidate.vendor?.RequestTimeoutSeconds
      ?? 60;
    ```
  - [ ] Pass `timeoutSeconds` parameter to `executeModel()` method
  - [ ] In `executeModel()`: Create ChatParams with timeout
    ```typescript
    const chatParams = new ChatParams();
    chatParams.timeout = (timeoutSeconds ?? 60) * 1000; // Convert to ms
    ```
  - [ ] Add logging: `LogStatusEx(\`Using timeout: \${timeoutSeconds}s for vendor: \${vendorName}\`)`
  - [ ] Build @memberjunction/ai-prompts package

- [ ] **Task 2.4**: Provider Drivers - Implement Timeout with AbortController

  **For each provider, implement timeout handling:**

  - [ ] **GeminiLLM** (`packages/AI/Providers/Gemini/src/index.ts`)
    - [ ] In `nonStreamingChatCompletion()`: Extract timeout from params
    - [ ] Create AbortController with timeout
    - [ ] Pass `signal` to SDK's `generateContent()` call
    - [ ] Handle AbortError and return ChatResult with NetworkError type
    - [ ] Test with actual API calls

  - [ ] **OpenAILLM** (`packages/AI/Providers/OpenAI/src/openai.ts`)
    - [ ] Check if OpenAI SDK supports timeout option (likely yes)
    - [ ] Pass timeout to SDK constructor or per-request
    - [ ] Handle timeout errors appropriately
    - [ ] Test with actual API calls

  - [ ] **AnthropicLLM** (`packages/AI/Providers/Anthropic/src/anthropic.ts`)
    - [ ] Check if Anthropic SDK supports timeout option
    - [ ] Implement AbortController pattern if needed
    - [ ] Handle timeout errors appropriately
    - [ ] Test with actual API calls

  - [ ] **GroqLLM** (if exists)
    - [ ] Follow similar pattern to OpenAI (Groq uses OpenAI-compatible API)
    - [ ] Test with actual API calls

  - [ ] **VertexLLM** (`packages/AI/Providers/Vertex/src/models/vertexLLM.ts`)
    - [ ] Verify it inherits timeout handling from GeminiLLM
    - [ ] Test that timeout works correctly with Vertex AI authentication

  - [ ] Build each provider package after changes

- [ ] **Task 2.5**: Database Configuration - Set Vendor Timeouts

  **SQL Script to update AIVendor records:**
  ```sql
  -- Set vendor-specific timeouts based on research
  UPDATE ${flyway:defaultSchema}.AIVendor SET RequestTimeoutSeconds = 30  WHERE Name = 'Groq';
  UPDATE ${flyway:defaultSchema}.AIVendor SET RequestTimeoutSeconds = 90  WHERE Name = 'OpenAI';
  UPDATE ${flyway:defaultSchema}.AIVendor SET RequestTimeoutSeconds = 120 WHERE Name = 'Anthropic';
  UPDATE ${flyway:defaultSchema}.AIVendor SET RequestTimeoutSeconds = 120 WHERE Name = 'Google AI';
  UPDATE ${flyway:defaultSchema}.AIVendor SET RequestTimeoutSeconds = 120 WHERE Name = 'Vertex AI';
  UPDATE ${flyway:defaultSchema}.AIVendor SET RequestTimeoutSeconds = 60  WHERE Name = 'xAI';
  UPDATE ${flyway:defaultSchema}.AIVendor SET RequestTimeoutSeconds = 120 WHERE Name = 'DeepSeek';
  ```

  **Optional: Set model-specific overrides (AIModelVendor):**
  - [ ] Identify fast model+vendor combinations
  - [ ] Set shorter timeouts for GPT-3.5 Turbo, Claude Haiku, Gemini Flash + Groq
  - [ ] Document override rationale in comments

- [ ] **Task 2.6**: Testing & Validation
  - [ ] Unit tests for timeout hierarchy (system → vendor → model+vendor)
  - [ ] Integration test: Simulate slow response, verify timeout triggers
  - [ ] Integration test: Verify failover occurs after timeout
  - [ ] Integration test: Verify successful response within timeout completes
  - [ ] Manual test: Check logs show correct timeout values
  - [ ] Performance test: Measure impact of AbortController overhead (should be negligible)

- [ ] **Task 2.7**: Documentation
  - [ ] Update AIVendor entity documentation to explain RequestTimeoutSeconds
  - [ ] Update AIModelVendor entity documentation
  - [ ] Add troubleshooting guide: "If requests timeout frequently, increase vendor timeout"
  - [ ] Document recommended timeout values by vendor type
  - [ ] Add example: How to override timeout for specific model+vendor combination

### Phase 3: Enhanced Error Logging (Nice-to-Have - Better Debugging)
**Goal**: Improve error messages and logging for production debugging

- [ ] **Task 3.1**: Enhance failover logging
  - [ ] Add more context to LogStatusEx messages
  - [ ] Include error type, canFailover, severity in logs
  - [ ] Log when failover is skipped (no more candidates)

- [ ] **Task 3.2**: Improve user-facing error messages
  - [ ] Map errorType to user-friendly messages
  - [ ] Include suggested actions (e.g., "This is a temporary network issue, please try again")
  - [ ] Ensure error messages propagate to agent run steps correctly

- [ ] **Task 3.3**: Add monitoring queries (Optional)
  - [ ] Query for failover frequency by model
  - [ ] Query for error types by model/vendor
  - [ ] Query for average latency by model
  - [ ] Add to AI health dashboard (if one exists)

---

## Key Design Decisions

### Decision 1: Timeout Configuration Location
**Decision**: Use AIVendor.RequestTimeoutSeconds with AIModelVendor.RequestTimeoutSeconds override (NOT AIModel)

**Rationale**:
- Timeout is primarily a network/infrastructure characteristic of the vendor, not the model
- Most models from the same vendor have similar timeout needs
- Reduces configuration complexity (fewer places to set timeouts)
- Still allows model-specific overrides when needed via AIModelVendor join table

**Hierarchy**: System default (60s) → AIVendor → AIModelVendor

### Decision 2: No RetryMaxAttempts Configuration
**Decision**: Do NOT add RetryMaxAttempts to AIModel or AIVendor entities

**Rationale**:
- AIPrompt entity already has `MaxRetries` property (prompt-level configuration)
- Existing retry logic works correctly for validation failures and rate limits
- With Phase 1 fix, network errors trigger failover (switching models), not retries (same model)
- Prompt-level retry configuration is more flexible and appropriate

### Decision 3: Research-Based Timeout Values
**Decision**: Use realistic timeout values based on vendor characteristics, not arbitrary defaults

**Approach**:
- Researched typical response times for each vendor
- Factored in context size impact, network latency, provider load
- Conservative values to avoid false timeouts on slow-but-successful requests
- Range: 30s (Groq - fast inference) to 120s (Anthropic/Google - can be slow)

**Values**:
- Groq: 30s (specialized fast hardware)
- OpenAI: 90s (GPT-4o is fast, GPT-4 slower)
- Anthropic: 120s (Claude Opus can be slow)
- Google AI/Vertex: 120s (large context can be slow)
- xAI: 60s (newer provider, less data)
- DeepSeek: 120s (can be slow with large context)

### Decision 4: No FallbackModelID on AIModel
**Decision**: Do NOT add FallbackModelID to AIModel entity

**Rationale**:
- AIPromptRunner already handles fallback logic through ModelVendorCandidates
- Fallback is determined by Priority, capabilities, and cost configurations
- Metadata-driven approach is more flexible than hardcoded fallback links
- Adding FallbackModelID would create rigid coupling between models

---
