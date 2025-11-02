/**
 * Test invoking the Execute Code action through the MJ action framework
 * This replicates how the Codesmith agent would actually call it
 */

const { ActionEngineServer } = require('@memberjunction/actions');
const { Metadata } = require('@memberjunction/core');

async function testActionInvocation() {
    console.log('🧪 Testing Execute Code Action via Action Engine\n');

    // Initialize metadata
    const md = new Metadata();

    // Create a user context (required for server-side operations)
    const contextUser = {
        ID: 'test-user-123',
        Name: 'Test User',
        Email: 'test@example.com'
    };

    const actionEngine = ActionEngineServer.Instance;

    // Test 1: Simple addition
    console.log('========================================');
    console.log('TEST 1: Simple Addition via Action Engine');
    console.log('========================================\n');

    const params1 = [
        { Name: 'code', Value: 'output = 5 + 3;' },
        { Name: 'language', Value: 'javascript' }
    ];

    try {
        const result1 = await actionEngine.RunAction({
            ActionName: 'Execute Code',
            Params: params1,
            ContextUser: contextUser
        });

        console.log('Result:', JSON.stringify(result1, null, 2));
        console.log('\n');
    } catch (error) {
        console.error('Error:', error.message);
    }

    // Test 2: Factorial markdown
    console.log('========================================');
    console.log('TEST 2: Factorial Markdown via Action Engine');
    console.log('========================================\n');

    const factorialCode = `// Input array of numbers
const numbers = input.inputs || [];

// Recursive factorial that records each multiplication step
function factorialSteps(n) {
  if (n === 0 || n === 1) {
    return { value: 1, steps: ["1"] };
  }
  const prev = factorialSteps(n - 1);
  const current = n * prev.value;
  const step = \`\${n} * \${prev.value} = \${current}\`;
  return { value: current, steps: [...prev.steps, step] };
}

// Build markdown table
let markdown = "| Input | Factorial | Calculation Steps |\\n";
markdown += "|-------|----------|-------------------|\\n";
for (const num of numbers) {
  const res = factorialSteps(num);
  const steps = res.steps.join(" <br> ");
  markdown += \`| \${num} | \${res.value} | \${steps} |\\n\`;
}

// Return result as a plain string (the markdown)
output = markdown;`;

    const params2 = [
        { Name: 'code', Value: factorialCode },
        { Name: 'language', Value: 'javascript' },
        { Name: 'inputData', Value: JSON.stringify({ inputs: [3, 5] }) }
    ];

    try {
        const result2 = await actionEngine.RunAction({
            ActionName: 'Execute Code',
            Params: params2,
            ContextUser: contextUser
        });

        console.log('Result:', JSON.stringify(result2, null, 2));
        console.log('\n');
    } catch (error) {
        console.error('Error:', error.message);
    }

    console.log('✅ Action Engine tests completed!\n');
}

testActionInvocation().catch(console.error);
