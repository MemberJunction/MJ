// Load the JIT compiler BEFORE any Angular library evaluates: npm-published Angular
// packages ship partial declarations whose static initializers need the compiler facade.
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import * as publicApi from '../public-api';
import { AgentRequestsModule, AgentRequestPanelComponent, AgentRequestDialogComponent } from '../public-api';

/**
 * Entry-point smoke test: importing the public entry must succeed (catches
 * broken exports / import-graph breakage) and the load-bearing symbols the
 * package exists to provide must be real constructors.
 */
describe('@memberjunction/ng-agent-requests', () => {
  it('exposes a non-empty public export surface', () => {
    expect(Object.keys(publicApi).length).toBeGreaterThan(0);
  });

  it('exports its load-bearing classes as constructors', () => {
    expect(AgentRequestsModule).toBeTypeOf('function');
    expect(AgentRequestPanelComponent).toBeTypeOf('function');
    expect(AgentRequestDialogComponent).toBeTypeOf('function');
  });
});
