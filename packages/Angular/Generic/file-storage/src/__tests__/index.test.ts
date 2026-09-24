import { describe, it, expect } from 'vitest';
import * as publicApi from '../public-api';
import { FileStorageModule, CategoryTreeComponent, FileOpenService } from '../public-api';

/**
 * Entry-point smoke test: importing the public entry must succeed (catches
 * broken exports / import-graph breakage) and the load-bearing symbols the
 * package exists to provide must be real constructors.
 */
describe('@memberjunction/ng-file-storage', () => {
  it('exposes a non-empty public export surface', () => {
    expect(Object.keys(publicApi).length).toBeGreaterThan(0);
  });

  it('exports its load-bearing classes as constructors', () => {
    expect(FileStorageModule).toBeTypeOf('function');
    expect(CategoryTreeComponent).toBeTypeOf('function');
    expect(FileOpenService).toBeTypeOf('function');
  });
});
