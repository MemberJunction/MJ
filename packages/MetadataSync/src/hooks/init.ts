import { Hook } from '@oclif/core';
import { LoadCoreEntitiesServerSubClasses } from '@memberjunction/core-entities-server';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { cleanupProvider } from '../lib/provider-utils';

const hook: Hook<'init'> = async function () {
  // Load .env from the repository root first
  dotenv.config({ path: path.join(__dirname, '../../../../.env') });
  
  // Then load local .env from package directory to override
  dotenv.config({ path: path.join(__dirname, '../../.env') });
  
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