import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { DEFAULT_FORM_CHROME_SPEC, MORE_SECTION_KEY, type FormChromeSpec } from './form-chrome';
import { StabilizeFirstClassGroupOrder } from './resolve-form-chrome';

/**
 * Which sections an inclusion of `None` removed, as the container pushes it to the form.
 * `RulesResolved` is false until the entity's chrome rules have loaded and been applied;
 * until then a lazily loaded section must not load (it may be about to be suppressed).
 */
export interface FormChromeSuppression {
    RulesResolved: boolean;
    SuppressedSectionKeys: ReadonlySet<string>;
}

/**
 * Per-container chrome state. Provided by `<mj-record-form-container>` so
 * projected panels and fill-in stock grids share one spec.
 */
@Injectable()
export class FormChromeCoordinator {
    public Spec: FormChromeSpec = DEFAULT_FORM_CHROME_SPEC;
    public MoreExpanded = false;
    public ActiveGroupKey: string | null = null;
    public readonly Changes = new Subject<void>();
    /**
     * A section arrived on or left the page after the rail was worked out. A panel that
     * draws its section only once its data has loaded (the Feature Values and Model
     * Predictions panels, for instance) mounts inside a slot after every structural
     * trigger the container watches has fired; without this the section belongs to no
     * rail group, and on a left-nav form that means it never shows.
     */
    public readonly SectionsChanged = new Subject<void>();

    public NotifySectionsChanged(): void {
        this.SectionsChanged.next();
    }

    /**
     * True once the L3 `MJ: Form Chrome Rules` for the current entity have loaded and a resolve
     * has applied them. Until then a section that an admin ruled `None` is not yet known, so
     * {@link IsSuppressed} answers `undefined`.
     */
    public RulesResolved = false;
    private suppressedSectionKeys: ReadonlySet<string> = new Set<string>();

    /**
     * Whether an inclusion of `None` removed this section from the form. `undefined` while the
     * rules are pending ({@link RulesResolved} false); `true` / `false` once they are applied.
     */
    public IsSuppressed(sectionKey: string): boolean | undefined {
        if (!this.RulesResolved) return undefined;
        return this.suppressedSectionKeys.has(sectionKey);
    }

    /** The current suppression state, as pushed to the form (see `BaseFormComponent.SetChromeSuppression`). */
    public get Suppression(): FormChromeSuppression {
        return { RulesResolved: this.RulesResolved, SuppressedSectionKeys: this.suppressedSectionKeys };
    }

    /** Records the rules as applied, with the section keys they suppress. */
    public SetSuppressed(sectionKeys: readonly string[]): void {
        this.RulesResolved = true;
        this.suppressedSectionKeys = new Set(sectionKeys);
    }

    /** Back to pending: the entity changed, so its rules have to load again. */
    public ResetSuppression(): void {
        this.RulesResolved = false;
        this.suppressedSectionKeys = new Set<string>();
    }

    /**
     * Apply a resolved spec. The first-class order is kept from the previous spec so the rail
     * does not reshuffle on every re-resolve; pass `Reordered: true` for the one deliberate
     * reorder (populated-first related sections), which must not be undone that way.
     */
    public Apply(spec: FormChromeSpec, options?: { Reordered?: boolean }): void {
        this.Spec = options?.Reordered ? spec : StabilizeFirstClassGroupOrder(this.Spec, spec);
        if (spec.Layout === 'left-nav') {
            // A More child is a valid active key too: it is never a group of its own.
            const active = this.ActiveGroupKey;
            const stillValid = active !== null
                && (spec.Groups.some((g) => g.Key === active) || this.isMoreChild(active));
            if (!stillValid) {
                this.ActiveGroupKey = spec.Groups[0]?.Key ?? null;
            }
        }
        this.Changes.next();
    }

    public IsRelatedSectionVisible(sectionKey: string): boolean {
        if (this.Spec.Layout === 'accordion') {
            return this.IsAccordionSectionVisible(sectionKey);
        }
        return this.isLeftNavVisible(sectionKey);
    }

    public IsFirstClassSectionVisible(sectionKey: string): boolean {
        if (this.Spec.Layout === 'accordion') {
            return this.IsAccordionSectionVisible(sectionKey);
        }
        return this.isLeftNavVisible(sectionKey);
    }

    /**
     * Accordion hides every More member — field panels included — until
     * the overflow footer is expanded. Left-nav does not use this.
     */
    public IsAccordionSectionVisible(sectionKey: string): boolean {
        if (this.Spec.Layout !== 'accordion') return true;
        if (this.IsSuppressed(sectionKey) === true) return false;
        if (this.Spec.MoreSectionKeys.includes(sectionKey)) return this.MoreExpanded;
        return true;
    }

    public SetActiveGroup(groupKey: string): void {
        this.ActiveGroupKey = groupKey;
        if (this.isMoreChild(groupKey)) {
            this.MoreExpanded = true;
        }
        this.Changes.next();
    }

    public ToggleMoreFolder(): void {
        this.MoreExpanded = !this.MoreExpanded;
        this.Changes.next();
    }

    public ToggleMore(expanded: boolean): void {
        this.MoreExpanded = expanded;
        this.Changes.next();
    }

    public get IsMoreActive(): boolean {
        return false;
    }

    public HidesAccordionChrome(sectionKey: string): boolean {
        if (this.Spec.Layout !== 'left-nav') return false;
        return this.isLeftNavVisible(sectionKey);
    }

    /**
     * Left-nav shows only the selected rail item — including a More child.
     * Clicking the More folder does not dump every leftover panel.
     */
    private isLeftNavVisible(sectionKey: string): boolean {
        if (this.Spec.Layout !== 'left-nav') return true;
        if (this.ActiveGroupKey === sectionKey) return true;
        const group = this.Spec.Groups.find((g) => g.SectionKeys.includes(sectionKey));
        if (!group || group.IsMore) return false;
        return group.Key === this.ActiveGroupKey;
    }

    private isMoreChild(groupKey: string): boolean {
        if (groupKey === MORE_SECTION_KEY) return false;
        return this.Spec.MoreSectionKeys.includes(groupKey);
    }
}
