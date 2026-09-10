import { describe, it, expect } from 'vitest';
import { ValidationErrorInfo, ValidationErrorType } from '@memberjunction/global';
import {
  ClaimedCollectionErrors,
  DescribeSectionDirty,
  DescribeSectionErrors,
  DescribeSectionWarnings,
  EMPTY_SECTION_INDICATORS,
  ParseValidationSource,
  SectionIndicatorsAreEmpty,
  SectionOwnsValidationSource,
  SumSectionIndicators,
  TallyValidationErrors,
  type FormSectionIndicators,
  type ParsedValidationSource,
} from '../form-section-indicators';
import {
  FormSectionIndicatorCoordinator,
  type FormSectionIndicatorSource,
} from '../form-section-indicator-coordinator.service';

/**
 * Unit coverage for the section-indicator model: the pure arithmetic a panel and the
 * rail share, the `ValidationErrorInfo.Source` ownership join (which section a
 * form-level failure belongs to — MJ issue #3962), and the per-container registry
 * the rail reads. Kept on the fast node preset: pure logic plus a service with no
 * Angular dependency beyond `@Injectable`.
 */

function failure(source: string): ValidationErrorInfo {
  return new ValidationErrorInfo(source, 'nope', null, ValidationErrorType.Failure);
}

function warning(source: string): ValidationErrorInfo {
  return new ValidationErrorInfo(source, 'hmm', null, ValidationErrorType.Warning);
}

describe('SumSectionIndicators', () => {
  it('adds every count across sets', () => {
    expect(
      SumSectionIndicators({ DirtyCount: 1, ErrorCount: 2, WarningCount: 0 }, { DirtyCount: 3, ErrorCount: 0, WarningCount: 4 }),
    ).toEqual({ DirtyCount: 4, ErrorCount: 2, WarningCount: 4 });
  });

  it('treats missing, null, negative and non-finite counts as zero', () => {
    expect(SumSectionIndicators(null, undefined, { DirtyCount: -3 }, { ErrorCount: Number.NaN }, { WarningCount: 2.9 })).toEqual({
      DirtyCount: 0,
      ErrorCount: 0,
      WarningCount: 2,
    });
  });

  it('returns a fresh zero set for no input', () => {
    const sum = SumSectionIndicators();
    expect(sum).toEqual(EMPTY_SECTION_INDICATORS);
    expect(sum).not.toBe(EMPTY_SECTION_INDICATORS);
  });
});

describe('SectionIndicatorsAreEmpty', () => {
  it('is true for nothing, and for all-zero', () => {
    expect(SectionIndicatorsAreEmpty(null)).toBe(true);
    expect(SectionIndicatorsAreEmpty({})).toBe(true);
    expect(SectionIndicatorsAreEmpty({ DirtyCount: 0, ErrorCount: 0, WarningCount: 0 })).toBe(true);
  });

  it('is false as soon as one count is positive', () => {
    expect(SectionIndicatorsAreEmpty({ DirtyCount: 1 })).toBe(false);
    expect(SectionIndicatorsAreEmpty({ WarningCount: 1 })).toBe(false);
  });
});

describe('ParseValidationSource', () => {
  it('treats a bare field name as a field, with no collection', () => {
    expect(ParseValidationSource('Code')).toEqual({ Source: 'Code', Field: 'Code' });
  });

  it('trims surrounding whitespace', () => {
    expect(ParseValidationSource('  Code  ')).toEqual({ Source: 'Code', Field: 'Code' });
  });

  it('returns an empty parse for null/undefined/blank', () => {
    expect(ParseValidationSource(null)).toEqual({ Source: '', Field: '' });
    expect(ParseValidationSource(undefined)).toEqual({ Source: '', Field: '' });
    expect(ParseValidationSource('   ')).toEqual({ Source: '', Field: '' });
  });

  it('splits a positional graph path into collection, index and field', () => {
    expect(ParseValidationSource('Modifications[2].ContractTemplateProvisionID')).toEqual({
      Source: 'Modifications[2].ContractTemplateProvisionID',
      Collection: 'Modifications',
      Index: 2,
      Field: 'ContractTemplateProvisionID',
    });
  });

  it('handles index 0 and a dotted path with no subscript', () => {
    expect(ParseValidationSource('Lines[0].Amount').Index).toBe(0);
    expect(ParseValidationSource('Modifications.Name')).toEqual({
      Source: 'Modifications.Name',
      Collection: 'Modifications',
      Index: undefined,
      Field: 'Name',
    });
  });

  it('keeps the leading collection and the trailing field on a deep path', () => {
    const parsed = ParseValidationSource('Lines[1].Allocations[3].Amount');
    expect(parsed.Collection).toBe('Lines');
    expect(parsed.Index).toBe(1);
    expect(parsed.Field).toBe('Amount');
  });
});

describe('SectionOwnsValidationSource', () => {
  const scope = { FieldNames: ['Name', 'Code'], CollectionNames: ['Modifications'] };

  it('matches a plain field source against the declared field names, case-insensitively', () => {
    expect(SectionOwnsValidationSource(ParseValidationSource('Code'), 'identity', scope)).toBe(true);
    expect(SectionOwnsValidationSource(ParseValidationSource('code'), 'identity', scope)).toBe(true);
    expect(SectionOwnsValidationSource(ParseValidationSource('Notes'), 'identity', scope)).toBe(false);
  });

  it('matches a graph source on its declared collection', () => {
    expect(SectionOwnsValidationSource(ParseValidationSource('Modifications[2].Name'), 'identity', scope)).toBe(true);
  });

  it('matches a graph source on the section key itself with no declaration', () => {
    expect(SectionOwnsValidationSource(ParseValidationSource('Lines[0].Amount'), 'lines', { FieldNames: [] })).toBe(true);
    expect(SectionOwnsValidationSource(ParseValidationSource('Lines[0].Amount'), 'LINES', { FieldNames: [] })).toBe(true);
  });

  it('never matches a graph source on its trailing field name', () => {
    // `identity` renders Name; `Modifications[2].Name` must NOT land there.
    expect(SectionOwnsValidationSource(ParseValidationSource('Modifications[2].Name'), 'identity', { FieldNames: ['Name'] })).toBe(false);
  });

  it('never matches an empty source', () => {
    expect(SectionOwnsValidationSource(ParseValidationSource(''), 'identity', scope)).toBe(false);
  });
});

describe('ClaimedCollectionErrors', () => {
  it('returns only graph-path errors the section owns — plain field errors are the field\'s job', () => {
    const errors = [failure('Code'), failure('Modifications[1].X'), failure('Lines[0].Amount'), warning('Modifications[3].Y')];
    const claimed = ClaimedCollectionErrors(errors, 'identity', { FieldNames: ['Code'], CollectionNames: ['Modifications'] });
    expect(claimed.map((e) => e.Source)).toEqual(['Modifications[1].X', 'Modifications[3].Y']);
  });

  it('is empty for no errors', () => {
    expect(ClaimedCollectionErrors(undefined, 'x', {})).toEqual([]);
    expect(ClaimedCollectionErrors([], 'x', {})).toEqual([]);
  });
});

describe('TallyValidationErrors', () => {
  it('separates warnings from failures', () => {
    expect(TallyValidationErrors([failure('a'), warning('b'), failure('c')])).toEqual({ ErrorCount: 2, WarningCount: 1 });
  });
});

describe('Describe* titles', () => {
  it('pluralize and place the section name', () => {
    expect(DescribeSectionErrors(1)).toBe('1 field in this section needs attention');
    expect(DescribeSectionErrors(3, 'Details')).toBe('3 fields in Details need attention');
    expect(DescribeSectionWarnings(1, 'Pricing')).toBe('1 field in Pricing has a warning');
    expect(DescribeSectionWarnings(2)).toBe('2 fields in this section have warnings');
    expect(DescribeSectionDirty(1)).toBe('1 unsaved change in this section');
    expect(DescribeSectionDirty(4, 'Overview')).toBe('4 unsaved changes in Overview');
  });

  it('are empty at zero', () => {
    expect(DescribeSectionErrors(0)).toBe('');
    expect(DescribeSectionWarnings(0)).toBe('');
    expect(DescribeSectionDirty(0)).toBe('');
  });
});

/** Minimal source for the registry tests: fixed counts, owns a fixed set of field names. */
function source(key: string, counts: Partial<FormSectionIndicators>, fields: string[] = []): FormSectionIndicatorSource {
  return {
    SectionKey: key,
    GetSectionIndicators: () => SumSectionIndicators(counts),
    OwnsValidationSource: (parsed: ParsedValidationSource) =>
      parsed.Collection === undefined && fields.some((f) => f.toLowerCase() === parsed.Field.toLowerCase()),
  };
}

describe('FormSectionIndicatorCoordinator', () => {
  it('reports empty for an unregistered key', () => {
    const c = new FormSectionIndicatorCoordinator();
    expect(c.IndicatorsFor('nope')).toEqual(EMPTY_SECTION_INDICATORS);
    expect(c.Has('nope')).toBe(false);
  });

  it('reads a registered source LIVE — no snapshot', () => {
    const c = new FormSectionIndicatorCoordinator();
    let dirty = 0;
    c.Register({ SectionKey: 'a', GetSectionIndicators: () => ({ DirtyCount: dirty, ErrorCount: 0, WarningCount: 0 }), OwnsValidationSource: () => false });
    expect(c.IndicatorsFor('a').DirtyCount).toBe(0);
    dirty = 2;
    expect(c.IndicatorsFor('a').DirtyCount).toBe(2);
  });

  it('sums over several keys — what a rail group fronting many panels needs', () => {
    const c = new FormSectionIndicatorCoordinator();
    c.Register(source('a', { DirtyCount: 1, ErrorCount: 1 }));
    c.Register(source('b', { ErrorCount: 2, WarningCount: 1 }));
    c.Register(source('c', { DirtyCount: 5 }));
    expect(c.IndicatorsForKeys(['a', 'b'])).toEqual({ DirtyCount: 1, ErrorCount: 3, WarningCount: 1 });
    expect(c.IndicatorsForKeys(['a', 'missing'])).toEqual({ DirtyCount: 1, ErrorCount: 1, WarningCount: 0 });
    expect(c.TotalIndicators).toEqual({ DirtyCount: 6, ErrorCount: 3, WarningCount: 1 });
    expect(c.RegisteredSectionKeys).toEqual(['a', 'b', 'c']);
  });

  it('ignores a source with no key', () => {
    const c = new FormSectionIndicatorCoordinator();
    c.Register(source('', { DirtyCount: 1 }));
    expect(c.RegisteredSectionKeys).toEqual([]);
  });

  it('replaces a source registered under the same key, and only the current holder can unregister it', () => {
    const c = new FormSectionIndicatorCoordinator();
    const first = source('a', { DirtyCount: 1 });
    const second = source('a', { DirtyCount: 9 });
    c.Register(first);
    c.Register(second);
    expect(c.IndicatorsFor('a').DirtyCount).toBe(9);
    c.Unregister(first); // stale holder — must not evict the replacement
    expect(c.IndicatorsFor('a').DirtyCount).toBe(9);
    c.Unregister(second);
    expect(c.Has('a')).toBe(false);
  });

  it('unregisters under a previous key when a section is re-keyed', () => {
    const c = new FormSectionIndicatorCoordinator();
    const s = source('old', { DirtyCount: 1 });
    c.Register(s);
    c.Unregister(s, 'old');
    expect(c.Has('old')).toBe(false);
  });

  it('emits Changes on register, unregister and NotifyChanged — but not on a no-op re-register', () => {
    const c = new FormSectionIndicatorCoordinator();
    let fired = 0;
    c.Changes.subscribe(() => fired++);
    const s = source('a', {});
    c.Register(s);
    c.Register(s);
    expect(fired).toBe(1);
    c.NotifyChanged();
    expect(fired).toBe(2);
    c.Unregister(s);
    expect(fired).toBe(3);
    c.Unregister(s);
    expect(fired).toBe(3);
  });

  it('reports form-level errors no section claims as unrouted, and nothing else', () => {
    const c = new FormSectionIndicatorCoordinator();
    c.Register(source('identity', {}, ['Name', 'Code']));
    const unrouted = c.UnroutedValidationErrors([failure('Code'), failure('Orphan'), failure(''), warning('name')]);
    expect(unrouted.map((e) => e.Source)).toEqual(['Orphan']);
    expect(c.UnroutedValidationErrors(undefined)).toEqual([]);
  });
});
