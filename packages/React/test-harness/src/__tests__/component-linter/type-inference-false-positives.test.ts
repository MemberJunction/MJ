/**
 * Regression tests for type-inference false positives in type-mismatch-operation, type-compatibility
 * and entity-field-access-validation. Each case is the component shape that was wrongly flagged
 * (must pass), with a true positive per rule that must still be flagged.
 *
 * - A string method after a typeof guard, in an if or a ternary.
 * - A variable typed from a same-named variable in another function.
 * - A React state setter called with a functional updater or with null.
 * - DataGrid's `onRowClick` event (`{ record, cancel }`) read as an entity row.
 */
import { describe, it, expect } from 'vitest';
import { ComponentLinter } from '@memberjunction/react-linter';
import { ComponentSpec, SimpleEntityFieldInfo } from '@memberjunction/interactive-component-types';

type SpecExtras = Pick<ComponentSpec, 'dataRequirements' | 'dependencies'>;

async function ruleViolations(rule: string, code: string, extras: Partial<SpecExtras> = {}): Promise<string[]> {
  const spec = { name: 'Report', code, location: 'embedded', ...extras } as ComponentSpec;
  const result = await ComponentLinter.lintComponent(code, 'Report', spec, true);
  return result.violations.filter(v => v.rule === rule).map(v => `${v.severity}: ${v.message}`);
}

async function typeRuleViolations(code: string): Promise<string[]> {
  return [
    ...(await ruleViolations('type-mismatch-operation', code)),
    ...(await ruleViolations('type-compatibility', code)),
  ];
}

const EVENTS_ENTITY: NonNullable<ComponentSpec['dataRequirements']> = {
  mode: 'views',
  entities: [{
    name: 'Events',
    displayFields: [],
    filterFields: [],
    sortFields: [],
    permissionLevelNeeded: ['read'],
    fieldMetadata: [
      new SimpleEntityFieldInfo({ name: 'ID', sequence: 1, defaultInView: false, type: 'uniqueidentifier', allowsNull: false, isPrimaryKey: true }),
      new SimpleEntityFieldInfo({ name: 'Name', sequence: 2, defaultInView: true, type: 'nvarchar', allowsNull: false, isPrimaryKey: false }),
      new SimpleEntityFieldInfo({ name: 'Revenue', sequence: 3, defaultInView: true, type: 'decimal', allowsNull: true, isPrimaryKey: false }),
    ],
  }],
  queries: [],
};

const dataGrid = { name: 'DataGrid', location: 'registry', namespace: 'Generic/UI/Table', version: '1.0.0' } as ComponentSpec;

describe('type-mismatch-operation and type-compatibility', () => {
  it('accepts a string method after a typeof guard in an if and in a ternary', async () => {
    // `?? 0` makes inference type aVal itself as number, so only the guard keeps these from flagging.
    const guardedIf = `function Report({ rows, sortField }) {
  const sorted = [...rows].sort((a, b) => {
    let aVal = a[sortField] ?? 0;
    let bVal = b[sortField];
    if (typeof aVal === 'string') {
      const cmp = aVal.localeCompare(String(bVal));
      return cmp;
    }
    return aVal < bVal ? -1 : 1;
  });
  return <div>{sorted.length}</div>;
}`;
    const guardedTernary = `function Report({ rows }) {
  const cmp = (a, b) => {
    const aVal = a.v ?? 0;
    const bVal = b.v ?? 0;
    return typeof aVal === 'string' && typeof bVal === 'string' ? aVal.localeCompare(bVal) : aVal - bVal;
  };
  return <div>{[...rows].sort(cmp).length}</div>;
}`;
    expect(await typeRuleViolations(guardedIf)).toEqual([]);
    expect(await typeRuleViolations(guardedTernary)).toEqual([]);
  });

  it('does not take a type from a same-named variable in another function', async () => {
    const code = `function Report({ rows, sortField }) {
  const pickTheme = (v, dark) => { const m = (dark ? v.dark : v.light) || {}; return m; };
  const amounts = rows.map((r) => { const aVal = Number(r.Revenue) || 0; return aVal; });
  const monthNames = ['Jan', 'Feb', 'Mar'];
  const labels = [];
  for (let m = 1; m <= 3; m++) { labels.push(monthNames[m - 1]); }
  const sorted = [...rows].sort((a, b) => {
    const aVal = a[sortField];
    return aVal.localeCompare(String(b[sortField]));
  });
  const elapsed = new Date() - new Date(rows[0].Date);
  return <div>{labels.join()}{amounts.length}{sorted.length}{pickTheme}{elapsed}</div>;
}`;
    expect(await typeRuleViolations(code)).toEqual([]);
  });

  it('does not retype state from a functional updater or a reset to null', async () => {
    const code = `function Report() {
  const [page, setPage] = useState(0);
  const [tier, setTier] = useState('Gold');
  const next = () => setPage(p => p + 1);
  const clear = () => setTier(null);
  const start = page * 25;
  return <div onClick={next}>{start}{tier ? tier.toLowerCase() : ''}{clear}</div>;
}`;
    expect(await typeRuleViolations(code)).toEqual([]);
  });

  it('still flags a string method on a number and arithmetic on an object', async () => {
    const code = `function Report() {
  const count = 5;
  const totals = { a: 1 };
  return <div>{count.localeCompare('x')}{totals - 1}</div>;
}`;
    const found = await ruleViolations('type-mismatch-operation', code);
    expect(found.sort()).toEqual([
      'high: Arithmetic operator "-" used with object on left side. Expected number.',
      'high: String method "localeCompare()" called on number. This may fail at runtime.',
    ]);
  });
});

describe('entity-field-access-validation', () => {
  const RULE = 'entity-field-access-validation';
  const highOnly = (found: string[]) => found.filter(v => v.startsWith('high:'));

  it("does not read DataGrid's onRowClick event as an entity row", async () => {
    const code = `function Report({ utilities, components }) {
  const { DataGrid } = components;
  const [events, setEvents] = useState([]);
  useEffect(() => {
    const load = async () => {
      const result = await utilities.rv.RunView({ EntityName: 'Events' });
      const names = result.Results.map(e => e.Name);
      setEvents(result.Results);
      return names;
    };
    load();
  }, []);
  const handleRowClick = (e) => {
    const record = e?.record;
    if (e) e.cancel = true;
    return record;
  };
  return <DataGrid data={events} onRowClick={handleRowClick} />;
}`;
    const found = await ruleViolations(RULE, code, { dataRequirements: EVENTS_ENTITY, dependencies: [dataGrid] });
    expect(highOnly(found)).toEqual([]);
  });

  it('still flags a field that is not on the entity', async () => {
    const code = `function Report({ utilities }) {
  useEffect(() => {
    const load = async () => {
      const result = await utilities.rv.RunView({ EntityName: 'Events' });
      return result.Results.map(e => e.Nmae);
    };
    load();
  }, []);
  return <div />;
}`;
    const found = highOnly(await ruleViolations(RULE, code, { dataRequirements: EVENTS_ENTITY }));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('Field "Nmae" does not exist on entity "Events". Did you mean "Name"?');
  });
});
