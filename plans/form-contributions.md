# Form Contributions

**Status:** implemented on `an-form-contributions`  
**Package:** `@memberjunction/ng-base-forms`  
**Migration:** none

A form is a list of **contributions**. A related-entity grid is the default contribution when nobody claimed that relationship. Installed OpenApps register `BaseFormPanel`s via `@RegisterClassEx` + a metadata bag; ClassFactory discovery is “what is installed.”

## CodeGen: keep emitting

Generated forms keep baking related-entity `<mj-collapsible-panel Variant="related-entity">` panels exactly as they do today.

| Situation | What happens |
|---|---|
| Generated form, no claim | Baked grid shows. Composer does **not** add a second one. |
| A panel **claims** that relationship (`relatedEntity` + optional join field) | Baked section is hidden via `HiddenSectionKeys`. The registered panel mounts in its slot. |
| Relationship exists in metadata (`DisplayInForm`) but was **not** baked (other app installed after CodeGen; custom form omitted it) | Composer mounts the stock grid — or the claiming panel. |
| Extra pane (no `relatedEntity`) | Existing `<mj-form-panel-slot>` mounts it. Unchanged. |

Override is runtime. No regen required. A later CodeGen cleanup (stop baking related grids; container is the only renderer) is optional and not part of this change.

## Discovery — metadata, not key prefixes

`GetAllRegistrationsByMetadata` is the query. Do not encode entity/slot/order into `Key`. `Key` stays a diagnostic id (`form-panel:People:related:EventOrderLines`).

```ts
interface FormPanelRegistrationMetadata {
  entity: string | '*';
  slot: FormPanelSlot;
  sortKey?: number;
  contributionKey?: string;       // identity for last-wins; derived if omitted
  relatedEntity?: string;         // claim → replace the stock/baked grid
  relatedJoinField?: string;      // BillToPersonID vs ShipToPersonID
}
```

Derived `contributionKey`: `related:${relatedEntity}:${joinField}` when claiming a relationship.

Collapse by `contributionKey`. Winner = highest ClassFactory `Priority`. Order winners by `sortKey` then `Priority`.

## Composer

`ResolveFormContributions` (pure TS, unit-tested):

1. Implicit set = `DisplayInForm` relationships that are not IS-A children.
2. Registered set = panels whose `entity` matches this form (or `'*'` extras).
3. Merge by key. A related claim replaces the stock grid and, if baked, hides that section key (same camelCase CodeGen uses).
4. Stock grids only for relationships that are **not** claimed and **not** already baked.

`<mj-form-contributions>` lives in `<mj-record-form-container>` (after projected content, before `after-everything`). Custom forms that use the container get fill-in grids for free. Restore CodeGen slots on custom templates so claimed panels land in `after-related` instead of falling through.

## Out of scope

- Toolbar verbs / hero replace (same idea, later host)
- A `MJ: Form Extensions` table — ClassFactory + client bootstrap is enough
- Changing CodeGen output
