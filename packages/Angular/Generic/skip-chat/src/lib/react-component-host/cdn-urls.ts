
/**
 * CDN URLs for external dependencies
 * These can be configured via environment variables in the future
 */
export const CDN_URLS = {
  // Core React dependencies
  BABEL_STANDALONE: 'https://unpkg.com/@babel/standalone@7/babel.min.js',
  REACT: 'https://unpkg.com/react@18/umd/react.production.min.js',
  REACT_DOM: 'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  
  // Ant Design dependencies
  DAYJS: 'https://unpkg.com/dayjs@1.11.10/dayjs.min.js',
  
  // UI Libraries - Using UMD builds that work with global React
  ANTD_JS: 'https://unpkg.com/antd@5.12.8/dist/antd.js',
  ANTD_CSS: 'https://unpkg.com/antd@5.12.8/dist/reset.css',
  REACT_BOOTSTRAP_JS: 'https://unpkg.com/react-bootstrap@2.9.1/dist/react-bootstrap.js',
  BOOTSTRAP_CSS: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  
  // Data Visualization
  D3_JS: 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js',
  CHART_JS: 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.js',
  
  // Utilities
  LODASH_JS: 'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js'
};
