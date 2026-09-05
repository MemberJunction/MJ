import { describe, it, expect, vi } from 'vitest';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import type { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { PSAskComponent } from './ps-ask.component';

/**
 * DOM coverage for <ps-ask> — the answer-shaped front door.
 *
 * The assertions that matter are about what a non-analyst is told: that the two blocks stay
 * separate, that an empty answer explains itself rather than rendering silence, and that no word
 * from our object model reaches the screen.
 */

const SIGNALS = [
  { ID: 's1', Name: 'days_since_last_act', TypeName: 'As-Of Recency', Story: 'How long ago someone last engaged.', Rebindable: true, Similarity: 0.74 },
  { ID: 's2', Name: 'bio_embedding', TypeName: 'Embedding', Story: null, Rebindable: false, Similarity: 0.61 },
];

const FINDINGS = [
  {
    ID: 'f1', Name: 'Committee membership and Renewed',
    Statement: 'Committee membership is associated with lower lapse risk.',
    EvidenceType: 'Predictive Contribution', Direction: 'Decreases',
    Magnitude: 0.31, MagnitudeUnit: 'importance share', Confidence: 'High',
    MeasuredAt: '2026-09-03T00:00:00Z', PopulationSize: 2180,
    HoldoutMetric: 'auc', HoldoutMetricValue: 0.741, Similarity: 0.69,
  },
];

const makeEngine = (overrides: Partial<Record<string, unknown>> = {}) =>
  ({
    Ask: vi.fn(async () => ({ Signals: SIGNALS, Findings: FINDINGS })),
    AssessDocument: vi.fn(async () => ({
      Objectives: [
        { Objective: { Index: 0, Section: 'Membership', Text: 'Reduce lapse among first-year members' }, Verdict: 'Covered', NextStep: 'Nothing to build.', Rationale: 'days_since_last_act measures this.', Signals: SIGNALS, Findings: FINDINGS },
        { Objective: { Index: 1, Section: 'Facilities', Text: 'Complete the seismic retrofit of the headquarters' }, Verdict: 'Gap', NextStep: 'Nothing on record describes this.', Rationale: 'Nothing measures building works.', Signals: [], Findings: [] },
      ],
      SignalsConsidered: 34,
      Summary: {},
      Message: '',
    })),
    ...overrides,
  } as unknown as PredictiveStudioEngine);

const render = (engine = makeEngine()) =>
  renderComponentFixture(PSAskComponent, { inputs: { engine, Provider: {} } });

/** Ask a question and settle the microtasks the click kicks off. */
async function ask(fixture: ReturnType<typeof render>, question = 'why do members lapse'): Promise<void> {
  fixture.componentInstance.question = question;
  await fixture.componentInstance.ask();
  fixture.detectChanges();
}

describe('PSAskComponent (DOM)', () => {
  it('opens on the question box, not on an object to inspect', () => {
    const fixture = render();
    expect(query(fixture, '[data-testid="ps-ask-input"]')).toBeTruthy();
    expect(queryAll(fixture, '[data-testid="ps-ask-suggestion"]').length).toBeGreaterThan(0);
  });

  it('keeps "what you can measure" and "what you have learned" as separate blocks', async () => {
    const fixture = render();
    await ask(fixture);

    // They answer different questions and lead to different work, so they never merge into one list.
    expect(query(fixture, '[data-testid="ps-ask-measures"]')).toBeTruthy();
    expect(query(fixture, '[data-testid="ps-ask-facts"]')).toBeTruthy();
    expect(queryAll(fixture, '[data-testid="ps-ask-measure"]')).toHaveLength(2);
    expect(queryAll(fixture, '[data-testid="ps-ask-fact"]')).toHaveLength(1);
  });

  it('shows each measure in the reader\'s words, not the tree\'s', async () => {
    const fixture = render();
    await ask(fixture);

    const text = query(fixture, '[data-testid="ps-ask-measures"]')!.textContent ?? '';
    expect(text).toContain('How long since it last happened');
    expect(text).toContain('days_since_last_act');
    // "As-Of Recency" is our name for a tree leaf; nobody outside this codebase wants it.
    expect(text).not.toContain('As-Of Recency');
  });

  it('says how a fact was established, so a correlation is not read as a lever', async () => {
    const fixture = render();
    await ask(fixture);

    const text = query(fixture, '[data-testid="ps-ask-facts"]')!.textContent ?? '';
    expect(text).toContain('Committee membership is associated with lower lapse risk.');
    expect(text).toContain('Predictive');
    expect(text).toContain('31.0% importance share');
    expect(text).toContain('2,180 records · auc 0.741');
  });

  it('explains an empty answer instead of rendering silence', async () => {
    const fixture = render(makeEngine({ Ask: vi.fn(async () => ({ Signals: [], Findings: [] })) }));
    await ask(fixture, 'how many parking spaces do we lease');

    const empty = query(fixture, '[data-testid="ps-ask-empty"]');
    expect(empty).toBeTruthy();
    // The difference between "we can't do this" and "nobody has described it".
    expect(empty!.textContent).toContain('has not been described yet');
  });

  it('surfaces a failure as a failure rather than as an empty answer', async () => {
    const fixture = render(makeEngine({ Ask: vi.fn(async () => { throw new Error('boom'); }) }));
    await ask(fixture);

    expect(query(fixture, '[data-testid="ps-ask-error"]')!.textContent).toContain('boom');
    expect(query(fixture, '[data-testid="ps-ask-measures"]')).toBeFalsy();
  });

  it('diagnoses a pasted document, grouped by its own sections', async () => {
    const fixture = render();
    fixture.componentInstance.setMode('document');
    fixture.componentInstance.document = 'x'.repeat(50);
    await fixture.componentInstance.assess();
    fixture.detectChanges();

    const objectives = queryAll(fixture, '[data-testid="ps-ask-objective"]');
    expect(objectives).toHaveLength(2);
    const verdicts = queryAll(fixture, '[data-testid="ps-ask-verdict"]').map((el) => el.textContent?.trim());
    expect(verdicts).toEqual(['Measurable, and we have learned something', 'Nothing on record']);
  });

  it('says what a gap means in the diagnosis headline', async () => {
    const fixture = render();
    fixture.componentInstance.setMode('document');
    fixture.componentInstance.document = 'x'.repeat(50);
    await fixture.componentInstance.assess();
    fixture.detectChanges();

    const headline = query(fixture, '[data-testid="ps-ask-diagnosis-headline"]')!.textContent ?? '';
    expect(headline).toContain('1 of 2 objectives have nothing on record');
    expect(headline).toContain('not that it cannot be measured');
  });

  it('clears the previous mode\'s answer when switching, so neither is read as the other', async () => {
    const fixture = render();
    await ask(fixture);
    expect(query(fixture, '[data-testid="ps-ask-measures"]')).toBeTruthy();

    fixture.componentInstance.setMode('document');
    expect(query(fixture, '[data-testid="ps-ask-measures"]')).toBeFalsy();
  });

  it('does not ask on an empty question', async () => {
    const engine = makeEngine();
    const fixture = render(engine);
    await ask(fixture, '   ');

    expect(engine.Ask).not.toHaveBeenCalled();
  });
});
