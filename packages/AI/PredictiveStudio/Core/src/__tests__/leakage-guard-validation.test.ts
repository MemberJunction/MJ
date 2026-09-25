import { describe, it, expect } from 'vitest';
import {
  ValidateLeakageGuard,
  ClampDominanceThreshold,
  IsMalformedNameToken,
  ParseDenyList,
  SanitizeNameToken,
  NormalizeName,
  DOMINANCE_THRESHOLD_DEFAULT,
  DOMINANCE_THRESHOLD_MIN,
  DOMINANCE_THRESHOLD_MAX,
} from '../leakage-guard-validation';
import type { LeakageGuard } from '../pipeline-spec';

/** A sound guard, used as the baseline the individual cases perturb. */
function guard(overrides: Partial<LeakageGuard> = {}): LeakageGuard {
  return {
    DenyFields: ['CheckInTime', 'Status'],
    SingleFeatureDominanceThreshold: DOMINANCE_THRESHOLD_DEFAULT,
    ...overrides,
  };
}

const RESOLVED = {
  KnownColumns: ['ID', 'CheckInTime', 'Status', 'MemberSince'],
  ColumnsFullyResolved: true,
};

describe('leakage-guard-validation', () => {
  describe('the reported bug: a pasted bracketed list', () => {
    // The exact shape that reached production: the editor's naive comma-split of
    // "[CheckInTime, Status]" kept the brackets, so the deny-set matched nothing
    // and the two most dangerous columns trained unguarded.
    const MALFORMED = ['[CheckInTime', 'Status]'];

    it('rejects the malformed entries structurally, with no schema knowledge', () => {
      const issues = ValidateLeakageGuard(guard({ DenyFields: MALFORMED }));
      expect(issues).toHaveLength(2);
      expect(issues.every((i) => i.Severity === 'Failure')).toBe(true);
      expect(issues.map((i) => i.Value)).toEqual(MALFORMED);
    });

    it('still rejects them when columns are fully resolved', () => {
      const issues = ValidateLeakageGuard(guard({ DenyFields: MALFORMED }), RESOLVED);
      expect(issues).toHaveLength(2);
    });

    it('parseDenyList recovers the intended column names from the paste', () => {
      expect(ParseDenyList('[CheckInTime, Status]')).toEqual(['CheckInTime', 'Status']);
    });

    it('the recovered list then validates clean', () => {
      const recovered = ParseDenyList('[CheckInTime, Status]');
      expect(ValidateLeakageGuard(guard({ DenyFields: recovered }), RESOLVED)).toEqual([]);
    });
  });

  describe('validateLeakageGuard — DenyFields', () => {
    it('accepts a sound guard', () => {
      expect(ValidateLeakageGuard(guard(), RESOLVED)).toEqual([]);
    });

    it('matches columns case-insensitively', () => {
      const issues = ValidateLeakageGuard(guard({ DenyFields: ['checkintime', 'STATUS'] }), RESOLVED);
      expect(issues).toEqual([]);
    });

    it('rejects an entry that matches no column when columns are fully resolved', () => {
      const issues = ValidateLeakageGuard(guard({ DenyFields: ['ChekInTime'] }), RESOLVED);
      expect(issues).toHaveLength(1);
      expect(issues[0].Field).toBe('DenyFields');
      expect(issues[0].Severity).toBe('Failure');
      expect(issues[0].Message).toContain('matches no column');
    });

    it('stands the semantic check down when columns are NOT fully resolved', () => {
      // A Query/external source is bound, so we cannot enumerate every column —
      // rejecting an unmatched entry here would be a false positive.
      const issues = ValidateLeakageGuard(guard({ DenyFields: ['ColumnOnSomeQuery'] }), {
        KnownColumns: ['ID', 'Status'],
        ColumnsFullyResolved: false,
      });
      expect(issues).toEqual([]);
    });

    it('applies the structural check even when columns are NOT fully resolved', () => {
      const issues = ValidateLeakageGuard(guard({ DenyFields: ['[Bogus'] }), {
        KnownColumns: ['ID'],
        ColumnsFullyResolved: false,
      });
      expect(issues).toHaveLength(1);
      expect(issues[0].Severity).toBe('Failure');
    });

    it('rejects blank entries', () => {
      const issues = ValidateLeakageGuard(guard({ DenyFields: ['   '] }));
      expect(issues).toHaveLength(1);
    });

    it('accepts an empty deny list (no guard configured is not an error)', () => {
      expect(ValidateLeakageGuard(guard({ DenyFields: [] }), RESOLVED)).toEqual([]);
    });
  });

  describe('validateLeakageGuard — SingleFeatureDominanceThreshold', () => {
    it('rejects a guard-disabling threshold above the max', () => {
      const issues = ValidateLeakageGuard(guard({ SingleFeatureDominanceThreshold: 0.95 }), RESOLVED);
      expect(issues).toHaveLength(1);
      expect(issues[0].Field).toBe('SingleFeatureDominanceThreshold');
      expect(issues[0].Severity).toBe('Failure');
    });

    it('rejects a noise-inducing threshold below the min', () => {
      const issues = ValidateLeakageGuard(guard({ SingleFeatureDominanceThreshold: 0.001 }), RESOLVED);
      expect(issues).toHaveLength(1);
      expect(issues[0].Field).toBe('SingleFeatureDominanceThreshold');
    });

    it('rejects a non-numeric threshold', () => {
      const issues = ValidateLeakageGuard(guard({ SingleFeatureDominanceThreshold: Number.NaN }), RESOLVED);
      expect(issues).toHaveLength(1);
    });

    it('accepts the boundaries', () => {
      expect(ValidateLeakageGuard(guard({ SingleFeatureDominanceThreshold: DOMINANCE_THRESHOLD_MIN }), RESOLVED)).toEqual([]);
      expect(ValidateLeakageGuard(guard({ SingleFeatureDominanceThreshold: DOMINANCE_THRESHOLD_MAX }), RESOLVED)).toEqual([]);
    });
  });

  describe('validateLeakageGuard — DenySources', () => {
    it('rejects a source that is not bound to the pipeline', () => {
      const issues = ValidateLeakageGuard(guard({ DenySources: ['Nope'] }), {
        ...RESOLVED,
        KnownSources: ['Members', 'Events'],
      });
      expect(issues).toHaveLength(1);
      expect(issues[0].Field).toBe('DenySources');
    });

    it('accepts a bound source', () => {
      const issues = ValidateLeakageGuard(guard({ DenySources: ['events'] }), {
        ...RESOLVED,
        KnownSources: ['Members', 'Events'],
      });
      expect(issues).toEqual([]);
    });
  });

  describe('clampDominanceThreshold', () => {
    it('clamps a saved guard-disabling value down to the max', () => {
      // This is the defense-in-depth path: rows written before validation existed.
      expect(ClampDominanceThreshold(0.95)).toBe(DOMINANCE_THRESHOLD_MAX);
      expect(ClampDominanceThreshold(1)).toBe(DOMINANCE_THRESHOLD_MAX);
    });

    it('clamps below-min values up to the min', () => {
      expect(ClampDominanceThreshold(0)).toBe(DOMINANCE_THRESHOLD_MIN);
      expect(ClampDominanceThreshold(-5)).toBe(DOMINANCE_THRESHOLD_MIN);
    });

    it('falls back to the default on non-finite input', () => {
      expect(ClampDominanceThreshold(Number.NaN)).toBe(DOMINANCE_THRESHOLD_DEFAULT);
      expect(ClampDominanceThreshold(Number.POSITIVE_INFINITY)).toBe(DOMINANCE_THRESHOLD_DEFAULT);
    });

    it('leaves an in-range value untouched', () => {
      expect(ClampDominanceThreshold(0.6)).toBe(0.6);
    });
  });

  describe('isMalformedNameToken', () => {
    it.each(['[CheckInTime', 'Status]', '"Status"', 'a,b', 'has space', '{x}', '', '   '])(
      'flags %j as malformed',
      (token) => expect(IsMalformedNameToken(token)).toBe(true)
    );

    it.each(['CheckInTime', 'Status', 'Member_Since', 'col-1'])(
      'accepts %j as a plausible name',
      (token) => expect(IsMalformedNameToken(token)).toBe(false)
    );
  });

  describe('sanitizeNameToken / normalizeName', () => {
    it('strips enclosing paste residue only', () => {
      expect(SanitizeNameToken(' [CheckInTime ')).toBe('CheckInTime');
      expect(SanitizeNameToken('"Status"')).toBe('Status');
    });

    it('does not rescue a genuine misspelling', () => {
      expect(SanitizeNameToken('ChekInTime')).toBe('ChekInTime');
    });

    it('normalizeName lowercases and trims', () => {
      expect(NormalizeName('  CheckInTime ')).toBe('checkintime');
    });
  });
});
