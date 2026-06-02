# @memberjunction/ng-base-forms

The foundation for rendering and editing MemberJunction entity records in
Angular — and for presenting **any** entity form as a full-page tab, a modal
dialog, a slide-in panel, or a floating window, from one set of forms with no
per-surface code and no regeneration.

> **Start with the architecture guide:** [/guides/FORMS_ARCHITECTURE_GUIDE.md](../../../../guides/FORMS_ARCHITECTURE_GUIDE.md)
> — the big picture, how generated/custom/interactive forms coexist, and how to
> use every surface. This README is a quick map of the package.

## What's in here

| Area | Key exports | Notes |
|------|-------------|-------|
| **Form base** | `BaseFormComponent`, `BaseFormSectionComponent`, `MjRecordFormContainerComponent`, `MjCollapsiblePanelComponent`, `MjFormFieldComponent` | The form itself + its toolbar/section container. Generated forms extend `BaseFormComponent`. |
| **Form host** | `MjEntityFormHostComponent` (`<mj-entity-form-host>`) | Presentation-agnostic: resolve → load → create → bind → re-emit → teardown. Supports full forms and single sections (`SectionName`). |
| **Overlay shells** | `MjFormDialogComponent`, `MjFormSlideInComponent`, `MjFormWindowComponent` (standalone) | Declarative dialog / slide-in / floating-window around the host. |
| **Imperative API** | `MJFormPresenterService.open(...)` → `MJFormRef` | One call to open any form on any surface. |
| **Per-instance config** | `EntityFormConfig` + `TAB_/DIALOG_/SLIDEIN_FORM_CONFIG` | Toolbar / related sections / collapsibility / width / record-links. Applied via the form reference — **no regeneration**. |
| **Form resolution** | `FormResolverService` | Picks generated / custom / interactive-override form + variants (cached via `InteractiveFormsEngine`). |
| **Form extension** | `BaseFormPanel` + `<mj-form-panel-slot>` | Inject custom sections into a generated form. See [PANELS.md](./PANELS.md). |

## Quick start

```typescript
import { MJFormPresenterService, DIALOG_FORM_CONFIG } from '@memberjunction/ng-base-forms';

const ref = this.forms.open({
  entityName: 'MJ: AI Agents',
  recordId: id,                      // omit → new record
  presentation: 'slide-in',          // 'dialog' | 'slide-in' | 'window'
  config: { showRelatedEntities: false },
});
const saved = await ref.afterSaved(); // BaseEntity | null
```

```html
<mj-form-dialog [EntityName]="'Users'" [RecordID]="id"
  [(Visible)]="show" (Saved)="onSaved($event)"></mj-form-dialog>
```

## Related docs

- **Architecture (read first):** [/guides/FORMS_ARCHITECTURE_GUIDE.md](../../../../guides/FORMS_ARCHITECTURE_GUIDE.md)
- **Inject custom sections into a form:** [PANELS.md](./PANELS.md)
- **Custom-form override + toolbar pattern:** [packages/Angular/CLAUDE.md](../../CLAUDE.md)
