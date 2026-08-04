import { describe, it, expect, beforeEach } from 'vitest';
import { of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { query, queryAll, text, click, typeInto, capture } from '@memberjunction/ng-test-utils';
import { FeedbackFormComponent } from './feedback-form.component';
import { FeedbackConfig, FEEDBACK_CONFIG } from '../feedback.config';
import { FeedbackService } from '../services/feedback.service';
import { FeedbackResponse, FeedbackSubmission } from '../feedback.types';

/**
 * DOM-level spec for <mj-feedback-form>.
 *
 * mj-dialog projects its content inline (native <dialog> markup rendered directly into
 * the component's own DOM when Visible) — no CDK overlay/portal — so the whole form
 * surface lands in fixture.nativeElement and is assertable here.
 *
 * FeedbackService is faked at the seam: Classify is stubbed out (the debounced LLM call
 * is timer-driven and not exercised here) and Submit returns a configurable Observable so
 * we can drive the success / error branches. No GraphQL, no network.
 */
describe('FeedbackFormComponent (DOM)', () => {
  let submitResult: FeedbackResponse;

  const fakeService: Pick<FeedbackService, 'Classify' | 'Submit'> = {
    Classify: async () => null,
    Submit: () => of(submitResult),
  };

  function configure(config: Partial<FeedbackConfig> = {}) {
    TestBed.configureTestingModule({
      providers: [
        { provide: FEEDBACK_CONFIG, useValue: { appName: 'Test App', ...config } satisfies FeedbackConfig },
        { provide: FeedbackService, useValue: fakeService },
      ],
    });
  }

  /**
   * Render in the zoneless-correct order: apply any internal-state mutations BEFORE the
   * first detectChanges() so the single render sees final values (avoids NG0100 — these
   * form fields are plain public properties, not @Inputs, so setInput isn't available).
   */
  function render(setup?: (instance: FeedbackFormComponent) => void): ComponentFixture<FeedbackFormComponent> {
    const fixture = TestBed.createComponent(FeedbackFormComponent);
    setup?.(fixture.componentInstance);
    fixture.detectChanges();
    return fixture;
  }

  function fillValidForm(instance: FeedbackFormComponent): void {
    instance.Title = 'A valid title';
    instance.Description = 'This description is definitely long enough to pass.';
    instance.CertificationAccepted = true;
  }

  beforeEach(() => {
    submitResult = { success: true, issueNumber: 42, issueUrl: 'https://example.com/issue/42' };
  });

  it('renders the dialog with the default title and the privacy notice', () => {
    configure();
    const fixture = render();
    expect(query(fixture, '.mj-dialog-backdrop')).not.toBeNull();
    expect(text(fixture, '.mj-dialog-title')).toBe('Submit Feedback');
    expect(query(fixture, '.feedback-privacy-notice')).not.toBeNull();
  });

  it('uses the configured title and shows the subtitle when provided', () => {
    configure({ title: 'Report an Issue', subtitle: 'Help us improve' });
    const fixture = render();
    expect(text(fixture, '.mj-dialog-title')).toBe('Report an Issue');
    expect(text(fixture, '.feedback-subtitle')).toBe('Help us improve');
  });

  it('omits the subtitle element when no subtitle is configured', () => {
    configure();
    const fixture = render();
    expect(query(fixture, '.feedback-subtitle')).toBeNull();
  });

  it('shows the title and description fields, defaulting to the bug category', () => {
    configure();
    const fixture = render();
    // Default Category is 'bug' → bug-specific steps-to-reproduce section renders
    const labels = queryAll(fixture, '.feedback-label').map((l) => l.textContent?.trim() ?? '');
    expect(labels.some((l) => l.startsWith('Title'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Description'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Steps to Reproduce'))).toBe(true);
  });

  it('marks the title char-count as warning when below the 5-char minimum', () => {
    configure();
    const fixture = render();
    typeInto(fixture, 'input.mj-input', 'abc');
    fixture.detectChanges();
    const titleSection = query(fixture, '.feedback-section');
    const charCount = titleSection?.querySelector('.char-count');
    expect(charCount?.classList.contains('warning')).toBe(true);
    expect(charCount?.textContent).toContain('3/256');
  });

  it('swaps bug-specific fields for feature-specific fields when Category is feature', () => {
    configure();
    const fixture = render((i) => (i.Category = 'feature'));
    const labels = queryAll(fixture, '.feedback-label').map((l) => l.textContent?.trim() ?? '');
    expect(labels.some((l) => l.startsWith('Use Case'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Steps to Reproduce'))).toBe(false);
  });

  it('disables the submit button while the form is invalid (CanSubmit)', () => {
    configure();
    const fixture = render();
    const submitBtn = query(fixture, 'mj-dialog-actions button[mjButton][variant="primary"]') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it('enables the submit button once all CanSubmit conditions are met', () => {
    configure();
    const fixture = render(fillValidForm);
    const submitBtn = query(fixture, 'mj-dialog-actions button[mjButton][variant="primary"]') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);
  });

  it('renders the success state with the issue link after a successful submit', () => {
    configure();
    // Fill valid state BEFORE the first detectChanges (these are plain props bound via
    // [(ngModel)], so mutating after the initial render triggers NG0100 in zoneless mode).
    const fixture = render(fillValidForm);

    click(fixture, 'mj-dialog-actions button[mjButton][variant="primary"]');
    fixture.detectChanges();

    expect(query(fixture, '.feedback-success')).not.toBeNull();
    const link = query(fixture, '.feedback-success a') as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('https://example.com/issue/42');
    expect(text(fixture, '.feedback-success a')).toContain('42');
  });

  it('renders an error message when the submit response is unsuccessful', () => {
    configure();
    submitResult = { success: false, error: 'Server rejected the submission' };
    const fixture = render(fillValidForm);

    click(fixture, 'mj-dialog-actions button[mjButton][variant="primary"]');
    fixture.detectChanges();

    expect(query(fixture, '.feedback-success')).toBeNull();
    expect(text(fixture, '.feedback-error')).toContain('Server rejected the submission');
  });

  it('emits Cancelled and DialogClosed when the Cancel button is clicked', () => {
    configure();
    const fixture = render();
    const cancelled = capture(fixture.componentInstance.Cancelled);
    const closed = capture(fixture.componentInstance.DialogClosed);

    // Cancel is the second action button (after the primary Submit)
    const buttons = queryAll(fixture, 'mj-dialog-actions button[mjButton]') as HTMLButtonElement[];
    const cancelBtn = buttons.find((b) => b.textContent?.trim() === 'Cancel');
    expect(cancelBtn).toBeDefined();
    cancelBtn!.click();
    fixture.detectChanges();

    expect(cancelled.length).toBe(1);
    expect(closed).toEqual([{ success: false }]);
  });

  it('emits the built submission via Submitted on submit', () => {
    configure();
    // Fill valid state BEFORE the first detectChanges (these are plain props bound via
    // [(ngModel)], so mutating after the initial render triggers NG0100 in zoneless mode).
    const fixture = render(fillValidForm);
    const submitted = capture<FeedbackSubmission>(fixture.componentInstance.Submitted);

    click(fixture, 'mj-dialog-actions button[mjButton][variant="primary"]');
    fixture.detectChanges();

    expect(submitted.length).toBe(1);
    expect(submitted[0].title).toBe('A valid title');
    expect(submitted[0].category).toBe('bug');
  });
});
