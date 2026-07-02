#!/usr/bin/env node

/**
 * Scaffold Vitest configuration for a MemberJunction package.
 *
 * Usage:
 *   node scripts/scaffold-tests.mjs packages/MJGlobal
 *   node scripts/scaffold-tests.mjs packages/AI/Engine
 *
 *   # DOM-level Angular component testing (jsdom + TestBed + analog):
 *   node scripts/scaffold-tests.mjs packages/Angular/Generic/my-widget --dom
 *
 * The default (node) preset is for pure-logic / class-level tests. The `--dom`
 * preset stands a package up for DOM-rendering Angular component tests — it
 * emits a `vitest.config.ts` extending `vitest.dom.shared`, a `tsconfig.spec.json`
 * (so the Angular compiler sees the spec files), and a starter ComponentFixture
 * spec. See guides/ANGULAR_TESTING_GUIDE.md.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const args = process.argv.slice(2);
const dom = args.includes('--dom');
const packageDir = args.find((a) => !a.startsWith('--'));

if (!packageDir) {
  console.error('Usage: node scripts/scaffold-tests.mjs <package-directory> [--dom]');
  process.exit(1);
}

// Use fileURLToPath (not URL.pathname) so paths with spaces / special chars and
// Windows drive letters decode correctly — URL.pathname leaves them %20-encoded.
const repoRoot = dirname(fileURLToPath(import.meta.url)).replace('/scripts', '');
const fullPath = join(repoRoot, packageDir);

if (!existsSync(fullPath)) {
  console.error(`Package directory not found: ${fullPath}`);
  process.exit(1);
}

// Calculate relative path to repo root for shared config import
const relPath = relative(fullPath, repoRoot).replace(/\\/g, '/');

// 1. Create vitest.config.ts (node or DOM preset)
const sharedImport = dom ? 'vitest.dom.shared' : 'vitest.shared';
const nodeConfig = `import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '${relPath}/vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineProject({
    test: {
      environment: 'node',
    },
  })
);
`;

const domConfig = `import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '${relPath}/vitest.dom.shared';

// DOM-level Angular component tests: jsdom + analog (Angular compile) + zoneless
// TestBed. See guides/ANGULAR_TESTING_GUIDE.md.
//
// If this package ALSO has class-level specs that \`vi.mock('@angular/core')\`,
// don't use this single-preset config — split into node + dom vitest projects
// instead (see packages/Angular/Generic/pagination/vitest.config.ts).
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '${getPkgName(fullPath)}',
    },
  })
);
`;

writeIfAbsent(join(fullPath, 'vitest.config.ts'), dom ? domConfig : nodeConfig);

// 1b. DOM packages need a tsconfig.spec.json so the Angular compiler includes
//     spec files in its program (the build tsconfig usually excludes *.test.ts).
if (dom) {
  const specTsconfig = `{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["vitest/globals", "node"]
  },
  "include": [
    "src/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "dist"
  ]
}
`;
  writeIfAbsent(join(fullPath, 'tsconfig.spec.json'), specTsconfig);
}

// 2. Create src/__tests__/ directory
const testDir = join(fullPath, 'src', '__tests__');
mkdirSync(testDir, { recursive: true });
console.log(`  Created ${testDir}/`);

// 3. Read package.json to get package name
const pkgJsonPath = join(fullPath, 'package.json');
const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
const pkgName = pkgJson.name || 'unknown';

// 4. Create starter test file
const nodeStarter = `import { describe, it, expect } from 'vitest';

describe('${pkgName}', () => {
  it('should have a passing test', () => {
    expect(true).toBe(true);
  });
});
`;

// A self-contained DOM starter: an inline standalone component rendered through
// TestBed, so it passes out of the box and shows the pattern. Replace it with a
// spec for a real component (import it, set @Inputs via setInput, drive DOM
// events, assert on fixture.nativeElement and @Output emissions).
const domStarter = `import { describe, it, expect } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

@Component({
  standalone: true,
  template: \`<button class="demo" (click)="Count = Count + 1">{{ Count }}</button>\`,
})
class DemoComponent {
  Count = 0;
}

describe('${pkgName} (DOM harness)', () => {
  it('renders a component into the DOM and reacts to a click', () => {
    const fixture = TestBed.createComponent(DemoComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button.demo') as HTMLButtonElement;

    expect(button.textContent?.trim()).toBe('0');
    button.click();
    fixture.detectChanges();
    expect(button.textContent?.trim()).toBe('1');
  });
});
`;

const starterName = dom ? 'harness.dom.test.ts' : 'index.test.ts';
writeIfAbsent(join(testDir, starterName), dom ? domStarter : nodeStarter);

// 5. Update package.json scripts
let modified = false;
if (!pkgJson.scripts) pkgJson.scripts = {};

if (!pkgJson.scripts.test || pkgJson.scripts.test.includes('echo "Error')) {
  pkgJson.scripts.test = 'vitest run';
  modified = true;
}
if (!pkgJson.scripts['test:watch']) {
  pkgJson.scripts['test:watch'] = 'vitest';
  modified = true;
}

// Add vitest to devDependencies if not present
if (!pkgJson.devDependencies) pkgJson.devDependencies = {};
if (!pkgJson.devDependencies.vitest) {
  pkgJson.devDependencies.vitest = '^4.0.18';
  modified = true;
}

if (modified) {
  writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8');
  console.log(`  Updated ${pkgJsonPath}`);
}

console.log(`\nDone! Package ${pkgName} is ready for ${dom ? 'DOM ' : ''}testing.`);
console.log(`Run tests with: cd ${packageDir} && npm run test`);
if (dom) {
  console.log(
    `\nThe DOM preset needs the repo-level devDeps @analogjs/vite-plugin-angular,\n` +
      `@angular/build and jsdom (already in the root package.json). Run \`npm install\`\n` +
      `at the repo root if they are not yet installed.`,
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────
function writeIfAbsent(path, contents) {
  if (!existsSync(path)) {
    writeFileSync(path, contents, 'utf-8');
    console.log(`  Created ${path}`);
  } else {
    console.log(`  Skipped ${path} (already exists)`);
  }
}

function getPkgName(pkgPath) {
  try {
    return JSON.parse(readFileSync(join(pkgPath, 'package.json'), 'utf-8')).name || 'unknown';
  } catch {
    return 'unknown';
  }
}
