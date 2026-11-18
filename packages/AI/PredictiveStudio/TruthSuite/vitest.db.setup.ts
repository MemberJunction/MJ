// Loads the repository root's .env before the database tests run. Resolved from this file, not the cwd: `pnpm run
// test:db` runs from the package folder, where BootstrapIntegrationServer's own LoadEnv() finds no .env. dotenv never
// overrides a variable the shell already exports.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
dotenv.config({ path: path.join(repoRoot, '.env'), quiet: true });
