---
"@memberjunction/core": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-explorer-core": patch
---

feat(forms): inline "create new" from FK fields (event-based) + fold Allow\*API into entity permissions

When the related record you need isn't in a foreign-key dropdown, you can now create it
inline. A sticky "➕ Create …" footer (always visible at the bottom of the dropdown,
prefilled with whatever you typed) requests creation; the new record is auto-selected into
the field once saved. Gated on create permission + a new `@Input() AllowFKCreate` (default
true); surface configurable via `@Input() FKCreatePresentation: 'dialog' | 'slide-in'`.

**`@memberjunction/ng-base-forms`** — the Generic FK field stays generic: it only *emits* a
new `create-related` `FormNavigationEvent` (carrying the entity, prefill `NewRecordValues`,
preferred presentation, provider, and a `Complete(record)` callback). It does **not** open
the form itself — that would couple a generic component to the app-level form presenter.

**`@memberjunction/ng-explorer-core`** — `SingleRecordComponent` handles the new
`create-related` event: opens the related entity's form via `MJFormPresenterService`
(dialog/slide-in, prefilled), then calls `event.Complete(savedRecord)` so the field selects it.

**`@memberjunction/core`** — `EntityInfo.GetUserPermisions()` now folds the entity's
`Allow{Create,Update,Delete}API` flags into the corresponding `Can*` results. An API-driven
action requires both a role grant **and** the entity allowing that action at all, so a user
can no longer be reported as able to create/update/delete records of an entity whose API for
that action is disabled. (Read is unchanged — it has no `Allow*API` flag.)
