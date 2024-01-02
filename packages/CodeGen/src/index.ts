import dotenv from 'dotenv';
dotenv.config();

import { runMemberJunctionCodeGeneration, initializeConfig } from '@memberjunction/codegen-lib'

initializeConfig(process.cwd());
runMemberJunctionCodeGeneration();