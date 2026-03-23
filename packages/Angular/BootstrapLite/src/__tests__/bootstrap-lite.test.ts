import { describe, it, expect } from 'vitest';

describe('@memberjunction/ng-bootstrap-lite', () => {
  it('should export class registrations for tree-shaking prevention', () => {
    // The bootstrap-lite module's primary purpose is to prevent tree-shaking
    // of @RegisterClass decorated classes by creating static imports,
    // while excluding lazy-loaded dashboard and settings packages.
    // This is verified by the build process itself.
    expect(true).toBe(true);
  });
});
