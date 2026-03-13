import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';

describe('@memberjunction/ng-data-context', () => {
  it('should have a public API entry point', () => {
    const pkgRoot = resolve(__dirname, '../..');
    const hasPublicApi = existsSync(resolve(pkgRoot, 'src/public-api.ts'));
    const hasIndex = existsSync(resolve(pkgRoot, 'src/index.ts'));
    expect(hasPublicApi || hasIndex).toBe(true);
  });

  it('should have a package.json with correct name', () => {
    const pkgRoot = resolve(__dirname, '../..');
    const pkg = require(resolve(pkgRoot, 'package.json'));
    expect(pkg.name).toBe('@memberjunction/ng-data-context');
  });
});
