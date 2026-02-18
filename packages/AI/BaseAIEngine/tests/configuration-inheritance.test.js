/**
 * Unit tests for AI Configuration Inheritance
 * Tests the GetConfigurationChain and GetConfigurationParamsWithInheritance methods
 *
 * Converted from custom TestRunner to Vitest format
 */

import { describe, it, expect } from 'vitest';

/**
 * Mock AIEngineBase for testing configuration inheritance logic
 * This allows us to test the chain resolution without needing database connectivity
 */
class MockAIEngineBase {
    constructor() {
        this._configurations = [];
        this._configurationParams = [];
        this._configurationChainCache = new Map();
    }

    // Simulate setting up configurations
    setConfigurations(configs) {
        this._configurations = configs;
        this._configurationChainCache.clear();
    }

    // Simulate setting up configuration parameters
    setConfigurationParams(params) {
        this._configurationParams = params;
    }

    // Copy of the actual GetConfigurationChain implementation
    GetConfigurationChain(configurationId) {
        // Check cache first
        if (this._configurationChainCache.has(configurationId)) {
            return this._configurationChainCache.get(configurationId);
        }

        const chain = [];
        const visitedIds = new Set();
        let currentId = configurationId;

        while (currentId) {
            // Cycle detection
            if (visitedIds.has(currentId)) {
                const chainNames = chain.map(c => c.Name).join(' -> ');
                throw new Error(
                    `Circular reference detected in AI Configuration hierarchy. ` +
                    `Configuration ID "${currentId}" appears multiple times in the chain: ` +
                    `${chainNames} -> [CYCLE]`
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

    // Copy of the actual GetConfigurationParamsWithInheritance implementation
    GetConfigurationParamsWithInheritance(configurationId) {
        const chain = this.GetConfigurationChain(configurationId);

        if (chain.length === 0) {
            return [];
        }

        // Use a map to track params by name (lowercase for case-insensitive matching)
        // Walk chain in reverse (root first, child last) so child overwrites parent
        const paramMap = new Map();

        for (let i = chain.length - 1; i >= 0; i--) {
            const configParams = this._configurationParams.filter(
                p => p.ConfigurationID === chain[i].ID
            );
            for (const param of configParams) {
                paramMap.set(param.Name.toLowerCase(), param);
            }
        }

        return Array.from(paramMap.values());
    }
}

// Create mock engine
const engine = new MockAIEngineBase();

// ============================================================================
// Test Suite: GetConfigurationChain
// ============================================================================

describe('GetConfigurationChain', () => {
    it('Single configuration with no parent', () => {
        engine.setConfigurations([
            { ID: 'config-a', Name: 'Config A', ParentID: null }
        ]);

        const chain = engine.GetConfigurationChain('config-a');

        expect(chain.length).toBe(1);
        expect(chain[0].Name).toBe('Config A');
    });

    it('Simple parent-child relationship', () => {
        engine.setConfigurations([
            { ID: 'parent', Name: 'Parent Config', ParentID: null },
            { ID: 'child', Name: 'Child Config', ParentID: 'parent' }
        ]);

        const chain = engine.GetConfigurationChain('child');

        expect(chain.length).toBe(2);
        expect(chain[0].Name).toBe('Child Config');
        expect(chain[1].Name).toBe('Parent Config');
    });

    it('Three-level inheritance', () => {
        engine.setConfigurations([
            { ID: 'grandparent', Name: 'Grandparent', ParentID: null },
            { ID: 'parent', Name: 'Parent', ParentID: 'grandparent' },
            { ID: 'child', Name: 'Child', ParentID: 'parent' }
        ]);

        const chain = engine.GetConfigurationChain('child');

        expect(chain.length).toBe(3);
        expect(chain[0].Name).toBe('Child');
        expect(chain[1].Name).toBe('Parent');
        expect(chain[2].Name).toBe('Grandparent');
    });

    it('Non-existent configuration returns empty array', () => {
        engine.setConfigurations([
            { ID: 'config-a', Name: 'Config A', ParentID: null }
        ]);

        const chain = engine.GetConfigurationChain('non-existent');

        expect(chain.length).toBe(0);
    });

    it('Broken chain (missing parent) stops at break', () => {
        engine.setConfigurations([
            { ID: 'child', Name: 'Child', ParentID: 'missing-parent' }
        ]);

        const chain = engine.GetConfigurationChain('child');

        expect(chain.length).toBe(1);
        expect(chain[0].Name).toBe('Child');
    });

    it('Cycle detection throws error', () => {
        engine.setConfigurations([
            { ID: 'config-a', Name: 'Config A', ParentID: 'config-b' },
            { ID: 'config-b', Name: 'Config B', ParentID: 'config-a' }
        ]);

        expect(() => engine.GetConfigurationChain('config-a')).toThrow('Circular reference detected');
    });

    it('Self-referencing cycle throws error', () => {
        engine.setConfigurations([
            { ID: 'config-a', Name: 'Config A', ParentID: 'config-a' }
        ]);

        expect(() => engine.GetConfigurationChain('config-a')).toThrow('Circular reference detected');
    });

    it('Cache is used on second call', () => {
        engine.setConfigurations([
            { ID: 'parent', Name: 'Parent', ParentID: null },
            { ID: 'child', Name: 'Child', ParentID: 'parent' }
        ]);

        // First call - populates cache
        const chain1 = engine.GetConfigurationChain('child');

        // Verify cache has the entry
        expect(engine._configurationChainCache.has('child')).toBe(true);

        // Second call - should use cache
        const chain2 = engine.GetConfigurationChain('child');

        expect(chain1).toBe(chain2);
    });
});

// ============================================================================
// Test Suite: GetConfigurationParamsWithInheritance
// ============================================================================

describe('GetConfigurationParamsWithInheritance', () => {
    it('Single config parameters', () => {
        engine.setConfigurations([
            { ID: 'config-a', Name: 'Config A', ParentID: null }
        ]);
        engine.setConfigurationParams([
            { ID: 'p1', ConfigurationID: 'config-a', Name: 'temperature', Value: '0.7' },
            { ID: 'p2', ConfigurationID: 'config-a', Name: 'maxTokens', Value: '4000' }
        ]);

        const params = engine.GetConfigurationParamsWithInheritance('config-a');

        expect(params.length).toBe(2);
        expect(params.some(p => p.Name === 'temperature' && p.Value === '0.7')).toBe(true);
        expect(params.some(p => p.Name === 'maxTokens' && p.Value === '4000')).toBe(true);
    });

    it('Child inherits parent params', () => {
        engine.setConfigurations([
            { ID: 'parent', Name: 'Parent', ParentID: null },
            { ID: 'child', Name: 'Child', ParentID: 'parent' }
        ]);
        engine.setConfigurationParams([
            { ID: 'p1', ConfigurationID: 'parent', Name: 'temperature', Value: '0.7' },
            { ID: 'p2', ConfigurationID: 'parent', Name: 'maxTokens', Value: '4000' }
        ]);

        const params = engine.GetConfigurationParamsWithInheritance('child');

        expect(params.length).toBe(2);
        expect(params.some(p => p.Name === 'temperature' && p.Value === '0.7')).toBe(true);
        expect(params.some(p => p.Name === 'maxTokens' && p.Value === '4000')).toBe(true);
    });

    it('Child overrides parent param', () => {
        engine.setConfigurations([
            { ID: 'parent', Name: 'Parent', ParentID: null },
            { ID: 'child', Name: 'Child', ParentID: 'parent' }
        ]);
        engine.setConfigurationParams([
            { ID: 'p1', ConfigurationID: 'parent', Name: 'temperature', Value: '0.7' },
            { ID: 'p2', ConfigurationID: 'parent', Name: 'maxTokens', Value: '4000' },
            { ID: 'p3', ConfigurationID: 'child', Name: 'temperature', Value: '0.9' }
        ]);

        const params = engine.GetConfigurationParamsWithInheritance('child');

        expect(params.length).toBe(2);

        const tempParam = params.find(p => p.Name.toLowerCase() === 'temperature');
        expect(tempParam.Value).toBe('0.9');
        expect(tempParam.ConfigurationID).toBe('child');

        const tokensParam = params.find(p => p.Name.toLowerCase() === 'maxtokens');
        expect(tokensParam.Value).toBe('4000');
        expect(tokensParam.ConfigurationID).toBe('parent');
    });

    it('Three-level inheritance with overrides', () => {
        engine.setConfigurations([
            { ID: 'grandparent', Name: 'Grandparent', ParentID: null },
            { ID: 'parent', Name: 'Parent', ParentID: 'grandparent' },
            { ID: 'child', Name: 'Child', ParentID: 'parent' }
        ]);
        engine.setConfigurationParams([
            // Grandparent defines base values
            { ID: 'p1', ConfigurationID: 'grandparent', Name: 'temperature', Value: '0.5' },
            { ID: 'p2', ConfigurationID: 'grandparent', Name: 'maxTokens', Value: '2000' },
            { ID: 'p3', ConfigurationID: 'grandparent', Name: 'seed', Value: '42' },
            // Parent overrides temperature
            { ID: 'p4', ConfigurationID: 'parent', Name: 'temperature', Value: '0.7' },
            // Child overrides temperature again
            { ID: 'p5', ConfigurationID: 'child', Name: 'temperature', Value: '0.9' }
        ]);

        const params = engine.GetConfigurationParamsWithInheritance('child');

        expect(params.length).toBe(3);

        const tempParam = params.find(p => p.Name.toLowerCase() === 'temperature');
        expect(tempParam.Value).toBe('0.9');

        const tokensParam = params.find(p => p.Name.toLowerCase() === 'maxtokens');
        expect(tokensParam.Value).toBe('2000');

        const seedParam = params.find(p => p.Name.toLowerCase() === 'seed');
        expect(seedParam.Value).toBe('42');
    });

    it('Case-insensitive param matching', () => {
        engine.setConfigurations([
            { ID: 'parent', Name: 'Parent', ParentID: null },
            { ID: 'child', Name: 'Child', ParentID: 'parent' }
        ]);
        engine.setConfigurationParams([
            { ID: 'p1', ConfigurationID: 'parent', Name: 'Temperature', Value: '0.7' },
            { ID: 'p2', ConfigurationID: 'child', Name: 'TEMPERATURE', Value: '0.9' }
        ]);

        const params = engine.GetConfigurationParamsWithInheritance('child');

        expect(params.length).toBe(1);
        expect(params[0].Value).toBe('0.9');
    });

    it('Empty params for non-existent config', () => {
        engine.setConfigurations([]);
        engine.setConfigurationParams([]);

        const params = engine.GetConfigurationParamsWithInheritance('non-existent');

        expect(params.length).toBe(0);
    });

    it('Config with no params inherits parent params', () => {
        engine.setConfigurations([
            { ID: 'parent', Name: 'Parent', ParentID: null },
            { ID: 'child', Name: 'Child', ParentID: 'parent' }
        ]);
        engine.setConfigurationParams([
            { ID: 'p1', ConfigurationID: 'parent', Name: 'temperature', Value: '0.7' }
        ]);

        const params = engine.GetConfigurationParamsWithInheritance('child');

        expect(params.length).toBe(1);
        expect(params[0].Name).toBe('temperature');
    });
});
