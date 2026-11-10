import { describe, it, expect } from 'vitest';
import { SidecarGates } from '../ps-gate-sidecar';

const LIBRARIES = { python: '3.11.15', numpy: '1.26.4', 'scikit-learn': '1.4.2', xgboost: '2.0.3', lightgbm: '4.3.0' };
const stored = (cv: object): string => JSON.stringify({ psGitSha: 'abc', sidecarVersion: '1', seed: 42, ...cv });

describe('SidecarGates.StoredCodeVersionVerdict (the stored run row G2.32 reads)', () => {
  it('passes a stored CodeVersion naming the five libraries and at least one thread', () => {
    expect(SidecarGates.StoredCodeVersionVerdict(stored({ threads: 1, libraryVersions: LIBRARIES })).Passed).toBe(true);
  });
  it('fails a run that stored no CodeVersion', () => {
    const v = SidecarGates.StoredCodeVersionVerdict(null);
    expect(v.Passed).toBe(false);
    expect(v.Measured.storedCodeVersion).toBe(false);
  });
  it('fails a stored CodeVersion lacking a library version, naming it', () => {
    const { lightgbm: _dropped, ...withoutLightgbm } = LIBRARIES;
    const v = SidecarGates.StoredCodeVersionVerdict(stored({ threads: 1, libraryVersions: withoutLightgbm }));
    expect(v.Passed).toBe(false);
    expect(v.Measured.missingLibraries).toBe('lightgbm');
  });
  it('fails a stored CodeVersion whose thread count is not a positive integer', () => {
    for (const threads of [0, 1.5, null]) {
      expect(SidecarGates.StoredCodeVersionVerdict(stored({ threads, libraryVersions: LIBRARIES })).Passed).toBe(false);
    }
  });
});
