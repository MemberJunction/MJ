# AI Configuration Inheritance Implementation Plan

## Overview

This document outlines the implementation plan for adding inheritance support to AI Configurations in MemberJunction. The goal is to allow child configurations to inherit prompt-model mappings and configuration parameters from parent configurations, enabling easy experimentation with configuration variations without duplicating all settings.

## Problem Statement

Currently, if you have a "Standard" configuration with 50 prompts configured with specific models, and you want to create "Standard-Experimental" that changes just 2 prompts to different models, you must:
- Create a new configuration
- Re-define all 50 prompt-model mappings
- Manually change just the 2 you want to experiment with

This is tedious, error-prone, and changes to the parent must be manually propagated to children.

## Solution: ParentID-Based Inheritance

Add a `ParentID` field to `AIConfiguration` that creates a self-referential hierarchy:

```
AIConfiguration
├── ID
├── ParentID (nullable FK to self)
├── Name
├── Description
├── ...other fields...
```

### Inheritance Resolution

When selecting models for a prompt with a given `configurationId`:

1. Build the configuration's inheritance chain: `[child, parent, grandparent, ..., root]`
2. For each prompt, walk the chain looking for an AIPromptModel match:
   - First check for `ConfigurationID = child.ID`
   - Then check for `ConfigurationID = parent.ID`
   - Continue up the chain...
   - Finally check for `ConfigurationID = NULL` (universal fallback)
3. First match wins (child overrides parent)

### Parameter Inheritance

AIConfigurationParams also inherit:
- Child parameters override parent parameters by name
- Unspecified parameters fall through to parent/grandparent
- Enables fine-grained parameter customization

---

## Implementation Tasks

### Phase 1: Database Schema

#### Task 1.1: Create Migration File

**File**: `migrations/v2/V20260103120000__v3.1_AIConfiguration_ParentID.sql`

**Changes**:
1. Add `ParentID` column to `__mj.AIConfiguration` table
2. Add foreign key constraint (self-referential)
3. Add extended property documentation
4. Add index for performance

```sql
-- Add ParentID column
ALTER TABLE __mj.AIConfiguration
ADD ParentID uniqueidentifier NULL;

-- Add foreign key constraint
ALTER TABLE __mj.AIConfiguration
ADD CONSTRAINT FK_AIConfiguration_ParentID
FOREIGN KEY (ParentID) REFERENCES __mj.AIConfiguration(ID);

-- Add index for parent lookups
CREATE NONCLUSTERED INDEX IX_AIConfiguration_ParentID
ON __mj.AIConfiguration(ParentID)
WHERE ParentID IS NOT NULL;

-- Document the field
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reference to a parent configuration. When set, this configuration inherits prompt-model mappings and parameters from its parent. Child configurations can override specific settings while inheriting defaults from the parent chain.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIConfiguration',
    @level2type = N'COLUMN', @level2name = N'ParentID';
```

**Note**: CodeGen will automatically:
- Update `vwAIConfigurations` view to include `ParentID` and `Parent` (name lookup)
- Update entity classes with getter/setter
- Update stored procedures
- Update Zod schemas

---

### Phase 2: BaseAIEngine Updates

#### Task 2.1: Add Configuration Chain Helper Method

**File**: `packages/AI/BaseAIEngine/src/BaseAIEngine.ts`

**Changes**:

1. Add private cache map for configuration chains:
```typescript
private _configurationChainCache: Map<string, AIConfigurationEntity[]> = new Map();
```

2. Add public method to get configuration chain:
```typescript
/**
 * Returns the inheritance chain for a configuration, starting with the specified
 * configuration and walking up through parent configurations to the root.
 *
 * The chain is ordered from most-specific (the requested configuration) to
 * least-specific (the root parent with no ParentID).
 *
 * Results are cached for performance. Cache is invalidated when configurations
 * are reloaded.
 *
 * @param configurationId - The ID of the configuration to get the chain for
 * @returns Array of AIConfigurationEntity objects representing the inheritance chain,
 *          or empty array if the configuration is not found
 * @throws Error if a circular reference is detected in the configuration hierarchy
 *
 * @example
 * // Single configuration with no parent
 * const chain = AIEngine.Instance.GetConfigurationChain('config-a');
 * // Returns: [ConfigA]
 *
 * @example
 * // Child -> Parent -> Grandparent chain
 * const chain = AIEngine.Instance.GetConfigurationChain('child-config');
 * // Returns: [ChildConfig, ParentConfig, GrandparentConfig]
 *
 * @example
 * // Usage in model selection - first config in chain with a match wins
 * const chain = AIEngine.Instance.GetConfigurationChain(configId);
 * for (const config of chain) {
 *   const models = promptModels.filter(pm => pm.ConfigurationID === config.ID);
 *   if (models.length > 0) return models;
 * }
 * // Fall back to null-config models if no match in chain
 */
public GetConfigurationChain(configurationId: string): AIConfigurationEntity[] {
    // Implementation details in Task 2.1
}
```

3. Add helper method for parameter resolution:
```typescript
/**
 * Returns all configuration parameters for a configuration, including inherited
 * parameters from parent configurations. Child parameters override parent parameters
 * with the same name.
 *
 * @param configurationId - The ID of the configuration to get parameters for
 * @returns Array of AIConfigurationParamEntity objects, with child overrides applied
 *
 * @example
 * // Parent has: temperature=0.7, maxTokens=4000
 * // Child has: temperature=0.9
 * // Result: temperature=0.9 (child), maxTokens=4000 (inherited from parent)
 */
public GetConfigurationParamsWithInheritance(configurationId: string): AIConfigurationParamEntity[] {
    // Implementation details in Task 2.2
}
```

4. Clear cache when configurations are reloaded (in the refresh/load methods)

#### Task 2.2: Implement Chain Resolution Logic

**Algorithm**:
```typescript
public GetConfigurationChain(configurationId: string): AIConfigurationEntity[] {
    // Check cache first
    if (this._configurationChainCache.has(configurationId)) {
        return this._configurationChainCache.get(configurationId)!;
    }

    const chain: AIConfigurationEntity[] = [];
    const visitedIds = new Set<string>();
    let currentId: string | null = configurationId;

    while (currentId) {
        // Cycle detection
        if (visitedIds.has(currentId)) {
            throw new Error(
                `Circular reference detected in AI Configuration hierarchy. ` +
                `Configuration ID "${currentId}" appears multiple times in the chain: ` +
                `${chain.map(c => c.Name).join(' -> ')} -> [CYCLE]`
            );
        }

        const config = this._configurations.find(c => c.ID === currentId);
        if (!config) break;

        visitedIds.add(currentId);
        chain.push(config);
        currentId = config.ParentID; // Will be null for root configs
    }

    // Cache the result
    this._configurationChainCache.set(configurationId, chain);

    return chain;
}
```

#### Task 2.3: Implement Parameter Inheritance

**Algorithm**:
```typescript
public GetConfigurationParamsWithInheritance(configurationId: string): AIConfigurationParamEntity[] {
    const chain = this.GetConfigurationChain(configurationId);
    const paramMap = new Map<string, AIConfigurationParamEntity>();

    // Walk chain in reverse (root first, child last) so child overrides parent
    for (let i = chain.length - 1; i >= 0; i--) {
        const configParams = this._configurationParams.filter(
            p => p.ConfigurationID === chain[i].ID
        );
        for (const param of configParams) {
            paramMap.set(param.Name.toLowerCase(), param); // Child overwrites parent
        }
    }

    return Array.from(paramMap.values());
}
```

---

### Phase 3: AIPromptRunner Updates

#### Task 3.1: Update Model Selection Methods

**File**: `packages/AI/Prompts/src/AIPromptRunner.ts`

**Methods to Update**:

1. `getPromptModelsForConfiguration` - Update to walk inheritance chain:
```typescript
private getPromptModelsForConfiguration(
    prompt: AIPromptEntityExtended,
    configurationId?: string
): AIPromptModelEntity[] {
    if (configurationId) {
        // Get the configuration chain (child -> parent -> grandparent -> ...)
        const chain = AIEngine.Instance.GetConfigurationChain(configurationId);

        // Walk the chain looking for prompt models
        for (const config of chain) {
            const promptModels = AIEngine.Instance.PromptModels.filter(
                pm => pm.PromptID === prompt.ID &&
                      (pm.Status === 'Active' || pm.Status === 'Preview') &&
                      pm.ConfigurationID === config.ID
            );

            if (promptModels.length > 0) {
                return promptModels;
            }
        }

        // No match in chain, fall back to NULL config models
        LogStatus(`No models found in configuration chain for "${configurationId}", falling back to default models`);
    }

    // Return null-config (universal) models
    return AIEngine.Instance.PromptModels.filter(
        pm => pm.PromptID === prompt.ID &&
              (pm.Status === 'Active' || pm.Status === 'Preview') &&
              !pm.ConfigurationID
    );
}
```

2. `filterPromptModelsByConfiguration` - Update for chain-aware filtering:
```typescript
private filterPromptModelsByConfiguration(
    allPromptModels: AIPromptModelEntity[],
    configurationId?: string
): AIPromptModelEntity[] {
    if (configurationId) {
        const chain = AIEngine.Instance.GetConfigurationChain(configurationId);
        const chainIds = new Set(chain.map(c => c.ID));

        // Include models matching any config in the chain, plus null-config (universal)
        return allPromptModels.filter(
            pm => (pm.ConfigurationID && chainIds.has(pm.ConfigurationID)) ||
                  pm.ConfigurationID === null
        );
    } else {
        return allPromptModels.filter(pm => pm.ConfigurationID === null);
    }
}
```

3. `sortPromptModelsForSpecificStrategy` - Update to respect chain order:
```typescript
private sortPromptModelsForSpecificStrategy(
    promptModels: AIPromptModelEntity[],
    configurationId?: string
): AIPromptModelEntity[] {
    if (!configurationId) {
        // No config specified - just sort by priority
        return promptModels.sort((a, b) => (b.Priority || 0) - (a.Priority || 0));
    }

    const chain = AIEngine.Instance.GetConfigurationChain(configurationId);
    const chainOrder = new Map(chain.map((c, index) => [c.ID, index]));

    return promptModels.sort((a, b) => {
        // Primary: Chain position (lower index = higher priority, null config = last)
        const aChainPos = a.ConfigurationID ? (chainOrder.get(a.ConfigurationID) ?? 999) : 1000;
        const bChainPos = b.ConfigurationID ? (chainOrder.get(b.ConfigurationID) ?? 999) : 1000;

        if (aChainPos !== bChainPos) {
            return aChainPos - bChainPos; // Lower chain position first
        }

        // Secondary: Higher priority first within same config level
        return (b.Priority || 0) - (a.Priority || 0);
    });
}
```

4. `addConfigurationFallbackCandidates` - Update to add chain fallbacks:
```typescript
private addConfigurationFallbackCandidates(
    candidates: ModelVendorCandidate[],
    prompt: AIPromptEntityExtended,
    configurationId: string,
    preferredVendorId?: string,
    verbose?: boolean
): void {
    const chain = AIEngine.Instance.GetConfigurationChain(configurationId);
    const directConfigId = chain[0]?.ID; // The originally requested config

    // Add models from parent configs (not the direct config, already handled)
    for (let i = 1; i < chain.length; i++) {
        const parentConfig = chain[i];
        const parentModels = AIEngine.Instance.PromptModels.filter(
            pm => pm.PromptID === prompt.ID &&
                  (pm.Status === 'Active' || pm.Status === 'Preview') &&
                  pm.ConfigurationID === parentConfig.ID
        );

        if (parentModels.length > 0 && verbose) {
            LogStatus(`Adding ${parentModels.length} models from parent config "${parentConfig.Name}" as fallback`);
        }

        for (const pm of parentModels) {
            const model = AIEngine.Instance.Models.find(m => m.ID === pm.ModelID);
            if (model && model.IsActive) {
                // Decrease base priority for each level up the chain
                const basePriority = 3000 - (i * 500);
                const modelCandidates = this.createCandidatesForModel(
                    model,
                    basePriority,
                    'prompt-model',
                    preferredVendorId,
                    pm.Priority
                );
                candidates.push(...modelCandidates);
            }
        }
    }

    // Finally add NULL config models (universal fallback) with lowest priority
    const nullConfigModels = AIEngine.Instance.PromptModels.filter(
        pm => pm.PromptID === prompt.ID &&
              (pm.Status === 'Active' || pm.Status === 'Preview') &&
              !pm.ConfigurationID
    );

    if (nullConfigModels.length > 0 && verbose) {
        LogStatus(`Adding ${nullConfigModels.length} NULL configuration models as universal fallback`);
    }

    for (const pm of nullConfigModels) {
        const model = AIEngine.Instance.Models.find(m => m.ID === pm.ModelID);
        if (model && model.IsActive) {
            const modelCandidates = this.createCandidatesForModel(
                model,
                1000, // Lowest priority tier
                'prompt-model',
                preferredVendorId,
                pm.Priority
            );
            candidates.push(...modelCandidates);
        }
    }
}
```

---

### Phase 4: Metadata Updates

#### Task 4.1: Update AI Configurations Metadata (if needed)

After running CodeGen, the metadata files will be automatically updated. However, we may want to create example child configurations in the metadata to demonstrate the feature.

**Optional**: Create example child configuration in `/metadata/ai-configurations/.ai-configurations.json`:
```json
{
    "fields": {
        "Name": "Standard-Experimental",
        "Description": "Experimental variant of Standard configuration for testing new models",
        "ParentID": "@lookup:MJ: AI Configurations.Name=Standard",
        "IsDefault": false,
        "Status": "Active"
    }
}
```

---

### Phase 5: Documentation Updates

#### Task 5.1: Update BaseAIEngine README

**File**: `packages/AI/BaseAIEngine/README.md`

Add section documenting:
- Configuration inheritance concept
- `GetConfigurationChain()` method usage
- `GetConfigurationParamsWithInheritance()` method usage
- Examples of inheritance resolution

#### Task 5.2: Update AI Prompts README

**File**: `packages/AI/Prompts/README.md`

Add/update section documenting:
- How configuration inheritance affects model selection
- Priority order: child config > parent config > ... > root config > null config
- Examples of creating child configurations for experimentation

#### Task 5.3: Update Core AI Package README (if exists)

Add high-level documentation about the configuration inheritance feature.

---

## Implementation Order

1. ✅ **Phase 1**: Database migration (creates schema foundation)
2. ✅ **Run CodeGen**: Regenerate entity classes, views, stored procedures
3. ✅ **Phase 2**: BaseAIEngine changes (chain resolution and caching)
4. ✅ **Phase 3**: AIPromptRunner changes (use chain in model selection)
5. **Phase 4**: Metadata updates (optional example configurations) - Skipped (no examples needed)
6. ✅ **Phase 5**: Documentation updates
7. **Testing**: Verify inheritance works correctly with various scenarios

---

## Testing Scenarios

### Scenario 1: Simple Parent-Child
- Parent config "A" has Model X for Prompt 1
- Child config "B" (ParentID = A) has no entry for Prompt 1
- Expected: When using config B, Prompt 1 uses Model X (inherited from A)

### Scenario 2: Child Override
- Parent config "A" has Model X for Prompt 1
- Child config "B" (ParentID = A) has Model Y for Prompt 1
- Expected: When using config B, Prompt 1 uses Model Y (child override)

### Scenario 3: Three-Level Chain
- Root config "A" has Model X for Prompt 1
- Middle config "B" (ParentID = A) has no override
- Child config "C" (ParentID = B) has no override
- Expected: When using config C, Prompt 1 uses Model X (inherited from A through B)

### Scenario 4: Partial Override in Chain
- Root config "A" has Model X for Prompt 1, Model Y for Prompt 2
- Child config "B" (ParentID = A) has Model Z for Prompt 1 only
- Expected: When using config B:
  - Prompt 1 uses Model Z (child override)
  - Prompt 2 uses Model Y (inherited from A)

### Scenario 5: Parameter Inheritance
- Parent config "A" has params: temperature=0.7, maxTokens=4000
- Child config "B" (ParentID = A) has params: temperature=0.9
- Expected: GetConfigurationParamsWithInheritance(B) returns:
  - temperature=0.9 (child override)
  - maxTokens=4000 (inherited from parent)

### Scenario 6: Cycle Detection
- Config "A" has ParentID = B
- Config "B" has ParentID = A
- Expected: GetConfigurationChain() throws Error with descriptive message

### Scenario 7: Null Config Fallback
- Parent config "A" has no entry for Prompt 1
- Child config "B" (ParentID = A) has no entry for Prompt 1
- Null-config (universal) has Model X for Prompt 1
- Expected: When using config B, Prompt 1 uses Model X (universal fallback)

---

## Files to Modify

| File | Changes |
|------|---------|
| `migrations/v2/V20260103XXXXXX__v3.1_AIConfiguration_ParentID.sql` | New migration file |
| `packages/AI/BaseAIEngine/src/BaseAIEngine.ts` | Add chain methods and caching |
| `packages/AI/Prompts/src/AIPromptRunner.ts` | Update model selection for inheritance |
| `packages/AI/BaseAIEngine/README.md` | Document new methods |
| `packages/AI/Prompts/README.md` | Document inheritance behavior |

---

## Rollback Plan

If issues are discovered:
1. The migration adds a nullable column, so no data loss
2. Existing configurations continue to work (ParentID = NULL means no inheritance)
3. Can deploy code changes independently of data changes
4. Remove ParentID values from any configurations to disable inheritance

---

## Future Considerations

1. **UI Support**: Angular admin UI to visualize and manage configuration hierarchy
2. **Validation**: Prevent creating deep chains (optional max depth limit)
3. **Reporting**: Show effective configuration (merged view of inherited settings)
4. **Configuration Field Inheritance**: Extend to inherit config-level fields like `DefaultPromptForContextCompressionID` (not in initial scope)
