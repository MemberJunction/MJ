import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { RatingDialogComponent } from './rating-dialog.component';

/**
 * DOM spec for <mj-rating-dialog>. A self-contained 1–10 rating picker.
 * Covers the 10-pip scale, the optional message, initialRating seeding (via
 * ngOnInit), the fill/select/band visual state, the caption text, and the
 * consent-gating branch.
 */
describe('RatingDialogComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown> = {}) =>
    renderComponentFixture(RatingDialogComponent, {
      imports: [CommonModule, FormsModule],
      declarations: [RatingDialogComponent],
      inputs,
    });

  const pips = (f: ReturnType<typeof render>) => queryAll(f, 'button.rating-pip') as HTMLButtonElement[];

  it('renders ten rating pips labelled 1 through 10', () => {
    const f = render();
    const ps = pips(f);
    expect(ps.length).toBe(10);
    expect(ps.map((b) => b.textContent?.trim())).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });

  it('renders the message when one is supplied', () => {
    expect(text(render({ message: 'Rate this answer' }), '.dialog-message')).toContain('Rate this answer');
  });

  it('omits the message element when no message is supplied', () => {
    expect(query(render(), '.dialog-message')).toBeNull();
  });

  it('shows the "pick a number" prompt when no rating is selected', () => {
    const f = render();
    expect(text(f, '.selected-caption')).toContain('Pick a number');
  });

  it('seeds the selected/filled state from initialRating', () => {
    const f = render({ initialRating: 5 });
    const ps = pips(f);
    // pip 5 is the selected one; pips 1–5 are filled, 6–10 are not
    expect(ps[4].classList.contains('selected')).toBe(true);
    expect(ps[4].classList.contains('filled')).toBe(true);
    expect(ps[5].classList.contains('filled')).toBe(false);
  });

  it('renders the rating value and descriptor in the caption when a rating is set', () => {
    const f = render({ initialRating: 5 });
    expect(text(f, '.selected-caption')).toContain('5/10');
    expect(text(f, '.selected-caption')).toContain('Okay');
  });

  it('maps pips to low/mid/high bands via the data-band attribute', () => {
    const ps = pips(render({ initialRating: 10 }));
    expect(ps[1].getAttribute('data-band')).toBe('low'); // 2
    expect(ps[4].getAttribute('data-band')).toBe('mid'); // 5
    expect(ps[8].getAttribute('data-band')).toBe('high'); // 9
  });

  it('updates the selection and caption when a pip is clicked', () => {
    const f = render();
    pips(f)[7].click(); // rating 8
    f.detectChanges();
    expect(pips(f)[7].classList.contains('selected')).toBe(true);
    expect(text(f, '.selected-caption')).toContain('8/10');
    expect(text(f, '.selected-caption')).toContain('Good');
  });

  it('does not render the consent checkbox unless consent is required', () => {
    expect(query(render(), '.consent-checkbox')).toBeNull();
  });

  it('renders the consent checkbox and a warning until it is checked', () => {
    const f = render({ requireConsent: true });
    expect(query(f, '.consent-note')?.classList.contains('requires-consent')).toBe(true);
    expect(query(f, '.consent-checkbox')).not.toBeNull();
    expect(text(f, '.consent-warning')).toContain('Required');
  });
});
