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
    inject,
} from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { BaseEntity, LogError } from '@memberjunction/core';
import { InteractiveFormsEngine } from '@memberjunction/core-entities';
import { firstValueFrom } from 'rxjs';
import { BaseFormComponent } from '../base-form-component';
import { FormContext } from '../types/form-types';
import { BaseFormPanel, FormPanelRegistrationMetadata, FormPanelSlot } from './base-form-panel';
import { FormSlotCoordinator } from './form-slot-coordinator.service';
import {
    CollapseFormPanelRegistrations,
    FormContributionEntityMatches,
    type FormContributionRegistration,
} from './form-contribution';
import { CollectFormContributionRegistrations } from './collect-form-contribution-registrations';
import { InteractiveFormPanelComponent } from '../interactive-form/interactive-form-panel.component';
import { FormRecordRefreshCoordinator } from '../form-record-refresh.coordinator';

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
    // `display: contents` makes the host element disappear from the layout
    // tree so the mounted panels (children) participate directly in the
    // parent's flex/grid layout. Without this, the parent's gap/spacing
    // rules treat all mounted panels as a SINGLE child (the slot host),
    // collapsing the spacing between them.
    styles: [`:host { display: contents; }`],
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
    private readonly recordRefresh = inject(FormRecordRefreshCoordinator, { optional: true });
    /** Tracks synchronous re-entry depth into remount() so a future refactor
     *  that reintroduces a remount loop surfaces loudly instead of freezing. */
    private remountDepth = 0;
    private readonly warnedLooseEntities = new Set<string>();
    private awaitingContributions = false;

    /**
     * Process-wide, not per-instance. The readiness wait is a one-time courtesy so the first
     * paint shows both sources together; once it has resolved — ready OR timed out — no slot
     * host anywhere should pay it again. Per-instance state made a failing engine cost every
     * slot on every form 1.5s apiece, which is far worse than the pop-in it was avoiding.
     */
    private static contributionGateResolved = false;

    /** Bounded: a slow or unreachable engine must not leave the form blank. */
    private static readonly READINESS_TIMEOUT_MS = 1500;

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
        this.recordRefresh?.Refreshed$.pipe(takeUntil(this.destroy$)).subscribe((record) => {
            this.notifyMountedPanels(record);
        });
        // Rows can arrive after the first paint (cold engine, a contribution saved in another
        // tab). Without this the slot would keep showing whatever it mounted first.
        try {
            InteractiveFormsEngine.Instance.Contributions$
                .pipe(takeUntil(this.destroy$))
                .subscribe(() => this.remount());
        } catch {
            // No engine here — compiled registrations are the only source.
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (!this.Entity || !this.Slot || !this.Record || !this.FormComponent) {
            // Inputs still being wired — wait for the next pass.
            return;
        }

        // Only remount when something that affects WHICH panels to mount has
        // changed. FormContext only flows through to mounted panels — pushing
        // it to the existing panels avoids an unmount/remount cycle.
        //
        // Critical for performance: the host form often reconstructs
        // formContext on every CD pass. Treating that as a structural change
        // would loop (remount → detectChanges → another CD → new FormContext
        // → remount again).
        const meaningfulKeys = ['Entity', 'Slot', 'Record', 'FormComponent'];
        const meaningfulChange = meaningfulKeys.some(k => changes[k]?.currentValue !== changes[k]?.previousValue);
        if (!meaningfulChange && changes['FormContext'] && this.mounted.length > 0) {
            for (const ref of this.mounted) {
                ref.instance.FormContext = this.FormContext;
            }
            return;
        }
        if (!meaningfulChange && this.mounted.length > 0) {
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

    private notifyMountedPanels(record: BaseEntity): void {
        for (const ref of this.mounted) {
            ref.instance.OnRecordRefreshed(record);
        }
    }

    private remount(): void {
        // Design decision 9: render both sources together or not at all. Mounting compiled
        // panels first and adding rows a tick later is visible — and for a `bare` hero that
        // replaces a baked section, the user watches that section render and then vanish.
        if (!this.contributionsReady()) {
            void this.awaitContributionsThenRemount();
            return;
        }
        this.remountDepth++;
        if (this.remountDepth > 5) {
            console.error(`[mj-form-panel-slot] LOOP DETECTED — remount depth ${this.remountDepth} on slot=${this.Slot}. Bailing.`);
            this.remountDepth--;
            return;
        }
        this.unmountAll();

        // 1. Direct matches: panels registered for THIS slot.
        const direct = this.findRegistrations(this.Slot);

        // 2. Orphans: panels registered for some OTHER slot whose preferred
        //    slot doesn't exist in this form, AND this slot host is the
        //    coordinator-resolved fallback for them. Without a coordinator
        //    (no parent container), no orphan handling — panels just bind
        //    to their literal slot.
        const orphans = this.findOrphans();

        const all = CollapseFormPanelRegistrations([...direct, ...orphans]);
        if (all.length === 0) {
            this.remountDepth--;
            return;
        }

        // Sort: higher sortKey first, then higher Priority, then registration order.
        all.sort((a, b) => {
            const aSort = a.Metadata?.sortKey ?? 0;
            const bSort = b.Metadata?.sortKey ?? 0;
            if (aSort !== bSort) return bSort - aSort;
            return b.Priority - a.Priority;
        });

        for (const reg of all) {
            try {
                const ref = reg.Source === 'metadata' ? this.mountMetadata(reg) : this.mountClass(reg);
                if (!ref) continue;
                ref.instance.Record = this.Record;
                ref.instance.FormComponent = this.FormComponent;
                if (this.FormContext) ref.instance.FormContext = this.FormContext;
                // Left-nav leftover height targets mj-collapsible-panel as a
                // flex child of .mj-forms-all-panels. The slot is already
                // display:contents; the mounted host must be too.
                const host = ref.location.nativeElement as HTMLElement | null;
                if (host) host.style.display = 'contents';
                this.FormComponent?.RegisterFormPanel?.(ref.instance);
                // No detectChanges() — Angular's normal CD pass picks the new
                // component up. Calling detectChanges() synchronously inside
                // an ongoing CD cycle (which is when ngOnChanges → remount
                // fires) can re-enter and cause an infinite loop if anything
                // upstream is reconstructing inputs on each CD pass.
                this.mounted.push(ref);
            } catch (e) {
                LogError(`[mj-form-panel-slot] Failed to mount panel for ${this.Entity}:${this.Slot}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        this.remountDepth--;
    }

    /**
     * Find registrations whose metadata declares this exact entity (or the
     * `'*'` wildcard) + slot. A panel registered with `entity: '*'` is
     * entity-agnostic — it mounts on EVERY entity's form. Such panels are
     * expected to self-hide (render nothing) when they don't apply to the
     * current record, so the cross-cutting registration stays unobtrusive.
     */
    private allForEntity(): FormContributionRegistration[] {
        const entity = this.Record?.EntityInfo ?? null;
        const provider = this.FormComponent?.ProviderToUse ?? null;
        const all = CollectFormContributionRegistrations(entity, provider);
        const strict = all.filter((reg) => FormContributionEntityMatches(reg.Metadata?.entity, this.Entity));
        this.warnOnLooseRegistrations(all, strict);
        return strict;
    }

    /**
     * Diagnostic for the old prefix-insensitive match. A loosely named registration no
     * longer mounts here — and never hid its baked grid on the container side, which has
     * always matched strictly.
     *
     * This runs on every resolve, not only when nothing matched strictly. Keying it on
     * "nothing matched" would miss the likeliest case: a form where some panels are named
     * correctly and one is not, where the broken one would vanish with no warning at all.
     */
    private warnOnLooseRegistrations(
        all: readonly FormContributionRegistration[],
        strict: readonly FormContributionRegistration[],
    ): void {
        if (this.warnedLooseEntities.has(this.Entity)) return;
        const strip = (v: string) => v.replace(/^mj[:_\s]+/i, '').replace(/[\s_]+/g, '').toLowerCase();
        const loose = all.filter((reg) => {
            const name = reg.Metadata?.entity;
            return !!name && name !== '*' && !strict.includes(reg) && strip(name) === strip(this.Entity);
        });
        if (loose.length === 0) return;
        this.warnedLooseEntities.add(this.Entity);
        const names = [...new Set(loose.map((reg) => reg.Metadata.entity))].join(', ');
        console.warn(
            `[mj-form-panel-slot] ${loose.length} BaseFormPanel registration(s) name "${names}" but the form entity is ` +
            `"${this.Entity}". Entity names must match exactly; these panels will not mount.`,
        );
    }

    private findRegistrations(slot: FormPanelSlot): FormContributionRegistration[] {
        return this.allForEntity().filter((reg) => reg.Metadata?.slot === slot);
    }

    private findOrphans(): FormContributionRegistration[] {
        if (!this.coordinator) return [];
        return this.allForEntity().filter((reg) => {
            const slot = reg.Metadata?.slot;
            return !!slot && slot !== this.Slot && this.coordinator!.resolveSlot(slot) === this.Slot;
        });
    }

    /**
     * Whether the slot can mount now, or should wait for contribution rows.
     *
     * It waits only while a load is actually in flight. An engine nobody has configured
     * is not "about to be ready" — blocking on it would delay every host that does not
     * use metadata contributions at all. Those hosts mount immediately and self-heal:
     * the collector kicks `Config`, and the `Contributions$` subscription below remounts
     * when rows arrive.
     */
    private contributionsReady(): boolean {
        if (FormPanelSlotComponent.contributionGateResolved) return true;
        try {
            const engine = InteractiveFormsEngine.Instance;
            if (engine.ContributionsReady) {
                FormPanelSlotComponent.contributionGateResolved = true;
                return true;
            }
            if (!engine.LoadingSubject.value) {
                // Nothing in flight — mount now rather than waiting on a load that may never start.
                return true;
            }
            return false;
        } catch {
            // No engine in this context (a panel composed outside a form host).
            FormPanelSlotComponent.contributionGateResolved = true;
            return true;
        }
    }

    /**
     * Wait for the contribution cache, then remount once. Falls through on a timeout so a
     * slow or unreachable engine degrades to today's behavior (compiled panels only) rather
     * than leaving the slot empty.
     */
    private async awaitContributionsThenRemount(): Promise<void> {
        if (this.awaitingContributions) return;
        this.awaitingContributions = true;
        try {
            const engine = InteractiveFormsEngine.Instance;
            await Promise.race([
                firstValueFrom(engine.Contributions$),
                new Promise<void>((resolve) => setTimeout(resolve, FormPanelSlotComponent.READINESS_TIMEOUT_MS)),
            ]);
            if (!engine.ContributionsReady) {
                // Once — the gate closes process-wide below, so this cannot become log spam.
                LogError(`[mj-form-panel-slot] contribution cache not ready after ${FormPanelSlotComponent.READINESS_TIMEOUT_MS}ms; mounting compiled panels only from here on.`);
            }
        } catch (e) {
            LogError(`[mj-form-panel-slot] waiting on contributions failed: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            this.awaitingContributions = false;
            // Ready or timed out, the gate is spent process-wide: from here every slot mounts
            // whatever the collector returns rather than waiting again.
            FormPanelSlotComponent.contributionGateResolved = true;
        }
        this.remount();
    }

    private mountClass(reg: FormContributionRegistration): ComponentRef<BaseFormPanel> | null {
        const ctor = reg.Registration?.SubClass as Type<BaseFormPanel> | undefined;
        if (!ctor) {
            LogError(`[mj-form-panel-slot] compiled registration for ${reg.Metadata?.entity}:${reg.Metadata?.slot} has no constructor`);
            return null;
        }
        return this.anchor.createComponent(ctor);
    }

    /** A metadata row mounts through the generic React host rather than its own component. */
    private mountMetadata(reg: FormContributionRegistration): ComponentRef<BaseFormPanel> {
        const ref = this.anchor.createComponent(InteractiveFormPanelComponent);
        (ref.instance as InteractiveFormPanelComponent).Contribution = reg;
        return ref as unknown as ComponentRef<BaseFormPanel>;
    }

    private unmountAll(): void {
        for (const ref of this.mounted) this.FormComponent?.UnregisterFormPanel?.(ref.instance);
        this.anchor.clear();
        this.mounted = [];
    }
}
