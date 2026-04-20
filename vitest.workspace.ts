import { defineWorkspace } from 'vitest/config';
import { readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Vitest workspace configuration for MemberJunction monorepo
 * Automatically discovers all packages with vitest.config.ts
 */

function findPackagesWithTests() {
  const packages: string[] = [];
  const searchPaths = [
    'packages',
    'packages/Actions',
    'packages/Actions/BizApps',
    'packages/AI',
    'packages/AI/Providers',
    'packages/Angular',
    'packages/Angular/Explorer',
    'packages/Angular/Generic',
    'packages/Communication',
    'packages/Communication/providers',
    'packages/React',
    'packages/TestingFramework'
  ];

  for (const searchPath of searchPaths) {
    if (!existsSync(searchPath)) continue;

    const dirs = readdirSync(searchPath);
    for (const dir of dirs) {
      const packagePath = join(searchPath, dir);
      try {
        if (statSync(packagePath).isDirectory()) {
          const vitestConfig = join(packagePath, 'vitest.config.ts');
          if (existsSync(vitestConfig)) {
            packages.push(packagePath);
          }
        }
      } catch (err) {
        // Skip directories we can't read
      }
    }
  }

  return packages;
}

const packages = findPackagesWithTests();

console.log(`Found ${packages.length} packages with Vitest configs`);

export default defineWorkspace(packages);
