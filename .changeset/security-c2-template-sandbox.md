---
"@memberjunction/templates": patch
"@memberjunction/server": patch
---

Security (C2): sandbox template rendering, and authorize on-demand template runs.

- **Sandboxed templates.** `HardenNunjucksRuntime()` (new export of `@memberjunction/templates`) guards the nunjucks parser and runtime that every nunjucks environment in the process shares, including templates loaded through `include` and `import`. The template engine applies it when it loads and checks it before each render. A template that breaks one of the rules below fails with `TemplateSandboxError`.
  - **Before a template compiles**, `AssertTemplateTreeIsSafe()` (new export) checks its parse tree, because the nunjucks compiler copies template-controlled names into the code it generates. Variable, filter, test, loop, `set`, macro, import and block names must be plain names (letters, digits, `_` and `$`; filter names can contain dots). A called member's name must not contain a backslash or a line break. A loop variable must not reuse a name the generated code relies on (`context`, `frame`, `runtime`, `env`, `cb`, `next`, ...).
  - **While a template renders**, it can no longer reach `Function` (for example `{{ range.constructor("...")() }}`), `eval`, `Object`, `Reflect`, `globalThis`, `process` or the render context. It could use those to run code on the server, or to change the shared environment for later renders. The member names `constructor`, `prototype` and the `__define/lookup Getter/Setter__` accessors read as empty unless they hold an object's own data that is not a function. `__proto__` always reads as empty. A bare name resolves only to a template variable, a key of the render data, or an environment global, never to an inherited property such as `valueOf`.
- **Authorized template runs.** The `RunTemplate` mutation and the `Template.Run` remote operation now refuse scope-limited sessions (anonymous magic-link and widget guests, resource-scoped magic-link sessions) and callers without read permission on `MJ: Templates` and `MJ: Template Contents`, before they load anything. The rule is the new `GetTemplateRunRefusal()` export.
