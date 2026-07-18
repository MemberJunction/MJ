# @memberjunction/markdown-core

## 5.48.0

### Patch Changes

- a101255: Fix: `@memberjunction/markdown-core` is published as a pure ESM package (`"type": "module"`) but its source used extensionless relative import/export specifiers. The base tsconfig's `moduleResolution: "bundler"` tolerated them, so `tsc` and bundler-based app builds stayed green — but Node's native ESM resolver is strict and threw `ERR_MODULE_NOT_FOUND` at load time for any native-ESM consumer (Vitest, plain Node), blocking downstream adoption. All relative specifiers now carry explicit `.js` extensions, and the package tsconfig moves to `module`/`moduleResolution: "nodenext"` so an extensionless specifier is a compile error going forward. Fixes #3137.

## 5.47.0

## 5.46.0

## 5.45.1

## 5.45.0
