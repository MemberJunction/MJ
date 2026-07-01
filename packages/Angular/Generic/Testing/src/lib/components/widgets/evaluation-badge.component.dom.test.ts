import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, text, hasClass } from '@memberjunction/ng-test-utils';
import { EvaluationBadgeComponent } from './evaluation-badge.component';
import type { EvaluationPreferences } from '../../models/evaluation.types';

const ALL_PREFS: EvaluationPreferences = { showExecution: true, showHuman: true, showAuto: true };
const EXEC_ONLY: EvaluationPreferences = { showExecution: true, showHuman: false, showAuto: false };

// Module-declared leaf, OnPush, three @if-gated modes: 'compact' | 'expanded' | 'inline'.
// Inner items are further gated by which preference flags are on plus data availability.
describe('EvaluationBadgeComponent (DOM)', () => {
  describe('compact mode (default)', () => {
    it('renders the compact wrapper and the exec item when showExecution is on', () => {
      const fixture = renderComponentFixture(EvaluationBadgeComponent, {
        declarations: [EvaluationBadgeComponent],
        inputs: { preferences: EXEC_ONLY, executionStatus: 'Completed' },
      });
      expect(query(fixture, '.eval-badge.compact')).not.toBeNull();
      // exec class for 'Completed' is 'success'
      expect(hasClass(fixture, '.eval-item.exec', 'success')).toBe(true);
    });

    it('renders the human rating with value and the correctness check when correct', () => {
      const fixture = renderComponentFixture(EvaluationBadgeComponent, {
        declarations: [EvaluationBadgeComponent],
        inputs: { preferences: ALL_PREFS, hasHumanFeedback: true, humanRating: 7, humanIsCorrect: true },
      });
      expect(text(fixture, '.eval-item.human .value')).toBe('7');
      expect(query(fixture, '.eval-item.human .correctness-icon')).not.toBeNull();
    });

    it('shows the human pending indicator when there is no human feedback', () => {
      const fixture = renderComponentFixture(EvaluationBadgeComponent, {
        declarations: [EvaluationBadgeComponent],
        inputs: { preferences: ALL_PREFS, hasHumanFeedback: false },
      });
      expect(query(fixture, '.eval-item.human.pending')).not.toBeNull();
    });

    it('renders the auto score as a rounded percentage with the high class', () => {
      const fixture = renderComponentFixture(EvaluationBadgeComponent, {
        declarations: [EvaluationBadgeComponent],
        inputs: { preferences: ALL_PREFS, autoScore: 0.85 },
      });
      expect(text(fixture, '.eval-item.auto .value')).toBe('85%');
      expect(hasClass(fixture, '.eval-item.auto', 'high')).toBe(true);
    });

    it('omits the auto item when autoScore is null', () => {
      const fixture = renderComponentFixture(EvaluationBadgeComponent, {
        declarations: [EvaluationBadgeComponent],
        inputs: { preferences: ALL_PREFS, autoScore: null, hasHumanFeedback: true, humanRating: 5 },
      });
      expect(query(fixture, '.eval-item.auto')).toBeNull();
    });
  });

  describe('expanded mode', () => {
    it('renders the expanded wrapper with the Status row label', () => {
      const fixture = renderComponentFixture(EvaluationBadgeComponent, {
        declarations: [EvaluationBadgeComponent],
        inputs: { mode: 'expanded', preferences: EXEC_ONLY, executionStatus: 'Completed', originalStatus: 'Passed' },
      });
      expect(query(fixture, '.eval-badge.expanded')).not.toBeNull();
      expect(text(fixture, '.eval-row .label')).toBe('Status');
      // getExecText() returns originalStatus when set
      expect(text(fixture, '.eval-row .value-wrap .text')).toBe('Passed');
    });

    it('renders the auto score bar with the bound width', () => {
      const fixture = renderComponentFixture(EvaluationBadgeComponent, {
        declarations: [EvaluationBadgeComponent],
        inputs: { mode: 'expanded', preferences: { showExecution: false, showHuman: false, showAuto: true }, autoScore: 0.6 },
      });
      const fill = query(fixture, '.score-fill') as HTMLElement | null;
      expect(fill).not.toBeNull();
      // [style.width.%]="(autoScore || 0) * 100" → 60%
      expect(fill!.style.width).toBe('60%');
    });
  });

  describe('inline mode', () => {
    it('renders the inline wrapper with the human primary value and a quality color class', () => {
      const fixture = renderComponentFixture(EvaluationBadgeComponent, {
        declarations: [EvaluationBadgeComponent],
        inputs: { mode: 'inline', preferences: ALL_PREFS, hasHumanFeedback: true, humanRating: 9 },
      });
      const inline = query(fixture, '.eval-badge.inline');
      expect(inline).not.toBeNull();
      // getPrimaryValue(): humanRating 9 → "9/10"
      expect(text(fixture, '.eval-badge.inline')).toBe('9/10');
      // getQualityColor: human rating >= 8 → success
      expect(inline!.classList.contains('success')).toBe(true);
    });
  });
});
