import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, text, hasClass } from '@memberjunction/ng-test-utils';
import { ReviewStatusIndicatorComponent } from './review-status-indicator.component';

// Module-declared leaf, OnPush, three @if-gated modes: 'badge' | 'count' | 'progress'.
describe('ReviewStatusIndicatorComponent (DOM)', () => {
  describe('badge mode (default)', () => {
    it('shows the reviewed text + class when hasReview is true', () => {
      const fixture = renderComponentFixture(ReviewStatusIndicatorComponent, {
        declarations: [ReviewStatusIndicatorComponent],
        inputs: { hasReview: true },
      });
      expect(hasClass(fixture, '.review-indicator.badge', 'reviewed')).toBe(true);
      expect(text(fixture, '.review-indicator.badge .text')).toBe('Reviewed');
    });

    it('shows the needs-review text + class when hasReview is false', () => {
      const fixture = renderComponentFixture(ReviewStatusIndicatorComponent, {
        declarations: [ReviewStatusIndicatorComponent],
        inputs: { hasReview: false },
      });
      expect(hasClass(fixture, '.review-indicator.badge', 'not-reviewed')).toBe(true);
      expect(text(fixture, '.review-indicator.badge .text')).toBe('Needs Review');
    });

    it('hides the text span when showText is false', () => {
      const fixture = renderComponentFixture(ReviewStatusIndicatorComponent, {
        declarations: [ReviewStatusIndicatorComponent],
        inputs: { hasReview: true, showText: false },
      });
      expect(query(fixture, '.review-indicator.badge .text')).toBeNull();
    });

    it('does not render the count or progress markup', () => {
      const fixture = renderComponentFixture(ReviewStatusIndicatorComponent, {
        declarations: [ReviewStatusIndicatorComponent],
        inputs: { hasReview: true },
      });
      expect(query(fixture, '.review-indicator.count')).toBeNull();
      expect(query(fixture, '.review-indicator.progress')).toBeNull();
    });
  });

  describe('count mode', () => {
    it('renders X/Y numbers and the complete class when all reviewed', () => {
      const fixture = renderComponentFixture(ReviewStatusIndicatorComponent, {
        declarations: [ReviewStatusIndicatorComponent],
        inputs: { mode: 'count', reviewedCount: 10, totalCount: 10 },
      });
      expect(text(fixture, '.review-indicator.count .numbers')).toBe('10/10');
      expect(hasClass(fixture, '.review-indicator.count', 'complete')).toBe(true);
    });

    it('applies the partial class when some are reviewed', () => {
      const fixture = renderComponentFixture(ReviewStatusIndicatorComponent, {
        declarations: [ReviewStatusIndicatorComponent],
        inputs: { mode: 'count', reviewedCount: 3, totalCount: 10 },
      });
      expect(hasClass(fixture, '.review-indicator.count', 'partial')).toBe(true);
    });

    it('shows the "reviewed" label when showLabel is true', () => {
      const fixture = renderComponentFixture(ReviewStatusIndicatorComponent, {
        declarations: [ReviewStatusIndicatorComponent],
        inputs: { mode: 'count', reviewedCount: 1, totalCount: 2, showLabel: true },
      });
      expect(text(fixture, '.review-indicator.count .label')).toBe('reviewed');
    });

    it('omits the "reviewed" label when showLabel is false (default)', () => {
      const fixture = renderComponentFixture(ReviewStatusIndicatorComponent, {
        declarations: [ReviewStatusIndicatorComponent],
        inputs: { mode: 'count', reviewedCount: 1, totalCount: 2 },
      });
      expect(query(fixture, '.review-indicator.count .label')).toBeNull();
    });
  });

  describe('progress mode', () => {
    it('renders the bar with the computed percentage width and the X/Y text', () => {
      const fixture = renderComponentFixture(ReviewStatusIndicatorComponent, {
        declarations: [ReviewStatusIndicatorComponent],
        inputs: { mode: 'progress', reviewedCount: 1, totalCount: 4 },
      });
      const fill = query(fixture, '.progress-fill') as HTMLElement | null;
      expect(fill).not.toBeNull();
      expect(fill!.style.width).toBe('25%');
      expect(text(fixture, '.progress-text')).toBe('1/4');
    });
  });
});
