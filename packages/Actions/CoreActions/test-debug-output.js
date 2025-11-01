/**
 * Debug test to figure out why output might be undefined
 */

const { ExecuteCodeAction } = require('./dist/custom/code-execution/execute-code.action');

async function debugTest() {
    console.log('🔍 Debugging Execute Code Action - Output Issue\n');

    const action = new ExecuteCodeAction();

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

    const runParams = {
        Params: [
            { Name: 'code', Type: 'Input', Value: factorialCode },
            { Name: 'language', Type: 'Input', Value: 'javascript' },
            { Name: 'inputData', Type: 'Input', Value: JSON.stringify({ inputs: [3, 5] }) }
        ],
        UserID: 'test-user',
        EntityID: null,
        RecordID: null
    };

    console.log('📥 Input Parameters:');
    console.log('  code length:', factorialCode.length);
    console.log('  language:', 'javascript');
    console.log('  inputData:', '{"inputs":[3,5]}');
    console.log('');

    try {
        console.log('▶️  Calling action.Run()...\n');
        const result = await action.Run(runParams);

        console.log('📤 Action Result:');
        console.log('  Success:', result.Success);
        console.log('  ResultCode:', result.ResultCode);
        console.log('  Message (type):', typeof result.Message);
        console.log('  Message (length):', result.Message?.length);
        console.log('');

        // Parse the message to see the actual output
        try {
            const parsed = JSON.parse(result.Message);
            console.log('📊 Parsed Message:');
            console.log('  output (type):', typeof parsed.output);
            console.log('  output (value):', parsed.output);
            console.log('  output (length):', parsed.output?.length);
            console.log('  executionTimeMs:', parsed.executionTimeMs);
            console.log('  logs:', parsed.logs);
            console.log('');
        } catch (e) {
            console.log('  ⚠️  Could not parse Message as JSON');
            console.log('  Raw Message:', result.Message);
            console.log('');
        }

        // Check output params
        const outputParams = runParams.Params.filter(p => p.Type === 'Output');
        console.log('📋 Output Parameters in Params array:');
        if (outputParams.length > 0) {
            for (const param of outputParams) {
                console.log(`  ${param.Name}:`, typeof param.Value, param.Value?.length || 'N/A', 'chars');
                if (param.Name === 'output') {
                    console.log('  First 100 chars:', param.Value?.substring(0, 100));
                }
            }
        } else {
            console.log('  ⚠️  No output parameters found!');
        }
        console.log('');

        console.log('✅ Test complete!\n');
        return result;

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
        throw error;
    }
}

debugTest().catch(console.error);
