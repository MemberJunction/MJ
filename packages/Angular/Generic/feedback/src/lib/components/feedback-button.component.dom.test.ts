import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { query, text, hasClass, attr, click } from '@memberjunction/ng-test-utils';
import { FeedbackButtonComponent } from './feedback-button.component';
import { FeedbackDialogService } from '../services/feedback-dialog.service';

/**
 * DOM-level spec for <mj-feedback-button> (module-declared / standalone:false).
 *
 * The button's only collaborator is FeedbackDialogService, which it calls on click.
 * We substitute a fake service so the template surface — label gating, position class,
 * tooltip binding, and the click → OpenFeedbackDialog wiring (including the
 * CurrentPageProvider plumbing) — can be asserted without the real dialog lifecycle.
 */
describe('FeedbackButtonComponent (DOM)', () => {
  let openSpy: ReturnType<typeof vi.fn>;

  function render(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(FeedbackButtonComponent);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    openSpy = vi.fn();
    TestBed.configureTestingModule({
      imports: [CommonModule],
      declarations: [FeedbackButtonComponent],
      providers: [{ provide: FeedbackDialogService, useValue: { OpenFeedbackDialog: openSpy } }],
    });
  });

  it('renders the floating button with the default bottom-right position class', () => {
    const fixture = render();
    const btn = query(fixture, 'button.feedback-floating-button');
    expect(btn).not.toBeNull();
    expect(hasClass(fixture, 'button.feedback-floating-button', 'position-bottom-right')).toBe(true);
  });

  it('applies the position class for the configured Position input', () => {
    const fixture = render({ Position: 'top-left' });
    expect(hasClass(fixture, 'button.feedback-floating-button', 'position-top-left')).toBe(true);
    expect(hasClass(fixture, 'button.feedback-floating-button', 'position-bottom-right')).toBe(false);
  });

  it('hides the text label by default and shows it when ShowLabel is true', () => {
    const without = render();
    expect(query(without, '.button-label')).toBeNull();

    const withLabel = render({ ShowLabel: true, ButtonText: 'Report Issue' });
    expect(text(withLabel, '.button-label')).toBe('Report Issue');
  });

  it('binds ButtonText to the title (tooltip) attribute', () => {
    const fixture = render({ ButtonText: 'Send us feedback' });
    expect(attr(fixture, 'button.feedback-floating-button', 'title')).toBe('Send us feedback');
  });

  it('opens the dialog on click with no current page when no provider is supplied', () => {
    const fixture = render();
    click(fixture, 'button.feedback-floating-button');
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith({ currentPage: undefined });
  });

  it('passes the CurrentPageProvider result through to the dialog options on click', () => {
    const fixture = render({ CurrentPageProvider: () => 'Dashboard Tab' });
    click(fixture, 'button.feedback-floating-button');
    expect(openSpy).toHaveBeenCalledWith({ currentPage: 'Dashboard Tab' });
  });
});
