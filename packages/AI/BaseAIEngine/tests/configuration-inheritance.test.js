/**
 * Unit tests for AI Configuration Inheritance
 * Tests the GetConfigurationChain and GetConfigurationParamsWithInheritance methods
 *
 * Run with: node tests/configuration-inheritance.test.js
 */

// Simple test runner
class TestRunner {
    constructor() {
        this.passed = 0;
        this.failed = 0;
        this.tests = [];
    }

    test(name, fn) {
        this.tests.push({ name, fn });
    }

    assertEqual(actual, expected, message) {
        const actualStr = JSON.stringify(actual);
        const expectedStr = JSON.stringify(expected);

        if (actualStr === expectedStr) {
            console.log(`  ✅ ${message}`);
            this.passed++;
            return true;
        } else {
            console.log(`  ❌ ${message}`);
            console.log(`     Expected: ${expectedStr}`);
            console.log(`     Actual:   ${actualStr}`);
            this.failed++;
            return false;
        }
    }

    assertTrue(condition, message) {
        if (condition) {
            console.log(`  ✅ ${message}`);
            this.passed++;
            return true;
        } else {
            console.log(`  ❌ ${message}`);
            this.failed++;
            return false;
        }
    }

    assertThrows(fn, expectedMessage, message) {
        try {
            fn();
            console.log(`  ❌ ${message} - Expected error but none was thrown`);
            this.failed++;
            return false;
        } catch (error) {
            if (error.message.includes(expectedMessage)) {
                console.log(`  ✅ ${message}`);
                this.passed++;
                return true;
            } else {
                console.log(`  ❌ ${message}`);
                console.log(`     Expected error containing: ${expectedMessage}`);
                console.log(`     Actual error: ${error.message}`);
                this.failed++;
                return false;
            }
        }
    }

    async run() {
        console.log('\n🧪 Running AI Configuration Inheritance Tests\n');
        console.log('='.repeat(70));

        for (const test of this.tests) {
            console.log(`\n📋 ${test.name}`);
            try {
                await test.fn();
            } catch (error) {
                console.log(`  ❌ Test threw unexpected error: ${error.message}`);
                this.failed++;
            }
        }

        console.log('\n' + '='.repeat(70));
        console.log(`\n📊 Results: ${this.passed} passed, ${this.failed} failed\n`);

        if (this.failed === 0) {
            console.log('✨ All tests passed!\n');
            process.exit(0);
        } else {
            console.log('💥 Some tests failed!\n');
            process.exit(1);
        }
    }
}

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

// Create test runner and mock engine
const runner = new TestRunner();
const engine = new MockAIEngineBase();

// ============================================================================
// Test Suite: GetConfigurationChain
// ============================================================================

runner.test('GetConfigurationChain: Single configuration with no parent', () => {
    engine.setConfigurations([
        { ID: 'config-a', Name: 'Config A', ParentID: null }
    ]);

    const chain = engine.GetConfigurationChain('config-a');

    runner.assertEqual(chain.length, 1, 'Chain should have 1 configuration');
    runner.assertEqual(chain[0].Name, 'Config A', 'Chain should contain Config A');
});

runner.test('GetConfigurationChain: Simple parent-child relationship', () => {
    engine.setConfigurations([
        { ID: 'parent', Name: 'Parent Config', ParentID: null },
        { ID: 'child', Name: 'Child Config', ParentID: 'parent' }
    ]);

    const chain = engine.GetConfigurationChain('child');

    runner.assertEqual(chain.length, 2, 'Chain should have 2 configurations');
    runner.assertEqual(chain[0].Name, 'Child Config', 'First in chain should be Child Config');
    runner.assertEqual(chain[1].Name, 'Parent Config', 'Second in chain should be Parent Config');
});

runner.test('GetConfigurationChain: Three-level inheritance', () => {
    engine.setConfigurations([
        { ID: 'grandparent', Name: 'Grandparent', ParentID: null },
        { ID: 'parent', Name: 'Parent', ParentID: 'grandparent' },
        { ID: 'child', Name: 'Child', ParentID: 'parent' }
    ]);

    const chain = engine.GetConfigurationChain('child');

    runner.assertEqual(chain.length, 3, 'Chain should have 3 configurations');
    runner.assertEqual(chain[0].Name, 'Child', 'First should be Child');
    runner.assertEqual(chain[1].Name, 'Parent', 'Second should be Parent');
    runner.assertEqual(chain[2].Name, 'Grandparent', 'Third should be Grandparent');
});

runner.test('GetConfigurationChain: Non-existent configuration returns empty array', () => {
    engine.setConfigurations([
        { ID: 'config-a', Name: 'Config A', ParentID: null }
    ]);

    const chain = engine.GetConfigurationChain('non-existent');

    runner.assertEqual(chain.length, 0, 'Chain should be empty for non-existent config');
});

runner.test('GetConfigurationChain: Broken chain (missing parent) stops at break', () => {
    engine.setConfigurations([
        { ID: 'child', Name: 'Child', ParentID: 'missing-parent' }
    ]);

    const chain = engine.GetConfigurationChain('child');

    runner.assertEqual(chain.length, 1, 'Chain should only contain the child');
    runner.assertEqual(chain[0].Name, 'Child', 'Chain should contain Child');
});

runner.test('GetConfigurationChain: Cycle detection throws error', () => {
    engine.setConfigurations([
        { ID: 'config-a', Name: 'Config A', ParentID: 'config-b' },
        { ID: 'config-b', Name: 'Config B', ParentID: 'config-a' }
    ]);

    runner.assertThrows(
        () => engine.GetConfigurationChain('config-a'),
        'Circular reference detected',
        'Should throw error for circular reference'
    );
});

runner.test('GetConfigurationChain: Self-referencing cycle throws error', () => {
    engine.setConfigurations([
        { ID: 'config-a', Name: 'Config A', ParentID: 'config-a' }
    ]);

    runner.assertThrows(
        () => engine.GetConfigurationChain('config-a'),
        'Circular reference detected',
        'Should throw error for self-referencing config'
    );
});

runner.test('GetConfigurationChain: Cache is used on second call', () => {
    engine.setConfigurations([
        { ID: 'parent', Name: 'Parent', ParentID: null },
        { ID: 'child', Name: 'Child', ParentID: 'parent' }
    ]);

    // First call - populates cache
    const chain1 = engine.GetConfigurationChain('child');

    // Verify cache has the entry
    runner.assertTrue(
        engine._configurationChainCache.has('child'),
        'Cache should contain entry after first call'
    );

    // Second call - should use cache
    const chain2 = engine.GetConfigurationChain('child');

    runner.assertEqual(chain1, chain2, 'Second call should return same cached result');
});

// ============================================================================
// Test Suite: GetConfigurationParamsWithInheritance
// ============================================================================

runner.test('GetConfigurationParamsWithInheritance: Single config parameters', () => {
    engine.setConfigurations([
        { ID: 'config-a', Name: 'Config A', ParentID: null }
    ]);
    engine.setConfigurationParams([
        { ID: 'p1', ConfigurationID: 'config-a', Name: 'temperature', Value: '0.7' },
        { ID: 'p2', ConfigurationID: 'config-a', Name: 'maxTokens', Value: '4000' }
    ]);

    const params = engine.GetConfigurationParamsWithInheritance('config-a');

    runner.assertEqual(params.length, 2, 'Should have 2 parameters');
    runner.assertTrue(
        params.some(p => p.Name === 'temperature' && p.Value === '0.7'),
        'Should include temperature=0.7'
    );
    runner.assertTrue(
        params.some(p => p.Name === 'maxTokens' && p.Value === '4000'),
        'Should include maxTokens=4000'
    );
});

runner.test('GetConfigurationParamsWithInheritance: Child inherits parent params', () => {
    engine.setConfigurations([
        { ID: 'parent', Name: 'Parent', ParentID: null },
        { ID: 'child', Name: 'Child', ParentID: 'parent' }
    ]);
    engine.setConfigurationParams([
        { ID: 'p1', ConfigurationID: 'parent', Name: 'temperature', Value: '0.7' },
        { ID: 'p2', ConfigurationID: 'parent', Name: 'maxTokens', Value: '4000' }
    ]);

    const params = engine.GetConfigurationParamsWithInheritance('child');

    runner.assertEqual(params.length, 2, 'Child should inherit 2 parameters from parent');
    runner.assertTrue(
        params.some(p => p.Name === 'temperature' && p.Value === '0.7'),
        'Should inherit temperature=0.7'
    );
    runner.assertTrue(
        params.some(p => p.Name === 'maxTokens' && p.Value === '4000'),
        'Should inherit maxTokens=4000'
    );
});

runner.test('GetConfigurationParamsWithInheritance: Child overrides parent param', () => {
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

    runner.assertEqual(params.length, 2, 'Should have 2 parameters (1 overridden, 1 inherited)');

    const tempParam = params.find(p => p.Name.toLowerCase() === 'temperature');
    runner.assertEqual(tempParam.Value, '0.9', 'temperature should be child value 0.9');
    runner.assertEqual(tempParam.ConfigurationID, 'child', 'temperature param should be from child');

    const tokensParam = params.find(p => p.Name.toLowerCase() === 'maxtokens');
    runner.assertEqual(tokensParam.Value, '4000', 'maxTokens should be inherited value 4000');
    runner.assertEqual(tokensParam.ConfigurationID, 'parent', 'maxTokens param should be from parent');
});

runner.test('GetConfigurationParamsWithInheritance: Three-level inheritance with overrides', () => {
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

    runner.assertEqual(params.length, 3, 'Should have 3 unique parameters');

    const tempParam = params.find(p => p.Name.toLowerCase() === 'temperature');
    runner.assertEqual(tempParam.Value, '0.9', 'temperature should be child value 0.9');

    const tokensParam = params.find(p => p.Name.toLowerCase() === 'maxtokens');
    runner.assertEqual(tokensParam.Value, '2000', 'maxTokens should be grandparent value 2000');

    const seedParam = params.find(p => p.Name.toLowerCase() === 'seed');
    runner.assertEqual(seedParam.Value, '42', 'seed should be grandparent value 42');
});

runner.test('GetConfigurationParamsWithInheritance: Case-insensitive param matching', () => {
    engine.setConfigurations([
        { ID: 'parent', Name: 'Parent', ParentID: null },
        { ID: 'child', Name: 'Child', ParentID: 'parent' }
    ]);
    engine.setConfigurationParams([
        { ID: 'p1', ConfigurationID: 'parent', Name: 'Temperature', Value: '0.7' },
        { ID: 'p2', ConfigurationID: 'child', Name: 'TEMPERATURE', Value: '0.9' }
    ]);

    const params = engine.GetConfigurationParamsWithInheritance('child');

    runner.assertEqual(params.length, 1, 'Should have 1 parameter (case-insensitive override)');
    runner.assertEqual(params[0].Value, '0.9', 'Should use child value regardless of case');
});

runner.test('GetConfigurationParamsWithInheritance: Empty params for non-existent config', () => {
    engine.setConfigurations([]);
    engine.setConfigurationParams([]);

    const params = engine.GetConfigurationParamsWithInheritance('non-existent');

    runner.assertEqual(params.length, 0, 'Should return empty array for non-existent config');
});

runner.test('GetConfigurationParamsWithInheritance: Config with no params inherits parent params', () => {
    engine.setConfigurations([
        { ID: 'parent', Name: 'Parent', ParentID: null },
        { ID: 'child', Name: 'Child', ParentID: 'parent' }
    ]);
    engine.setConfigurationParams([
        { ID: 'p1', ConfigurationID: 'parent', Name: 'temperature', Value: '0.7' }
    ]);

    const params = engine.GetConfigurationParamsWithInheritance('child');

    runner.assertEqual(params.length, 1, 'Child with no params should inherit parent params');
    runner.assertEqual(params[0].Name, 'temperature', 'Should inherit temperature param');
});

// Run all tests
runner.run();
