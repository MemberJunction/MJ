const { CodeExecutionService } = require('./dist/index.js');

async function testLodash() {
    const service = new CodeExecutionService();
    await service.initialize();

    console.log('\n=== Testing JUST simple code (no library) ===');
    const simpleTest = await service.execute({
        code: `
            const numbers = [1, 2, 3, 4, 5];
            const sum = numbers.reduce((a, b) => a + b, 0);
            output = { sum, count: numbers.length };
        `,
        language: 'javascript'
    });
    console.log('Simple test (no require):');
    console.log('  Success:', simpleTest.success);
    console.log('  Output:', JSON.stringify(simpleTest.output, null, 2));
    console.log('  Error:', simpleTest.error);

    console.log('\n=== Testing lodash with require ===');
    const lodashTest = await service.execute({
        code: `
            const _ = require('lodash');
            const numbers = [1, 2, 3, 4, 5];
            const sum = _.sum(numbers);
            output = { sum, mean: _.mean(numbers) };
        `,
        language: 'javascript'
    });
    console.log('Lodash test:');
    console.log('  Success:', lodashTest.success);
    console.log('  Output:', JSON.stringify(lodashTest.output, null, 2));
    console.log('  Error:', lodashTest.error);

    await service.shutdown();
}

testLodash().catch(console.error);
