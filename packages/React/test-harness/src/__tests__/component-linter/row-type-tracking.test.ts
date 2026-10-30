/**
 * Row-Type Tracking
 *
 * A misnamed field is only reported when the linter knows the variable holds rows from a
 * RunQuery or RunView result. These cases follow the shapes generated components actually
 * use to carry rows from the data call to where a field is read.
 */

import { describe, it, expect } from 'vitest';
import { ComponentLinter, LintResult, Violation } from '@memberjunction/react-linter';
import { ComponentSpec, SimpleQueryFieldInfo } from '@memberjunction/interactive-component-types';

const FIELDS = ['AccountName', 'Region', 'TotalRevenue', 'OpenedCount'];

function buildSpec(code: string): ComponentSpec {
  return {
    name: 'AccountList',
    title: 'Account List',
    description: 'Lists accounts from a saved query',
    type: 'report',
    location: 'embedded',
    code,
    functionalRequirements: 'Lists accounts',
    technicalDesign: 'Reads rows and renders them',
    exampleUsage: '<AccountList />',
    libraries: [],
    dataRequirements: {
      mode: 'queries',
      entities: [],
      queries: [{
        name: 'Account Summary',
        categoryPath: 'Test/Reports',
        description: 'Account summary rows',
        entityNames: ['Accounts'],
        fields: FIELDS.map((name, i) => new SimpleQueryFieldInfo({
          Name: name, Sequence: i, DefaultInView: true, Type: 'nvarchar', AllowsNull: true, IsPrimaryKey: false,
        })),
      }],
    },
  };
}

/** A component whose effect loads rows, then `body` (the rest of the component) uses them. */
function component(loadStatement: string, body: string): string {
  return `function AccountList({ utilities }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  useEffect(() => {
    async function load() {
      try {
        const result = await utilities.rq.RunQuery({ QueryName: 'Account Summary', CategoryPath: 'Test/Reports' });
        ${loadStatement}
      } catch (e) {
        setError(String(e));
        setRows([]);
      }
    }
    load();
  }, []);
  ${body}
}`;
}

async function misnamedFields(code: string): Promise<string[]> {
  const spec = buildSpec(code);
  const result: LintResult = await ComponentLinter.lintComponent(spec.code!, spec.name, spec, true);
  return result.violations
    .filter((v: Violation) => v.Details?.Kind === 'field-access' && v.severity !== 'low')
    .map(v => v.Details!.Field);
}

describe('row-type tracking for field-access validation', () => {
  it('follows rows through a `|| []` fallback', async () => {
    const code = component(
      `const names = (result.Results || []).map(r => r.AcountName); setRows(names);`,
      `return <div>{rows.length}</div>;`
    );
    expect(await misnamedFields(code)).toEqual(['AcountName']);
  });

  it('follows rows through a `?? []` fallback', async () => {
    const code = component(
      `const list = result.Results ?? []; setRows(list.map(r => r.Regin));`,
      `return <div>{rows.length}</div>;`
    );
    expect(await misnamedFields(code)).toEqual(['Regin']);
  });

  it('follows rows stored in React state and read in render', async () => {
    const code = component(
      `if (result.Success) setRows(result.Results);`,
      `return <ul>{rows.map((r, i) => <li key={i}>{r.Regin}</li>)}</ul>;`
    );
    expect(await misnamedFields(code)).toEqual(['Regin']);
  });

  it('keeps the row type when the state is later reset to an empty array', async () => {
    // The catch block in component() calls setRows([]) after the success path.
    const code = component(
      `setRows(result.Results || []);`,
      `return <ul>{rows.map((r, i) => <li key={i}>{r.TotalRevenu}</li>)}</ul>;`
    );
    expect(await misnamedFields(code)).toEqual(['TotalRevenu']);
  });

  it('follows rows from state through useMemo and filter', async () => {
    const code = component(
      `setRows(result.Results);`,
      `const visible = useMemo(() => rows.filter(r => r.Region === 'West'), [rows]);
  return <ul>{visible.map((r, i) => <li key={i}>{r.AccountNme}</li>)}</ul>;`
    );
    expect(await misnamedFields(code)).toEqual(['AccountNme']);
  });

  it('follows rows into lodash iteratee callbacks', async () => {
    const code = component(
      `setRows(result.Results);`,
      `const opened = _.sumBy(rows, r => Number(r.OpeneCount) || 0);
  const byRegion = _.groupBy(_.filter(rows, r => r.Region), r => r.Regon);
  return <div>{opened}{Object.keys(byRegion).length}</div>;`
    );
    expect(await misnamedFields(code)).toEqual(['OpeneCount', 'Regon']);
  });

  it('does not claim a type for a choice between rows of two different sources', async () => {
    // `pick` is either the query rows or entity rows; neither field list applies to it.
    const code = component(
      `setRows(result.Results);
        const others = await utilities.rv.RunView({ EntityName: 'Accounts' });
        setOtherRows(others.Results);`,
      `const pick = rows.length ? rows : otherRows;
  return <ul>{pick.map((r, i) => <li key={i}>{r.Region || r.Territory}</li>)}</ul>;`
    ).replace('const [error, setError] = useState(null);', 'const [error, setError] = useState(null);\n  const [otherRows, setOtherRows] = useState([]);');
    expect(await misnamedFields(code)).toEqual([]);
  });

  it('keeps a same-named parameter in another callback separate', async () => {
    // Both functions call their parameter `row`; only the map callback's holds query rows.
    const code = component(
      `setRows(result.Results);`,
      `const handleRowClick = (row) => { if (row && row.ID) console.log(row.rawRecord); };
  return <ul>{rows.map((row, i) => <li key={i} onClick={() => handleRowClick({ ID: i, rawRecord: row })}>{row.Regin}</li>)}</ul>;`
    );
    expect(await misnamedFields(code)).toEqual(['Regin']);
  });

  it('follows rows through React.useMemo and slice', async () => {
    const code = component(
      `setRows(result.Results);`,
      `const top = React.useMemo(() => rows.slice(0, 20), [rows]);
  top.forEach(r => console.log(r.TotalRevnue));
  return <div>{top.length}</div>;`
    );
    expect(await misnamedFields(code)).toEqual(['TotalRevnue']);
  });

  it('follows rows through a sorted spread copy', async () => {
    const code = component(
      `const sorted = [...result.Results].sort((a, b) => a.Region.localeCompare(b.Region)); setRows(sorted);`,
      `const current = rows.find(r => r.Region === 'West');
  return <div>{current ? current.OpendCount : 0}</div>;`
    );
    expect(await misnamedFields(code)).toEqual(['OpendCount']);
  });

  it('reports nothing when every field exists', async () => {
    const code = component(
      `setRows(result.Results || []);`,
      `const total = _.sumBy(rows, r => r.TotalRevenue);
  return <ul>{rows.map((r, i) => <li key={i}>{r.AccountName} {r.Region} {total}</li>)}</ul>;`
    );
    expect(await misnamedFields(code)).toEqual([]);
  });
});
