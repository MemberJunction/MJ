import { Hook } from '@oclif/core';
import * as dotenv from 'dotenv';
import * as path from 'path';

/**
 * Init hook runs once when the CLI starts up.
 * Load environment variables from .env file.
 */
const hook: Hook<'init'> = async function () {
  // Load environment variables from .env file in repo root
  const envPath = path.resolve(process.cwd(), '.env');
  dotenv.config({ path: envPath });
};

export default hook;