/**
 * Example of testing React components with hierarchies using the enhanced test harness
 */

import { ReactTestHarness, ComponentSpec } from '@memberjunction/react-test-harness';

async function runHierarchyTests() {
  const harness = new ReactTestHarness({ debug: true });
  
  try {
    await harness.initialize();
    
    // Example 1: Test a component hierarchy with Skip-style specifications
    const dashboardSpec: ComponentSpec = {
      componentName: 'Dashboard',
      componentCode: `
        function Component({ title, components }) {
          return (
            <div className="dashboard">
              <h1>{title}</h1>
              <div className="widgets">
                {components && components.MetricCard && (
                  <components.MetricCard value={42} label="Total Sales" />
                )}
                {components && components.ChartWidget && (
                  <components.ChartWidget data={[10, 20, 30]} />
                )}
              </div>
            </div>
          );
        }
      `,
      childComponents: [
        {
          componentName: 'MetricCard',
          componentCode: `
            function Component({ value, label }) {
              return (
                <div className="metric-card">
                  <div className="value">{value}</div>
                  <div className="label">{label}</div>
                </div>
              );
            }
          `
        },
        {
          componentName: 'ChartWidget',
          componentCode: `
            function Component({ data }) {
              return (
                <div className="chart-widget">
                  <div className="chart">
                    {data.map((value, index) => (
                      <div key={index} className="bar" style={{ height: value * 5 + 'px' }}>
                        {value}
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
          `
        }
      ]
    };
    
    console.log('Testing component hierarchy...');
    const result = await harness.testComponentHierarchy(
      dashboardSpec,
      { title: 'Sales Dashboard' }
    );
    
    console.log('Test completed:', result.success ? 'PASSED' : 'FAILED');
    
    // Example 2: Test a component from file with additional child components
    const childComponents: ComponentSpec[] = [
      {
        componentName: 'CustomButton',
        componentCode: `
          function Component({ onClick, children }) {
            return (
              <button className="custom-button" onClick={onClick}>
                {children}
              </button>
            );
          }
        `
      }
    ];
    
    // This would test a component from a file and inject the child components
    // await harness.testComponentFromFileWithChildren(
    //   './my-component.js',
    //   childComponents,
    //   { someProp: 'value' }
    // );
    
    // Example 3: Testing with registerChildren disabled
    const resultNoChildren = await harness.testComponent(
      dashboardSpec.componentCode!,
      { title: 'Dashboard Without Children' },
      { registerChildren: false } // Children won't be registered
    );
    
    console.log('Test without children:', resultNoChildren.success ? 'PASSED' : 'FAILED');
    
  } finally {
    await harness.close();
  }
}

// Run the example
runHierarchyTests().catch(console.error);