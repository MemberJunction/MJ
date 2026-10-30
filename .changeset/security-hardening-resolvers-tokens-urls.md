---
"@memberjunction/global": patch
"@memberjunction/server": patch
"@memberjunction/component-registry-server": patch
"@memberjunction/external-change-detection": patch
"@memberjunction/metadata-sync": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/react-runtime": patch
---

Security hardening across SQL filter construction, expression sandboxing, token verification, fail-closed endpoints, and client URL/selector screening:

- **Pure AST transform evaluation (`@memberjunction/global`)**: Replace `new Function` in `FieldTransformEngine` with an Acorn-based AST interpreter (`SafeTransformAstEvaluator`) that blocks prototype climbs, ambient global callback smuggling, and dynamic code generation, while supporting standard string/array transform methods (`split`, `slice`, `join`, `substring`, `replace`, `padStart`, `padEnd`, etc.). Harden `SafeExpressionEvaluator` against higher-order callback smuggling.
- **SQL filter & token hardening (`@memberjunction/server`, `@memberjunction/external-change-detection`, `@memberjunction/metadata-sync`)**: Enforce strict UUID shape validation and SQL string escaping on `ExtraFilter` interpolations across resolvers and REST handlers, reject non-primitive/non-literal primary key and lookup filter values in `MetadataSync`, perform non-short-circuiting constant-time access-token lookups in `GetDataResolver` with full token redaction from error messages, derive a domain-separated HS256 media-access signing subkey from `MJ_BASE_ENCRYPTION_KEY`, and default `SetupRESTEndpoints` to disabled (`enabled: false`).
- **Fail-closed registry auth (`@memberjunction/component-registry-server`)**: Refuse requests by default in `ComponentRegistryAPIServer.checkAPIKey` until overridden by a subclass, and protect both `/components` and `/feedback` routes when `requireAuth` is enabled.
- **Client URL-scheme & DOM selector screening (`@memberjunction/ng-core-entity-forms`, `@memberjunction/ng-conversations`, `@memberjunction/react-runtime`)**: Screen media and subresource URLs to `http:` / `https:` (rejecting `javascript:`, `data:`, `blob:`, and scheme-relative `//` targets) across viewer, open-in-tab, download, session-state rehydration, and dynamic `<script>` / `<link>` loaders, and replace interpolated `document.querySelector` URL lookups with direct attribute comparison.
