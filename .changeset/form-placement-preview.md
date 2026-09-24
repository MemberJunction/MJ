---
"@memberjunction/interactive-component-types": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-actions": minor
"@memberjunction/ng-base-forms": minor
"@memberjunction/ng-artifacts": minor
---

The placement dialog previews the real form, and a panel can now stand in for several sections or
sit inside one.

- **Live preview.** "Add to a form" and "Change where it goes" show the entity's real form, read-only
  and scaled to fit, with the panel's own component drawn where it will go. The form places it, hides
  what it replaces and gives it a rail item, through a registration only the preview's copy of the form
  sees. It shows the record that is open, else the entity's first record by name. On a form with a
  side rail it shows the tab that holds the panel. Every choice is made in the controls beside it.
- **Order within a position.** An "Order in this position" list sets `SortKey` against the panels
  already in that position: a slot, the top or bottom of a section, or the place of the first block
  a panel stands in for. A panel that stands in for blocks is saved at `before-fields`, so panels in
  one place share one slot and sort by `SortKey`. The open form's snapshot, the composition action
  and the drawer now report `SortKey` and the blocks each panel stands in for, and the drawer's save
  writes `SortKey`.
- **Several sections.** New `ReplacesSectionKeys` (JSON array): a panel stands in for several blocks
  of one tab and draws in the place of the first. One section is still stored in
  `ReplacesSectionKey`.
- **Inside a section.** New `InSectionKey` + `SectionPosition` (`start` | `end`): a panel draws at the
  top or bottom of a section without replacing anything. `SectionPosition` also puts a field claim at
  the bottom of its section. `<mj-collapsible-panel>` now hosts a panel slot above and below its
  fields. A contribution still makes one claim at most; the database enforces it.
- **Positions match the page.** A panel "before the fields", "after the fields" or "after the related
  grids" takes its order from the section beside its slot, so it draws where the slot is even when
  related grids share the form's section order. A panel that reports a row count no longer joins the
  form's declared section order and moves to the end.
- **"Manage this form".** The drawer is renamed and restyled to match the placement dialog. A form is
  chosen by its radio button.
- Editing a panel from the drawer keeps its field claim, and replacing another panel writes that
  panel's contribution key rather than its row ID.

Requires migration `V202609231200__v6.1.x__Entity_Form_Contribution_Section_Claims`.
