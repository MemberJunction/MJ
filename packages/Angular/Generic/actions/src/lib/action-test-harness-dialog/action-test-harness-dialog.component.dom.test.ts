import { describe, it, expect, afterEach } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, text, capture, click } from '@memberjunction/ng-test-utils';
import { ActionTestHarnessDialogComponent } from './action-test-harness-dialog.component';

/**
 * These specs cover only the dialog WRAPPER's data-free surface: open/close gating,
 * header-title fallback, and Close emission. When an Action is bound the wrapper
 * projects the data-bound <mj-action-test-harness> child (GraphQL/UserInfoEngine
 * coupled) — that path is deferred to the harness's own coverage / a live test, so
 * we never bind Action here.
 */
const baseImports = [CommonModule, FormsModule];
const baseDeclarations = [ActionTestHarnessDialogComponent];

describe('ActionTestHarnessDialogComponent (DOM)', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders nothing when IsOpen is false', () => {
    const fixture = renderComponentFixture(ActionTestHarnessDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: false },
    });
    expect(query(fixture, '.dialog-backdrop')).toBeNull();
  });

  it('renders the dialog chrome when IsOpen is true', () => {
    const fixture = renderComponentFixture(ActionTestHarnessDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true },
    });
    expect(query(fixture, '.dialog-backdrop')).not.toBeNull();
    expect(query(fixture, '.dialog-container')).not.toBeNull();
  });

  it('shows the generic title and a loading state when no Action is bound', () => {
    const fixture = renderComponentFixture(ActionTestHarnessDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true },
    });
    expect(text(fixture, '.dialog-title')).toContain('Action Test Harness');
    expect(query(fixture, '.loading-state')).not.toBeNull();
    // child harness must NOT render without an Action
    expect(query(fixture, 'mj-action-test-harness')).toBeNull();
  });

  it('emits Close when the footer Close button is clicked', () => {
    const fixture = renderComponentFixture(ActionTestHarnessDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true },
    });
    const emitted = capture<void>(fixture.componentInstance.Close);
    click(fixture, '.dialog-footer .btn-outline');
    expect(emitted).toHaveLength(1);
  });

  it('emits Close when the header close button is clicked', () => {
    const fixture = renderComponentFixture(ActionTestHarnessDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true },
    });
    const emitted = capture<void>(fixture.componentInstance.Close);
    click(fixture, '.dialog-close-btn');
    expect(emitted).toHaveLength(1);
  });
});
