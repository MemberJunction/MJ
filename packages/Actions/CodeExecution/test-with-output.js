const { CodeExecutionService } = require('./dist/index.js');

async function quickTest() {
    const service = new CodeExecutionService();
    await service.initialize();
    
    // Test lodash
    const result = await service.execute({
        code: `
            const _ = require('lodash');
            const sum = _.sum([1, 2, 3, 4, 5]);
            console.log('Sum:', sum);
            output = { sum: sum, library: 'lodash' };
        `,
        language: 'javascript',
        inputData: {}
    });
    
    console.log('Result:', JSON.stringify(result, null, 2));
    
    await service.shutdown();
}

quickTest();
