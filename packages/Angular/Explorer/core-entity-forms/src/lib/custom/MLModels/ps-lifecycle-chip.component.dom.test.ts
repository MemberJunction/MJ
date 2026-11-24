import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { PSLifecycleChipComponent } from './ps-lifecycle-chip.component';

try {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

const PRE_CHANGE_REASON =
  'Trained before the Predictive Studio lifecycle gate; never evaluated under an Evaluation Protocol; the pipeline is retrained under its protocol automatically.';

/** The chip's inputs. */
interface ChipInputs {
  Status: MJMLModelEntity['Status'];
  StatusReason?: string | null;
  ServingWhileUnevaluated?: boolean;
}

const RenderChip = (inputs: ChipInputs) => renderComponentFixture(PSLifecycleChipComponent, { inputs: { ...inputs } });
const Text = (f: ReturnType<typeof RenderChip>, testId: string): string => query(f, `[data-testid="${testId}"]`)?.textContent || '';

describe('PSLifecycleChipComponent (DOM)', () => {
  it('an Unevaluated model shows its chip and the stored reason', () => {
    const f = RenderChip({ Status: 'Unevaluated', StatusReason: PRE_CHANGE_REASON });
    expect(Text(f, 'ps-lifecycle-chip')).toContain('retrain to publish');
    expect(Text(f, 'ps-lifecycle-reason')).toBe(PRE_CHANGE_REASON);
    expect(query(f, '[data-testid="ps-lifecycle-serving"]')).toBeNull();
  });

  it('a serving pre-change model says it is still serving', () => {
    const f = RenderChip({ Status: 'Unevaluated', StatusReason: PRE_CHANGE_REASON, ServingWhileUnevaluated: true });
    expect(Text(f, 'ps-lifecycle-serving')).toContain('Still serving — not evaluated under a protocol');
  });

  it('a KeepBaseline model says it ships the simple baseline', () => {
    expect(Text(RenderChip({ Status: 'KeepBaseline', StatusReason: null }), 'ps-lifecycle-chip')).toContain('Ships the simple baseline');
  });

  it('a model without a reason shows no reason line', () => {
    expect(query(RenderChip({ Status: 'Published' }), '[data-testid="ps-lifecycle-reason"]')).toBeNull();
  });
});
