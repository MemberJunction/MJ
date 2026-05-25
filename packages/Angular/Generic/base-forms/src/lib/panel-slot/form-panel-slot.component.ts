import {
    Component,
    ComponentRef,
    Input,
    OnChanges,
    OnDestroy,
    OnInit,
    Optional,
    SimpleChanges,
    Type,
    ViewChild,
    ViewContainerRef,
} from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { BaseEntity, LogError } from '@memberjunction/core';
import { ClassRegistration, MJGlobal } from '@memberjunction/global';
import { BaseFormComponent } from '../base-form-component';
import { FormContext } from '../types/form-types';
import { BaseFormPanel, FormPanelRegistrationMetadata, FormPanelSlot } from './base-form-panel';
import { FormSlotCoordinator } from './form-slot-coordinator.service';

/**
 * `<mj-form-panel-slot>` — dynamic slot host that discovers and mounts every
 * registered `BaseFormPanel` whose metadata matches the slot's `Entity` +
 * `Slot` inputs. Generated entity-form HTML emits one of these at each
 * well-known slot position so consumers can extend the form WITHOUT replacing
 * it via the custom-form override pattern.
 *
 * **Discovery**: uses `ClassFactory.GetAllRegistrationsByMetadata(BaseFormPanel, ...)`
 * to find every panel registered with metadata `{ entity, slot }` matching this
 * slot. Registrations without a metadata bag (or without these required keys)
 * are silently ignored so legacy registrations don't accidentally bind.
 *
 * **Ordering**: registrations are sorted by `metadata.sortKey` descending —
 * higher number renders first within the slot. Use ranges (100/50/10) so future
 * panels can wedge in without renumbering. Ties fall back to the
 * `ClassRegistration.Priority` field (also descending), and finally to
 * registration order.
 *
 * **Fallback chain** (see `FormSlotCoordinator`): each slot host registers
 * with the per-form coordinator and additionally renders panels whose
 * REGISTERED slot is missing in the current form, when this host happens to
 * be the next-existing slot down the chain. The container template guarantees
 * an `after-everything` slot host, so fallback always terminates somewhere.
 * Downstream consumers running an older form template (no CodeGen rerun
 * yet) get every panel rendered at the bottom; consumers on the new template
 * get them in the preferred position.
 *
 * **Re-mount**: any input change OR a coordinator change (another slot
 * registers/deregisters) triggers a re-render so fallback assignments stay
 * correct as slots come and go.
 */
@Component({
    standalone: false,
    selector: 'mj-form-panel-slot',
    template: `<ng-container #anchor></ng-container>`,
})
export class FormPanelSlotComponent implements OnInit, OnChanges, OnDestroy {
    /** The entity name (e.g., `"MJ: Content Sources"`) being edited. */
    @Input() Entity!: string;
    /** Which slot position this host represents. */
    @Input() Slot!: FormPanelSlot;
    /** The record being edited — threaded through to every mounted panel. */
    @Input() Record!: BaseEntity;
    /** The host form component — used by panels for EditMode + dirty notifications. */
    @Input() FormComponent!: BaseFormComponent;
    /** Optional form context — same shape collapsible-panel chrome expects. */
    @Input() FormContext?: FormContext;

    @ViewChild('anchor', { read: ViewContainerRef, static: true })
    private anchor!: ViewContainerRef;

    private mounted: ComponentRef<BaseFormPanel>[] = [];
    private readonly destroy$ = new Subject<void>();
    private registeredSlot: FormPanelSlot | null = null;

    constructor(@Optional() private readonly coordinator?: FormSlotCoordinator) {}

    ngOnInit(): void {
        if (this.Slot && this.coordinator) {
            this.coordinator.registerSlot(this.Slot);
            this.registeredSlot = this.Slot;
            // Re-mount whenever the coordinator's known-slot set changes —
            // a panel that was previously orphaned to us might now have a
            // better slot available (or vice versa).
            this.coordinator.changes
                .pipe(takeUntil(this.destroy$))
                .subscribe(() => this.remount());
        }
    }

    ngOnChanges(_changes: SimpleChanges): void {
        if (!this.Entity || !this.Slot || !this.Record || !this.FormComponent) {
            // Inputs still being wired — wait for the next pass.
            return;
        }
        this.remount();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        if (this.coordinator && this.registeredSlot) {
            this.coordinator.deregisterSlot(this.registeredSlot);
            this.registeredSlot = null;
        }
        this.unmountAll();
    }

    private remount(): void {
        this.unmountAll();

        // 1. Direct matches: panels registered for THIS slot.
        const direct = this.findRegistrations(this.Slot);

        // 2. Orphans: panels registered for some OTHER slot whose preferred
        //    slot doesn't exist in this form, AND this slot host is the
        //    coordinator-resolved fallback for them. Without a coordinator
        //    (no parent container), no orphan handling — panels just bind
        //    to their literal slot.
        const orphans = this.findOrphans();

        const all = [...direct, ...orphans];
        if (all.length === 0) return;

        // Sort: higher sortKey first, then higher Priority, then registration order.
        all.sort((a, b) => {
            const aSort = (a.Metadata as FormPanelRegistrationMetadata | undefined)?.sortKey ?? 0;
            const bSort = (b.Metadata as FormPanelRegistrationMetadata | undefined)?.sortKey ?? 0;
            if (aSort !== bSort) return bSort - aSort;
            return b.Priority - a.Priority;
        });

        for (const reg of all) {
            try {
                const ctor = reg.SubClass as Type<BaseFormPanel>;
                const ref = this.anchor.createComponent(ctor);
                ref.instance.Record = this.Record;
                ref.instance.FormComponent = this.FormComponent;
                if (this.FormContext) ref.instance.FormContext = this.FormContext;
                ref.changeDetectorRef.detectChanges();
                this.mounted.push(ref);
            } catch (e) {
                LogError(`[mj-form-panel-slot] Failed to mount panel for ${this.Entity}:${this.Slot}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    }

    /** Find registrations whose metadata declares this exact entity + slot. */
    private findRegistrations(slot: FormPanelSlot): ClassRegistration[] {
        return MJGlobal.Instance.ClassFactory.GetAllRegistrationsByMetadata(
            BaseFormPanel,
            (metadata) => {
                if (!metadata) return false;
                const meta = metadata as Partial<FormPanelRegistrationMetadata>;
                return meta.entity === this.Entity && meta.slot === slot;
            },
        );
    }

    /**
     * Find panels registered for a different slot that should mount HERE
     * because their preferred slot isn't present and this slot is the next
     * existing one in the fallback chain.
     *
     * Only meaningful when we have a coordinator (i.e., we're inside an
     * `<mj-record-form-container>`).
     */
    private findOrphans(): ClassRegistration[] {
        if (!this.coordinator) return [];

        const allForEntity = MJGlobal.Instance.ClassFactory.GetAllRegistrationsByMetadata(
            BaseFormPanel,
            (metadata) => {
                if (!metadata) return false;
                const meta = metadata as Partial<FormPanelRegistrationMetadata>;
                return meta.entity === this.Entity && meta.slot != null && meta.slot !== this.Slot;
            },
        );

        return allForEntity.filter(reg => {
            const meta = reg.Metadata as FormPanelRegistrationMetadata | undefined;
            if (!meta?.slot) return false;
            const resolved = this.coordinator!.resolveSlot(meta.slot);
            return resolved === this.Slot;
        });
    }

    private unmountAll(): void {
        this.anchor.clear();
        this.mounted = [];
    }
}
