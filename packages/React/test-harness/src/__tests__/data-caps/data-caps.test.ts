import { describe, it, expect } from 'vitest';
import {
  ResolveDataCapMaxRows,
  BuildDataAccessRecord,
  DescribeDataCap,
  DEFAULT_RUN_VIEW_MAX_ROWS,
  DEFAULT_RUN_QUERY_MAX_ROWS,
  DescribeQueryTarget,
  DescribeViewTarget,
  ResolveQueryTarget,
  ResolveViewTarget,
} from '../../lib/component-runner';

describe('ResolveDataCapMaxRows', () => {
  it('applies the ceiling when the component asks for nothing', () => {
    const r = ResolveDataCapMaxRows(undefined, 1000);
    expect(r.applied).toBe(1000);
    expect(r.requested).toBeUndefined();
  });

  it('clamps downward when the component asks for more than the ceiling', () => {
    // The case that motivated all of this: an unbounded roster query.
    const r = ResolveDataCapMaxRows(205802, 1000);
    expect(r.applied).toBe(1000);
    expect(r.requested).toBe(205802);
  });

  it('never clamps upward — a smaller request is preserved', () => {
    const r = ResolveDataCapMaxRows(50, 1000);
    expect(r.applied).toBe(50);
    expect(r.requested).toBe(50);
  });

  it('keeps a request that exactly equals the ceiling', () => {
    expect(ResolveDataCapMaxRows(1000, 1000)).toEqual({ applied: 1000, requested: 1000 });
  });

  it.each([0, -1, NaN, Infinity])('treats %p as no request at all', (bad) => {
    const r = ResolveDataCapMaxRows(bad as number, 1000);
    expect(r.applied).toBe(1000);
    expect(r.requested).toBeUndefined();
  });

  it('defaults are 1000 for both bridges', () => {
    expect(DEFAULT_RUN_VIEW_MAX_ROWS).toBe(1000);
    expect(DEFAULT_RUN_QUERY_MAX_ROWS).toBe(1000);
  });
});

describe('BuildDataAccessRecord', () => {
  const maxRows = { applied: 1000, requested: undefined };

  it('reports capped with the true denominator when the source held more', () => {
    const rec = BuildDataAccessRecord(
      'RunQuery',
      { target: 'Prevention Training Activity Roster', identity: {} },
      { Results: new Array(1000), TotalRowCount: 205802 },
      maxRows,
      42
    );
    expect(rec.capped).toBe(true);
    expect(rec.rowsReturned).toBe(1000);
    expect(rec.totalRowCount).toBe(205802);
    expect(rec.durationMs).toBe(42);
  });

  it('is not capped when everything fit', () => {
    const rec = BuildDataAccessRecord('RunView', { target: 'Causes', identity: {} }, { Results: new Array(12), TotalRowCount: 12 }, maxRows, 1);
    expect(rec.capped).toBe(false);
  });

  it('does not guess when the provider omits TotalRowCount', () => {
    const rec = BuildDataAccessRecord('RunView', { target: 'Causes', identity: {} }, { Results: new Array(1000) }, maxRows, 1);
    expect(rec.capped).toBe(false);
    expect(rec.totalRowCount).toBeUndefined();
  });

  it('distinguishes a zero-row result from no result at all', () => {
    const empty = BuildDataAccessRecord('RunQuery', { target: 'Q', identity: {} }, { Results: [], TotalRowCount: 0 }, maxRows, 1);
    expect(empty.rowsReturned).toBe(0);
    expect(empty.capped).toBe(false);

    const missing = BuildDataAccessRecord('RunQuery', { target: 'Q', identity: {} }, undefined, maxRows, 1);
    expect(missing.rowsReturned).toBe(0);
    expect(missing.capped).toBe(false);
  });

  it('carries the requested value through so a capped call stays legible', () => {
    const rec = BuildDataAccessRecord(
      'RunQuery', { target: 'Q', identity: {} }, { Results: new Array(1000), TotalRowCount: 5000 },
      { applied: 1000, requested: 5000 }, 1
    );
    expect(rec.requestedMaxRows).toBe(5000);
    expect(rec.appliedMaxRows).toBe(1000);
  });
});

describe('DescribeDataCap', () => {
  it('names both numbers when capped', () => {
    const rec = BuildDataAccessRecord(
      'RunQuery', { target: 'Q', identity: {} }, { Results: new Array(1000), TotalRowCount: 205802 },
      { applied: 1000 }, 1
    );
    expect(DescribeDataCap(rec)).toBe(' (capped at 1000 of 205802)');
  });

  it('stays empty when nothing was capped, so uncapped logs are unchanged', () => {
    const rec = BuildDataAccessRecord('RunView', { target: 'Causes', identity: {} }, { Results: new Array(5), TotalRowCount: 5 }, { applied: 1000 }, 1);
    expect(DescribeDataCap(rec)).toBe('');
  });
});

describe('DescribeQueryTarget', () => {
  it('qualifies a name with its category path — a bare name is not unique', () => {
    expect(DescribeQueryTarget({
      QueryName: 'Prevention Training Activity Roster',
      CategoryPath: '/Skip/Training/',
    })).toBe('/Skip/Training/Prevention Training Activity Roster');
  });

  it('normalizes missing or doubled slashes on the category path', () => {
    expect(DescribeQueryTarget({ QueryName: 'Foo', CategoryPath: 'MJ/AI/Agents' })).toBe('/MJ/AI/Agents/Foo');
    expect(DescribeQueryTarget({ QueryName: 'Foo', CategoryPath: '/MJ/AI/Agents/' })).toBe('/MJ/AI/Agents/Foo');
    expect(DescribeQueryTarget({ QueryName: 'Foo', CategoryPath: '/' })).toBe('/Foo');
  });

  it('distinguishes same-named queries in different categories', () => {
    const a = DescribeQueryTarget({ QueryName: 'Revenue', CategoryPath: '/Skip/Finance' });
    const b = DescribeQueryTarget({ QueryName: 'Revenue', CategoryPath: '/Skip/Ops' });
    expect(a).not.toBe(b);
  });

  it('follows RunQuery precedence: QueryID wins and QueryName is only a label', () => {
    expect(DescribeQueryTarget({ QueryID: 'abc-123', QueryName: 'Ignored', CategoryPath: '/X' }))
      .toBe('Ignored (resolved by QueryID abc-123)');
    expect(DescribeQueryTarget({ QueryID: 'abc-123' })).toBe('QueryID abc-123');
  });

  it('flags an unqualified name rather than presenting it as resolved', () => {
    expect(DescribeQueryTarget({ QueryName: 'Foo' })).toBe('Foo (uncategorized)');
    expect(DescribeQueryTarget({ QueryName: 'Foo', CategoryID: 'cat-9' })).toBe('Foo (CategoryID cat-9)');
  });

  it('falls back to unknown when nothing identifies the query', () => {
    expect(DescribeQueryTarget({})).toBe('unknown');
  });
});

describe('DescribeViewTarget', () => {
  it('names the entity for a dynamic view', () => {
    expect(DescribeViewTarget({ EntityName: 'WC Claims' })).toBe('WC Claims');
  });

  it('follows RunView precedence — EntityName is ignored when a view is named', () => {
    // EntityName is documented as used ONLY when ViewID/ViewName/ViewEntity are absent,
    // so reporting it alone would name something the call did not resolve by.
    expect(DescribeViewTarget({ ViewID: 'v-1', EntityName: 'WC Claims' })).toBe('ViewID v-1 on WC Claims');
    expect(DescribeViewTarget({ ViewName: 'My View', EntityName: 'WC Claims' })).toBe('view "My View" on WC Claims');
    expect(DescribeViewTarget({ ViewEntity: {}, EntityName: 'WC Claims' })).toBe('saved view via ViewEntity on WC Claims');
  });

  it('still identifies a saved view run without an entity name', () => {
    // Previously reported "unknown" — the case that motivated this.
    expect(DescribeViewTarget({ ViewID: 'v-1' })).toBe('ViewID v-1');
    expect(DescribeViewTarget({ ViewName: 'My View' })).toBe('view "My View"');
  });

  it('falls back to unknown when nothing identifies the view', () => {
    expect(DescribeViewTarget({})).toBe('unknown');
  });
});

describe('structured identity (correlatable against declared dataRequirements)', () => {
  it('carries queryName and categoryPath separately, matching the requirement vocabulary', () => {
    const { identity } = ResolveQueryTarget({
      QueryName: 'Prevention Training Activity Roster',
      CategoryPath: '/Skip/Training',
    });
    // Same field names as ComponentQueryDataRequirement.name / .categoryPath, so a caller
    // can match without parsing the display string.
    expect(identity).toEqual({
      queryName: 'Prevention Training Activity Roster',
      categoryPath: '/Skip/Training',
    });
  });

  it('keeps name+path even when an ID drove resolution, so correlation still works', () => {
    const { identity } = ResolveQueryTarget({
      QueryID: 'abc-123', QueryName: 'Revenue', CategoryPath: '/Skip/Finance',
    });
    expect(identity.queryId).toBe('abc-123');
    expect(identity.queryName).toBe('Revenue');
    expect(identity.categoryPath).toBe('/Skip/Finance');
  });

  it('distinguishes same-named queries structurally, not just in the display string', () => {
    const a = ResolveQueryTarget({ QueryName: 'Revenue', CategoryPath: '/Skip/Finance' }).identity;
    const b = ResolveQueryTarget({ QueryName: 'Revenue', CategoryPath: '/Skip/Ops' }).identity;
    expect(a.queryName).toBe(b.queryName);
    expect(a.categoryPath).not.toBe(b.categoryPath);
  });

  it('records entityName for a dynamic view and the view id for a saved one', () => {
    expect(ResolveViewTarget({ EntityName: 'WC Claims' }).identity).toEqual({ entityName: 'WC Claims' });
    expect(ResolveViewTarget({ ViewID: 'v-1', EntityName: 'WC Claims' }).identity)
      .toEqual({ entityName: 'WC Claims', viewId: 'v-1' });
  });

  it('omits absent fields rather than emitting undefined keys', () => {
    expect(ResolveQueryTarget({}).identity).toEqual({});
    expect(ResolveViewTarget({}).identity).toEqual({});
  });
});
