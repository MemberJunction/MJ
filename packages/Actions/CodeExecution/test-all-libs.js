const { CodeExecutionService } = require('./dist/index.js');

async function testAllLibraries() {
    const service = new CodeExecutionService();
    await service.initialize();
    
    const tests = [
        {
            name: 'lodash',
            code: `
                const _ = require('lodash');
                const data = [
                    { category: 'A', value: 10 },
                    { category: 'B', value: 20 },
                    { category: 'A', value: 15 }
                ];
                const grouped = _.groupBy(data, 'category');
                const summed = _.mapValues(grouped, items => _.sumBy(items, 'value'));
                output = { grouped: Object.keys(grouped), sums: summed };
            `,
            inputData: {}
        },
        {
            name: 'date-fns',
            code: `
                const { format, addDays, differenceInDays } = require('date-fns');
                const today = new Date('2024-01-01');
                const future = addDays(today, 30);
                output = {
                    today: format(today, 'yyyy-MM-dd'),
                    future: format(future, 'yyyy-MM-dd'),
                    diff: differenceInDays(future, today)
                };
            `,
            inputData: {}
        },
        {
            name: 'mathjs',
            code: `
                const math = require('mathjs');
                const values = input.values;
                output = {
                    mean: math.mean(values),
                    median: math.median(values),
                    std: math.std(values),
                    variance: math.variance(values)
                };
            `,
            inputData: { values: [10, 20, 30, 40, 50] }
        },
        {
            name: 'papaparse',
            code: `
                const Papa = require('papaparse');
                const parsed = Papa.parse(input.csv, {
                    header: true,
                    dynamicTyping: true
                });
                output = {
                    rowCount: parsed.data.length,
                    headers: parsed.meta.fields,
                    firstRow: parsed.data[0]
                };
            `,
            inputData: { csv: 'name,age,city\\nAlice,30,NYC\\nBob,25,SF' }
        },
        {
            name: 'jstat',
            code: `
                const jStat = require('jstat');
                const data = input.data;
                const mean = jStat.mean(data);
                const stdev = jStat.stdev(data);
                output = {
                    mean: mean,
                    stdev: stdev,
                    normalProb: jStat.normal.cdf(35, mean, stdev)
                };
            `,
            inputData: { data: [20, 25, 30, 35, 40, 45, 50] }
        },
        {
            name: 'uuid',
            code: `
                const uuid = require('uuid');
                const id1 = uuid.v4();
                const id2 = uuid.v4();
                output = {
                    uuid1: id1,
                    uuid2: id2,
                    different: id1 !== id2,
                    validFormat: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id1)
                };
            `,
            inputData: {}
        },
        {
            name: 'validator',
            code: `
                const validator = require('validator');
                output = {
                    emailValid: validator.isEmail('test@example.com'),
                    emailInvalid: validator.isEmail('not-an-email'),
                    urlValid: validator.isURL('https://example.com')
                };
            `,
            inputData: {}
        }
    ];
    
    let allPassed = true;
    
    for (const test of tests) {
        console.log(`\n========================================`);
        console.log(`Testing: ${test.name}`);
        console.log(`========================================`);
        
        try {
            const result = await service.execute({
                code: test.code,
                language: 'javascript',
                inputData: test.inputData,
                timeoutSeconds: 30,
                memoryLimitMB: 128
            });
            
            if (result.success) {
                console.log(`✅ ${test.name} test PASSED`);
                console.log('Output:', JSON.stringify(result.output, null, 2));
                console.log('Execution time:', result.executionTimeMs, 'ms');
                if (result.logs && result.logs.length > 0) {
                    console.log('Logs:', result.logs);
                }
            } else {
                console.log(`❌ ${test.name} test FAILED`);
                console.log('Error:', result.error);
                console.log('Error type:', result.errorType);
                allPassed = false;
            }
        } catch (error) {
            console.log(`❌ ${test.name} test FAILED with exception`);
            console.log('Error:', error.message);
            console.log('Stack:', error.stack);
            allPassed = false;
        }
    }
    
    await service.shutdown();
    
    console.log('\n========================================');
    console.log('Test Summary');
    console.log('========================================');
    if (allPassed) {
        console.log('✅ ALL TESTS PASSED!');
        process.exit(0);
    } else {
        console.log('❌ SOME TESTS FAILED');
        process.exit(1);
    }
}

testAllLibraries().catch(error => {
    console.error('Fatal error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
});
