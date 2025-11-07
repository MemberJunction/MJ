const { CodeExecutionService } = require('./dist/index.js');

async function test() {
    const service = new CodeExecutionService();
    await service.initialize();
    
    // Ultra simple test
    const result1 = await service.execute({
        code: `output = { test: 'simple' };`,
        language: 'javascript',
        inputData: {}
    });
    console.log('Test 1 (simple):', JSON.stringify(result1));
    
    // Test with lodash
    const result2 = await service.execute({
        code: `
            const _ = require('lodash');
            output = { sum: _.sum([1,2,3]) };
        `,
        language: 'javascript',
        inputData: {}
    });
    console.log('Test 2 (lodash):', JSON.stringify(result2));
    
    await service.shutdown();
}

test();
