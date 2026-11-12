import { describe, it, expect } from 'vitest';
import { FilterPreBaselineMigrations, LatestBaseline } from '../commands/migrate/convert.js';
import { DecideRebakeWrites } from '../commands/migrate/rebake.js';

describe('FilterPreBaselineMigrations (#3345 item 1)', () => {
  const files = [
    'B202602151200__v5.0__Baseline.sql',
    'B202606011200__v5.30__Baseline.sql',
    'V202602131500__v4.x__Old.sql',
    'V202602141421__v4.x__Older.sql',
    'V202602151300__v5.0.x__After.sql',
    'V202611011200__v6.x__New.sql',
  ];

  it('skips V files older than the OLDEST baseline and keeps the rest', () => {
    const r = FilterPreBaselineMigrations(files);
    expect(r.skipped).toEqual(['V202602131500__v4.x__Old.sql', 'V202602141421__v4.x__Older.sql']);
    expect(r.kept).toEqual([
      'B202602151200__v5.0__Baseline.sql',
      'B202606011200__v5.30__Baseline.sql',
      'V202602151300__v5.0.x__After.sql',
      'V202611011200__v6.x__New.sql',
    ]);
  });

  it('keeps everything when the folder has no baseline', () => {
    expect(FilterPreBaselineMigrations(['V1__a.sql', 'V2__b.sql']).skipped).toEqual([]);
  });

  it('LatestBaseline picks the newest T-SQL baseline, never a PG counterpart', () => {
    expect(LatestBaseline([...files, 'B209901011200__x.pg.sql'])).toBe('B202606011200__v5.30__Baseline.sql');
    expect(LatestBaseline(['V1__a.sql'])).toBeUndefined();
  });
});

describe('DecideRebakeWrites (#3345 item 4)', () => {
  it('a full re-bake is a dry run unless --write', () => {
    expect(DecideRebakeWrites({ write: false, dryRun: false })).toBe(false);
    expect(DecideRebakeWrites({ write: true, dryRun: false })).toBe(true);
  });

  it('a single --file re-bake writes', () => {
    expect(DecideRebakeWrites({ file: 'V1__a.sql', write: false, dryRun: false })).toBe(true);
  });

  it('--dry-run never writes', () => {
    expect(DecideRebakeWrites({ file: 'V1__a.sql', write: true, dryRun: true })).toBe(false);
  });
});
