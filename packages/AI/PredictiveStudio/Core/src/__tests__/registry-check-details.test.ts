/**
 * `RegistryCheckDetails.FindingsAbout` (M7-11): the findings of a Registry Check run's `Details` about one model, read
 * structurally — step (g)'s record first, then the run's findings whose subject is the model.
 */
import { describe, expect, it } from 'vitest';
import { RegistryCheckDetails } from '../registry-check-details';

const MODEL = 'A1B2C3D4-0000-4000-8000-000000000001';

/** A run's `Details` with `findings` and step (g)'s record `migration`. */
function details(findings: object[], migration: object | null = null): string {
  return JSON.stringify({ Findings: findings, ...(migration === null ? {} : { [RegistryCheckDetails.PreChangeKey]: migration }) });
}

describe('RegistryCheckDetails.FindingsAbout', () => {
  it('reads step (g)\'s entries about the model first, then the findings whose subject it is, matching the ID case-insensitively', () => {
    const text = details(
      [
        { Finding: 'c', SubjectID: MODEL.toLowerCase(), Detail: 'the stored artifact loads missing', Action: 'archived by the lifecycle gate', Outcome: 'remediated' },
        { Finding: 'd', SubjectID: 'another-model', Detail: 'another model', Action: 'scoring Action re-synced', Outcome: 'remediated' },
      ],
      {
        Reverified: { Adopted: [], Demoted: [{ ModelID: MODEL, Refusal: { kind: 'gate-no-signal', reason: 'x' }, RolledBackTo: null }] },
        Artifacts: { Verified: [], LegacyLocal: [MODEL], Missing: [], HashMismatch: [] },
      },
    );
    expect(RegistryCheckDetails.FindingsAbout(text, MODEL)).toEqual([
      { Finding: 'g', Detail: 'trained before the lifecycle gate; its stored gate record did not re-verify', Action: 'demoted to Unevaluated (gate-no-signal)', Outcome: 'remediated' },
      { Finding: 'g', Detail: 'trained before the lifecycle gate; its artifact was checked once', Action: 'artifact recorded legacy-local', Outcome: 'recorded' },
      { Finding: 'c', Detail: 'the stored artifact loads missing', Action: 'archived by the lifecycle gate', Outcome: 'remediated' },
    ]);
  });

  it('reads an adoption', () => {
    expect(RegistryCheckDetails.FindingsAbout(details([], { Reverified: { Adopted: [MODEL] } }), MODEL)).toEqual([
      { Finding: 'g', Detail: 'trained before the lifecycle gate; re-verified on its stored gate record', Action: 'kept Published with an adopt record', Outcome: 'remediated' },
    ]);
  });

  it('records nothing for text that is not a JSON object, or a finding with an unknown letter or outcome', () => {
    const odd = details([
      { Finding: 'z', SubjectID: MODEL, Detail: 'd', Action: 'a', Outcome: 'remediated' },
      { Finding: 'a', SubjectID: MODEL, Detail: 'd', Action: 'a', Outcome: 'ignored' },
    ]);
    expect([RegistryCheckDetails.FindingsAbout(null, MODEL), RegistryCheckDetails.FindingsAbout('not json', MODEL), RegistryCheckDetails.FindingsAbout('[1]', MODEL), RegistryCheckDetails.FindingsAbout(odd, MODEL)])
      .toEqual([[], [], [], []]);
  });
});
