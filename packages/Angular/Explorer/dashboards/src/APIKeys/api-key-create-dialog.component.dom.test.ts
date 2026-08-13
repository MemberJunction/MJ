import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, text, hasClass, capture } from '@memberjunction/ng-test-utils';
import { APIKeyCreateDialogComponent } from './api-key-create-dialog.component';

/**
 * DOM coverage for <mj-api-key-create-dialog> — a two-step (standalone:false, default-CD) creation
 * wizard. ngOnInit calls loadScopes() which reads the APIKeysEngineBase singleton; unconfigured it
 * returns an empty Scopes array (no throw, no scope categories), keeping that path inert. The tested
 * surface is @Input/local-state driven: the Configure step form, the label-required validation the
 * "Next: Permissions" button enforces (Error → mj-alert; Step advances only when valid), and the
 * close() → VisibleChange(false)/Closed outputs. mj-input/mj-textarea are plain classed native
 * elements (FormsModule handles [(ngModel)]); mj-alert / mjButton are light stubs. Step transitions
 * are event-driven, so each render + click is NG0100-safe. One render per test (TestBed single-use).
 */

@Component({ standalone: true, selector: 'mj-alert', template: '<span class="stub-alert"><ng-content></ng-content></span>' })
class StubAlert { @Input() Variant = ''; }
@Component({ standalone: true, selector: 'button[mjButton]', template: '<ng-content></ng-content>' })
class StubButton { @Input() variant = ''; }

const render = (Visible = true) =>
  renderComponentFixture(APIKeyCreateDialogComponent, {
    imports: [CommonModule, FormsModule, StubAlert, StubButton],
    declarations: [APIKeyCreateDialogComponent],
    inputs: { Visible },
  });

describe('APIKeyCreateDialogComponent (DOM)', () => {
  it('starts on the Configure step with the label field and step indicator', () => {
    const fixture = render();
    expect(query(fixture, '.step-indicator')).not.toBeNull();
    expect(hasClass(fixture, '.step', 'active')).toBe(true); // first step is active
    expect(query(fixture, 'input.form-input')).not.toBeNull();
    expect(query(fixture, '.stub-alert')).toBeNull(); // no error yet
  });

  it('applies the open class and backdrop when Visible', () => {
    const fixture = render(true);
    expect(hasClass(fixture, '.slideout-panel', 'open')).toBe(true);
    expect(query(fixture, '.slideout-backdrop')).not.toBeNull();
  });

  it('shows a validation error and stays on Configure when Next is clicked with no label', () => {
    const fixture = render();
    (query(fixture, '.slideout-footer button[mjButton]') as HTMLElement).click();
    fixture.detectChanges(false);
    expect(fixture.componentInstance.Step).toBe('configure');
    expect(text(fixture, '.stub-alert')).toContain('Please enter a label');
  });

  it('advances to the Permissions step when Next is clicked with a label', () => {
    const fixture = render();
    fixture.componentInstance.Label = 'My New Key';
    (query(fixture, '.slideout-footer button[mjButton]') as HTMLElement).click();
    fixture.detectChanges(false);
    expect(fixture.componentInstance.Step).toBe('scopes');
    // Step-2 panel is now rendered and the Configure label field is gone.
    expect(query(fixture, '.scopes-step')).not.toBeNull();
    expect(query(fixture, 'input.form-input')).toBeNull();
  });

  it('emits VisibleChange(false) and Closed when the close button is clicked', () => {
    const fixture = render();
    const visibleChanges = capture(fixture.componentInstance.VisibleChange);
    const closed = capture(fixture.componentInstance.Closed);
    (query(fixture, '.slideout-close') as HTMLElement).click();
    expect(visibleChanges).toEqual([false]);
    expect(closed.length).toBe(1);
  });
});
