import { describe, it, expect } from 'vitest';
import {
  buildAskAnswer,
  askHeadline,
  emptyNote,
  formatEvidence,
  formatSize,
  groupBySection,
  diagnosisHeadline,
  matchPercent,
  toFact,
  toMeasure,
  toObjective,
} from '../ask.view-models';

/**
 * The Ask panel is the one surface a non-analyst sees, so these tests are about the two things that
 * would quietly mislead them: our vocabulary leaking onto the screen, and a claim reading stronger
 * than the evidence behind it.
 */
describe('ask.view-models', () => {
  describe('measures', () => {
    it('translates tree kinds into the reader\'s words', () => {
      expect(toMeasure({ TypeName: 'As-Of Recency' }).kind).toBe('How long since it last happened');
      expect(toMeasure({ TypeName: 'As-Of Count' }).kind).toBe('How many, in a time window');
      expect(toMeasure({ TypeName: 'Column' }).kind).toBe('A value already on the record');
    });

    it('passes through an unknown kind rather than inventing a translation', () => {
      expect(toMeasure({ TypeName: 'Some New Kind' }).kind).toBe('Some New Kind');
    });

    it('carries reusability, which decides whether a population picker can be offered', () => {
      expect(toMeasure({ Rebindable: true }).reusable).toBe(true);
      // Anything not explicitly true is false — an unset flag must not read as "yes, point it anywhere".
      expect(toMeasure({}).reusable).toBe(false);
      expect(toMeasure({ Rebindable: 'yes' }).reusable).toBe(false);
    });

    it('survives a row where everything crossed the wire as the wrong type', () => {
      const m = toMeasure({ ID: null, Name: undefined, Story: 42, Similarity: 'high' });
      expect(m.name).toBe('(unnamed)');
      expect(m.describes).toBe('42');
      expect(m.matchPercent).toBe(100);
    });
  });

  describe('facts', () => {
    it('says how a fact was established, and whether that supports acting on it', () => {
      const tested = toFact({ EvidenceType: 'Tested Intervention', Statement: 'x' });
      expect(tested.supportsAction).toBe(true);
      expect(tested.basis).toContain('we changed something');

      // The distinction the whole findings table exists to preserve.
      const observed = toFact({ EvidenceType: 'Observed Association', Statement: 'x' });
      expect(observed.supportsAction).toBe(false);
      expect(observed.basis).toContain('move together');

      const predictive = toFact({ EvidenceType: 'Predictive Contribution', Statement: 'x' });
      expect(predictive.supportsAction).toBe(false);
      expect(predictive.basis).toContain('never seen before');
    });

    it('never shows a magnitude without its unit', () => {
      expect(formatSize(0.31, 'importance share')).toBe('31.0% importance share');
      expect(formatSize(12, 'days')).toBe('12 days');
      // A bare number would read as a percentage, a probability or a count depending on the reader.
      expect(formatSize(0.31, null)).toBeNull();
      expect(formatSize(null, 'importance share')).toBeNull();
    });

    it('builds an evidence line from whatever is present, and nothing when there is none', () => {
      expect(formatEvidence(2180, 'auc', 0.741)).toBe('2,180 records · auc 0.741');
      expect(formatEvidence(2180, null, null)).toBe('2,180 records');
      expect(formatEvidence(null, null, null)).toBeNull();
    });

    it('falls back to the name when a finding has no statement', () => {
      expect(toFact({ Name: 'Tenure and Renewed' }).statement).toBe('Tenure and Renewed');
      expect(toFact({}).statement).toBe('(no statement)');
    });

    it('trims a measurement date to the day', () => {
      expect(toFact({ MeasuredAt: '2026-09-03T22:11:06.000Z' }).measuredAt).toBe('2026-09-03');
    });
  });

  describe('the answer', () => {
    it('leads with what the reader can do, not with row counts', () => {
      expect(askHeadline('q', 3, 2)).toContain('You can measure this today, and 2 facts have been established');
      expect(askHeadline('q', 3, 0)).toContain('nothing has been established about what moves it');
      expect(askHeadline('q', 0, 2)).toContain('no measure currently recomputes it');
    });

    it('preserves the server ranking rather than re-sorting', () => {
      const answer = buildAskAnswer('q', [{ ID: 'b', Similarity: 0.5 }, { ID: 'a', Similarity: 0.9 }], []);
      expect(answer.measures.map((m) => m.id)).toEqual(['b', 'a']);
    });

    it('explains an empty answer instead of rendering silence', () => {
      const answer = buildAskAnswer('why do members lapse', [], []);
      expect(answer.emptyNote).toContain('has not been described yet');
      expect(answer.emptyNote).toContain('why do members lapse');
      expect(answer.headline).toContain('Nothing on record answers that yet');
    });

    it('truncates a long question in the empty note rather than flooding the panel', () => {
      const note = emptyNote('x'.repeat(200));
      expect(note.length).toBeLessThan(300);
      expect(note).toContain('…');
    });

    it('clamps a similarity bar and treats an absent one as full, not empty', () => {
      expect(matchPercent(0.742)).toBe(74);
      expect(matchPercent(2)).toBe(100);
      expect(matchPercent(-1)).toBe(0);
      // An unranked list is not a list of bad matches.
      expect(matchPercent(undefined)).toBe(100);
    });
  });

  describe('document diagnosis', () => {
    const objective = (verdict: string, section: string | null, text: string) =>
      toObjective({ Objective: { Index: 0, Section: section, Text: text }, Verdict: verdict, NextStep: 'do a thing' });

    it('translates each verdict and gives it a tone', () => {
      expect(objective('Covered', null, 'x').verdictLabel).toBe('Measurable, and we have learned something');
      expect(objective('Gap', null, 'x').tone).toBe('gap');
      expect(objective('Undetermined', null, 'x').tone).toBe('unknown');
      // An unrecognised verdict degrades to "needs a human look", never to a confident label.
      expect(objective('Something', null, 'x').verdictLabel).toBe('Needs a human look');
    });

    it('groups by section in document order, keeping repeats together', () => {
      const groups = groupBySection([
        objective('Covered', 'Membership', 'a'),
        objective('Gap', 'Membership', 'b'),
        objective('Gap', 'Facilities', 'c'),
      ]);
      expect(groups.map((g) => g.section)).toEqual(['Membership', 'Facilities']);
      expect(groups[0].objectives).toHaveLength(2);
    });

    it('leads the diagnosis with gaps and says what a gap means', () => {
      const line = diagnosisHeadline(
        [objective('Covered', null, 'a'), objective('Gap', null, 'b')],
        34,
      );
      expect(line).toContain('1 of 2 objectives have nothing on record');
      expect(line).toContain('checked against 34 measure(s)');
      // Without this sentence a reader concludes the organization cannot do the thing.
      expect(line).toContain('not that it cannot be measured');
    });

    it('says so plainly when a document yielded no objectives', () => {
      expect(diagnosisHeadline([], 34)).toContain('No objectives could be read');
    });
  });
});
