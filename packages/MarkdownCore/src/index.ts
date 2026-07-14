// Public API of @memberjunction/markdown-core
//
// Framework-agnostic markdown engine + custom extensions. No DOM, Prism, or
// Mermaid dependency — consumers (ng-markdown on web, the React Native
// renderer, etc.) inject highlighting and handle presentation.

// Engine
export * from './engine/markdown-engine.js';

// Extensions (marked configuration building blocks)
export * from './extensions/svg-renderer.extension.js';
export * from './extensions/collapsible-headings.extension.js';
export * from './extensions/html-block-repair.extension.js';

// Helpers
export * from './helpers/language.js';
export * from './helpers/escape.js';

// Types
export * from './types/markdown.types.js';
