import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, text, hasClass } from '@memberjunction/ng-test-utils';
import { ScoreIndicatorComponent } from './score-indicator.component';

// Module-declared leaf. Template: .score-indicator with [class]=getColorClass(),
// @if(showBar) a .score-bar-container with [style.width.%]=score*100,
// @if(showIcon) an <i> with getIcon()'s class, and {{ formatScore(score) }}.
describe('ScoreIndicatorComponent (DOM)', () => {
  it('formats the score with the default 4 decimals', () => {
    const fixture = renderComponentFixture(ScoreIndicatorComponent, {
      declarations: [ScoreIndicatorComponent],
      inputs: { score: 0.5 },
    });
    expect(text(fixture, '.score-text')).toBe('0.5000');
  });

  it('honors a custom decimals input', () => {
    const fixture = renderComponentFixture(ScoreIndicatorComponent, {
      declarations: [ScoreIndicatorComponent],
      inputs: { score: 0.9512, decimals: 2 },
    });
    expect(text(fixture, '.score-text')).toBe('0.95');
  });

  it('applies the excellent color class for a high score', () => {
    const fixture = renderComponentFixture(ScoreIndicatorComponent, {
      declarations: [ScoreIndicatorComponent],
      inputs: { score: 0.95 },
    });
    expect(hasClass(fixture, '.score-indicator', 'score-indicator--excellent')).toBe(true);
  });

  it('applies the fail color class for a low score', () => {
    const fixture = renderComponentFixture(ScoreIndicatorComponent, {
      declarations: [ScoreIndicatorComponent],
      inputs: { score: 0.1 },
    });
    expect(hasClass(fixture, '.score-indicator', 'score-indicator--fail')).toBe(true);
  });

  it('renders the score bar with the bound width when showBar is true (default)', () => {
    const fixture = renderComponentFixture(ScoreIndicatorComponent, {
      declarations: [ScoreIndicatorComponent],
      inputs: { score: 0.42 },
    });
    const bar = query(fixture, '.score-bar') as HTMLElement | null;
    expect(bar).not.toBeNull();
    // [style.width.%]="score * 100" → 42%
    expect(bar!.style.width).toBe('42%');
  });

  it('hides the score bar when showBar is false', () => {
    const fixture = renderComponentFixture(ScoreIndicatorComponent, {
      declarations: [ScoreIndicatorComponent],
      inputs: { score: 0.5, showBar: false },
    });
    expect(query(fixture, '.score-bar-container')).toBeNull();
  });

  it('hides the icon when showIcon is false', () => {
    const fixture = renderComponentFixture(ScoreIndicatorComponent, {
      declarations: [ScoreIndicatorComponent],
      inputs: { score: 0.5, showIcon: false },
    });
    expect(query(fixture, '.score-value i')).toBeNull();
  });
});
