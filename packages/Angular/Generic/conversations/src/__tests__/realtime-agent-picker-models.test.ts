import { describe, it, expect } from 'vitest';
import {
  BuildRealtimeModelOptions,
  VoiceModelCandidate,
} from '../lib/services/realtime-pairing';

/**
 * The "Voice model" option builder the picker applies to {@link AIEngineBase}'s cached
 * `Models` — the pure replacement for the previous narrow RunView
 * (`IsActive = 1 AND AIModelType = 'Realtime'`, `OrderBy: 'Name'`). Filter parity with the
 * SQL it replaced is the contract under test: active-only, Realtime-type-only
 * (trim + case-insensitive, matching SQL collation), Name-sorted, ID+Name projection.
 */

function model(overrides: Partial<VoiceModelCandidate> & { ID: string; Name: string }): VoiceModelCandidate {
  return {
    AIModelType: 'Realtime',
    IsActive: true,
    ...overrides,
  };
}

describe('BuildRealtimeModelOptions', () => {
  it('keeps only ACTIVE models of type Realtime, projected to {ID, Name}', () => {
    const options = BuildRealtimeModelOptions([
      model({ ID: 'm1', Name: 'Realtime One' }),
      model({ ID: 'm2', Name: 'Inactive Realtime', IsActive: false }),
      model({ ID: 'm3', Name: 'Some LLM', AIModelType: 'LLM' }),
      model({ ID: 'm4', Name: 'Untyped', AIModelType: null }),
    ]);
    expect(options).toEqual([{ ID: 'm1', Name: 'Realtime One' }]);
  });

  it('matches the Realtime type trim + case-insensitively (SQL-collation parity)', () => {
    const options = BuildRealtimeModelOptions([
      model({ ID: 'm1', Name: 'A', AIModelType: ' realtime ' }),
      model({ ID: 'm2', Name: 'B', AIModelType: 'REALTIME' }),
    ]);
    expect(options.map(o => o.ID)).toEqual(['m1', 'm2']);
  });

  it('sorts by Name ascending (parity with the previous OrderBy)', () => {
    const options = BuildRealtimeModelOptions([
      model({ ID: 'm2', Name: 'Zeta Voice' }),
      model({ ID: 'm1', Name: 'Alpha Voice' }),
      model({ ID: 'm3', Name: 'Mid Voice' }),
    ]);
    expect(options.map(o => o.Name)).toEqual(['Alpha Voice', 'Mid Voice', 'Zeta Voice']);
  });

  it('returns an empty list for an empty cache and never mutates the input', () => {
    expect(BuildRealtimeModelOptions([])).toEqual([]);
    const input = [model({ ID: 'm2', Name: 'B' }), model({ ID: 'm1', Name: 'A' })];
    BuildRealtimeModelOptions(input);
    expect(input.map(m => m.ID)).toEqual(['m2', 'm1']); // input order untouched
  });
});
