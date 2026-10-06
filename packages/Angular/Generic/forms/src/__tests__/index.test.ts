import { describe, it, expect } from 'vitest';
import * as publicApi from '../public-api';
import { DynamicFormsModule, DynamicFormComponent, DynamicFormFieldComponent } from '../public-api';

/**
 * Entry-point smoke test: importing the public entry must succeed (catches
 * broken exports / import-graph breakage) and the load-bearing symbols the
 * package exists to provide must be real constructors.
 */
describe('@memberjunction/ng-forms', () => {
  it('exposes a non-empty public export surface', () => {
    expect(Object.keys(publicApi).length).toBeGreaterThan(0);
  });

  it('exports its load-bearing classes as constructors', () => {
    expect(DynamicFormsModule).toBeTypeOf('function');
    expect(DynamicFormComponent).toBeTypeOf('function');
    expect(DynamicFormFieldComponent).toBeTypeOf('function');
  });
});
