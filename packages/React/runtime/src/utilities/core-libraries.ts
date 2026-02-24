import { ExternalLibraryConfig } from '../types/library-config';

/**
 * Get the React CDN URL based on debug mode
 */
function getReactUrl(debug: boolean = false): string {
  return debug 
    ? 'https://unpkg.com/react@18.2.0/umd/react.development.js'
    : 'https://unpkg.com/react@18.2.0/umd/react.production.min.js';
}

/**
 * Get the ReactDOM CDN URL based on debug mode
 */
function getReactDOMUrl(debug: boolean = false): string {
  return debug
    ? 'https://unpkg.com/react-dom@18.2.0/umd/react-dom.development.js'
    : 'https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js';
}

/**
 * Get the core runtime libraries configuration
 * @param debug Whether to use development builds for better error messages
 */
/**
 * Get the React fallback CDN URL based on debug mode
 */
function getReactFallbackUrl(debug: boolean = false): string {
  return debug
    ? 'https://cdn.jsdelivr.net/npm/react@18.2.0/umd/react.development.js'
    : 'https://cdn.jsdelivr.net/npm/react@18.2.0/umd/react.production.min.js';
}

/**
 * Get the ReactDOM fallback CDN URL based on debug mode
 */
function getReactDOMFallbackUrl(debug: boolean = false): string {
  return debug
    ? 'https://cdn.jsdelivr.net/npm/react-dom@18.2.0/umd/react-dom.development.js'
    : 'https://cdn.jsdelivr.net/npm/react-dom@18.2.0/umd/react-dom.production.min.js';
}

/**
 * Get the core runtime libraries configuration
 * @param debug Whether to use development builds for better error messages
 */
export function getCoreRuntimeLibraries(debug: boolean = false): ExternalLibraryConfig[] {
  return [
    {
      id: 'react',
      name: 'react',
      displayName: 'React',
      category: 'runtime',
      globalVariable: 'React',
      version: '18.2.0',
      cdnUrl: getReactUrl(debug),
      fallbackCdnUrls: [getReactFallbackUrl(debug)],
      description: 'React core library',
      isEnabled: true,
      isCore: true,
      isRuntimeOnly: true
    },
    {
      id: 'react-dom',
      name: 'react-dom',
      displayName: 'ReactDOM',
      category: 'runtime',
      globalVariable: 'ReactDOM',
      version: '18.2.0',
      cdnUrl: getReactDOMUrl(debug),
      fallbackCdnUrls: [getReactDOMFallbackUrl(debug)],
      description: 'React DOM library',
      isEnabled: true,
      isCore: true,
      isRuntimeOnly: true
    },
    {
      id: 'babel-standalone',
      name: '@babel/standalone',
      displayName: 'Babel Standalone',
      category: 'runtime',
      globalVariable: 'Babel',
      version: '7.24.4',
      cdnUrl: 'https://unpkg.com/@babel/standalone@7.24.4/babel.min.js',
      fallbackCdnUrls: ['https://cdn.jsdelivr.net/npm/@babel/standalone@7.24.4/babel.min.js'],
      description: 'Babel compiler for JSX transformation',
      isEnabled: true,
      isCore: true,
      isRuntimeOnly: true
    }
  ];
}

/**
 * Check if a library ID is a core runtime library
 */
export function isCoreRuntimeLibrary(libraryId: string): boolean {
  const coreLibraries = getCoreRuntimeLibraries();
  return coreLibraries.some((lib: ExternalLibraryConfig) => lib.id === libraryId);
}