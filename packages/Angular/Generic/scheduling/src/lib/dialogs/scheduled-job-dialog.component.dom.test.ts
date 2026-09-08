import { describe, it, expect, beforeEach } from 'vitest';
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MJScheduledJobEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { ScheduledJobDialogComponent } from './scheduled-job-dialog.component';

/**
 * DOM spec for <mj-scheduled-job-dialog>. The component's only template logic is the
 * @if (Visible) gate around <mj-dialog> (which wraps the data-bound editor). Both children
 * are replaced with explicit stubs mirroring their bound inputs/outputs — we assert the
 * gating contract, which is the full extent of this wrapper's template behavior. The
 * Close-emit handlers are plain methods covered at the class level.
 */

/** Stub for <mj-dialog> — mirrors the inputs/outputs bound in the dialog template. */
@Component({
  standalone: true,
  selector: 'mj-dialog',
  template: '<ng-content></ng-content>',
})
class StubDialogComponent {
  @Input() Visible = false;
  @Input() Title = '';
  @Input() Width = 0;
  @Output() Close = new EventEmitter<void>();
}

/** Stub for <mj-scheduled-job-editor> — mirrors the inputs/outputs bound in the template. */
@Component({
  standalone: true,
  selector: 'mj-scheduled-job-editor',
  template: '',
})
class StubScheduledJobEditorComponent {
  @Input() ScheduledJobID: string | null = null;
  @Input() JobTypeID: string | null = null;
  @Input() DefaultConfiguration: string | null = null;
  @Input() HideJobType = false;
  @Output() Saved = new EventEmitter<MJScheduledJobEntity>();
  @Output() Deleted = new EventEmitter<string>();
  @Output() Cancelled = new EventEmitter<void>();
}

describe('ScheduledJobDialogComponent (DOM)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CommonModule, StubDialogComponent, StubScheduledJobEditorComponent],
      declarations: [ScheduledJobDialogComponent],
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
