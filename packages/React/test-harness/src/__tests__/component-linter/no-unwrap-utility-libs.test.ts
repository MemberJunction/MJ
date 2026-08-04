/**
 * Tests for the no-unwrap-utility-libs lint rule.
 *
 * Ensures unwrapLibraryComponents() is not used with utility libraries
 * (lodash, dayjs, d3, moment) whose functions become non-callable when wrapped.
 */

import { describe, it, expect } from 'vitest';
import { ComponentLinter } from '@memberjunction/react-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

const baseSpec = {
  name: 'TestComponent',
  type: 'chart' as const,
  title: 'Test',
  description: 'Test component',
  code: '',
  location: 'embedded' as const,
  functionalRequirements: '',
  technicalDesign: '',
  exampleUsage: '<TestComponent />',
  dataRequirements: {
    mode: 'queries' as const,
    queries: [],
    entities: [],
  },
} as ComponentSpec;

const RULE = 'no-unwrap-utility-libs';

function findViolations(result: Awaited<ReturnType<typeof ComponentLinter.lintComponent>>) {
  return result.violations.filter(v => v.rule === RULE);
}

// ═══════════════════════════════════════════════════════════════════════════
// Cases that SHOULD produce violations
// ═══════════════════════════════════════════════════════════════════════════

describe('ComponentLinter - no-unwrap-utility-libs (violations)', () => {
  it('should flag lodash debounce via unwrap (the production failure case)', async () => {
    const code = `function TestComponent({ utilities }) {
      const { debounce } = unwrapLibraryComponents(_, 'debounce');
      return React.createElement('div', null, 'hello');
    }`;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);
    const violations = findViolations(result);

    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe('critical');
    expect(violations[0].message).toContain('lodash');
    expect(violations[0].message).toContain('"_"');
    expect(violations[0].suggestion).toBeDefined();
    expect(violations[0].suggestion?.example).toContain('_.debounce');
  });

  it('should flag multiple lodash functions via unwrap', async () => {
    const code = `function TestComponent({ utilities }) {
      const { sortBy, groupBy, uniq } = unwrapLibraryComponents(_, 'sortBy', 'groupBy', 'uniq');
      return React.createElement('div', null, 'hello');
    }`;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);
    const violations = findViolations(result);

    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe('critical');
    expect(violations[0].message).toContain('lodash');
  });

  it('should flag single lodash function via unwrap', async () => {
    const code = `function TestComponent({ utilities }) {
      const { throttle } = unwrapLibraryComponents(_, 'throttle');
      return React.createElement('div', null, 'hello');
    }`;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);
    const violations = findViolations(result);

    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe('critical');
  });

  it('should flag dayjs via unwrap', async () => {
    const code = `function TestComponent({ utilities }) {
      const { extend } = unwrapLibraryComponents(dayjs, 'extend');
      return React.createElement('div', null, 'hello');
    }`;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);
    const violations = findViolations(result);

    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe('critical');
    expect(violations[0].message).toContain('Day.js');
    expect(violations[0].message).toContain('"dayjs"');
  });

  it('should flag d3 via unwrap', async () => {
    const code = `function TestComponent({ utilities }) {
      const { select, scaleLinear } = unwrapLibraryComponents(d3, 'select', 'scaleLinear');
      return React.createElement('div', null, 'hello');
    }`;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);
    const violations = findViolations(result);

    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe('critical');
    expect(violations[0].message).toContain('D3.js');
    expect(violations[0].message).toContain('"d3"');
  });

  it('should flag moment via unwrap', async () => {
    const code = `function TestComponent({ utilities }) {
      const { duration } = unwrapLibraryComponents(moment, 'duration');
      return React.createElement('div', null, 'hello');
    }`;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);
    const violations = findViolations(result);

    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe('critical');
    expect(violations[0].message).toContain('Moment.js');
    expect(violations[0].message).toContain('"moment"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Cases that should NOT produce violations (false positive prevention)
// ═══════════════════════════════════════════════════════════════════════════

describe('ComponentLinter - no-unwrap-utility-libs (no false positives)', () => {
  it('should allow antd via unwrap (correct usage)', async () => {
    const code = `function TestComponent({ utilities }) {
      const { Select, Spin, Button } = unwrapLibraryComponents(antd, 'Select', 'Spin', 'Button');
      return React.createElement('div', null, 'hello');
    }`;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);
    const violations = findViolations(result);
    expect(violations).toHaveLength(0);
  });

  it('should allow Chart.js via unwrap (UI library)', async () => {
    const code = `function TestComponent({ utilities }) {
      const { Chart: ChartJS } = unwrapLibraryComponents(Chart, 'Chart');
      return React.createElement('div', null, 'hello');
    }`;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);
    const violations = findViolations(result);
    expect(violations).toHaveLength(0);
  });

  it('should allow XLSX via unwrap (UI library exports)', async () => {
    const code = `function TestComponent({ utilities }) {
      const { utils, writeFile } = unwrapLibraryComponents(XLSX, 'utils', 'writeFile');
      return React.createElement('div', null, 'hello');
    }`;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);
    const violations = findViolations(result);
    expect(violations).toHaveLength(0);
  });

  it('should not flag lodash used directly (correct pattern)', async () => {
    const code = `function TestComponent({ utilities }) {
      const sorted = _.sortBy(items, 'name');
      const debouncedFn = _.debounce(loadData, 500);
      const grouped = _.groupBy(data, 'category');
      return React.createElement('div', null, 'hello');
    }`;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);
    const violations = findViolations(result);
    expect(violations).toHaveLength(0);
  });

  it('should not flag dayjs used directly (correct pattern)', async () => {
    const code = `function TestComponent({ utilities }) {
      const formatted = dayjs(date).format('YYYY-MM-DD');
      return React.createElement('div', null, 'hello');
    }`;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);
    const violations = findViolations(result);
    expect(violations).toHaveLength(0);
  });

  it('should not flag d3 used directly (correct pattern)', async () => {
    const code = `function TestComponent({ utilities }) {
      const svg = d3.select('#chart');
      const scale = d3.scaleLinear().domain([0, 100]);
      return React.createElement('div', null, 'hello');
    }`;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);
    const violations = findViolations(result);
    expect(violations).toHaveLength(0);
  });

  it('should not flag _ in non-unwrap contexts', async () => {
    const code = `function TestComponent({ utilities }) {
      const _ = someOtherThing;
      const result = _.process(data);
      return React.createElement('div', null, 'hello');
    }`;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);
    const violations = findViolations(result);
    expect(violations).toHaveLength(0);
  });

  it('should still flag _ as first arg to unwrapLibraryComponents regardless of shadowing', async () => {
    const code = `function TestComponent({ utilities }) {
      const _ = someOtherThing;
      const { debounce } = unwrapLibraryComponents(_, 'debounce');
      return React.createElement('div', null, 'hello');
    }`;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);
    const violations = findViolations(result);

    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe('critical');
  });
});
