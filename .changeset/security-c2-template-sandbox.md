---
"@memberjunction/templates": patch
"@memberjunction/server": patch
---

Security (C2): sandbox template rendering, and authorize on-demand template runs.

- **Sandboxed rendering.** `HardenNunjucksRuntime()` (new export of `@memberjunction/templates`) guards the nunjucks runtime that every nunjucks environment in the process shares. The template engine applies it when it loads and checks it before each render. A template can no longer reach `Function` (for example `{{ range.constructor("...")() }}`), `eval`, `Object`, `Reflect`, `globalThis`, `process` or the render context, which it could use to run code on the server or to change the shared environment for later renders. The member names `constructor`, `prototype`, `__proto__` and the `__define/lookup Getter/Setter__` accessors read as empty, even when the data defines them. A bare name resolves only to a template variable, a key of the render data, or an environment global, never to an inherited property such as `valueOf`. A template that reaches one of the restricted values fails with `TemplateSandboxError`.
- **Authorized template runs.** The `RunTemplate` mutation and the `Template.Run` remote operation now refuse scope-limited sessions (anonymous magic-link and widget guests, resource-scoped magic-link sessions) and callers without read permission on `MJ: Templates` and `MJ: Template Contents`, before they load anything. The rule is the new `GetTemplateRunRefusal()` export.
