---
"@memberjunction/interactive-component-types": minor
"@memberjunction/core-entities": minor
"@memberjunction/ng-base-forms": minor
"@memberjunction/core-actions": minor
"@memberjunction/ng-artifacts": patch
---

A form contribution can stand in for a group of fields.

`EntityFormContribution.ReplacesFieldNames` is a JSON array of field names — the same shape
as `FormChromeRule.JoinFields`, for the same reason in the same part of the runtime. The
panel renders at the top of the section that draws them, and those fields are not drawn. It
is the smallest of the four claims a contribution can make — a rail tab, a field section,
some fields, a related grid — and the table's one-claim constraint now covers all of them,
because replacing a section and fields inside it describes two different panels.

Every name must belong to one section: the panel has one place to draw, so a claim spread
over two sections has no single top to sit at. The dialog makes that impossible to express
rather than refusing it afterwards — picking a different group clears the fields chosen in
the old one.

The section is what hosts the panel, through the new `<mj-form-field-panel-slot>`, because
the section is the only thing that knows which fields it draws. The fields stop rendering
through `FormContext.claimedFieldNames`, in read and edit mode alike, so a claimed value is
never shown twice. `mj-form-field` carries `data-field-name` and `data-field-label` so the
placement dialog's offscreen probe can read a form's field layout the same way it reads its
sections.

A field claim is the one placement the user does not choose a slot for: the panel belongs
inside those fields' section, and the dialog says so rather than offering a position it will
not honour.
