import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { FormPanelSlot } from './base-form-panel';

/**
 * Document-order chain used by the slot host to figure out where to render a
 * panel whose preferred slot is missing in the current form. Walks forward:
 * a panel registered for `after-fields` looks for the next existing slot down
 * the chain (`after-related`, then `after-everything`) until it finds one.
 *
 * The chain is intentionally short — these are the only positions any panel
 * should ever need. New positions can be added by inserting into this array
 * at the right document-order position.
 */
export const FORM_SLOT_CHAIN: FormPanelSlot[] = [
    'top-area',
    'before-fields',
    'after-fields',
    'after-related',
    'after-everything',
];

/**
 * Per-form coordinator that tracks which slot positions are physically present
 * in the current form's DOM. Provided at the `<mj-record-form-container>` level
 * (one instance per form) so descendant slot hosts can register themselves and
 * compute the fallback chain.
 *
 * The container template guarantees an `after-everything` slot host at the very
 * bottom of the form body — so panels whose preferred slot is missing always
 * have a final landing spot. Pre-CodeGen-regen forms still display every
 * panel; post-regen forms display them at the better position.
 */
@Injectable()
export class FormSlotCoordinator {
    private readonly presentSlots = new Set<FormPanelSlot>();
    private readonly changes$ = new Subject<void>();

    /** Slot host calls this on init. Idempotent — safe if invoked twice. */
    public registerSlot(slot: FormPanelSlot): void {
        if (!this.presentSlots.has(slot)) {
            this.presentSlots.add(slot);
            this.changes$.next();
        }
    }

    /** Slot host calls this on destroy. */
    public deregisterSlot(slot: FormPanelSlot): void {
        if (this.presentSlots.has(slot)) {
            this.presentSlots.delete(slot);
            this.changes$.next();
        }
    }

    public hasSlot(slot: FormPanelSlot): boolean {
        return this.presentSlots.has(slot);
    }

    /**
     * Resolve a preferred slot to the slot that should ACTUALLY render the
     * panel. Returns the preferred slot if it's present; otherwise walks
     * forward in the chain to find the next existing slot.
     *
     * Returns null only in the (impossible) case where no slot at all is
     * present — the container guarantees `after-everything` exists, so this
     * should never happen in practice.
     */
    public resolveSlot(preferred: FormPanelSlot): FormPanelSlot | null {
        const startIdx = FORM_SLOT_CHAIN.indexOf(preferred);
        if (startIdx === -1) return null;
        for (let i = startIdx; i < FORM_SLOT_CHAIN.length; i++) {
            const candidate = FORM_SLOT_CHAIN[i];
            if (this.presentSlots.has(candidate)) {
                return candidate;
            }
        }
        return null;
    }

    /** RxJS stream that fires whenever a slot registers or deregisters. */
    public get changes() {
        return this.changes$.asObservable();
    }
}
