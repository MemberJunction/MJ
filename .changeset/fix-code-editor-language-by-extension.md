---
"@memberjunction/ng-code-editor": patch
---

Resolve a language by its file extension when the name does not match, restoring syntax highlighting for template editors.

`_findLanguage` matched only `name` and `alias`. Several names in common use are registered by CodeMirror as extensions instead — `jinja2` is one of Jinja's (`["j2", "jinja", "jinja2"]`) while its only matchable name is `"Jinja"`. Core-entity-forms' template editors ask for `jinja2` at six call sites, so every prompt and template opened with `Language not found: jinja2` and no highlighting at all — on content that is Nunjucks, where `{{ }}` and `{% %}` are most of what you are reading.

Deliberately a fallback rather than part of the main loop: it runs only when nothing matched by name or alias, so it can turn a miss into a hit but can never change a match that already resolved. That matters because short extensions (`r`, `md`, `ts`) could otherwise outrank another language's real name.

Covered by `ng-code-editor.language.dom.test.ts`, which pins that ordering (`r` resolves to R and `html` to HTML, both of which also appear among other languages' extensions) alongside the `jinja2` case itself.
