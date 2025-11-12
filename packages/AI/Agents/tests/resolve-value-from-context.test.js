/**
 * Unit test for resolveValueFromContext fix
 * Tests scalar arrays, object arrays, and mixed scenarios
 */

const { BaseAgent } = require('../dist/base-agent');

// Create a test instance to access the protected method
class TestAgent extends BaseAgent {
    constructor() {
        super();
    }

    // Expose the protected method for testing
    testResolveValue(value, context, itemVariable) {
        return this.resolveValueFromContext(value, context, itemVariable);
    }

    testResolveTemplates(obj, context, itemVariable) {
        return this.resolveTemplates(obj, context, itemVariable);
    }
}

// Test runner
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
        } else {
            console.log(`  ❌ ${message}`);
            console.log(`     Expected: ${expectedStr}`);
            console.log(`     Actual:   ${actualStr}`);
            this.failed++;
        }
    }

    async run() {
        console.log('\n🧪 Running resolveValueFromContext Tests\n');
        console.log('='.repeat(70));

        for (const test of this.tests) {
            console.log(`\n📋 ${test.name}`);
            await test.fn();
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

const runner = new TestRunner();
const agent = new TestAgent();

// Test 1: Scalar array iteration (your exact use case)
runner.test('Scalar Array: Entity Names (Original Bug Report)', () => {
    const candidateEntities = ["Memberships", "Membership Types", "Members"];

    // Simulate iteration 1
    const context = {
        item: candidateEntities[0],  // "Memberships"
        index: 0,
        payload: { candidateEntities },
        data: {}
    };

    // Test direct reference
    const result1 = agent.testResolveValue("{{entityName}}", context, "entityName");
    runner.assertEqual(result1, "Memberships", "{{entityName}} should resolve to 'Memberships'");

    // Test iteration 2
    context.item = candidateEntities[1];
    context.index = 1;
    const result2 = agent.testResolveValue("{{entityName}}", context, "entityName");
    runner.assertEqual(result2, "Membership Types", "{{entityName}} should resolve to 'Membership Types'");

    // Test full template resolution in action params
    const params = {
        Name: "{{entityName}}"
    };
    context.item = candidateEntities[0];
    const resolvedParams = agent.testResolveTemplates(params, context, "entityName");
    runner.assertEqual(resolvedParams.Name, "Memberships", "Full template resolution should work");
});

// Test 2: Object array iteration
runner.test('Object Array: User Objects', () => {
    const users = [
        { name: "Alice", age: 30, email: "alice@example.com" },
        { name: "Bob", age: 25, email: "bob@example.com" }
    ];

    const context = {
        item: users[0],
        index: 0,
        payload: { users },
        data: {}
    };

    // Test direct object reference
    const result1 = agent.testResolveValue("{{user}}", context, "user");
    runner.assertEqual(result1, users[0], "{{user}} should return entire object");

    // Test property access
    const result2 = agent.testResolveValue("{{user.name}}", context, "user");
    runner.assertEqual(result2, "Alice", "{{user.name}} should resolve to 'Alice'");

    // Test nested property access
    const result3 = agent.testResolveValue("{{user.email}}", context, "user");
    runner.assertEqual(result3, "alice@example.com", "{{user.email}} should resolve correctly");
});

// Test 3: Default 'item' variable name (backward compatibility)
runner.test('Backward Compatibility: Default "item" Variable', () => {
    const items = ["apple", "banana", "cherry"];

    const context = {
        item: items[0],
        index: 0,
        payload: { items },
        data: {}
    };

    // Test with default "item" name
    const result1 = agent.testResolveValue("{{item}}", context, "item");
    runner.assertEqual(result1, "apple", "{{item}} should work with default variable name");

    // Test via context loop fallback (when itemVariable matches context key)
    const result2 = agent.testResolveValue("item", context, "item");
    runner.assertEqual(result2, "apple", "Direct 'item' reference should work");
});

// Test 4: Complex nested objects
runner.test('Complex Objects: Nested Properties', () => {
    const orders = [
        {
            id: 1,
            customer: { name: "Alice", email: "alice@ex.com" },
            items: [{ sku: "A123", qty: 2 }],
            total: 99.99
        }
    ];

    const context = {
        item: orders[0],
        index: 0,
        payload: { orders },
        data: {}
    };

    // Test entire object
    const result1 = agent.testResolveValue("{{order}}", context, "order");
    runner.assertEqual(result1, orders[0], "{{order}} should return entire order object");

    // Test nested object
    const result2 = agent.testResolveValue("{{order.customer}}", context, "order");
    runner.assertEqual(result2, orders[0].customer, "{{order.customer}} should return customer object");

    // Test deeply nested property
    const result3 = agent.testResolveValue("{{order.customer.name}}", context, "order");
    runner.assertEqual(result3, "Alice", "{{order.customer.name}} should resolve to 'Alice'");

    // Test top-level property
    const result4 = agent.testResolveValue("{{order.total}}", context, "order");
    runner.assertEqual(result4, 99.99, "{{order.total}} should resolve to 99.99");
});

// Test 5: Number arrays (scalars)
runner.test('Scalar Array: Numbers', () => {
    const numbers = [1, 2, 3, 4, 5];

    const context = {
        item: numbers[2],  // 3
        index: 2,
        payload: { numbers },
        data: {}
    };

    const result = agent.testResolveValue("{{num}}", context, "num");
    runner.assertEqual(result, 3, "{{num}} should resolve to number 3");
});

// Test 6: Context variables (index, payload, data)
runner.test('Context Variables: index, payload, data', () => {
    const context = {
        item: "test-item",
        index: 5,
        payload: { someData: "payload-value" },
        data: { otherData: "data-value" }
    };

    // Test index
    const result1 = agent.testResolveValue("{{index}}", context, "item");
    runner.assertEqual(result1, 5, "{{index}} should resolve to 5");

    // Test payload property
    const result2 = agent.testResolveValue("{{payload.someData}}", context, "item");
    runner.assertEqual(result2, "payload-value", "{{payload.someData}} should resolve correctly");

    // Test data property
    const result3 = agent.testResolveValue("{{data.otherData}}", context, "item");
    runner.assertEqual(result3, "data-value", "{{data.otherData}} should resolve correctly");
});

// Test 7: Full action params resolution (realistic scenario)
runner.test('Full Template Resolution: Action Parameters', () => {
    const entities = ["Users", "Companies", "Invoices"];

    const context = {
        item: entities[1],  // "Companies"
        index: 1,
        payload: { candidateEntities: entities },
        data: { prefix: "Test_" }
    };

    const actionParams = {
        Name: "{{entityName}}",
        Index: "{{index}}",
        Prefix: "{{data.prefix}}",
        Static: "literal-value"
    };

    const resolved = agent.testResolveTemplates(actionParams, context, "entityName");

    runner.assertEqual(resolved.Name, "Companies", "Name should resolve to 'Companies'");
    runner.assertEqual(resolved.Index, 1, "Index should resolve to 1");
    runner.assertEqual(resolved.Prefix, "Test_", "Prefix should resolve to 'Test_'");
    runner.assertEqual(resolved.Static, "literal-value", "Static values should pass through");
});

// Test 8: Edge cases
runner.test('Edge Cases: Empty strings, null, undefined', () => {
    const context = {
        item: "",
        index: 0,
        payload: {},
        data: {}
    };

    // Empty string item
    const result1 = agent.testResolveValue("{{item}}", context, "item");
    runner.assertEqual(result1, "", "{{item}} should handle empty string");

    // Static value when no match
    const result2 = agent.testResolveValue("{{unknown}}", context, "item");
    runner.assertEqual(result2, "unknown", "Unknown variable should return as literal");

    // Without template wrapper
    const result3 = agent.testResolveValue("item", context, "item");
    runner.assertEqual(result3, "", "Direct reference without {{}} should work");
});

// Test 9: Case insensitivity
runner.test('Case Insensitivity: Variable Names', () => {
    const context = {
        item: "test-value",
        index: 0,
        payload: {},
        data: {}
    };

    // Different cases should all work
    const result1 = agent.testResolveValue("{{EntityName}}", context, "entityName");
    runner.assertEqual(result1, "test-value", "{{EntityName}} should match itemVariable (case insensitive)");

    const result2 = agent.testResolveValue("{{ENTITYNAME}}", context, "entityName");
    runner.assertEqual(result2, "test-value", "{{ENTITYNAME}} should match itemVariable (case insensitive)");

    const result3 = agent.testResolveValue("{{entityname}}", context, "EntityName");
    runner.assertEqual(result3, "test-value", "{{entityname}} should match EntityName (case insensitive)");
});

// Run all tests
runner.run();
