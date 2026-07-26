// Public API Surface of @memberjunction/ng-markdown
//
// Framework-agnostic parsing, config, custom marked extensions, and types live
// in @memberjunction/markdown-core — import those directly from that package.
// This package exposes the Angular component/service plus the web-only DOM
// helpers that operate on rendered markup.

// Module
export * from './lib/markdown.module';

// Components
export * from './lib/components/markdown.component';

// Services
export * from './lib/services/markdown.service';

// Web-only DOM helpers (the pure marked extensions are in @memberjunction/markdown-core)
export * from './lib/extensions/collapsible-headings.extension';
export * from './lib/extensions/code-copy.extension';
export * from './lib/extensions/svg-renderer.extension';
