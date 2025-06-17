import { Hook } from '@oclif/core';
import { LoadCoreEntitiesServerSubClasses } from '@memberjunction/core-entities-server';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { cleanupProvider } from '../lib/provider-utils';
import { configManager } from '../lib/config-manager';

const hook: Hook<'init'> = async function () {
  // Capture the original working directory FIRST before any changes
  configManager.getOriginalCwd();
  
  // Load .env from the repository root first
  dotenv.config({ path: path.join(__dirname, '../../../../.env') });
  
  // Then load local .env from package directory to override
  dotenv.config({ 
    path: path.join(__dirname, '../../.env'),
    override: true  // This ensures local values override already loaded ones
  });
  
  // Load core entities server subclasses
  LoadCoreEntitiesServerSubClasses();
  
  // Register cleanup handlers
  process.on('exit', () => {
    cleanupProvider().catch(() => {
      // Ignore errors during cleanup
    });
  });
  
  process.on('SIGINT', async () => {
    await cleanupProvider();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await cleanupProvider();
    process.exit(0);
  });
};

export default hook;