// Public API of @memberjunction/markdown-core
//
// Framework-agnostic markdown engine + custom extensions. No DOM, Prism, or
// Mermaid dependency — consumers (ng-markdown on web, the React Native
// renderer, etc.) inject highlighting and handle presentation.

// Engine
export * from './engine/markdown-engine';

// Extensions (marked configuration building blocks)
export * from './extensions/svg-renderer.extension';
export * from './extensions/collapsible-headings.extension';

// Helpers
export * from './helpers/language';
export * from './helpers/escape';

// Types
export * from './types/markdown.types';
