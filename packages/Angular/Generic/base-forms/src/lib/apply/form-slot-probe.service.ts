import { ApplicationRef, Injectable, ViewContainerRef, inject } from '@angular/core';
import { LogError, Metadata, ResolveFormLayout } from '@memberjunction/core';
import type { FormPanelSlot } from '../panel-slot/base-form-panel';
import { MjEntityFormHostComponent } from '../host/entity-form-host.component';
import { ResolveFormChrome } from '../chrome/resolve-form-chrome';
import { FieldGroupsInDetails, type FormChromeGroup, type FormChromePanelSnapshot } from '../chrome/form-chrome';
import { CollectFormContributionRegistrations } from '../panel-slot/collect-form-contribution-registrations';
import { ResolveContributionKey } from '../panel-slot/form-contribution';

/** What a rendered form turned out to contain. */
export interface ProbedFormShape {
    Slots: FormPanelSlot[];
    /**
     * Field sections the form drew, in document order, each with the inputs it draws.
     * Replaceable a section or a single field at a time.
     */
    Sections: Array<{ Key: string; Title: string; Fields: Array<{ Name: string; Label: string }> }>;
    /** Every panel the form drew, including the related grids. Feeds the rail. */
    Panels: FormChromePanelSnapshot[];
    /** The rail the form will show, resolved the way the form itself resolves it. */
    Groups: FormChromeGroup[];
    /**
     * Whether the form shows a side rail. In a rail layout the chrome bundles every field
     * section into one "Details" tab, so a user reading the section list sees names that
     * are a level below anything the form shows them.
     */
    Layout: 'accordion' | 'left-nav';
}

/**
 * Reads what an entity's form really contains, without opening the record.
 *
 * Both answers are properties of the form's Angular template rather than of any metadata.
 * Slots: CodeGen emits a fixed three, the container adds `after-everything`, and a
 * hand-written custom form can emit anything. Sections: a generated template is frozen at
 * the last CodeGen run, so the sections it draws can differ from what the field metadata
 * now says. The only authority for either is the rendered form.
 *
 * So this renders one — offscreen, against a new unsaved record, once per entity per
 * session. That probe is cheap by construction: a related-entity grid renders only
 * `@if (Record.IsSaved)`, so an unsaved record fires none of their queries, and the slot
 * elements carry their position as a static HTML attribute, so reading them needs no
 * injector access.
 *
 * Every failure returns an empty list rather than throwing. The caller treats empty as
 * "unknown" and falls back, because a dialog that cannot answer this question should still
 * open.
 */
@Injectable({ providedIn: 'root' })
export class FormSlotProbeService {
    private readonly appRef = inject(ApplicationRef);

    /** Entity name (lowercased) → what its form contains. */
    private readonly cache = new Map<string, ProbedFormShape>();

    /** Probes in flight, so two dialogs on one entity render one form between them. */
    private readonly inflight = new Map<string, Promise<ProbedFormShape>>();

    /** A form that never signals readiness must not hold the dialog open. */
    private static readonly TIMEOUT_MS = 5000;

    /**
     * What `entityName`'s form contains, with empty lists when it could not be read.
     *
     * @param host a `ViewContainerRef` inside `BaseFormsModule`. The form host is declared
     *   in that module, so it is created through a view in its scope rather than through
     *   the environment injector.
     */
    public async Probe(host: ViewContainerRef, entityName: string): Promise<ProbedFormShape> {
        const key = entityName.trim().toLowerCase();
        if (!key) return EMPTY_SHAPE;

        const cached = this.cache.get(key);
        if (cached) return cached;

        const running = this.inflight.get(key);
        if (running) return running;

        const probe = this.render(host, entityName)
            .catch((err: unknown) => {
                LogError(`FormSlotProbeService: probe of '${entityName}' failed: ${err instanceof Error ? err.message : String(err)}`);
                return EMPTY_SHAPE;
            })
            .then((shape) => {
                // A form with no slots at all did not render; that is a failure to answer,
                // not an answer, so it is not cached and a later attempt can still succeed.
                if (shape.Slots.length > 0) this.cache.set(key, shape);
                this.inflight.delete(key);
                return shape;
            });

        this.inflight.set(key, probe);
        return probe;
    }

    /** Section keys of the contributions already registered on this entity. */
    private contributionKeys(entityName: string): string[] {
        const entity = Metadata.Provider?.EntityByName(entityName);
        if (!entity) return [];
        return CollectFormContributionRegistrations(entity, Metadata.Provider)
            .map((reg) => ResolveContributionKey(reg.Metadata))
            .filter((key) => key.length > 0);
    }

    /** Drops the memo for one entity, or all of them. For a form that changed underneath. */
    public Forget(entityName?: string): void {
        if (entityName) this.cache.delete(entityName.trim().toLowerCase());
        else this.cache.clear();
    }

    private async render(host: ViewContainerRef, entityName: string): Promise<ProbedFormShape> {
        const ref = host.createComponent(MjEntityFormHostComponent);
        try {
            this.hide(ref.location.nativeElement as HTMLElement);
            ref.instance.EntityName = entityName;
            ref.changeDetectorRef.detectChanges();

            await this.settled(ref.instance);
            ref.changeDetectorRef.detectChanges();

            const root = ref.location.nativeElement as HTMLElement;
            const panels = this.readPanels(root);
            const rail = this.resolveRail(entityName, panels);
            const fieldsBySection = this.readFields(root);
            return {
                Slots: this.readSlots(root),
                Sections: FieldGroupsInDetails(panels, rail.Groups).map((group) => ({
                    ...group,
                    Fields: fieldsBySection.get(group.Key) ?? [],
                })),
                Panels: panels,
                Groups: rail.Groups,
                Layout: rail.Layout,
            };
        } finally {
            ref.destroy();
        }
    }

    /**
     * Out of the layout and out of the accessibility tree, but still rendered — the slot
     * hosts have to reach `ngOnInit` for their elements to exist.
     */
    private hide(element: HTMLElement): void {
        element.setAttribute('aria-hidden', 'true');
        Object.assign(element.style, {
            position: 'absolute',
            left: '-99999px',
            top: '0',
            width: '1px',
            height: '1px',
            overflow: 'hidden',
            visibility: 'hidden',
            pointerEvents: 'none',
        });
    }

    /** Resolves when the form has loaded, errored, or taken too long. */
    private settled(instance: MjEntityFormHostComponent): Promise<void> {
        return new Promise<void>((resolve) => {
            let done = false;
            const finish = (): void => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                loaded.unsubscribe();
                failed.unsubscribe();
                resolve();
            };
            const timer = setTimeout(finish, FormSlotProbeService.TIMEOUT_MS);
            const loaded = instance.LoadComplete.subscribe(() => finish());
            // A form the caller cannot open still emits its slots or none; either answer is
            // better than waiting out the timeout.
            const failed = instance.LoadError.subscribe(() => finish());
        });
    }

    /**
     * The slot positions present in the rendered form.
     *
     * Read from the DOM rather than from `FormSlotCoordinator`: the coordinator is provided
     * per container and would have to be reached through the form's own injector, while the
     * slot host publishes its position as `data-form-slot`.
     */
    private readSlots(root: HTMLElement): FormPanelSlot[] {
        const found = new Set<FormPanelSlot>();
        root.querySelectorAll('[data-form-slot]').forEach((node) => {
            const slot = node.getAttribute('data-form-slot')?.trim();
            if (slot) found.add(slot as FormPanelSlot);
        });
        return [...found];
    }

    /**
     * Every panel the form drew, related grids included, in document order.
     *
     * The title comes from the first span inside the header, not from the header's own
     * text: the header also carries the unsaved-changes and invalid-field indicators, so
     * reading the whole node turns "Organization Identity" into "Organization Identity1".
     */
    private readPanels(root: HTMLElement): FormChromePanelSnapshot[] {
        const out: FormChromePanelSnapshot[] = [];
        const seen = new Set<string>();
        root.querySelectorAll('mj-collapsible-panel[data-section-key]').forEach((node) => {
            const key = node.getAttribute('data-section-key')?.trim();
            if (!key || seen.has(key)) return;
            seen.add(key);
            const title = node.querySelector('.mj-forms-panel-title span')?.textContent?.trim();
            out.push({
                SectionKey: key,
                SectionName: title || key,
                Variant: node.getAttribute('data-variant') || 'default',
                Icon: node.getAttribute('data-icon') || undefined,
            });
        });
        return out;
    }

    /**
     * The inputs each section draws, keyed by section key.
     *
     * A field belongs to the nearest panel above it, which is what `closest` answers —
     * a nested panel would otherwise donate its fields to its parent as well. Read from
     * `data-field-name` rather than from a component reference, so this stays a DOM sweep
     * like the rest of the probe; a field a contribution already claims still carries the
     * attribute, because the element exists even when it draws nothing.
     */
    private readFields(root: HTMLElement): Map<string, Array<{ Name: string; Label: string }>> {
        const out = new Map<string, Array<{ Name: string; Label: string }>>();
        root.querySelectorAll('mj-form-field[data-field-name]').forEach((node) => {
            const name = node.getAttribute('data-field-name')?.trim();
            if (!name) return;
            const key = node.closest('mj-collapsible-panel[data-section-key]')
                ?.getAttribute('data-section-key')?.trim();
            if (!key) return;
            const list = out.get(key) ?? [];
            if (list.some((f) => f.Name === name)) return;
            list.push({ Name: name, Label: node.getAttribute('data-field-label')?.trim() || name });
            out.set(key, list);
        });
        return out;
    }

    /**
     * The rail the saved form will show.
     *
     * Resolved through the form's own chrome resolver rather than read off the probe's
     * DOM. The probe renders a NEW record, and a related grid on an unsaved record has
     * nothing to draw, so it leaves the rail — which drops the group count below the
     * auto-left-nav threshold and makes a rail form report itself as an accordion. The
     * panels are what the probe can see; the rail they form is computed.
     */
    private resolveRail(
        entityName: string,
        panels: FormChromePanelSnapshot[],
    ): { Groups: FormChromeGroup[]; Layout: 'accordion' | 'left-nav' } {
        const entity = Metadata.Provider?.EntityByName(entityName);
        if (!entity) {
            return { Groups: [], Layout: ResolveFormLayout(null, panels.length) };
        }
        try {
            const spec = ResolveFormChrome({
                Entity: entity,
                Panels: panels,
                RelatedSchemaByEntityId: new Map(),
                // Without these an installed contribution is indistinguishable from a
                // field section, so it folds into Details and is counted as one of them.
                ContributionSectionKeys: this.contributionKeys(entity.Name),
            }).Spec;
            return { Groups: spec.Groups, Layout: spec.Layout };
        } catch (err: unknown) {
            LogError(`FormSlotProbeService: rail resolve for '${entityName}' failed: ${err instanceof Error ? err.message : String(err)}`);
            return { Groups: [], Layout: 'accordion' };
        }
    }
}

const EMPTY_SHAPE: ProbedFormShape = { Slots: [], Sections: [], Panels: [], Groups: [], Layout: 'accordion' };
