---
'@memberjunction/codegen-lib': patch
---

A new schema gets its Application on PostgreSQL, and never loses the window on any platform

Two defects closed the same door. `createNewApplication` named the `Application` columns unquoted, and `conditionalInsert` wraps that statement in PG's `DO $$ ... $$` block — which the identifier auto-quoter skips wholesale, since it cannot know whether a dollar-quoted block holds SQL or text. `ID` therefore reached PostgreSQL folded to `id` and the INSERT failed on every run, silently: the method catches, logs and returns null, and its caller carries on, so CodeGen finished green while the schema got no Application. Separately, Application creation was gated on `isSchemaNew()`, evaluated moments before the INSERT that ends that condition — so the window closed permanently on first use whether or not an Application was ever created.

Columns are now quoted, and the create path is the shared `addEntityToApplicationForSchema` helper (already used for virtual and query entities), which looks up and creates if absent every time rather than once.
