/**
 * Test script for Execute Code Action
 *
 * This tests the action through the proper action framework
 * to replicate how the Codesmith agent would call it.
 */

const { ExecuteCodeAction } = require('./dist/custom/code-execution/execute-code.action');

async function runTest(testName, params) {
    console.log(`\n========================================`);
    console.log(`TEST: ${testName}`);
    console.log(`========================================`);

    const action = new ExecuteCodeAction();

    // Create RunActionParams structure (how the action framework calls actions)
    const runParams = {
        Params: params,
        UserID: 'test-user',
        EntityID: null,
        RecordID: null
    };

    try {
        const result = await action.Run(runParams);

        console.log('\n✅ Action Result:');
        console.log('  Success:', result.Success);
        console.log('  ResultCode:', result.ResultCode);
        console.log('  Message:', result.Message);

        // Check for output params
        const outputParams = runParams.Params.filter(p => p.Type === 'Output');
        if (outputParams.length > 0) {
            console.log('\n📤 Output Parameters:');
            for (const param of outputParams) {
                console.log(`  ${param.Name}:`, param.Value);
            }
        }

        return result;
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
        throw error;
    }
}

async function test1_SimpleAddition() {
    await runTest('Simple Addition', [
        { Name: 'code', Type: 'Input', Value: 'output = 5 + 3;' },
        { Name: 'language', Type: 'Input', Value: 'javascript' },
        { Name: 'inputData', Type: 'Input', Value: null }
    ]);
}

async function test2_WithInput() {
    await runTest('With Input Data', [
        { Name: 'code', Type: 'Input', Value: 'const sum = input.values.reduce((a,b) => a+b, 0); output = sum;' },
        { Name: 'language', Type: 'Input', Value: 'javascript' },
        { Name: 'inputData', Type: 'Input', Value: JSON.stringify({ values: [1, 2, 3, 4, 5] }) }
    ]);
}

async function test3_FactorialCode() {
    const code = `// Input array of numbers
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

    await runTest('Factorial with Markdown Table', [
        { Name: 'code', Type: 'Input', Value: code },
        { Name: 'language', Type: 'Input', Value: 'javascript' },
        { Name: 'inputData', Type: 'Input', Value: JSON.stringify({ inputs: [3, 5] }) }
    ]);
}

async function main() {
    console.log('🧪 Testing Execute Code Action\n');

    try {
        await test1_SimpleAddition();
        await test2_WithInput();
        await test3_FactorialCode();

        console.log('\n\n✅ All tests completed!\n');
    } catch (error) {
        console.error('\n\n❌ Tests failed!\n');
        process.exit(1);
    }
}

main();
