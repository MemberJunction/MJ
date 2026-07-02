/**
 * Event Parameter Validation Tests
 *
 * Validates that event callback handlers access the correct properties from
 * the event object, as defined by the component spec's event parameter types.
 */

import { describe, it, expect } from 'vitest';
import { ComponentLinter } from '@memberjunction/react-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

const RULE_NAME = 'event-parameter-validation';

// ---------------------------------------------------------------------------
// Shared spec with DataGrid and SimpleChart as dependencies
// ---------------------------------------------------------------------------

const spec = {
  name: 'TestComponent',
  type: 'report' as const,
  title: 'Test',
  description: 'Test component',
  code: '',
  location: 'embedded' as const,
  functionalRequirements: '',
  technicalDesign: '',
  exampleUsage: '<TestComponent />',
  properties: [],
  events: [],
  dependencies: [
    {
      name: 'DataGrid',
      type: 'table' as const,
      title: 'DataGrid',
      description: 'Grid component',
      code: '',
      location: 'registry' as const,
      functionalRequirements: '',
      technicalDesign: '',
      exampleUsage: '<DataGrid />',
      properties: [],
      events: [
        {
          name: 'rowClick',
          description: 'Fired when a row is clicked',
          parameters: [{ name: 'event', description: 'Event data', type: '{ record: object, cancel: boolean }' as 'object' }],
        },
        {
          name: 'selectionChanged',
          description: 'Fired when row selection changes',
          parameters: [{ name: 'event', description: 'Event data', type: '{ selectedRows: Array<object> }' as 'object' }],
        },
        {
          name: 'sortChanged',
          description: 'Fired when sort state changes',
          parameters: [{ name: 'event', description: 'Event data', type: '{ sortState: { column: string, direction: string } }' as 'object' }],
        },
        {
          name: 'pageChanged',
          description: 'Fired when page changes',
          parameters: [{ name: 'event', description: 'Event data', type: '{ pageNumber: number, pageSize: number, visibleRows: Array<object> }' as 'object' }],
        },
      ],
    },
    {
      name: 'SimpleChart',
      type: 'chart' as const,
      title: 'SimpleChart',
      description: 'Chart component',
      code: '',
      location: 'registry' as const,
      functionalRequirements: '',
      technicalDesign: '',
      exampleUsage: '<SimpleChart />',
      properties: [],
      events: [
        {
          name: 'dataPointClick',
          description: 'Fired when a data point is clicked',
          parameters: [{
            name: 'clickData',
            description: 'Click data',
            type: '{ seriesName: string; value: number; label: string; records: Array<object>; chartType: string; percentage: number }' as 'object',
          }],
        },
      ],
    },
  ],
} as ComponentSpec;

// ═══════════════════════════════════════════════════════════════════════════
// TRUE POSITIVE TESTS (should produce violations)
// ═══════════════════════════════════════════════════════════════════════════

describe('event-parameter-validation: true positives', () => {
  it('should flag e.data on DataGrid rowClick (AG Grid convention mistake)', async () => {
    const code = `
      function TestComponent({ utilities, styles }) {
        return React.createElement(DataGrid, {
          onRowClick: (e) => {
            console.log(e.data);
          }
        });
      }
    `;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', spec, true);
    const violations = result.violations.filter(v => v.rule === RULE_NAME);

    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].message).toContain('"data"');
    expect(violations[0].message).toContain('rowClick');
    expect(violations[0].severity).toBe('high');
    expect(violations[0].suggestion?.text).toContain('record');
  });

  it('should flag destructured { data } on DataGrid rowClick', async () => {
    const code = `
      function TestComponent({ utilities, styles }) {
        return React.createElement(DataGrid, {
          onRowClick: ({ data }) => {
            console.log(data);
          }
        });
      }
    `;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', spec, true);
    const violations = result.violations.filter(v => v.rule === RULE_NAME);

    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].message).toContain('"data"');
    expect(violations[0].message).toContain('rowClick');
    expect(violations[0].suggestion?.text).toContain('record');
  });

  it('should flag multiple wrong accesses on rowClick', async () => {
    const code = `
      function TestComponent({ utilities, styles }) {
        return React.createElement(DataGrid, {
          onRowClick: (evt) => {
            const d = evt.data;
            const id = evt.rowId;
          }
        });
      }
    `;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', spec, true);
    const violations = result.violations.filter(v => v.rule === RULE_NAME);

    expect(violations.length).toBeGreaterThanOrEqual(2);
    const messages = violations.map(v => v.message);
    expect(messages.some(m => m.includes('"data"'))).toBe(true);
    expect(messages.some(m => m.includes('"rowId"'))).toBe(true);
  });

  it('should flag e.rows on selectionChanged (suggest selectedRows)', async () => {
    const code = `
      function TestComponent({ utilities, styles }) {
        return React.createElement(DataGrid, {
          onSelectionChanged: (e) => {
            const items = e.rows;
          }
        });
      }
    `;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', spec, true);
    const violations = result.violations.filter(v => v.rule === RULE_NAME);

    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].message).toContain('"rows"');
    expect(violations[0].message).toContain('selectionChanged');
    expect(violations[0].suggestion?.text).toContain('selectedRows');
  });

  it('should flag e.sort on sortChanged (suggest sortState)', async () => {
    const code = `
      function TestComponent({ utilities, styles }) {
        return React.createElement(DataGrid, {
          onSortChanged: (e) => {
            const s = e.sort;
          }
        });
      }
    `;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', spec, true);
    const violations = result.violations.filter(v => v.rule === RULE_NAME);

    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].message).toContain('"sort"');
    expect(violations[0].suggestion?.text).toContain('sortState');
  });

  it('should flag e.name on SimpleChart dataPointClick (suggest label)', async () => {
    const code = `
      function TestComponent({ utilities, styles }) {
        return React.createElement(SimpleChart, {
          onDataPointClick: (e) => {
            const n = e.name;
          }
        });
      }
    `;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', spec, true);
    const violations = result.violations.filter(v => v.rule === RULE_NAME);

    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].message).toContain('"name"');
    expect(violations[0].message).toContain('dataPointClick');
  });

  it('should flag named handler with wrong property access', async () => {
    const code = `
      function TestComponent({ utilities, styles }) {
        const handleRowClick = (e) => {
          console.log(e.data);
        };
        return React.createElement(DataGrid, {
          onRowClick: handleRowClick
        });
      }
    `;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', spec, true);
    const violations = result.violations.filter(v => v.rule === RULE_NAME);

    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].message).toContain('"data"');
  });

  it('should flag destructured alias ({ data: row }) where data is wrong key', async () => {
    const code = `
      function TestComponent({ utilities, styles }) {
        return React.createElement(DataGrid, {
          onRowClick: ({ data: row }) => {
            console.log(row);
          }
        });
      }
    `;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', spec, true);
    const violations = result.violations.filter(v => v.rule === RULE_NAME);

    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].message).toContain('"data"');
    expect(violations[0].suggestion?.text).toContain('record');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TRUE NEGATIVE TESTS (should NOT produce violations)
// ═══════════════════════════════════════════════════════════════════════════

describe('event-parameter-validation: true negatives', () => {
  it('should NOT flag correct e.record access on rowClick', async () => {
    const code = `
      function TestComponent({ utilities, styles }) {
        return React.createElement(DataGrid, {
          onRowClick: (e) => {
            console.log(e.record);
            console.log(e.cancel);
          }
        });
      }
    `;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', spec, true);
    const violations = result.violations.filter(v => v.rule === RULE_NAME);
    expect(violations.length).toBe(0);
  });

  it('should NOT flag correct destructured ({ record, cancel })', async () => {
    const code = `
      function TestComponent({ utilities, styles }) {
        return React.createElement(DataGrid, {
          onRowClick: ({ record, cancel }) => {
            console.log(record, cancel);
          }
        });
      }
    `;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', spec, true);
    const violations = result.violations.filter(v => v.rule === RULE_NAME);
    expect(violations.length).toBe(0);
  });

  it('should NOT flag correct alias destructuring ({ record: row })', async () => {
    const code = `
      function TestComponent({ utilities, styles }) {
        return React.createElement(DataGrid, {
          onRowClick: ({ record: row }) => {
            console.log(row);
          }
        });
      }
    `;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', spec, true);
    const violations = result.violations.filter(v => v.rule === RULE_NAME);
    expect(violations.length).toBe(0);
  });

  it('should NOT flag callback with no parameters', async () => {
    const code = `
      function TestComponent({ utilities, styles }) {
        return React.createElement(DataGrid, {
          onRowClick: () => {
            console.log('clicked');
          }
        });
      }
    `;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', spec, true);
    const violations = result.violations.filter(v => v.rule === RULE_NAME);
    expect(violations.length).toBe(0);
  });

  it('should NOT flag unresolvable function reference', async () => {
    const code = `
      function TestComponent({ utilities, styles, onRowClick: externalHandler }) {
        return React.createElement(DataGrid, {
          onRowClick: externalHandler
        });
      }
    `;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', spec, true);
    const violations = result.violations.filter(v => v.rule === RULE_NAME);
    expect(violations.length).toBe(0);
  });

  it('should NOT flag correct SimpleChart property access', async () => {
    const code = `
      function TestComponent({ utilities, styles }) {
        return React.createElement(SimpleChart, {
          onDataPointClick: (e) => {
            console.log(e.label, e.value, e.records, e.seriesName, e.chartType, e.percentage);
          }
        });
      }
    `;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', spec, true);
    const violations = result.violations.filter(v => v.rule === RULE_NAME);
    expect(violations.length).toBe(0);
  });

  it('should NOT flag nested property access e.sortState.column (only first level)', async () => {
    const code = `
      function TestComponent({ utilities, styles }) {
        return React.createElement(DataGrid, {
          onSortChanged: (e) => {
            console.log(e.sortState.column);
          }
        });
      }
    `;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', spec, true);
    const violations = result.violations.filter(v => v.rule === RULE_NAME);
    expect(violations.length).toBe(0);
  });

  it('should NOT flag correct pageChanged access', async () => {
    const code = `
      function TestComponent({ utilities, styles }) {
        return React.createElement(DataGrid, {
          onPageChanged: (e) => {
            console.log(e.pageNumber, e.pageSize, e.visibleRows);
          }
        });
      }
    `;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', spec, true);
    const violations = result.violations.filter(v => v.rule === RULE_NAME);
    expect(violations.length).toBe(0);
  });

  it('should NOT flag events on non-dependency components', async () => {
    const code = `
      function TestComponent({ utilities, styles }) {
        return React.createElement(UnknownComponent, {
          onRowClick: (e) => {
            console.log(e.whatever);
          }
        });
      }
    `;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', spec, true);
    const violations = result.violations.filter(v => v.rule === RULE_NAME);
    expect(violations.length).toBe(0);
  });

  it('should NOT flag partial destructuring with only valid props', async () => {
    const code = `
      function TestComponent({ utilities, styles }) {
        return React.createElement(DataGrid, {
          onRowClick: ({ record }) => {
            console.log(record);
          }
        });
      }
    `;

    const result = await ComponentLinter.lintComponent(code, 'TestComponent', spec, true);
    const violations = result.violations.filter(v => v.rule === RULE_NAME);
    expect(violations.length).toBe(0);
  });
});
