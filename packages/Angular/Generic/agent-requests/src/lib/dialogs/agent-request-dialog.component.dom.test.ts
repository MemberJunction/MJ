import { describe, it, expect, beforeEach } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { query } from '@memberjunction/ng-test-utils';
import { AgentRequestDialogComponent } from './agent-request-dialog.component';

/**
 * DOM-level test for AgentRequestDialogComponent's template gating.
 *
 * Only the `@if (Visible)` branch is asserted here: with Visible=false nothing
 * renders and — importantly — ngOnInit does NOT kick off the request-types load
 * (which calls `new RunView()` against the global provider and has no provider
 * seam to fake). The visible/loading branches are deferred to the deferred list:
 * they depend on that backend load, plus the child `mj-agent-request-panel` /
 * `mj-loading` rendering, neither of which this component owns.
 *
 * `mj-agent-request-panel` / `mj-loading` are declared unknown via
 * CUSTOM_ELEMENTS_SCHEMA so the compile doesn't require their real modules.
 */
describe('AgentRequestDialogComponent (DOM)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CommonModule],
      declarations: [AgentRequestDialogComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    });
  });

  it('renders nothing when not visible', () => {
    const fixture = TestBed.createComponent(AgentRequestDialogComponent);
    fixture.componentRef.setInput('Visible', false);
    fixture.detectChanges();
    expect(query(fixture, 'mj-agent-request-panel')).toBeNull();
    expect(query(fixture, '.loading-backdrop')).toBeNull();
  });
});
