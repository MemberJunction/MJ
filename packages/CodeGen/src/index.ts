import dotenv from 'dotenv';
dotenv.config();

import { runMemberJunctionCodeGeneration, initializeConfig } from '@memberjunction/codegen-lib';

// Initialize configuration
initializeConfig(process.cwd());

// Check for the '-skipdb' command-line argument
const skipDb = process.argv.includes('-skipdb');

// Call the function with the determined argument
runMemberJunctionCodeGeneration(skipDb);