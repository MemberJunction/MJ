/**
 * Regression tests for false positives in four runtime rules. Each rule gets the component
 * shape that was wrongly flagged (must pass) and a true positive (must still be flagged).
 *
 * - required-queries-not-called: RunQuery reached through a ref, an alias or an optional call.
 * - query-result-field-access-validation: a same-named variable in another function.
 * - noisy-settings-updates: dropdown/checkbox handlers, debounced saves, optional-call saves.
 * - component-usage-without-destructuring: `components || {}`, `?? {}`, `props.components`.
 */
import { describe, it, expect } from 'vitest';
import { ComponentLinter } from '@memberjunction/react-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

type SpecExtras = Pick<ComponentSpec, 'dataRequirements' | 'dependencies'>;

async function ruleViolations(rule: string, code: string, extras: Partial<SpecExtras> = {}): Promise<string[]> {
  const spec = { name: 'Report', code, location: 'embedded', ...extras } as ComponentSpec;
  const result = await ComponentLinter.lintComponent(code, 'Report', spec, true);
  return result.violations.filter(v => v.rule === rule).map(v => `${v.severity}: ${v.message}`);
}

const COURSE_QUERY = {
  mode: 'queries',
  queries: [{
    name: 'Course Enrollments',
    categoryPath: 'Test',
    fields: [
      { name: 'CourseName', type: 'nvarchar', description: 'Course' },
      { name: 'Enrollments', type: 'int', description: 'Enrollment count' },
    ],
  }],
} as ComponentSpec['dataRequirements'];

const registryComponent = (name: string) =>
  ({ name, location: 'registry', namespace: 'Generic/UI/Table', version: '1.0.0' }) as ComponentSpec;

describe('required-queries-not-called', () => {
  const RULE = 'required-queries-not-called';

  it('accepts RunQuery through an alias of a utilities ref', async () => {
    const code = `function Report({ utilities }) {
  const utilitiesRef = useRef(utilities);
  useEffect(() => {
    const u = utilitiesRef.current;
    u.rq.RunQuery({ QueryName: 'Course Enrollments' });
  }, []);
  return <div />;
}`;
    expect(await ruleViolations(RULE, code, { dataRequirements: COURSE_QUERY })).toEqual([]);
  });

  it('accepts utilitiesRef.current.rq.RunQuery, an optional call and an aliased rq', async () => {
    const direct = `function Report({ utilities }) {
  const utilitiesRef = useRef(utilities);
  useEffect(() => { utilitiesRef.current.rq.RunQuery({ QueryName: 'Course Enrollments' }); }, []);
  return <div />;
}`;
    const optional = `function Report({ utilities }) {
  useEffect(() => { utilities?.rq?.RunQuery?.({ QueryName: 'Course Enrollments' }); }, []);
  return <div />;
}`;
    const aliased = `function Report({ utilities }) {
  const { rq: queries } = utilities;
  useEffect(() => { queries.RunQuery({ QueryName: 'Course Enrollments' }); }, []);
  return <div />;
}`;
    for (const code of [direct, optional, aliased]) {
      expect(await ruleViolations(RULE, code, { dataRequirements: COURSE_QUERY })).toEqual([]);
    }
  });

  it('still flags a component that only calls RunView', async () => {
    const code = `function Report({ utilities }) {
  useEffect(() => { utilities.rv.RunView({ EntityName: 'Courses' }); }, []);
  return <div />;
}`;
    const found = await ruleViolations(RULE, code, { dataRequirements: COURSE_QUERY });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^critical: .*never calls RunQuery/);
  });
});

describe('query-result-field-access-validation', () => {
  const RULE = 'query-result-field-access-validation';
  const highOnly = (found: string[]) => found.filter(v => v.startsWith('high:'));

  // Callbacks return an object literal: an expression-bodied `r => r.Title` is not checked at
  // all (the walk visits only the body's children), which would make these tests vacuous.

  it('does not carry a query onto a same-named variable in another function', async () => {
    const code = `function Report({ utilities, courseData }) {
  async function load() {
    const result = await utilities.rq.RunQuery({ QueryName: 'Course Enrollments' });
    const rows = result.Results;
    return rows.map(r => ({ name: r.CourseName }));
  }
  function summarize() {
    let rows = [...courseData];
    return rows.map(r => ({ title: r.Title }));
  }
  return <div>{summarize().length}</div>;
}`;
    expect(highOnly(await ruleViolations(RULE, code, { dataRequirements: COURSE_QUERY }))).toEqual([]);
  });

  it('still flags a field that is not on the query', async () => {
    const code = `function Report({ utilities }) {
  async function load() {
    const result = await utilities.rq.RunQuery({ QueryName: 'Course Enrollments' });
    const rows = result.Results;
    return rows.map(r => ({ title: r.Title }));
  }
  return <div />;
}`;
    const found = highOnly(await ruleViolations(RULE, code, { dataRequirements: COURSE_QUERY }));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('Field "Title" does not exist on query "Course Enrollments"');
  });
});

describe('noisy-settings-updates', () => {
  const RULE = 'noisy-settings-updates';

  it('does not flag dropdown or checkbox change handlers', async () => {
    const code = `function Report({ onSaveUserSettings, savedUserSettings }) {
  const [year, setYear] = useState(2026);
  const handleComparisonYearChange = (e) => {
    setYear(e.target.value);
    onSaveUserSettings({ ...savedUserSettings, comparisonYear: e.target.value });
  };
  const handleShowTotalsChange = (e) => onSaveUserSettings?.({ showTotals: e.target.checked });
  return <div>
    <select value={year} onChange={handleComparisonYearChange}><option>2025</option></select>
    <input type="checkbox" onChange={handleShowTotalsChange} />
  </div>;
}`;
    expect(await ruleViolations(RULE, code)).toEqual([]);
  });

  it('does not flag a debounced save on a text input', async () => {
    const code = `function Report({ onSaveUserSettings }) {
  const timer = useRef(null);
  const handleSearchChange = (e) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onSaveUserSettings?.({ search: e.target.value }), 500);
  };
  const lastDebounceAt = useRef(0);
  const handleNameChange = (e) => {
    if (Date.now() - lastDebounceAt.current < 500) return;
    lastDebounceAt.current = Date.now();
    onSaveUserSettings({ name: e.target.value });
  };
  return <div><input type="text" onChange={handleSearchChange} /><input onChange={handleNameChange} /></div>;
}`;
    expect(await ruleViolations(RULE, code)).toEqual([]);
  });

  it('flags a per-keystroke save from a useCallback handler and from an inline handler', async () => {
    const code = `function Report({ onSaveUserSettings, savedUserSettings }) {
  const handleSearchChange = useCallback((e) => {
    onSaveUserSettings?.({ ...savedUserSettings, search: e.target.value });
  }, [savedUserSettings]);
  return <div>
    <input type="search" onChange={handleSearchChange} />
    <textarea onChange={(e) => onSaveUserSettings?.({ note: e.target.value })} />
  </div>;
}`;
    const found = await ruleViolations(RULE, code);
    expect(found).toHaveLength(2);
    expect(found[0]).toMatch(/^critical: Saving settings on every change\/keystroke/);
  });
});

describe('component-usage-without-destructuring', () => {
  const RULE = 'component-usage-without-destructuring';
  const dependencies = [registryComponent('DataGrid'), registryComponent('DataExportPanel')];

  it('accepts destructuring from components || {}, components ?? {} and props.components', async () => {
    const sources = ['components || {}', 'components ?? {}', 'props.components', 'props?.components || {}'];
    for (const source of sources) {
      const code = `function Report(props) {
  const { components } = props;
  const { DataGrid, DataExportPanel } = ${source};
  return <div><DataGrid data={[]} /><DataExportPanel /></div>;
}`;
      expect(await ruleViolations(RULE, code, { dependencies }), source).toEqual([]);
    }
  });

  it('still flags a component used without destructuring', async () => {
    const code = `function Report({ components }) {
  const { DataGrid } = components || {};
  return <div><DataGrid data={[]} /><DataExportPanel /></div>;
}`;
    const found = await ruleViolations(RULE, code, { dependencies });
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('Component "DataExportPanel" used without destructuring');
  });
});
