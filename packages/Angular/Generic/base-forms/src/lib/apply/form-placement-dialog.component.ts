import { ChangeDetectorRef, Component, EventEmitter, Input, Output, ViewContainerRef, inject } from '@angular/core';
import type { FormContributionSlot, FormContributionSpec } from '@memberjunction/interactive-component-types/forms';
import {
    FORM_PLACEMENT_SLOTS,
    DefaultSlotFor,
    HasDetailsTab,
    SectionOptionLabel,
    TargetRailItem,
    ReplaceableRailTabs,
    DefaultRailKeyFor,
    ReplaceableFields,
    ReplacedPreviewKeys,
    SectionHoldingField,
    ShowsRail,
    SlotIsOnForm,
    InitialPlacementState,
    ResolvePlacementDecision,
    SummarizePlacement,
    type FormPlacementContext,
    type FormPlacementDecision,
    type FormPlacementSection,
    type FormPlacementFieldChoice,
    type FormPlacementRailItem,
    type FormPlacementReplaceMode,
    type FormPlacementSlotChoice,
    type FormPlacementState,
} from './form-placement';
import { FormSlotProbeService } from './form-slot-probe.service';

/**
 * Asks where a generated panel should go before anything is written.
 *
 * Presentational by design: it takes the form's composition and the component's own
 * proposal, and emits the answers. It reads nothing and saves nothing, so the host owns
 * both the fetch and the write, and this stays testable without a provider.
 *
 * Scope is not a control here. The create path clamps every contribution to the calling
 * user, deliberately — an agent must not be able to change another person's form — so the
 * dialog states that rather than offering a choice it cannot honour.
 */
@Component({
    standalone: false,
    selector: 'mj-form-placement-dialog',
    templateUrl: './form-placement-dialog.component.html',
    styleUrls: ['./form-placement-dialog.component.css'],
})
export class MjFormPlacementDialogComponent {
    /** What the form contains. Setting it re-seeds the answers. */
    @Input()
    set Context(value: FormPlacementContext) {
        this._context = value;
        this.State = InitialPlacementState(this._proposal, value);
        this.SeedState?.(this);
        void this.probeSlots();
    }
    get Context(): FormPlacementContext { return this._context; }

    /**
     * A hook to overwrite the starting answers once the context is in.
     *
     * A new panel starts from a fixed default, deliberately. Editing one already on the
     * form has to start from what it is doing now, and only the caller knows that — the
     * dialog is handed a context, not a row.
     */
    @Input() SeedState: ((dialog: MjFormPlacementDialogComponent) => void) | null = null;

    /** The component's own registration intent. Only identity fields are read from it. */
    @Input()
    set Proposal(value: FormContributionSpec | null) {
        this._proposal = value;
        this.State = InitialPlacementState(value, this._context);
    }
    get Proposal(): FormContributionSpec | null { return this._proposal; }

    /** Name of the component being placed, for the dialog heading. */
    @Input() ComponentName = '';

    /**
     * Whether to read the entity's form to find out which positions it offers.
     *
     * On by default: without it the list is the shape CodeGen produces, which is right for
     * a generated form and can be wrong for a hand-written one. A host that already knows
     * the slots, or one with no Angular form to render, turns it off.
     */
    @Input() ProbeForm = true;

    /** The user pressed Apply. */
    @Output() Applied = new EventEmitter<FormPlacementDecision>();

    /** The user backed out. */
    @Output() Cancelled = new EventEmitter<void>();

    private _context: FormPlacementContext = {
        EntityName: '',
        Sections: [],
        Related: [],
        Existing: [],
        SlotsPresent: [],
        SlotsVerified: false,
        Layout: 'accordion',
        Rail: [],
        FullCustomForm: false,
        TargetsVerified: false,
    };
    private _proposal: FormContributionSpec | null = null;

    public State: FormPlacementState = InitialPlacementState(null, this._context);

    /**
     * The positions to offer. Once the form's own set is known, a slot it does not emit is
     * not shown: choosing it would silently resolve to the bottom of the form, so it is not
     * a position the user can meaningfully pick.
     */
    public get Slots(): readonly FormPlacementSlotChoice[] {
        return FORM_PLACEMENT_SLOTS.filter((s) => SlotIsOnForm(this._context, s.Slot));
    }

    /** Slots that sit above the field sections, so the preview renders in form order. */
    public get SlotsAbove(): readonly FormPlacementSlotChoice[] {
        return this.Slots.filter((s) => s.Slot === 'top-area' || s.Slot === 'before-fields');
    }

    /** The slot between the fields and the related grids. */
    public get SlotAfterFields(): FormPlacementSlotChoice | undefined {
        return this.Slots.find((s) => s.Slot === 'after-fields');
    }

    /** Slots that sit below the related grids. */
    public get SlotsBelow(): readonly FormPlacementSlotChoice[] {
        return this.Slots.filter((s) => s.Slot === 'after-related' || s.Slot === 'after-everything');
    }

    public get Summary(): string {
        return SummarizePlacement(this.State, this._context);
    }

    /** Whether this form draws a side rail, so tabs are a thing the user can see. */
    public get HasRail(): boolean {
        return ShowsRail(this._context);
    }

    /** The rail item the panel will appear under, or null when it gets one of its own. */
    public get TargetRail(): FormPlacementRailItem | null {
        return TargetRailItem(this.State, this._context);
    }

    /** True when the panel will add a rail item rather than join one. */
    public get AddsRailItem(): boolean {
        return this.State.Presentation === 'panel' && this.TargetRail === null;
    }



    /** True when the panel would carry no header of its own and none from the host. */
    public get HasTitle(): boolean {
        return this.State.Title.trim().length > 0;
    }

    /** A form with no field sections has nothing for a panel to hide. */
    public get CanReplaceSection(): boolean {
        return this._context.Sections.length > 0;
    }

    /** Every field a panel could stand in for, in form order. */
    public get ReplaceableFieldChoices(): readonly FormPlacementFieldChoice[] {
        return ReplaceableFields(this._context);
    }

    /**
     * Whether standing in for one field is offered.
     *
     * Only when the fields were read off a real form. Derived targets name the entity's
     * fields rather than the ones this form draws, and a claim on a field the form does
     * not draw hides nothing while still reading as applied.
     */
    public get CanReplaceField(): boolean {
        return this.ReplaceableFieldChoices.length > 0;
    }

    /** The section a field claim will render at the top of, for the preview. */
    public get FieldTargetSectionKey(): string {
        if (this.State.ReplaceMode !== 'field') return '';
        return SectionHoldingField(this._context, this.State.ReplaceFieldName)?.Key ?? '';
    }

    /** Whether this preview block is the one a field claim lands inside. */
    public HostsFieldPanel(sectionKey: string): boolean {
        return !!sectionKey && this.FieldTargetSectionKey === sectionKey;
    }

    /** The chosen field, for the note beside the choice. */
    public get ChosenField(): FormPlacementFieldChoice | undefined {
        return this.ReplaceableFieldChoices.find((f) => f.Name === this.State.ReplaceFieldName);
    }

    /**
     * True when the form bundles its field sections into a single Details tab, so the
     * section names on offer are the parts of that tab rather than anything the user can
     * point at on screen.
     */
    public get SectionsAreInDetailsTab(): boolean {
        return HasDetailsTab(this._context);
    }

    /** How many sections the Details tab is made of, for the option that replaces all of them. */
    public get DetailsTabSectionCount(): number {
        return this._context.Sections.length;
    }

    /** The tabs a panel may stand in for. Empty means the form shows no rail. */
    public get RailTabs(): readonly FormPlacementRailItem[] {
        return ReplaceableRailTabs(this._context);
    }

    /** Whether standing in for a whole tab is offered at all. */
    public get CanReplaceRailTab(): boolean {
        return this.RailTabs.length > 0;
    }

    /** How many panels the chosen tab holds, for the note beside the choice. */
    public get ChosenRailTabSize(): number {
        return this.RailTabs.find((t) => t.Key === this.State.ReplaceRailKey)?.SectionKeys.length ?? 0;
    }

    /** Whether this preview block will be taken off the form by the current choice. */
    public IsReplaced(sectionKey: string): boolean {
        return ReplacedPreviewKeys(this.State, this._context).has(sectionKey);
    }

    /** Whether the related grid at this position will be taken over. */
    public IsRelatedReplaced(index: number): boolean {
        return this.State.ReplaceMode === 'related' && Number(this.State.ReplaceRelatedIndex) === index;
    }

    /** Whether every field group in the Details tab is going, so the tab itself is marked. */
    public get IsWholeDetailsTabReplaced(): boolean {
        if (this._context.Sections.length === 0) return false;
        const going = ReplacedPreviewKeys(this.State, this._context);
        return this._context.Sections.every((section) => going.has(section.Key));
    }

    /** One section's label, told apart from the Details tab when they share a name. */
    public SectionLabel(section: FormPlacementSection): string {
        return SectionOptionLabel(section, this._context);
    }

    /** Whether hiding a section is a guess, because the targets were not read from the form. */
    public get SectionTargetsAreDerived(): boolean {
        return this.CanReplaceSection && !this._context.TargetsVerified;
    }

    /**
     * A bare panel carries no chrome and no rail item, so a left-nav form has nowhere to
     * file it and shows it above every section. Worth saying before it is applied.
     */
    public get IsPersistentHero(): boolean {
        return this.State.Presentation === 'bare';
    }

    /** A form with no related grids has nothing for a panel to take over. */
    public get CanReplaceRelated(): boolean {
        return this._context.Related.length > 0;
    }

    /** A form with no panels on it yet has nothing for this one to stand in for. */
    public get CanReplaceContribution(): boolean {
        return this._context.Existing.length > 0;
    }


    /** True while the form is being read to find out which positions it offers. */
    public Probing = false;

    /**
     * True when the list is the shape CodeGen produces rather than this form's own, because
     * reading the form did not answer. A hand-written custom template can differ.
     */
    public get SlotsAreAssumed(): boolean {
        return !this.Probing && !this._context.SlotsVerified && this._context.SlotsPresent.length > 0;
    }

    public SelectSlot(slot: FormContributionSlot): void {
        this.State.Slot = slot;
    }

    /** Refuses a claim the form cannot honour, so the state can never describe a missing target. */
    public SetReplaceMode(mode: FormPlacementReplaceMode): void {
        if (mode === 'section' && !this.CanReplaceSection) return;
        if (mode === 'field' && !this.CanReplaceField) return;
        if (mode === 'related' && !this.CanReplaceRelated) return;
        if (mode === 'contribution' && !this.CanReplaceContribution) return;
        if (mode === 'rail-tab' && !this.CanReplaceRailTab) return;
        this.State.ReplaceMode = mode;
    }

    public OnApply(): void {
        this.Applied.emit(ResolvePlacementDecision(this.State, this._context, this._proposal));
    }

    public OnCancel(): void {
        this.Cancelled.emit();
    }

    /**
     * Replace the assumed positions and section keys with the form's own.
     *
     * The probe renders the entity's form offscreen, so it costs one hidden form per entity
     * per session and answers for hand-written templates too. A caller that already had the
     * form open has nothing to learn, and a failed probe leaves the assumptions in place.
     */
    private async probeSlots(): Promise<void> {
        const entity = this._context.EntityName;
        if (!this.ProbeForm || !entity || this._context.SlotsVerified || this._context.FullCustomForm) return;

        this.Probing = true;
        try {
            const shape = await this.probe.Probe(this.viewContainer, entity);
            if (shape.Slots.length === 0 || this._context.EntityName !== entity) return;
            this._context = {
                ...this._context,
                SlotsPresent: shape.Slots,
                SlotsVerified: true,
                // Sections read off the form replace ones derived from field metadata, which
                // a template generated earlier may not draw.
                Sections: shape.Sections.length > 0 ? shape.Sections : this._context.Sections,
                TargetsVerified: shape.Sections.length > 0 ? true : this._context.TargetsVerified,
                // Resolved through the form's own chrome resolver, so the rail drawn here
                // is the rail the saved record shows.
                Rail: shape.Groups.map((g) => ({
                    Key: g.Key, Title: g.Title, Icon: g.Icon,
                    SectionKeys: g.SectionKeys, IsMore: g.IsMore === true,
                })),
                Layout: shape.Layout,
            };
            // The rail was not known before the probe, so the default tab was not either.
            if (!this._context.Rail.some((item) => item.Key === this.State.ReplaceRailKey)) {
                this.State = { ...this.State, ReplaceRailKey: DefaultRailKeyFor(this._context) };
            }
            // Re-seed: the caller's answers were set against a context with no sections
            // or slots in it, so the checks above may have just discarded them.
            this.SeedState?.(this);
            if (!SlotIsOnForm(this._context, this.State.Slot)) {
                this.State = { ...this.State, Slot: DefaultSlotFor(this._context) };
            }
            // The fields were unknown before the probe, so the chosen one was not either.
            const fields = ReplaceableFields(this._context);
            if (!fields.some((f) => f.Name === this.State.ReplaceFieldName)) {
                this.State = {
                    ...this.State,
                    ReplaceFieldName: fields[0]?.Name ?? '',
                    ReplaceMode: fields.length > 0 || this.State.ReplaceMode !== 'field'
                        ? this.State.ReplaceMode : 'none',
                };
            }
            // The previously selected section may not be one the form draws.
            if (!this._context.Sections.some((s) => s.Key === this.State.ReplaceSectionKey)) {
                this.State = {
                    ...this.State,
                    ReplaceSectionKey: this._context.Sections[0]?.Key ?? '',
                    ReplaceMode: this._context.Sections.length > 0 ? this.State.ReplaceMode : 'none',
                };
            }
        } finally {
            this.Probing = false;
            this.cdr.markForCheck();
        }
    }

    private readonly probe = inject(FormSlotProbeService);
    private readonly viewContainer = inject(ViewContainerRef);
    private readonly cdr = inject(ChangeDetectorRef);
}
