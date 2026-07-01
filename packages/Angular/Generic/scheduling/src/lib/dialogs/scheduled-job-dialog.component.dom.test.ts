import { describe, it, expect, beforeEach } from 'vitest';
import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { ScheduledJobDialogComponent } from './scheduled-job-dialog.component';

/**
 * DOM spec for <mj-scheduled-job-dialog>. The component's only template logic is the
 * @if (Visible) gate around <mj-dialog> (which wraps the data-bound editor). Both children
 * are left unresolved via NO_ERRORS_SCHEMA — we assert the gating contract, which is the
 * full extent of this wrapper's template behavior. The Close-emit handlers are plain
 * methods covered at the class level.
 */
describe('ScheduledJobDialogComponent (DOM)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CommonModule],
      declarations: [ScheduledJobDialogComponent],
      schemas: [NO_ERRORS_SCHEMA],
    });
  });

  function render(inputs: Record<string, unknown>): ComponentFixture<ScheduledJobDialogComponent> {
    return renderComponentFixture(ScheduledJobDialogComponent, { inputs });
  }

  it('renders nothing when not visible', () => {
    const f = render({ Visible: false });
    expect(query(f, 'mj-dialog')).toBeNull();
  });

  it('renders the dialog and the editor when visible', () => {
    const f = render({ Visible: true });
    expect(query(f, 'mj-dialog')).not.toBeNull();
    expect(query(f, 'mj-scheduled-job-editor')).not.toBeNull();
  });
});
