#!/usr/bin/env node

// Test script to verify async error catching improvements
const { ReactTestHarness } = require('./dist/index.js');

async function runAsyncErrorTests() {
  console.log('Testing async error capture improvements...\n');
  
  const harness = new ReactTestHarness({
    headless: true,
    debug: false
  });

  try {
    await harness.initialize();

    // Test 1: Component with immediate error (should be caught)
    console.log('Test 1: Immediate error in render');
    const componentCode1 = `
      const Component = () => {
        const data = null;
        return <div>{data.property}</div>; // Immediate error
      };
    `;
    const test1 = await harness.testComponentCode(componentCode1, {});
    console.log('  Success:', test1.success);
    console.log('  Errors:', test1.errors.length);
    if (test1.errors.length > 0) {
      console.log('  First error:', test1.errors[0].message || test1.errors[0]);
    }
    console.log('');

    // Test 2: Component with delayed error (should be caught with new changes)
    console.log('Test 2: Delayed error after 1.5 seconds');
    const test2 = await harness.testComponentCode(`
      const Component = () => {
        React.useEffect(() => {
          setTimeout(() => {
            throw new Error('Async error after 1.5 seconds');
          }, 1500);
        }, []);
        
        return <div>Component renders fine initially</div>;
      };
    `);
    console.log('  Success:', test2.success);
    console.log('  Errors:', test2.errors.length);
    if (test2.errors.length > 0) {
      console.log('  Errors found:', test2.errors.map(e => e.message || e));
    }
    console.log('');

    // Test 3: Unhandled promise rejection (should be caught with new changes)
    console.log('Test 3: Unhandled promise rejection after 1 second');
    const test3 = await harness.testComponentCode(`
      const Component = () => {
        React.useEffect(() => {
          // Simulate async operation that fails
          new Promise((resolve, reject) => {
            setTimeout(() => {
              reject(new Error('Promise rejected after 1 second'));
            }, 1000);
          });
        }, []);
        
        return <div>Component with async promise</div>;
      };
    `);
    console.log('  Success:', test3.success);
    console.log('  Errors:', test3.errors.length);
    if (test3.errors.length > 0) {
      console.log('  Errors found:', test3.errors.map(e => e.message || e));
    }
    console.log('');

    // Test 4: Async fetch error (should be caught)
    console.log('Test 4: Failed fetch operation after 500ms');
    const test4 = await harness.testComponentCode(`
      const Component = () => {
        React.useEffect(() => {
          setTimeout(() => {
            fetch('/api/nonexistent')
              .then(res => res.json())
              .then(data => {
                // This will fail because fetch will likely fail
                console.log(data.missingProperty.value);
              })
              .catch(err => {
                // Throw to make it an unhandled error
                throw new Error('Fetch failed: ' + err.message);
              });
          }, 500);
        }, []);
        
        return <div>Component with fetch</div>;
      };
    `);
    console.log('  Success:', test4.success);
    console.log('  Errors:', test4.errors.length);
    if (test4.errors.length > 0) {
      console.log('  Errors found:', test4.errors.map(e => e.message || e));
    }
    console.log('');

    // Test 5: Multiple async errors at different times
    console.log('Test 5: Multiple async errors at different times');
    const test5 = await harness.testComponentCode(`
      const Component = () => {
        React.useEffect(() => {
          // Error at 500ms
          setTimeout(() => {
            console.error('First async error at 500ms');
            throw new Error('Error at 500ms');
          }, 500);
          
          // Promise rejection at 1500ms
          setTimeout(() => {
            Promise.reject('Promise rejection at 1500ms');
          }, 1500);
          
          // Another error at 2500ms
          setTimeout(() => {
            const obj = undefined;
            obj.doSomething(); // Will throw
          }, 2500);
        }, []);
        
        return <div>Component with multiple async errors</div>;
      };
    `);
    console.log('  Success:', test5.success);
    console.log('  Errors:', test5.errors.length);
    if (test5.errors.length > 0) {
      console.log('  All errors found:');
      test5.errors.forEach(e => console.log('    -', e.message || e));
    }
    console.log('');

    // Test 6: Clean component (should succeed)
    console.log('Test 6: Clean component with no errors');
    const test6 = await harness.testComponentCode(`
      const Component = () => {
        const [count, setCount] = React.useState(0);
        
        React.useEffect(() => {
          const timer = setTimeout(() => {
            setCount(1);
          }, 1000);
          
          return () => clearTimeout(timer);
        }, []);
        
        return <div>Count: {count}</div>;
      };
    `);
    console.log('  Success:', test6.success);
    console.log('  Errors:', test6.errors.length);
    console.log('');

    console.log('Summary:');
    console.log('- Test 1 (immediate error):', test1.success ? '❌ PASSED (should fail)' : '✅ FAILED (expected)');
    console.log('- Test 2 (delayed error):', test2.success ? '❌ PASSED (should fail)' : '✅ FAILED (expected)');
    console.log('- Test 3 (promise rejection):', test3.success ? '❌ PASSED (should fail)' : '✅ FAILED (expected)');
    console.log('- Test 4 (fetch error):', test4.success ? '❌ PASSED (should fail)' : '✅ FAILED (expected)');
    console.log('- Test 5 (multiple errors):', test5.success ? '❌ PASSED (should fail)' : '✅ FAILED (expected)');
    console.log('- Test 6 (clean component):', test6.success ? '✅ PASSED (expected)' : '❌ FAILED (should pass)');

  } catch (error) {
    console.error('Test execution failed:', error);
  } finally {
    await harness.close();
  }
}

runAsyncErrorTests().catch(console.error);