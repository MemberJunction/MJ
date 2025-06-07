import { Hook } from '@oclif/core';
import { LoadCoreEntitiesServerSubClasses } from '@memberjunction/core-entities-server';
import * as dotenv from 'dotenv';
import * as path from 'path';

const hook: Hook<'init'> = async function () {
  console.log('MetadataSync CLI initializing...');
  
  // Load .env from the repository root
  dotenv.config({ path: path.join(__dirname, '../../../../.env') });
  
  // Load core entities server subclasses
  console.log('Loading core entities server subclasses...');
  LoadCoreEntitiesServerSubClasses();
  
  console.log('MetadataSync CLI initialization complete');
};

export default hook;