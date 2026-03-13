/**
 * Unit tests for AI Prompt Model Selection with Configuration Inheritance
 * Tests the inheritance-aware model selection functions in AIPromptRunner
 *
 * Converted from custom TestRunner to Vitest format
 */

import { describe, it, expect } from 'vitest';

/**
 * Mock AIEngine for testing prompt model selection logic
 * Simulates the AIEngine.Instance methods used by AIPromptRunner
 */
class MockAIEngine {
    constructor() {
        this._configurations = [];
        this._promptModels = [];
        this._models = [];
        this._configurationChainCache = new Map();
    }

    // Setup methods
    setConfigurations(configs) {
        this._configurations = configs;
        this._configurationChainCache.clear();
    }

    setPromptModels(promptModels) {
        this._promptModels = promptModels;
    }

    setModels(models) {
        this._models = models;
    }

    // Simulates AIEngine.Instance properties
    get PromptModels() {
        return this._promptModels;
    }

    get Models() {
        return this._models;
    }

    // Copy of GetConfigurationChain implementation
    GetConfigurationChain(configurationId) {
        if (this._configurationChainCache.has(configurationId)) {
            return this._configurationChainCache.get(configurationId);
        }

        const chain = [];
        const visitedIds = new Set();
        let currentId = configurationId;

        while (currentId) {
            if (visitedIds.has(currentId)) {
                throw new Error(`Circular reference detected in AI Configuration hierarchy.`);
            }

            const config = this._configurations.find(c => c.ID === currentId);
            if (!config) break;

            visitedIds.add(currentId);
            chain.push(config);
            currentId = config.ParentID;
        }

        this._configurationChainCache.set(configurationId, chain);
        return chain;
    }
}

/**
 * Standalone implementations of the methods we're testing
 * (extracted from AIPromptRunner for isolated unit testing)
 */

/**
 * Filter prompt models by configuration with inheritance support
 */
function filterPromptModelsByConfiguration(engine, allPromptModels, configurationId) {
    if (configurationId) {
        const chain = engine.GetConfigurationChain(configurationId);
        const chainIds = new Set(chain.map(c => c.ID));

        return allPromptModels.filter(
            pm => (pm.ConfigurationID && chainIds.has(pm.ConfigurationID)) ||
                  pm.ConfigurationID === null
        );
    } else {
        return allPromptModels.filter(pm => pm.ConfigurationID === null);
    }
}

/**
 * Sort prompt models for Specific strategy with inheritance
 */
function sortPromptModelsForSpecificStrategy(engine, promptModels, configurationId) {
    if (!configurationId) {
        return [...promptModels].sort((a, b) => (b.Priority || 0) - (a.Priority || 0));
    }

    const chain = engine.GetConfigurationChain(configurationId);
    const chainOrder = new Map(chain.map((c, index) => [c.ID, index]));

    return [...promptModels].sort((a, b) => {
        const aChainPos = a.ConfigurationID ? (chainOrder.get(a.ConfigurationID) ?? 999) : 1000;
        const bChainPos = b.ConfigurationID ? (chainOrder.get(b.ConfigurationID) ?? 999) : 1000;

        if (aChainPos !== bChainPos) {
            return aChainPos - bChainPos;
        }

        return (b.Priority || 0) - (a.Priority || 0);
    });
}

/**
 * Get prompt models for configuration with inheritance chain fallback
 */
function getPromptModelsForConfiguration(engine, promptId, configurationId) {
    if (configurationId) {
        const chain = engine.GetConfigurationChain(configurationId);

        for (const config of chain) {
            const promptModels = engine.PromptModels.filter(
                pm => pm.PromptID === promptId &&
                      (pm.Status === 'Active' || pm.Status === 'Preview') &&
                      pm.ConfigurationID === config.ID
            );

            if (promptModels.length > 0) {
                return promptModels;
            }
        }
    }

    // Fall back to null-config models
    return engine.PromptModels.filter(
        pm => pm.PromptID === promptId &&
              (pm.Status === 'Active' || pm.Status === 'Preview') &&
              !pm.ConfigurationID
    );
}

/**
 * Simulate the fallback priority calculation for parent configs
 */
function calculateFallbackPriorities(engine, promptId, configurationId) {
    const chain = engine.GetConfigurationChain(configurationId);
    const results = [];

    // Add models from parent configs (skip index 0 which is direct config)
    for (let i = 1; i < chain.length; i++) {
        const parentConfig = chain[i];
        const parentModels = engine.PromptModels.filter(
            pm => pm.PromptID === promptId &&
                  (pm.Status === 'Active' || pm.Status === 'Preview') &&
                  pm.ConfigurationID === parentConfig.ID
        );

        for (const pm of parentModels) {
            const basePriority = 3000 - (i * 500);
            results.push({
                modelId: pm.ModelID,
                configId: parentConfig.ID,
                configName: parentConfig.Name,
                chainLevel: i,
                basePriority: basePriority,
                modelPriority: pm.Priority,
                effectivePriority: basePriority + (pm.Priority || 0)
            });
        }
    }

    // Add null config models
    const nullConfigModels = engine.PromptModels.filter(
        pm => pm.PromptID === promptId &&
              (pm.Status === 'Active' || pm.Status === 'Preview') &&
              !pm.ConfigurationID
    );

    for (const pm of nullConfigModels) {
        results.push({
            modelId: pm.ModelID,
            configId: null,
            configName: 'NULL (universal)',
            chainLevel: 999,
            basePriority: 1000,
            modelPriority: pm.Priority,
            effectivePriority: 1000 + (pm.Priority || 0)
        });
    }

    return results;
}

// Create mock engine for tests
const engine = new MockAIEngine();

// ============================================================================
// Test Suite: filterPromptModelsByConfiguration
// ============================================================================

describe('filterPromptModelsByConfiguration', () => {
    it('No config - returns only null-config models', () => {
        engine.setConfigurations([
            { ID: 'config-a', Name: 'Config A', ParentID: null }
        ]);

        const allModels = [
            { ID: 'pm1', ConfigurationID: 'config-a', ModelID: 'model-1' },
            { ID: 'pm2', ConfigurationID: null, ModelID: 'model-2' },
            { ID: 'pm3', ConfigurationID: 'config-b', ModelID: 'model-3' }
        ];

        const filtered = filterPromptModelsByConfiguration(engine, allModels, undefined);

        expect(filtered.length).toBe(1);
        expect(filtered[0].ID).toBe('pm2');
    });

    it('With config - returns config and null-config models', () => {
        engine.setConfigurations([
            { ID: 'config-a', Name: 'Config A', ParentID: null }
        ]);

        const allModels = [
            { ID: 'pm1', ConfigurationID: 'config-a', ModelID: 'model-1' },
            { ID: 'pm2', ConfigurationID: null, ModelID: 'model-2' },
            { ID: 'pm3', ConfigurationID: 'config-b', ModelID: 'model-3' }
        ];

        const filtered = filterPromptModelsByConfiguration(engine, allModels, 'config-a');

        expect(filtered.length).toBe(2);
        expect(filtered.some(m => m.ID === 'pm1')).toBe(true);
        expect(filtered.some(m => m.ID === 'pm2')).toBe(true);
    });

    it('With inheritance - returns chain and null-config models', () => {
        engine.setConfigurations([
            { ID: 'parent', Name: 'Parent', ParentID: null },
            { ID: 'child', Name: 'Child', ParentID: 'parent' }
        ]);

        const allModels = [
            { ID: 'pm1', ConfigurationID: 'child', ModelID: 'model-1' },
            { ID: 'pm2', ConfigurationID: 'parent', ModelID: 'model-2' },
            { ID: 'pm3', ConfigurationID: null, ModelID: 'model-3' },
            { ID: 'pm4', ConfigurationID: 'unrelated', ModelID: 'model-4' }
        ];

        const filtered = filterPromptModelsByConfiguration(engine, allModels, 'child');

        expect(filtered.length).toBe(3);
        expect(filtered.some(m => m.ID === 'pm1')).toBe(true);
        expect(filtered.some(m => m.ID === 'pm2')).toBe(true);
        expect(filtered.some(m => m.ID === 'pm3')).toBe(true);
    });
});

// ============================================================================
// Test Suite: sortPromptModelsForSpecificStrategy
// ============================================================================

describe('sortPromptModelsForSpecificStrategy', () => {
    it('No config - sort by priority only', () => {
        const models = [
            { ID: 'pm1', Priority: 10, ConfigurationID: null },
            { ID: 'pm2', Priority: 30, ConfigurationID: null },
            { ID: 'pm3', Priority: 20, ConfigurationID: null }
        ];

        const sorted = sortPromptModelsForSpecificStrategy(engine, models, undefined);
        const sortedIds = sorted.map(item => item.ID);

        expect(sortedIds).toEqual(['pm2', 'pm3', 'pm1']);
    });

    it('With config - child before parent before null', () => {
        engine.setConfigurations([
            { ID: 'parent', Name: 'Parent', ParentID: null },
            { ID: 'child', Name: 'Child', ParentID: 'parent' }
        ]);

        const models = [
            { ID: 'pm-null', Priority: 100, ConfigurationID: null },
            { ID: 'pm-parent', Priority: 50, ConfigurationID: 'parent' },
            { ID: 'pm-child', Priority: 10, ConfigurationID: 'child' }
        ];

        const sorted = sortPromptModelsForSpecificStrategy(engine, models, 'child');
        const sortedIds = sorted.map(item => item.ID);

        expect(sortedIds).toEqual(['pm-child', 'pm-parent', 'pm-null']);
    });

    it('Same config level - sort by priority', () => {
        engine.setConfigurations([
            { ID: 'parent', Name: 'Parent', ParentID: null },
            { ID: 'child', Name: 'Child', ParentID: 'parent' }
        ]);

        const models = [
            { ID: 'pm-child-low', Priority: 10, ConfigurationID: 'child' },
            { ID: 'pm-child-high', Priority: 50, ConfigurationID: 'child' },
            { ID: 'pm-parent', Priority: 100, ConfigurationID: 'parent' }
        ];

        const sorted = sortPromptModelsForSpecificStrategy(engine, models, 'child');
        const sortedIds = sorted.map(item => item.ID);

        expect(sortedIds).toEqual(['pm-child-high', 'pm-child-low', 'pm-parent']);
    });

    it('Three-level inheritance', () => {
        engine.setConfigurations([
            { ID: 'grandparent', Name: 'Grandparent', ParentID: null },
            { ID: 'parent', Name: 'Parent', ParentID: 'grandparent' },
            { ID: 'child', Name: 'Child', ParentID: 'parent' }
        ]);

        const models = [
            { ID: 'pm-null', Priority: 100, ConfigurationID: null },
            { ID: 'pm-grandparent', Priority: 80, ConfigurationID: 'grandparent' },
            { ID: 'pm-parent', Priority: 60, ConfigurationID: 'parent' },
            { ID: 'pm-child', Priority: 40, ConfigurationID: 'child' }
        ];

        const sorted = sortPromptModelsForSpecificStrategy(engine, models, 'child');
        const sortedIds = sorted.map(item => item.ID);

        expect(sortedIds).toEqual(['pm-child', 'pm-parent', 'pm-grandparent', 'pm-null']);
    });
});

// ============================================================================
// Test Suite: getPromptModelsForConfiguration
// ============================================================================

describe('getPromptModelsForConfiguration', () => {
    it('Child has models - returns child models only', () => {
        engine.setConfigurations([
            { ID: 'parent', Name: 'Parent', ParentID: null },
            { ID: 'child', Name: 'Child', ParentID: 'parent' }
        ]);

        engine.setPromptModels([
            { ID: 'pm1', PromptID: 'prompt-1', Status: 'Active', ConfigurationID: 'child', ModelID: 'model-1' },
            { ID: 'pm2', PromptID: 'prompt-1', Status: 'Active', ConfigurationID: 'parent', ModelID: 'model-2' },
            { ID: 'pm3', PromptID: 'prompt-1', Status: 'Active', ConfigurationID: null, ModelID: 'model-3' }
        ]);

        const result = getPromptModelsForConfiguration(engine, 'prompt-1', 'child');

        expect(result.length).toBe(1);
        expect(result[0].ID).toBe('pm1');
    });

    it('Child empty - falls back to parent', () => {
        engine.setConfigurations([
            { ID: 'parent', Name: 'Parent', ParentID: null },
            { ID: 'child', Name: 'Child', ParentID: 'parent' }
        ]);

        engine.setPromptModels([
            { ID: 'pm1', PromptID: 'prompt-1', Status: 'Active', ConfigurationID: 'parent', ModelID: 'model-1' },
            { ID: 'pm2', PromptID: 'prompt-1', Status: 'Active', ConfigurationID: null, ModelID: 'model-2' }
        ]);

        const result = getPromptModelsForConfiguration(engine, 'prompt-1', 'child');

        expect(result.length).toBe(1);
        expect(result[0].ID).toBe('pm1');
    });

    it('Chain empty - falls back to null-config', () => {
        engine.setConfigurations([
            { ID: 'parent', Name: 'Parent', ParentID: null },
            { ID: 'child', Name: 'Child', ParentID: 'parent' }
        ]);

        engine.setPromptModels([
            { ID: 'pm1', PromptID: 'prompt-1', Status: 'Active', ConfigurationID: null, ModelID: 'model-1' },
            { ID: 'pm2', PromptID: 'prompt-1', Status: 'Active', ConfigurationID: 'unrelated', ModelID: 'model-2' }
        ]);

        const result = getPromptModelsForConfiguration(engine, 'prompt-1', 'child');

        expect(result.length).toBe(1);
        expect(result[0].ID).toBe('pm1');
    });

    it('No config specified - returns null-config models', () => {
        engine.setConfigurations([]);
        engine.setPromptModels([
            { ID: 'pm1', PromptID: 'prompt-1', Status: 'Active', ConfigurationID: 'some-config', ModelID: 'model-1' },
            { ID: 'pm2', PromptID: 'prompt-1', Status: 'Active', ConfigurationID: null, ModelID: 'model-2' }
        ]);

        const result = getPromptModelsForConfiguration(engine, 'prompt-1', undefined);

        expect(result.length).toBe(1);
        expect(result[0].ID).toBe('pm2');
    });

    it('Only returns Active/Preview models', () => {
        engine.setConfigurations([
            { ID: 'config-a', Name: 'Config A', ParentID: null }
        ]);

        engine.setPromptModels([
            { ID: 'pm1', PromptID: 'prompt-1', Status: 'Active', ConfigurationID: 'config-a', ModelID: 'model-1' },
            { ID: 'pm2', PromptID: 'prompt-1', Status: 'Preview', ConfigurationID: 'config-a', ModelID: 'model-2' },
            { ID: 'pm3', PromptID: 'prompt-1', Status: 'Disabled', ConfigurationID: 'config-a', ModelID: 'model-3' },
            { ID: 'pm4', PromptID: 'prompt-1', Status: 'Deprecated', ConfigurationID: 'config-a', ModelID: 'model-4' }
        ]);

        const result = getPromptModelsForConfiguration(engine, 'prompt-1', 'config-a');

        expect(result.length).toBe(2);
        expect(result.some(m => m.ID === 'pm1')).toBe(true);
        expect(result.some(m => m.ID === 'pm2')).toBe(true);
    });
});

// ============================================================================
// Test Suite: calculateFallbackPriorities
// ============================================================================

describe('calculateFallbackPriorities', () => {
    it('Parent configs get decreasing priority', () => {
        engine.setConfigurations([
            { ID: 'grandparent', Name: 'Grandparent', ParentID: null },
            { ID: 'parent', Name: 'Parent', ParentID: 'grandparent' },
            { ID: 'child', Name: 'Child', ParentID: 'parent' }
        ]);

        engine.setPromptModels([
            { ID: 'pm-gp', PromptID: 'prompt-1', Status: 'Active', ConfigurationID: 'grandparent', ModelID: 'model-gp', Priority: 10 },
            { ID: 'pm-parent', PromptID: 'prompt-1', Status: 'Active', ConfigurationID: 'parent', ModelID: 'model-p', Priority: 20 }
        ]);

        const result = calculateFallbackPriorities(engine, 'prompt-1', 'child');

        const parentEntry = result.find(r => r.configId === 'parent');
        const grandparentEntry = result.find(r => r.configId === 'grandparent');

        expect(parentEntry.basePriority).toBe(2500);
        expect(grandparentEntry.basePriority).toBe(2000);
        expect(parentEntry.effectivePriority).toBeGreaterThan(grandparentEntry.effectivePriority);
    });

    it('NULL config models get lowest priority', () => {
        engine.setConfigurations([
            { ID: 'parent', Name: 'Parent', ParentID: null },
            { ID: 'child', Name: 'Child', ParentID: 'parent' }
        ]);

        engine.setPromptModels([
            { ID: 'pm-parent', PromptID: 'prompt-1', Status: 'Active', ConfigurationID: 'parent', ModelID: 'model-p', Priority: 10 },
            { ID: 'pm-null', PromptID: 'prompt-1', Status: 'Active', ConfigurationID: null, ModelID: 'model-null', Priority: 100 }
        ]);

        const result = calculateFallbackPriorities(engine, 'prompt-1', 'child');

        const parentEntry = result.find(r => r.configId === 'parent');
        const nullEntry = result.find(r => r.configId === null);

        expect(nullEntry.basePriority).toBe(1000);
        expect(parentEntry.effectivePriority).toBeGreaterThan(nullEntry.effectivePriority);
    });

    it('Excludes child config (handled separately)', () => {
        engine.setConfigurations([
            { ID: 'parent', Name: 'Parent', ParentID: null },
            { ID: 'child', Name: 'Child', ParentID: 'parent' }
        ]);

        engine.setPromptModels([
            { ID: 'pm-child', PromptID: 'prompt-1', Status: 'Active', ConfigurationID: 'child', ModelID: 'model-c', Priority: 50 },
            { ID: 'pm-parent', PromptID: 'prompt-1', Status: 'Active', ConfigurationID: 'parent', ModelID: 'model-p', Priority: 10 }
        ]);

        const result = calculateFallbackPriorities(engine, 'prompt-1', 'child');

        expect(result.length).toBe(1);
        expect(result[0].configId).toBe('parent');
    });
});

// ============================================================================
// Test Suite: Integration scenarios
// ============================================================================

describe('Integration scenarios', () => {
    it('Model override - child overrides parent model selection', () => {
        engine.setConfigurations([
            { ID: 'parent', Name: 'Parent', ParentID: null },
            { ID: 'child', Name: 'Child', ParentID: 'parent' }
        ]);

        // Parent has Claude, child overrides with GPT-4
        engine.setPromptModels([
            { ID: 'pm-parent', PromptID: 'prompt-1', Status: 'Active', ConfigurationID: 'parent', ModelID: 'claude-3', Priority: 10 },
            { ID: 'pm-child', PromptID: 'prompt-1', Status: 'Active', ConfigurationID: 'child', ModelID: 'gpt-4', Priority: 20 }
        ]);

        // When using child config, should get child's model first
        const childModels = getPromptModelsForConfiguration(engine, 'prompt-1', 'child');
        expect(childModels.length).toBe(1);
        expect(childModels[0].ModelID).toBe('gpt-4');

        // When using parent config, should get parent's model
        const parentModels = getPromptModelsForConfiguration(engine, 'prompt-1', 'parent');
        expect(parentModels.length).toBe(1);
        expect(parentModels[0].ModelID).toBe('claude-3');
    });

    it('Fallback chain - child inherits from grandparent when parent empty', () => {
        engine.setConfigurations([
            { ID: 'grandparent', Name: 'Grandparent', ParentID: null },
            { ID: 'parent', Name: 'Parent', ParentID: 'grandparent' },
            { ID: 'child', Name: 'Child', ParentID: 'parent' }
        ]);

        // Only grandparent has model config for this prompt
        engine.setPromptModels([
            { ID: 'pm-gp', PromptID: 'prompt-1', Status: 'Active', ConfigurationID: 'grandparent', ModelID: 'claude-3', Priority: 10 }
        ]);

        const result = getPromptModelsForConfiguration(engine, 'prompt-1', 'child');

        expect(result.length).toBe(1);
        expect(result[0].ConfigurationID).toBe('grandparent');
    });

    it('Mixed inheritance - some prompts override, others inherit', () => {
        engine.setConfigurations([
            { ID: 'parent', Name: 'Parent', ParentID: null },
            { ID: 'child', Name: 'Child', ParentID: 'parent' }
        ]);

        engine.setPromptModels([
            // Prompt 1: Child overrides parent
            { ID: 'pm1-parent', PromptID: 'prompt-1', Status: 'Active', ConfigurationID: 'parent', ModelID: 'claude-3', Priority: 10 },
            { ID: 'pm1-child', PromptID: 'prompt-1', Status: 'Active', ConfigurationID: 'child', ModelID: 'gpt-4', Priority: 10 },
            // Prompt 2: Only parent has config (child inherits)
            { ID: 'pm2-parent', PromptID: 'prompt-2', Status: 'Active', ConfigurationID: 'parent', ModelID: 'claude-3', Priority: 10 },
            // Prompt 3: Only child has config (no inheritance needed)
            { ID: 'pm3-child', PromptID: 'prompt-3', Status: 'Active', ConfigurationID: 'child', ModelID: 'gpt-4-turbo', Priority: 10 }
        ]);

        // Prompt 1: Child should get its own model
        const prompt1Models = getPromptModelsForConfiguration(engine, 'prompt-1', 'child');
        expect(prompt1Models[0].ModelID).toBe('gpt-4');

        // Prompt 2: Child should inherit from parent
        const prompt2Models = getPromptModelsForConfiguration(engine, 'prompt-2', 'child');
        expect(prompt2Models[0].ModelID).toBe('claude-3');

        // Prompt 3: Child should use its own model
        const prompt3Models = getPromptModelsForConfiguration(engine, 'prompt-3', 'child');
        expect(prompt3Models[0].ModelID).toBe('gpt-4-turbo');
    });
});
