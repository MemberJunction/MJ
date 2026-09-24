---
"@memberjunction/ng-base-forms": patch
"@memberjunction/core-actions": patch
---

A full custom entity form now renders its own body in full.

`BaseFormComponent.OwnsEntireFormBody` declares that a form composes its own body;
`InteractiveFormComponent` returns true. Such a form accepts nothing the container would
otherwise compose into it: no `BaseFormPanel` mounts, no contribution claims a section, and
no stock grid is filled in for a `DisplayInForm` relationship. The composition snapshot
reports none of them. Container chrome that belongs to the record rather than to the body —
the toolbar, Save/Delete, History, Record Changes — is unaffected.

The related-grid fill-in reads an unbaked relationship as stale CodeGen and supplies the
missing grid. That premise holds for a generated form and inverts for a custom one, which
bakes nothing by design: every relationship read as drift, so the container composed a form
the author never asked for.

The panel check lives in the slot host rather than the form template because the container
always emits an `after-everything` slot. Removing the four slots the interactive form used to
emit would have sent every panel through the fallback chain and rendered the lot at the bottom.

`Get Form Composition For Entity` reports the same to agents with no browser snapshot: an
entity with an Active, scope-matching override returns `FullCustomForm: true`, empty
`Sections`, `Related`, `SlotsPresent` and `Contributions`, and a Note saying to propose a new
version of the full form instead of a panel.
