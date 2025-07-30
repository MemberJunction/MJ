import { ExternalLibraryConfig } from '../types/library-config';

/**
 * Core runtime libraries required for the React runtime to function.
 * These are not plugin libraries and are always loaded.
 */
export const CORE_RUNTIME_LIBRARIES: ExternalLibraryConfig[] = [
  {
    id: 'react',
    name: 'react',
    displayName: 'React',
    category: 'runtime',
    globalVariable: 'React',
    version: '18.2.0',
    cdnUrl: 'https://unpkg.com/react@18.2.0/umd/react.production.min.js',
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
    cdnUrl: 'https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js',
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
    description: 'Babel compiler for JSX transformation',
    isEnabled: true,
    isCore: true,
    isRuntimeOnly: true
  }
];

/**
 * Get the core runtime libraries configuration
 */
export function getCoreRuntimeLibraries(): ExternalLibraryConfig[] {
  return CORE_RUNTIME_LIBRARIES;
}

/**
 * Check if a library ID is a core runtime library
 */
export function isCoreRuntimeLibrary(libraryId: string): boolean {
  return CORE_RUNTIME_LIBRARIES.some(lib => lib.id === libraryId);
}