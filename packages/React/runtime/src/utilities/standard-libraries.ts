/**
 * @fileoverview Standard libraries configuration for React components
 * @module @memberjunction/react-runtime/utilities
 */

/**
 * CDN URLs for standard libraries used by React components
 */
export const STANDARD_LIBRARY_URLS = {
  // Core React libraries
  REACT: 'https://unpkg.com/react@18/umd/react.development.js',
  REACT_DOM: 'https://unpkg.com/react-dom@18/umd/react-dom.development.js',
  BABEL: 'https://unpkg.com/@babel/standalone/babel.min.js',
  
  // Data Visualization
  D3: 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js',
  CHART_JS: 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.js',
  
  // Utilities
  LODASH: 'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js',
  DAYJS: 'https://unpkg.com/dayjs@1.11.10/dayjs.min.js',
  
  // UI Libraries (optional)
  ANTD: 'https://unpkg.com/antd@5.11.5/dist/antd.min.js',
  REACT_BOOTSTRAP: 'https://unpkg.com/react-bootstrap@2.9.1/dist/react-bootstrap.min.js',
  
  // CSS
  ANTD_CSS: 'https://unpkg.com/antd@5.11.5/dist/reset.css',
  BOOTSTRAP_CSS: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css'
};

/**
 * Interface for standard libraries available to React components
 */
export interface StandardLibraries {
  _: any; // lodash
  d3?: any;
  Chart?: any;
  dayjs?: any;
  antd?: any;
  ReactBootstrap?: any;
  [key: string]: any; // Allow additional libraries
}

/**
 * Get the list of core libraries that should always be loaded
 */
export function getCoreLibraryUrls(): string[] {
  return [
    STANDARD_LIBRARY_URLS.LODASH,
    STANDARD_LIBRARY_URLS.D3,
    STANDARD_LIBRARY_URLS.CHART_JS,
    STANDARD_LIBRARY_URLS.DAYJS
  ];
}

/**
 * Get the list of optional UI library URLs
 */
export function getUILibraryUrls(): string[] {
  return [
    STANDARD_LIBRARY_URLS.ANTD,
    STANDARD_LIBRARY_URLS.REACT_BOOTSTRAP
  ];
}

/**
 * Get the list of CSS URLs for UI libraries
 */
export function getCSSUrls(): string[] {
  return [
    STANDARD_LIBRARY_URLS.ANTD_CSS,
    STANDARD_LIBRARY_URLS.BOOTSTRAP_CSS
  ];
}

/**
 * Creates a standard libraries object for browser environments
 * This assumes the libraries are already loaded as globals
 */
export function createStandardLibraries(): StandardLibraries {
  if (typeof window === 'undefined') {
    // Return empty object in Node.js environments
    return {
      _: undefined
    };
  }
  
  return {
    _: (window as any)._,
    d3: (window as any).d3,
    Chart: (window as any).Chart,
    dayjs: (window as any).dayjs,
    antd: (window as any).antd,
    ReactBootstrap: (window as any).ReactBootstrap
  };
}