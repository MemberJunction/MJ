import { describe, it, expect } from 'vitest';
import { FindSimilarNames } from './lint-utils';

const FIELDS = ['ID', 'AccountName', 'OwnerName', 'Revenue', 'TotalRevenue', 'Region', 'Status'];

describe('FindSimilarNames', () => {
  it('finds a misspelling', () => {
    expect(FindSimilarNames('Statsu', FIELDS)).toEqual(['Status']);
  });

  it('ranks names that contain the guess ahead of names that are merely close in spelling', () => {
    // 'Region' is within edit distance of 'Revenue', but both revenue fields contain it.
    expect(FindSimilarNames('Revenue', FIELDS)).toEqual(['TotalRevenue']);
    expect(FindSimilarNames('Reven', FIELDS)).toEqual(['Revenue', 'TotalRevenue', 'Region']);
  });

  it('matches a guess that contains a real field name', () => {
    expect(FindSimilarNames('AnnualRevenue', FIELDS)).toEqual(['Revenue', 'TotalRevenue']);
  });

  it('ignores case', () => {
    expect(FindSimilarNames('accountname', FIELDS)).toEqual(['AccountName']);
  });

  it('does not treat a short name as contained in everything', () => {
    // 'ID' is only two characters, so it must not match every name containing "id".
    expect(FindSimilarNames('RegionID', FIELDS)).toEqual(['Region']);
  });

  it('returns nothing when nothing resembles the guess', () => {
    expect(FindSimilarNames('Zzzqx', FIELDS)).toEqual([]);
  });

  it('caps the result at the limit', () => {
    expect(FindSimilarNames('Reven', FIELDS, 1)).toEqual(['Revenue']);
  });
});
