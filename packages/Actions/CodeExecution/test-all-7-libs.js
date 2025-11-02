const { CodeExecutionService } = require('./dist/index.js');

async function testAllLibraries() {
    const service = new CodeExecutionService();
    await service.initialize();

    const tests = [
        {
            name: 'lodash',
            code: `
                const _ = require('lodash');
                const numbers = [1, 2, 3, 4, 5];
                output = { sum: _.sum(numbers), mean: _.mean(numbers) };
            `
        },
        {
            name: 'date-fns',
            code: `
                const { format, addDays } = require('date-fns');
                const today = new Date('2025-01-01');
                const future = addDays(today, 7);
                output = { formatted: format(future, 'yyyy-MM-dd') };
            `
        },
        {
            name: 'uuid',
            code: `
                const { v4 } = require('uuid');
                const id = v4();
                output = { hasUUID: id.length === 36 && id.includes('-') };
            `
        },
        {
            name: 'validator',
            code: `
                const validator = require('validator');
                output = { 
                    email: validator.isEmail('test@example.com'),
                    notEmail: validator.isEmail('notanemail')
                };
            `
        },
        {
            name: 'mathjs',
            code: `
                const math = require('mathjs');
                const values = [1, 2, 3, 4, 5];
                output = { 
                    mean: math.mean(values),
                    median: math.median(values),
                    std: math.std(values)
                };
            `
        },
        {
            name: 'papaparse',
            code: `
                const Papa = require('papaparse');
                const csv = 'name,age\\nAlice,30\\nBob,25';
                const parsed = Papa.parse(csv, { header: true });
                output = { rowCount: parsed.data.length };
            `
        },
        {
            name: 'jstat',
            code: `
                const jStat = require('jstat');
                const values = [1, 2, 3, 4, 5];
                output = { 
                    mean: jStat.mean(values),
                    stdev: jStat.stdev(values)
                };
            `
        }
    ];

    console.log('\n========================================');
    console.log('Testing All 7 Libraries');
    console.log('========================================\n');

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        console.log(`\nTesting ${test.name}...`);
        const result = await service.execute({
            code: test.code,
            language: 'javascript'
        });

        if (result.success && result.output) {
            console.log(`✅ ${test.name}: PASS`);
            console.log(`   Output:`, JSON.stringify(result.output, null, 2));
            passed++;
        } else {
            console.log(`❌ ${test.name}: FAIL`);
            console.log(`   Error: ${result.error}`);
            console.log(`   Output:`, result.output);
            failed++;
        }
    }

    console.log('\n========================================');
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('========================================\n');

    await service.shutdown();
    process.exit(failed > 0 ? 1 : 0);
}

testAllLibraries().catch(err => {
    console.error('Test suite error:', err);
    process.exit(1);
});
