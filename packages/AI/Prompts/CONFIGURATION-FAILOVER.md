# Configuration-Aware Failover Implementation

## Overview

Enhanced the AIPromptRunner failover system to respect AIConfiguration boundaries and implement a hierarchical fallback strategy from configuration-specific models to NULL configuration models.

## Problem Solved

### Before Enhancement
**Issue:** Failover candidates were rebuilt from scratch during failures, **ignoring the ConfigurationID constraint** set during initial model selection.

**Example Scenario:**
```sql
-- Production config: Only Claude 3.5 Sonnet
INSERT INTO AIPromptModel (PromptID, ModelID, ConfigurationID, Priority)
VALUES (@PromptID, @Claude35SonnetID, @ProductionConfigID, 100);

-- Development config: GPT-4
INSERT INTO AIPromptModel (PromptID, ModelID, ConfigurationID, Priority)
VALUES (@PromptID, @GPT4ID, @DevelopmentConfigID, 100);
```

**Problem Flow:**
1. User executes with `ConfigurationID = @ProductionConfigID`
2. System selects Claude 3.5 Sonnet (only Production model)
3. Claude gets "No Credits" error (403)
4. Failover **rebuilds** candidate list from **ALL models** (ignoring configuration!)
5. ❌ Could failover to GPT-4 from Development config (boundary violation)

### After Enhancement
**Solution:** Candidate list is built ONCE during initial selection and **reused** during failover, respecting configuration boundaries with a controlled fallback hierarchy.

**Flow:**
1. User executes with `ConfigurationID = @ProductionConfigID`
2. System builds candidates:
   - Phase 1: All models with `ConfigurationID = @ProductionConfigID` (priority 5000+)
   - Phase 2: All models with `ConfigurationID = NULL` (priority 2000+) **as fallback**
3. System selects first available candidate (Claude 3.5 Sonnet)
4. Claude gets "No Credits" error (403)
5. Failover uses **cached candidate list** from step 2
6. ✅ Tries next Production config model (if any)
7. ✅ Then falls back to NULL config models (universal fallbacks)
8. ✅ Never crosses to Development config

## Implementation

### 1. Configuration-Aware Candidate Building

**File:** `AIPromptRunner.ts` lines [1519-1540](AIPromptRunner.ts:1519-1540)

```typescript
// Phase 3: Build candidates with configuration-aware fallback hierarchy
if (promptModels.length > 0 && prompt.SelectionStrategy !== 'Specific') {
  // Use prompt-specific models with blended priorities
  for (const pm of promptModels) {
    const model = AIEngine.Instance.Models.find(m => m.ID === pm.ModelID);
    if (model && model.IsActive) {
      const modelCandidates = createCandidatesForModel(
        model,
        5000,  // High priority for config-specific models
        'prompt-model',
        pm.Priority
      );
      candidates.push(...modelCandidates);
    }
  }

  // CONFIGURATION FALLBACK: Add NULL config models with lower priority
  if (configurationId) {
    const nullConfigModels = AIEngine.Instance.PromptModels.filter(
      pm => pm.PromptID === prompt.ID &&
            (pm.Status === 'Active' || pm.Status === 'Preview') &&
            !pm.ConfigurationID
    );

    for (const pm of nullConfigModels) {
      const model = AIEngine.Instance.Models.find(m => m.ID === pm.ModelID);
      if (model && model.IsActive) {
        const modelCandidates = createCandidatesForModel(
          model,
          2000,  // Lower priority for NULL config fallback
          'prompt-model',
          pm.Priority
        );
        candidates.push(...modelCandidates);
      }
    }
  }
}
```

### 2. Candidate List Caching

**File:** `AIPromptRunner.ts` lines [1097-1111](AIPromptRunner.ts:1097-1111), [1242](AIPromptRunner.ts:1242)

**Enhanced `selectModel()` return type:**
```typescript
Promise<{
  model: AIModelEntityExtended | null;
  vendorDriverClass?: string;
  vendorApiName?: string;
  vendorSupportsEffortLevel?: boolean;
  selectionInfo?: AIModelSelectionInfo;
  allCandidates?: ModelVendorCandidate[];  // ✅ NEW: Cached candidates
}>
```

**Candidates are passed through execution chain:**
1. `selectModel()` returns `allCandidates`
2. `executeSinglePrompt()` stores candidates
3. `executeWithValidationRetries()` receives candidates
4. `executeModelWithFailover()` reuses candidates (no rebuild!)

### 3. Failover with Cached Candidates

**File:** `AIPromptRunner.ts` lines [2039-2045](AIPromptRunner.ts:2039-2045)

```typescript
// Get all model candidates if not provided
if (!allCandidates || allCandidates.length === 0) {
  // Fallback to old behavior (backward compatibility)
  allCandidates = await this.buildFailoverCandidates(prompt);
  LogStatus('⚠️ Warning: Failover candidates not provided from initial selection');
}

// Use cached candidates for failover selection
const nextCandidates = this.selectFailoverCandidates(
  currentModel,
  currentVendorId,
  failoverConfig.strategy,
  failoverConfig.modelStrategy,
  allCandidates,  // ✅ Uses cached list from initial selection
  failoverAttempts
);
```

## Failover Priority Hierarchy

### Scenario: ConfigurationID Provided

```
Priority 5000+: Configuration-Specific Models
├── Model A (Config-Specific, Priority 100) → 5100
├── Model B (Config-Specific, Priority 90)  → 5090
└── Model C (Config-Specific, Priority 80)  → 5080

Priority 2000+: NULL Configuration Models (Fallback)
├── Model D (NULL Config, Priority 100) → 2100
├── Model E (NULL Config, Priority 90)  → 2090
└── Model F (NULL Config, Priority 80)  → 2080
```

**Failover Order:**
1. Try all config-specific models first (5000+ priority)
2. Only after exhausting config models, try NULL config models (2000+ priority)
3. Never cross into other configurations

### Scenario: No ConfigurationID

```
Priority 5000+: NULL Configuration Models Only
├── Model A (NULL Config, Priority 100) → 5100
├── Model B (NULL Config, Priority 90)  → 5090
└── Model C (NULL Config, Priority 80)  → 5080
```

**Failover Order:**
1. Only considers NULL configuration models
2. Respects priority order within NULL config models

## Example: xAI "No Credits" with Configuration

### Database Setup
```sql
-- Production Configuration
DECLARE @ProductionConfigID UNIQUEIDENTIFIER = NEWID();
INSERT INTO [__mj].[AIConfiguration] (ID, Name, Description)
VALUES (@ProductionConfigID, 'Production', 'Production environment config');

-- Production Models (Only Anthropic providers)
INSERT INTO [__mj].[AIPromptModel]
  (PromptID, ModelID, ConfigurationID, Priority, Status)
VALUES
  (@PromptID, @Claude35SonnetID, @ProductionConfigID, 100, 'Active'),
  (@PromptID, @Claude3OpusID, @ProductionConfigID, 90, 'Active');

-- Fallback Models (NULL config - any provider)
INSERT INTO [__mj].[AIPromptModel]
  (PromptID, ModelID, ConfigurationID, Priority, Status)
VALUES
  (@PromptID, @GPT4ID, NULL, 100, 'Active'),
  (@PromptID, @GeminiProID, NULL, 90, 'Active');
```

### Execution Flow

**Code:**
```typescript
const result = await runner.ExecutePrompt({
  prompt: 'Analyze data',
  configurationId: productionConfigID  // Specify production
});
```

**Step-by-Step:**

1. **Initial Selection**
   - Builds candidates with Production models (priority 5100, 5090)
   - Adds NULL config fallbacks (priority 2100, 2090)
   - Selects Claude 3.5 Sonnet (highest: 5100)
   - **Caches candidate list**

2. **First Execution - NoCredit Error**
   ```
   Error: "Your newly created teams doesn't have any credits yet"
   Status: 403
   Classification: NoCredit (canFailover = true)
   ```

3. **Failover Attempt 1**
   - Uses **cached candidate list**
   - Filters out failed: Claude 3.5 Sonnet
   - Selects next: Claude 3 Opus (priority 5090 - still Production config)
   - Retries with Claude 3 Opus

4. **If Claude 3 Opus Also Fails**
   - Filters out both Anthropic models
   - Selects: GPT-4 (priority 2100 - NULL config fallback)
   - ✅ Controlled fallback to universal model

5. **Never Crosses to Development Config**
   - Development config models are **never in candidate list**
   - Configuration boundaries are **respected**

## Benefits

### 1. Configuration Isolation ✅
- Production models stay in production
- Development models stay in development
- No accidental cross-configuration failover

### 2. Controlled Fallback ✅
- Explicit fallback hierarchy: Config → NULL config
- NULL config models serve as universal safety net
- Predictable behavior

### 3. Performance ✅
- Candidate list built **once** (not per failover)
- Reduced database queries
- Faster failover response

### 4. Consistency ✅
- Same candidate list for initial selection and failover
- Configuration logic centralized in `buildModelVendorCandidates()`
- No duplicate or conflicting logic

## Configuration Best Practices

### 1. Use Configuration-Specific Models for Environment Control
```sql
-- Production: Only trusted, high-quality models
INSERT INTO AIPromptModel (PromptID, ModelID, ConfigurationID, Priority)
VALUES
  (@PromptID, @Claude35SonnetID, @ProductionConfigID, 100),
  (@PromptID, @GPT4ID, @ProductionConfigID, 90);

-- Development: Include experimental/cheaper models
INSERT INTO AIPromptModel (PromptID, ModelID, ConfigurationID, Priority)
VALUES
  (@PromptID, @LlamaExperimentalID, @DevelopmentConfigID, 100),
  (@PromptID, @GPT35TurboID, @DevelopmentConfigID, 90);
```

### 2. Set Universal Fallbacks with NULL Configuration
```sql
-- NULL config: Available to all configurations as last resort
INSERT INTO AIPromptModel (PromptID, ModelID, ConfigurationID, Priority)
VALUES
  (@PromptID, @GPT4ID, NULL, 100),
  (@PromptID, @Claude3HaikuID, NULL, 90);
```

### 3. Configure Failover Strategy per Prompt
```sql
UPDATE AIPrompt
SET
  FailoverStrategy = 'SameModelDifferentVendor',  -- Try same model, different vendor first
  FailoverMaxAttempts = 3,
  FailoverErrorScope = 'All'  -- Failover on all eligible errors (including NoCredit)
WHERE ID = @PromptID;
```

## Testing Scenarios

### Test 1: Configuration Boundary Respect
```typescript
// Setup: Production has Claude, Dev has GPT-4
const result = await runner.ExecutePrompt({
  prompt: 'test',
  configurationId: productionConfigID
});

// Verify:
// 1. Initial selection: Claude (Production)
// 2. On NoCredit error: Does NOT switch to GPT-4 (Dev config)
// 3. Only uses Production models or NULL config fallbacks
```

### Test 2: NULL Config Fallback
```typescript
// Setup: Production config has 1 model, NULL config has fallbacks
const result = await runner.ExecutePrompt({
  prompt: 'test',
  configurationId: productionConfigID
});

// Verify:
// 1. Tries Production model first
// 2. On failure, falls back to NULL config models
// 3. Priority order: Production (5000+) then NULL (2000+)
```

### Test 3: No Configuration (NULL Only)
```typescript
// Setup: No configurationId provided
const result = await runner.ExecutePrompt({
  prompt: 'test'
  // No configurationId
});

// Verify:
// 1. Only considers NULL config models
// 2. Never uses config-specific models
// 3. Respects priority within NULL config
```

## Backward Compatibility

### Fallback Mechanism
If `allCandidates` is not provided (e.g., from legacy code paths), the system falls back to `buildFailoverCandidates()` with a warning:

```typescript
if (!allCandidates || allCandidates.length === 0) {
  allCandidates = await this.buildFailoverCandidates(prompt);
  LogStatus('⚠️ Warning: Failover candidates not provided from initial selection');
}
```

This ensures existing code continues to work but logs a warning about potentially incorrect behavior.

## Related Enhancements

- **NoCredit Error Type**: New error classification for billing/quota failures
- **Message-First Error Detection**: Prioritizes error messages over HTTP status codes
- **Permissive Failover**: Defaults to allowing failover for uncertain errors

## See Also
- [FAILOVER_IMPROVEMENTS.md](../Core/FAILOVER_IMPROVEMENTS.md) - Error classification enhancements
- [NoCredit-Error-Type.md](../Core/NoCredit-Error-Type.md) - NoCredit error documentation
