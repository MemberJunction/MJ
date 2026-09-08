# Form Contributions

**Status:** implemented on `an-form-contributions`  
**Package:** `@memberjunction/ng-base-forms`  
**Migration:** none  
**How-to + domain examples:** [Forms Architecture Guide §7c](../guides/FORMS_ARCHITECTURE_GUIDE.md#7c-form-contributions--add-replace-or-fill-in-no-regen)

A form is a list of **contributions**. Installed OpenApps register `BaseFormPanel`s via `@RegisterClassEx` + a metadata bag; ClassFactory discovery is “what is installed.”

A contribution can be a collapsible section, a related-entity card, **or a form hero that is not a panel at all**.

## CodeGen: keep emitting

Generated forms keep baking field panels and related-entity grids exactly as they do today.

| Situation | What happens |
|---|---|
| Generated form, no claim | Baked UI shows. Composer does **not** add a second related grid. |
| Panel claims a relationship (`relatedEntity` + optional join field) | Baked related section hides. The registered panel mounts. |
| `DisplayInForm` relationship not baked (other app installed after CodeGen) | Composer mounts the stock grid — or the claiming panel. |
| Panel sets `replacesSectionKey` (e.g. `'details'`) | That baked field panel hides. Yours mounts in `slot` (typically `before-fields`). Does not have to be a collapsible panel. |
| Extra pane (no claim) | Existing `<mj-form-panel-slot>` mounts it. |

Override is runtime. No regen required.

## Metadata

```ts
interface FormPanelRegistrationMetadata {
  entity: string | '*';
  slot: FormPanelSlot;            // before-fields = top of every generated form
  sortKey?: number;
  contributionKey?: string;       // last-wins identity; derived for related claims
  relatedEntity?: string;         // replace a related grid
  relatedJoinField?: string;      // BillTo vs ShipTo
  replacesSectionKey?: string;    // replace a field panel (CodeGen SectionKey)
}
```

Related / field-section claims must name a concrete `entity` (not `'*'`). Collapse by `contributionKey`. Winner = highest ClassFactory `Priority`.

## Out of scope

- Toolbar verbs (same idea, later host)
- A `MJ: Form Extensions` table
- Changing CodeGen output
