import { LoadCoreEntitiesServerSubClasses } from '@memberjunction/core-entities-server';
LoadCoreEntitiesServerSubClasses(); // prevent tree shaking
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from the repository root
dotenv.config({ path: path.join(__dirname, '../../../.env') });

export { run } from '@oclif/core';