import { ComponentLinter } from '../src/lib/component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

describe('ComponentLinter - Dependency Event Validation', () => {

  describe('dependency-prop-validation rule - events', () => {
    it('should detect incorrect event handler names passed to dependency components', async () => {
      const code = `
        function TestChart({ utilities, styles, components }) {
          const { SimpleDrilldownChart } = components;
          const [data, setData] = useState([]);

          const handleClick = (clickData) => {
            console.log('Clicked:', clickData);
          };

          return (
            <SimpleDrilldownChart
              data={data}
              groupBy="Category"
              valueField="Amount"
              dataPointClick={handleClick}
            />
          );
        }
      `;

      const spec: ComponentSpec = {
        name: 'TestChart',
        type: 'chart',
        title: 'Test Chart Component',
        dependencies: [
          {
            name: 'SimpleDrilldownChart',
            title: 'Simple Drilldown Chart',
            location: 'registry',
            properties: [
              { name: 'data', type: 'Array<object>', required: true },
              { name: 'groupBy', type: 'string', required: true },
              { name: 'valueField', type: 'string', required: false }
            ],
            events: [
              { name: 'onDataPointClick', description: 'Fired when a data point is clicked' },
              { name: 'onSegmentSelected', description: 'Fired when a segment is selected' }
            ]
          }
        ]
      };

      const result = await ComponentLinter.lintComponent(code, spec, 'TestChart');

      // Should find the incorrect event name (dataPointClick vs onDataPointClick)
      const eventViolation = result.violations.find(v =>
        v.rule === 'dependency-prop-validation' &&
        v.message.includes('dataPointClick')
      );

      expect(eventViolation).toBeDefined();
      expect(eventViolation?.severity).toBe('high'); // Should suggest the correct name
      expect(eventViolation?.message).toContain('onDataPointClick');
    });

    it('should accept correct event handler names', async () => {
      const code = `
        function TestChart({ utilities, styles, components }) {
          const { SimpleDrilldownChart } = components;
          const [data, setData] = useState([]);

          const handleClick = (clickData) => {
            console.log('Clicked:', clickData);
          };

          return (
            <SimpleDrilldownChart
              data={data}
              groupBy="Category"
              valueField="Amount"
              onDataPointClick={handleClick}
            />
          );
        }
      `;

      const spec: ComponentSpec = {
        name: 'TestChart',
        type: 'chart',
        title: 'Test Chart Component',
        dependencies: [
          {
            name: 'SimpleDrilldownChart',
            title: 'Simple Drilldown Chart',
            location: 'registry',
            properties: [
              { name: 'data', type: 'Array<object>', required: true },
              { name: 'groupBy', type: 'string', required: true },
              { name: 'valueField', type: 'string', required: false }
            ],
            events: [
              { name: 'onDataPointClick', description: 'Fired when a data point is clicked' }
            ]
          }
        ]
      };

      const result = await ComponentLinter.lintComponent(code, spec, 'TestChart');

      // Should NOT find any violations for onDataPointClick
      const eventViolation = result.violations.find(v =>
        v.rule === 'dependency-prop-validation' &&
        v.message.includes('onDataPointClick')
      );

      expect(eventViolation).toBeUndefined();
    });

    it('should validate both properties and events together', async () => {
      const code = `
        function TestChart({ utilities, styles, components }) {
          const { SimpleChart } = components;

          return (
            <SimpleChart
              data={[]}
              groupBy="Category"
              wrongPropName="test"
              wrongEventName={() => {}}
            />
          );
        }
      `;

      const spec: ComponentSpec = {
        name: 'TestChart',
        type: 'chart',
        title: 'Test Chart Component',
        dependencies: [
          {
            name: 'SimpleChart',
            title: 'Simple Chart',
            location: 'registry',
            properties: [
              { name: 'data', type: 'Array<object>', required: true },
              { name: 'groupBy', type: 'string', required: true }
            ],
            events: [
              { name: 'onChartRendered', description: 'Fired when chart is rendered' }
            ]
          }
        ]
      };

      const result = await ComponentLinter.lintComponent(code, spec, 'TestChart');

      // Should find both incorrect prop and event
      const violations = result.violations.filter(v =>
        v.rule === 'dependency-prop-validation' &&
        (v.message.includes('wrongPropName') || v.message.includes('wrongEventName'))
      );

      expect(violations.length).toBeGreaterThanOrEqual(2);
    });

    it('should provide helpful suggestions for typos in event names', async () => {
      const code = `
        function TestChart({ utilities, styles, components }) {
          const { DataGrid } = components;

          return (
            <DataGrid
              data={[]}
              columns={['Name', 'Email']}
              onRowClicked={(row) => console.log(row)}
            />
          );
        }
      `;

      const spec: ComponentSpec = {
        name: 'TestChart',
        type: 'table',
        title: 'Test Grid Component',
        dependencies: [
          {
            name: 'DataGrid',
            title: 'Data Grid',
            location: 'registry',
            properties: [
              { name: 'data', type: 'Array<object>', required: true },
              { name: 'columns', type: 'Array<string>', required: false }
            ],
            events: [
              { name: 'onRowClick', description: 'Fired when a row is clicked' },
              { name: 'onSelectionChanged', description: 'Fired when selection changes' }
            ]
          }
        ]
      };

      const result = await ComponentLinter.lintComponent(code, spec, 'TestChart');

      // Should suggest onRowClick (without 'ed')
      const eventViolation = result.violations.find(v =>
        v.rule === 'dependency-prop-validation' &&
        v.message.includes('onRowClicked')
      );

      expect(eventViolation).toBeDefined();
      expect(eventViolation?.message).toContain('onRowClick'); // Should suggest correct name
    });
  });
});
