import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { DEFAULT_FORM_CHROME_SPEC, MORE_SECTION_KEY, type FormChromeSpec } from './form-chrome';

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

    public Apply(spec: FormChromeSpec): void {
        this.Spec = spec;
        if (spec.Layout === 'left-nav') {
            const stillValid = spec.Groups.some((g) => g.Key === this.ActiveGroupKey);
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
