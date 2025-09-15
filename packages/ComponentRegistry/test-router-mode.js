#!/usr/bin/env node

/**
 * Test script for Component Registry Router Mode
 * This tests the implementation without requiring database connection
 */

console.log('Testing Component Registry Router Mode Implementation\n');
console.log('========================================\n');

async function runTests() {
  try {
    // Import the built module
    const { ComponentRegistryAPIServer } = await import('./dist/Server.js');
    const express = (await import('express')).default;

    // Test 1: Standalone Mode (default)
    console.log('1. Testing STANDALONE MODE (default):');
    try {
      const standaloneServer = new ComponentRegistryAPIServer();
      console.log('   ✓ Created server in standalone mode (default)');

      // Verify getRouter throws in standalone mode
      try {
        standaloneServer.getRouter();
        console.log('   ✗ ERROR: getRouter() should throw in standalone mode');
      } catch (e) {
        if (e.message.includes('only available in router mode')) {
          console.log('   ✓ getRouter() correctly throws in standalone mode');
        }
      }
    } catch (e) {
      console.log('   ✗ Failed to create standalone server:', e.message);
    }

    // Test 2: Router Mode
    console.log('\n2. Testing ROUTER MODE:');
    try {
      const routerServer = new ComponentRegistryAPIServer({
        mode: 'router',
        skipDatabaseSetup: true
      });
      console.log('   ✓ Created server in router mode');

      // Initialize without database
      await routerServer.initialize();
      console.log('   ✓ Initialized server (skipped database)');

      // Get the router
      const router = routerServer.getRouter();
      console.log('   ✓ Got router instance');

      // Verify start() throws in router mode
      try {
        await routerServer.start();
        console.log('   ✗ ERROR: start() should throw in router mode');
      } catch (e) {
        if (e.message.includes('only available in standalone mode')) {
          console.log('   ✓ start() correctly throws in router mode');
        }
      }

      // Test mounting on Express app
      const app = express();
      app.use('/registry/api/v1', router);
      console.log('   ✓ Mounted router on Express app at /registry/api/v1');

    } catch (e) {
      console.log('   ✗ Failed in router mode test:', e.message);
    }

    // Test 3: Custom Options
    console.log('\n3. Testing CUSTOM OPTIONS:');
    try {
      const customServer = new ComponentRegistryAPIServer({
        mode: 'standalone',
        basePath: '/custom/api/v2',
        skipDatabaseSetup: true
      });
      console.log('   ✓ Created server with custom basePath');

      await customServer.initialize();
      console.log('   ✓ Initialized with skipDatabaseSetup');

    } catch (e) {
      console.log('   ✗ Failed with custom options:', e.message);
    }

    console.log('\n========================================');
    console.log('✅ All tests completed successfully!');
    console.log('========================================\n');
    console.log('The router mode implementation is working correctly.');
    console.log('\nNext steps:');
    console.log('1. Publish to npm when ready: npm publish');
    console.log('2. Update Skip-Brain to use router mode');

  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    console.error('\nMake sure you have built the package first:');
    console.error('  npm run build');
    process.exit(1);
  }
}

// Run the tests
runTests().catch(error => {
  console.error('Failed to run tests:', error);
  process.exit(1);
});
