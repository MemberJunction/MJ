# @memberjunction/ng-markdown

## 5.40.0

## 5.39.0

### Patch Changes

- 5b4102c: Fix raw HTML blocks split by a blank line rendering as an escaped code block.

  Embedded raw HTML in markdown (e.g. a Skip PRD `## Mockup` section) is meant to be a single HTML block, but CommonMark ends an HTML block at the first blank line; the following indented (4+ space) markup is then tokenized as an indented code block and shown as escaped text — a "black box" of raw markup (often a leading `<!-- ... -->` comment) instead of the intended HTML.

  `MarkdownService` now applies a `marked` `processAllTokens` hook (`createHtmlBlockRepairExtension`) that reclassifies the misparsed `code` token back to an `html` token. It only fires when the token is an indented code block (no language — fenced ` ``` ` examples are untouched), starts with an HTML tag/comment, and is adjacent to an `html` token (the signature of a split HTML block), so prose, fenced code examples, and standalone indented code render unchanged.

## 5.38.0

## 5.37.0

## 5.36.0

## 5.35.0

## 5.34.1

## 5.34.0

### Patch Changes

- b03bfb4: Replace hardcoded colors with semantic design tokens across Angular components and shared styles, restoring correct dark-mode behavior and enabling white-labeling. Also maps the System Diagnostics PerfMon chrome (background, borders, text, controls) to MJ semantic tokens so the panel adapts to the active theme; series colors stay categorical.
- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.

## 5.33.0

## 5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes

## 5.30.1

## 5.30.0

## 5.29.0

## 5.28.0

## 5.27.1

## 5.27.0

## 5.26.0

## 5.25.0

## 5.24.0

## 5.23.0

## 5.22.0

## 5.21.0

## 5.20.0

## 5.19.0

## 5.18.0

### Patch Changes

- de310bc: markdown darkmode fix

## 5.17.0

## 5.16.0

## 5.15.0

## 5.14.0

## 5.13.0

## 5.12.0

### Patch Changes

- a57b8d5: Migrate all hardcoded CSS colors to design tokens for dark mode and white-label support. Introduces `--mj-*` semantic CSS custom properties in `_tokens.scss` with full `[data-theme="dark"]` overrides. Migrates 1,544 of 1,659 hardcoded hex values (93%) across 72+ CSS files to semantic tokens. Adds logo token system (`--mj-logo-mark`, `--mj-logo-color`) for themeable branding. Fixes dark mode theming for CodeMirror, AG Grid v35, and Kendo popups. No API or behavioral changes — CSS only.
- e87d153: design tokens phase 1

## 5.11.0

## 5.10.1

## 5.10.0

## 5.9.0

## 5.8.0

## 5.7.0

## 5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes

## 5.4.1

## 5.4.0

## 5.3.1

## 5.3.0

## 5.2.0

## 5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

## 4.4.0

## 4.3.1

## 4.3.0

## 4.2.0

## 4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

## 3.4.0

## 3.3.0

## 3.2.0

## 3.1.1

## 3.0.0

## 2.133.0

## 2.132.0

## 2.131.0

## 2.130.1

### Patch Changes

- 0dcb9cb: no migration

## 2.130.0

## 2.129.0

## 2.128.0

### Patch Changes

- 0863f85: no migration

## 2.127.0

## 2.126.1

## 2.126.0

### Minor Changes

- 389183e: migration
