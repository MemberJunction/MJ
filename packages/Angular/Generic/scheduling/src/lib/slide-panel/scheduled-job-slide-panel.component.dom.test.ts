import { describe, it, expect, beforeEach } from 'vitest';
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MJScheduledJobEntity } from '@memberjunction/core-entities';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { query, text, hasClass, click, capture } from '@memberjunction/ng-test-utils';
import { ScheduledJobSlidePanelComponent } from './scheduled-job-slide-panel.component';

/**
 * DOM spec for <mj-scheduled-job-slide-panel> — a presentational wrapper around the editor.
 * It gates its whole body on IsOpen, renders a title, and emits Close from both the backdrop
 * and the close button. The nested <mj-scheduled-job-editor> is replaced with an explicit
 * stub mirroring its bound inputs/outputs (it's data-bound and tested elsewhere; here we
 * only assert the wrapper's own gating / title / Close wiring).
 */

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

describe('ScheduledJobSlidePanelComponent (DOM)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CommonModule, StubScheduledJobEditorComponent],
      declarations: [ScheduledJobSlidePanelComponent],
    });
  });

  function render(inputs: Record<string, unknown>): ComponentFixture<ScheduledJobSlidePanelComponent> {
    return renderComponentFixture(ScheduledJobSlidePanelComponent, { inputs });
  }

  it('renders nothing when closed', () => {
    const f = render({ IsOpen: false });
    expect(query(f, '.slide-panel')).toBeNull();
    expect(query(f, '.slide-panel-backdrop')).toBeNull();
  });

  it('renders the panel and backdrop when open', () => {
    const f = render({ IsOpen: true });
    expect(query(f, '.slide-panel')).not.toBeNull();
    expect(query(f, '.slide-panel-backdrop')).not.toBeNull();
    expect(hasClass(f, '.slide-panel', 'open')).toBe(true);
  });

  it('shows "Create Schedule" title when no job id', () => {
    const f = render({ IsOpen: true, ScheduledJobID: null });
    expect(text(f, '.header-title span')).toBe('Create Schedule');
  });

  it('shows "Edit Schedule" title when a job id is set', () => {
    const f = render({ IsOpen: true, ScheduledJobID: 'job-9' });
    expect(text(f, '.header-title span')).toBe('Edit Schedule');
  });

  it('emits Close when the backdrop is clicked', () => {
    const f = render({ IsOpen: true });
    const closes = capture(f.componentInstance.Close);
    click(f, '.slide-panel-backdrop');
    expect(closes).toHaveLength(1);
  });

  it('emits Close when the close button is clicked', () => {
    const f = render({ IsOpen: true });
    const closes = capture(f.componentInstance.Close);
    click(f, '.close-btn');
    expect(closes).toHaveLength(1);
  });
});
