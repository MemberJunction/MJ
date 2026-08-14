import { Directive, Input } from '@angular/core';
import { BaseEntity, ValidationResult } from '@memberjunction/core';
import { BaseFormComponent } from '../base-form-component';
import { FormContext } from '../types/form-types';

/**
 * Well-known slot positions where panels can be injected into a generated
 * entity form. Used as the `slot` field in a panel's registration metadata.
 *
 * Slot positions inside the form, top to bottom:
 *
 *   ┌─ <mj-record-form-container>
 *   │     [top-area slot]            ← CodeGen-emitted; rare (entities with top-area section)
 *   │     [before-fields slot]       ← CodeGen-emitted; banners / warnings above field panels
 *   │     <connection details>
 *   │     <other generated field panels>
 *   │     [after-fields slot]        ← CodeGen-emitted; typed config knobs, secondary settings — most common slot
 *   │     <content items grid>
 *   │     <other related-entity grids>
 *   │     [after-related slot]       ← CodeGen-emitted; bottom-of-form addenda
 *   │     [after-everything slot]    ← Container-emitted; ALWAYS present (fallback target)
 *   └─ </mj-record-form-container>
 *
 * Pick the slot that matches the panel's role. `after-fields` is the default
 * for most "additional settings" panels — it sits in the field column, before
 * the related-entity grids.
 *
 * **Fallback behavior** — see `FormSlotCoordinator`. If the registered slot is
 * missing in the current form (CodeGen hasn't been rerun against the new
 * template emitter), the panel walks forward in the chain until it finds an
 * existing slot. `after-everything` is always emitted by the container, so
 * fallback never dead-ends. Pre-CodeGen-regen forms show every panel at the
 * bottom of the form; post-regen forms show them in the preferred position.
 */
export type FormPanelSlot =
    | 'top-area'
    | 'before-fields'
    | 'after-fields'
    | 'after-related'
    | 'after-everything';

/**
 * Shape of the `metadata` object every BaseFormPanel registration MUST attach
 * via `@RegisterClass(BaseFormPanel, { metadata: {...} })`. The
 * `<mj-form-panel-slot>` host filters registrations by matching against this
 * shape — registrations without it are silently ignored.
 *
 *   - `entity` — the exact entity name (case-sensitive equality enforced by the
 *                slot host), OR the wildcard `'*'` to register an
 *                **entity-agnostic** panel that mounts on EVERY entity's form.
 *                Wildcard panels are expected to self-hide (render nothing) when
 *                they don't apply to the current record, so the cross-cutting
 *                registration stays unobtrusive on forms it has no business on.
 *   - `slot`   — which slot the panel renders into.
 *   - `sortKey`— higher = earlier within the slot. Defaults to 0 if omitted.
 *                Use ranges (e.g., 100/50/10) so future panels can wedge in
 *                without recomputing every neighbor's sort.
 */
export interface FormPanelRegistrationMetadata extends Record<string, unknown> {
    entity: string;
    slot: FormPanelSlot;
    sortKey?: number;
    /**
     * Identity for last-wins collapse. Two registrations with the same key
     * compete; highest ClassFactory `Priority` wins. Omit to derive:
     * `related:${relatedEntity}:${relatedJoinField}` when claiming a
     * relationship, otherwise the registration is unique and never collapses.
     */
    contributionKey?: string;
    /**
     * When set, this panel **replaces** the default related-entity grid for
     * that relationship on `entity`'s form. The baked CodeGen panel (if any)
     * is hidden; the stock fill-in grid is not mounted.
     */
    relatedEntity?: string;
    /**
     * Disambiguates two FKs to the same related entity (BillTo vs ShipTo).
     * Compared after stripping wrapping `[]`.
     */
    relatedJoinField?: string;
    /**
     * CodeGen `SectionKey` of a baked field (or other) panel this contribution
     * replaces — e.g. `'details'`, `'personalIdentity'`. Hidden at runtime via
     * `HiddenSectionKeys`. Use with `slot: 'before-fields'` for a form hero that
     * is not a collapsible panel. Must name a concrete `entity` (not `'*'`).
     */
    replacesSectionKey?: string;
}

/**
 * Abstract base for every dynamically-injectable form panel.
 *
 * Subclasses are standalone Angular components decorated with
 * `@RegisterClass(BaseFormPanel, { metadata: { entity, slot, sortKey? } })`.
 * At runtime, `<mj-form-panel-slot>` discovers matching registrations via
 * `ClassFactory.GetAllRegistrationsByMetadata`, instantiates each via
 * `ViewContainerRef.createComponent`, and wires `Record` + `FormComponent` +
 * `FormContext` into the inputs.
 *
 * Lifecycle hooks: standard Angular `ngOnInit` / `ngOnDestroy` work as usual.
 * `Record` is guaranteed to be set before the first change-detection pass.
 *
 * Optional `validate()` returns a synchronous validation result; the parent
 * `BaseFormComponent.Save()` path will surface it via the existing validation
 * pipeline when called. Panels that don't validate anything beyond what the
 * record itself does can leave this method off.
 */
@Directive()
export abstract class BaseFormPanel<TRecord extends BaseEntity = BaseEntity> {
    /** The entity record being edited. Set by the slot host before view init. */
    @Input() Record!: TRecord;
    /** The host form component (use for EditMode, dirty notifications, etc). Set by the slot host. */
    @Input() FormComponent!: BaseFormComponent;
    /** Optional form context — same shape the collapsible-panel chrome expects. Set by the slot host. */
    @Input() FormContext?: FormContext;

    /**
     * Convenience getter for read-only / edit-mode rendering. Falls back to
     * `false` when the panel is shown outside a `BaseFormComponent` host (e.g.,
     * a dashboard quick-edit dialog reusing the same panel — see the
     * "composable panel" docs).
     */
    public get EditMode(): boolean {
        return this.FormComponent?.EditMode ?? false;
    }

    /**
     * Override to add per-panel validation that should block the parent form's
     * Save(). Return `{ Success: true, Errors: [] }` when valid, or include
     * `ValidationErrorInfo` entries to surface field-level errors. The default
     * implementation reports valid (panels that don't need extra validation
     * can leave this method off).
     */
    public validate(): ValidationResult {
        // Inline construction — ValidationResult is a class in @memberjunction/core,
        // not a plain interface, so callers can construct via `new`.
        const result = new ValidationResult();
        result.Success = true;
        return result;
    }
}
