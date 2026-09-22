---
"@memberjunction/interactive-component-types": minor
"@memberjunction/core-entities": minor
"@memberjunction/ng-base-forms": minor
"@memberjunction/core-actions": minor
"@memberjunction/ng-artifacts": patch
---

A form contribution can stand in for a single field.

`EntityFormContribution.ReplacesFieldName` names one field. The panel renders at the top of
the section that draws that field, and the field itself is not drawn. It is the smallest of
the four claims a contribution can make — a rail tab, a field section, a field, a related
grid — and the table's one-claim constraint now covers all of them, because replacing a
section and one field inside it describes two different panels.

The section is what hosts the panel, through the new `<mj-form-field-panel-slot>`, because
the section is the only thing that knows which fields it draws. The field stops rendering
through `FormContext.claimedFieldNames`, in read and edit mode alike, so a claimed value is
never shown twice. `mj-form-field` carries `data-field-name` and `data-field-label` so the
placement dialog's offscreen probe can read a form's field layout the same way it reads its
sections.

A field claim is the one placement the user does not choose a slot for: the panel belongs
inside that field's section, and the dialog says so rather than offering a position it will
not honour.
