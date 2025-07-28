import { ExternalLibraryConfig } from '@memberjunction/react-runtime';

/**
 * Additional libraries required for Skip Chat components
 * This includes Ant Design, D3, and Chart.js
 * 
 * Usage:
 * ```typescript
 * import { SKIP_CHAT_ADDITIONAL_LIBRARIES } from '@memberjunction/ng-skip-chat';
 * 
 * // When initializing React runtime
 * await adapter.initialize(null, SKIP_CHAT_ADDITIONAL_LIBRARIES);
 * ```
 */
export const SKIP_CHAT_ADDITIONAL_LIBRARIES: ExternalLibraryConfig[] = [
    // Ant Design dependencies
    {
      id: 'dayjs',
      name: 'dayjs',
      displayName: 'Day.js',
      category: 'utility',
      globalVariable: 'dayjs',
      version: '1.11.10',
      cdnUrl: 'https://unpkg.com/dayjs@1.11.10/dayjs.min.js',
      description: 'Fast 2KB alternative to Moment.js with the same modern API',
      isEnabled: true,
      isCore: false
    },
    // UI component libraries
    {
      id: 'antd',
      name: 'antd',
      displayName: 'Ant Design',
      category: 'ui',
      globalVariable: 'antd',
      version: '5.20.2',
      cdnUrl: 'https://unpkg.com/antd@5.20.2/dist/antd.min.js',
      cdnCssUrl: 'https://unpkg.com/antd@5.20.2/dist/reset.css',
      description: 'Enterprise-class UI design language and React components',
      aiInstructions: 'Use Ant Design components for consistent UI. Access via window.antd or destructure from libraries.antd. Common components: Button, Table, Form, Input, Select, DatePicker, Modal, Tabs, Card.',
      exampleUsage: 'const { Button, Table } = libraries.antd || window.antd;',
      isEnabled: true,
      isCore: false
    },
    // Charting libraries
    {
      id: 'd3',
      name: 'd3',
      displayName: 'D3.js',
      category: 'charting',
      globalVariable: 'd3',
      version: '7.8.5',
      cdnUrl: 'https://unpkg.com/d3@7.8.5/dist/d3.min.js',
      description: 'Data visualization library for creating custom charts',
      aiInstructions: 'Use D3 for complex custom visualizations. Access via window.d3 or libraries.d3. Provides low-level control over SVG elements.',
      exampleUsage: 'const d3 = libraries.d3 || window.d3;',
      isEnabled: true,
      isCore: false
    },
    {
      id: 'chartjs',
      name: 'chart.js',
      displayName: 'Chart.js',
      category: 'charting',
      globalVariable: 'Chart',
      version: '4.4.1',
      cdnUrl: 'https://unpkg.com/chart.js@4.4.1/dist/chart.umd.js',
      description: 'Simple yet flexible JavaScript charting library',
      aiInstructions: 'Use Chart.js for standard chart types (line, bar, pie, etc). Access via window.Chart or libraries.Chart. Requires a canvas element.',
      exampleUsage: 'const Chart = libraries.Chart || window.Chart; new Chart(canvasContext, config);',
      isEnabled: true,
      isCore: false
    }
];