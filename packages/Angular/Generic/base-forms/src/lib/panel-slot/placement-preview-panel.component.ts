import { Component, Input } from '@angular/core';
import { NormalizeIconClass } from '@memberjunction/ng-ui-components';
import { BaseFormPanel, type FormPanelRegistrationMetadata } from './base-form-panel';
import { ReplacedSectionKeys, ResolveContributionKey, type FormContributionRegistration } from './form-contribution';
import { PLACEMENT_PREVIEW_KEY } from './placement-preview';

/**
 * Stands in for the placement dialog's unsaved panel on the preview form.
 *
 * Draws the same chrome a saved row draws — a collapsible panel with its title and icon, or a
 * bare strip — around a marked body, so the form lays it out exactly as it will lay out the
 * real panel.
 */
@Component({
    standalone: false,
    selector: 'mj-placement-preview-panel',
    template: `
      @if (Contribution) {
        @if (IsBare) {
          <div class="mj-form-bare-panel" style="display: block"
               [style.order]="DisplayOrder"
               [attr.data-bare-section-key]="BareTabKey"
               [attr.data-bare-title]="Title">
            <ng-container *ngTemplateOutlet="body"></ng-container>
          </div>
        } @else {
          <mj-collapsible-panel
            [SectionKey]="SectionKey"
            [Order]="DisplayOrder"
            [SectionName]="Title"
            [Icon]="Icon"
            [Variant]="IsRelatedClaim ? 'related-entity' : 'default'"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            <ng-container *ngTemplateOutlet="body"></ng-container>
          </mj-collapsible-panel>
        }
      }
      <ng-template #body>
        <div class="mj-placement-preview-body" data-placement-preview>
          <i [class]="Icon" aria-hidden="true"></i>
          <span>{{ Title }} goes here</span>
        </div>
      </ng-template>
    `,
    styles: [`
      .mj-placement-preview-body {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--mj-space-2);
        min-height: 96px;
        padding: var(--mj-space-4);
        border: 2px dashed var(--mj-brand-primary);
        border-radius: var(--mj-radius-md);
        background: color-mix(in srgb, var(--mj-brand-primary) 8%, transparent);
        color: var(--mj-brand-primary);
        font-weight: var(--mj-font-semibold);
      }
    `],
})
export class PlacementPreviewPanelComponent extends BaseFormPanel {
    @Input() Contribution!: FormContributionRegistration;

    public get SectionKey(): string {
        return ResolveContributionKey(this.Contribution.Metadata) || PLACEMENT_PREVIEW_KEY;
    }

    public get Title(): string {
        return this.Contribution.Title || 'Your panel';
    }

    public get Icon(): string {
        return NormalizeIconClass(this.Contribution.Icon) || 'fa-solid fa-puzzle-piece';
    }

    /** The rail key of a bare strip that replaces blocks; null for one that replaces nothing. */
    public get BareTabKey(): string | null {
        return ReplacedSectionKeys(this.Contribution.Metadata).length > 0 ? this.SectionKey : null;
    }

    public get IsBare(): boolean {
        return (this.Contribution.Presentation ?? this.Contribution.Metadata.presentation) === 'bare';
    }

    public get IsRelatedClaim(): boolean {
        return !!this.Contribution.Metadata.relatedEntity?.trim();
    }

    protected override get PanelMetadata(): FormPanelRegistrationMetadata | undefined {
        return this.Contribution?.Metadata ?? super.PanelMetadata;
    }
}
