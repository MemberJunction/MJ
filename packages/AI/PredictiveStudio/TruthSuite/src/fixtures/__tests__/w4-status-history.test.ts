import { describe, it, expect } from 'vitest';
import { W4StatusHistory } from '../w4-status-history';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('W4StatusHistory.BuildTimeline', () => {
  it('is Active from 1 January of the first cycle and Lapsed from 1 January after the first cycle not renewed', () => {
    const timeline = W4StatusHistory.BuildTimeline([
      { PersonID: 'AA', Year: 2023, Renewed: false },
      { PersonID: 'AA', Year: 2021, Renewed: true },
      { PersonID: 'AA', Year: 2022, Renewed: false },
      { PersonID: 'BB', Year: 2022, Renewed: true },
    ]);
    expect(timeline.get('aa')).toEqual({ ActiveFrom: day('2021-01-01'), LapsedFrom: day('2023-01-01') });
    expect(timeline.get('bb')).toEqual({ ActiveFrom: day('2022-01-01'), LapsedFrom: null });
  });
});

describe('W4StatusHistory.ExpectedStatusAt', () => {
  const timeline = W4StatusHistory.BuildTimeline([{ PersonID: 'AA', Year: 2021, Renewed: true }, { PersonID: 'AA', Year: 2022, Renewed: false }]);

  it('reads the status in force at the end of the decision day', () => {
    expect(W4StatusHistory.ExpectedStatusAt(timeline, 'AA', day('2022-12-01'))).toBe('Active');
    expect(W4StatusHistory.ExpectedStatusAt(timeline, 'aa', day('2023-01-01'))).toBe('Lapsed');
  });

  it('is null before the person joined and for a person the timeline does not know', () => {
    expect(W4StatusHistory.ExpectedStatusAt(timeline, 'AA', day('2020-12-30'))).toBeNull();
    expect(W4StatusHistory.ExpectedStatusAt(timeline, 'ZZ', day('2022-12-01'))).toBeNull();
  });
});
