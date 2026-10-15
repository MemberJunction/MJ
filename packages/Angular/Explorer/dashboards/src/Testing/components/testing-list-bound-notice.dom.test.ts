/**
 * Fix round 2 (QA2 Y): the review queue, review history, Runs list and score distribution are capped loads
 * (newest first). When a cap cuts one, the surface must say "Showing the newest N of M", and the review badge
 * must show the exact pending total — so a list never silently disagrees with an exact count.
 */
import { describe, it, expect } from 'vitest';
import { BehaviorSubject, of } from 'rxjs';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import { TestingReviewComponent } from './testing-review.component';
import { TestingInstrumentationService, type FeedbackPending } from '../services/testing-instrumentation.service';
import { TestingListBoundInfo, type TestingListBounds } from '../services/testing-list-bound';

const pendingItem = (id: string): FeedbackPending => ({
  testRunID: id, testName: `Test ${id}`, automatedScore: 0.4, automatedStatus: 'Passed', runDateTime: new Date('2026-10-15T00:00:00Z'), reason: 'no-feedback',
});

function renderReview(bounds: TestingListBounds, items: FeedbackPending[]) {
  const service = {
    Provider: null,
    ListBounds$: new BehaviorSubject<TestingListBounds>(bounds),
    pendingFeedback$: of(items),
    evaluationMetrics$: of(null),
    testRunsWithFeedback$: of([]),
  };
  // The child widgets (page chrome, alerts, accordion, badges) are outside this check; render them inert.
  TestBed.configureTestingModule({ schemas: [CUSTOM_ELEMENTS_SCHEMA] });
  return renderComponentFixture(TestingReviewComponent, {
    imports: [CommonModule, FormsModule],
    declarations: [TestingReviewComponent],
    providers: [{ provide: TestingInstrumentationService, useValue: service }],
    inputs: { HideToolbar: true },
  });
}

const bound = (Shown: number, Total: number) => ({ Shown, Total });

describe('capped Testing lists say they are capped', () => {
  it('words a capped bound with the exact total and says nothing for a complete one', () => {
    expect(TestingListBoundInfo.Notice(bound(1000, 3200), 'unreviewed runs')).toBe('Showing the newest 1,000 of 3,200 unreviewed runs.');
    expect(TestingListBoundInfo.Notice(bound(12, 12), 'runs')).toBeNull();
    expect(TestingListBoundInfo.FromCounts(1000, 3200)).toEqual(bound(1000, 3200));
    expect(TestingListBoundInfo.FromCounts(12, null)).toEqual(bound(12, 12));
  });

  it('shows the queue notice and counts every pending run when the queue is capped', () => {
    const f = renderReview({
      ...TestingListBoundInfo.EmptyBounds(),
      PendingUnreviewed: bound(2, 3200),
      PendingDiscrepant: bound(1, 1),
    }, [pendingItem('r1'), pendingItem('r2'), pendingItem('r3')]);
    const notices = queryAll(f, '.list-bound-notice').map((n) => n.textContent?.trim());
    expect(notices).toEqual(['Showing the newest 2 of 3,200 unreviewed runs.']);
    expect(f.componentInstance.PendingCount).toBe(3201);
  });

  it('shows no notice when every list is complete', () => {
    const f = renderReview({
      ...TestingListBoundInfo.EmptyBounds(),
      PendingUnreviewed: bound(3, 3),
    }, [pendingItem('r1'), pendingItem('r2'), pendingItem('r3')]);
    expect(query(f, '.list-bound-notice')).toBeNull();
    expect(f.componentInstance.PendingCount).toBe(3);
  });
});
