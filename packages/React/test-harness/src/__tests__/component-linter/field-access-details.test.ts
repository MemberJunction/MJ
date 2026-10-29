/**
 * Field-Access Violation Details
 *
 * A violation for a field that does not exist must carry the complete list of valid
 * fields in `Details`, not only the short preview in the message, so a consumer can hand
 * the whole list to a fixer without parsing text.
 */

import { describe, it, expect } from 'vitest';
import { ComponentLinter, LintResult, Violation } from '@memberjunction/react-linter';
import { ComponentDataRequirements, ComponentSpec, SimpleEntityFieldInfo, SimpleQueryFieldInfo } from '@memberjunction/interactive-component-types';

/** Twelve fields, so the message preview (10) is shorter than the full list. */
const FIELDS = [
  'AccountName', 'Industry', 'Region', 'Revenue', 'EmployeeCount', 'FoundedYear',
  'OwnerName', 'Status', 'Tier', 'Country', 'City', 'PostalCode',
];

type DataSource = 'query' | 'entity';

function buildDataCall(source: DataSource): string {
  return source === 'query'
    ? `await utilities.rq.RunQuery({ QueryName: 'Account Summary', CategoryPath: 'Test/Reports' })`
    : `await utilities.rv.RunView({ EntityName: 'Accounts' })`;
}

function buildDataRequirements(source: DataSource): ComponentDataRequirements {
  if (source === 'query') {
    return {
      mode: 'queries',
      entities: [],
      queries: [{
        name: 'Account Summary',
        categoryPath: 'Test/Reports',
        description: 'Account summary rows',
        entityNames: ['Accounts'],
        fields: FIELDS.map((name, i) => new SimpleQueryFieldInfo({
          name, sequence: i, defaultInView: true, type: 'nvarchar', allowsNull: true, isPrimaryKey: false,
        })),
      }],
    };
  }
  return {
    mode: 'views',
    queries: [],
    entities: [{
      name: 'Accounts',
      description: 'Accounts',
      displayFields: FIELDS,
      filterFields: [],
      sortFields: [],
      permissionLevelNeeded: ['read'],
      fieldMetadata: FIELDS.map((name, i) => new SimpleEntityFieldInfo({
        name, sequence: i, defaultInView: true, type: 'nvarchar', allowsNull: true, isPrimaryKey: false,
      })),
    }],
  };
}

function buildSpec(source: DataSource, fieldAccess: string): ComponentSpec {
  const code = `function AccountList({ utilities }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    async function load() {
      const result = ${buildDataCall(source)};
      if (result?.Success) {
        setRows(result.Results.map(row => row.${fieldAccess}));
      }
    }
    load();
  }, []);
  return (
    <div>
      {rows.map((value, i) => (<div key={i}>{value}</div>))}
    </div>
  );
}`;
  return {
    name: 'AccountList',
    title: 'Account List',
    description: 'Lists accounts from a saved query',
    type: 'report',
    location: 'embedded',
    code,
    properties: [],
    events: [],
    functionalRequirements: 'Lists accounts',
    technicalDesign: 'Reads rows and renders one field per row',
    exampleUsage: '<AccountList />',
    dataRequirements: buildDataRequirements(source),
  };
}

/** Field-access violations for the spec. Both field-access rules may report one, so filter on Details. */
async function lintFieldAccess(source: DataSource, fieldAccess: string): Promise<Violation[]> {
  const spec = buildSpec(source, fieldAccess);
  const result: LintResult = await ComponentLinter.lintComponent(spec.code!, spec.name, spec, true);
  return result.violations.filter(v => v.Details?.Kind === 'field-access');
}

describe('field-access violation details', () => {
  const cases: Array<{ source: DataSource; targetName: string }> = [
    { source: 'query', targetName: 'Account Summary' },
    { source: 'entity', targetName: 'Accounts' },
  ];

  for (const { source, targetName } of cases) {
    describe(`${source} rows`, () => {
      it('carries every available field for a field that does not exist', async () => {
        const violations = await lintFieldAccess(source, 'Zzzqx');

        expect(violations).toHaveLength(1);
        expect(violations[0].Details).toEqual({
          Kind: 'field-access',
          Field: 'Zzzqx',
          TargetType: source,
          TargetName: targetName,
          SimilarFields: [],
          AvailableFields: FIELDS,
        });
        // The message still previews only the first ten.
        expect(violations[0].message).toContain('and 2 more');
      });

      it('carries the field list on a case mismatch too', async () => {
        const violations = await lintFieldAccess(source, 'accountname');

        expect(violations).toHaveLength(1);
        expect(violations[0].severity).toBe('medium');
        expect(violations[0].Details?.AvailableFields).toEqual(FIELDS);
      });

      it.each([
        ['Revenu', ['Revenue']],
        ['AnnualRevenue', ['Revenue']],
        ['Name', ['OwnerName', 'AccountName']],
      ])('suggests fields that resemble %s', async (guess, expected) => {
        const violations = await lintFieldAccess(source, guess);

        expect(violations).toHaveLength(1);
        expect(violations[0].Details?.SimilarFields).toEqual(expected);
      });

      it('adds no violation for a field that exists', async () => {
        expect(await lintFieldAccess(source, 'AccountName')).toHaveLength(0);
      });
    });
  }
});
