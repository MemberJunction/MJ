#!/usr/bin/env node

/**
 * Entry point for the MemberJunction Component Registry Server
 * 
 * This module starts the Component Registry API Server when run directly.
 * The server can be configured via the mj.config.cjs file in your project root.
 * 
 * Configuration example in mj.config.cjs:
 * ```javascript
 * module.exports = {
 *   // ... other config ...
 *   componentRegistrySettings: {
 *     port: 3200,
 *     enableRegistry: true,
 *     registryId: 'your-registry-guid', // Optional
 *     requireAuth: false,
 *     corsOrigins: ['*']
 *   }
 * }
 * ```
 */

import { startComponentRegistryServer } from './Server.js';

// Export all server components for library use
export * from './Server.js';
export * from './config.js';
export * from './types.js';

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startComponentRegistryServer().catch(error => {
    console.error('Failed to start Component Registry Server:', error);
    process.exit(1);
  });
}