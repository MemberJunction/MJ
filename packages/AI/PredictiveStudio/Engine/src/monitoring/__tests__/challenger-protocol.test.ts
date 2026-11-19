import { describe, expect, it } from 'vitest';
import type { HoldoutSplit } from '@memberjunction/predictive-studio-core';

import { ChallengerProtocol } from '../challenger-protocol';

/** P-F2: a monitoring challenger's date-carved holdout moves to the protocol's own default over the unit's current rows. */
const carved = (cutoff: string, holdoutEnd: string | null = null): HoldoutSplit => ({ kind: 'date-carved', dateColumn: 'DecisionDate', cutoff, holdoutEnd, newEntityReport: null });

describe('ChallengerProtocol.Recarved', () => {
  it('moves a date-carved cutoff to a later default cutoff and opens its end, keeping the date column and new-entity report', () => {
    const stored: HoldoutSplit = { kind: 'date-carved', dateColumn: 'T', cutoff: '2021-01-01', holdoutEnd: '2022-01-01', newEntityReport: { groupKey: 'EntityKey', holdoutFraction: 0.2 } };
    expect(ChallengerProtocol.Recarved(stored, carved('2023-01-01'))).toEqual({ ...stored, cutoff: '2023-01-01', holdoutEnd: null });
  });
  it('keeps the stored holdout when the default cutoff is not later', () => {
    expect(ChallengerProtocol.Recarved(carved('2023-01-01'), carved('2023-01-01'))).toBeNull();
    expect(ChallengerProtocol.Recarved(carved('2023-01-01'), carved('2022-01-01'))).toBeNull();
  });
  it('keeps a holdout that is not date-carved (seeded-random, rolling-origin)', () => {
    expect(ChallengerProtocol.Recarved({ kind: 'seeded-random', fraction: 0.25 }, carved('2023-01-01'))).toBeNull();
    expect(ChallengerProtocol.Recarved(carved('2021-01-01'), { kind: 'seeded-random', fraction: 0.25 })).toBeNull();
  });
});
