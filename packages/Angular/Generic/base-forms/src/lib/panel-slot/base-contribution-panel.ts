import { Directive, Input } from '@angular/core';
import { NormalizeIconClass } from '@memberjunction/ng-ui-components';
import { BaseFormPanel, type FormPanelRegistrationMetadata } from './base-form-panel';
import { ReplacedSectionKeys, type FormContributionRegistration } from './form-contribution';

/**
 * A panel that draws one form contribution: a collapsible panel with its title and icon, or a
 * bare strip. Holds what that chrome reads from the contribution. The host for a saved row and
 * the placement preview's stand-in both extend it; each supplies its own section key and title.
 */
@Directive()
export abstract class BaseContributionPanel extends BaseFormPanel {
    @Input() Contribution!: FormContributionRegistration;

    /** The key the rail files this panel by. */
    public abstract get SectionKey(): string;

    /** The panel's header and rail label. */
    public abstract get Title(): string;

    /**
     * The panel's icon, completed if it was stored without a style.
     *
     * Font Awesome needs a style class beside the name: `fa-chart-column` alone matches a
     * rule that sets a glyph but no font family, so nothing draws. Rows written before the
     * picker existed carry bare names, and normalizing on the way out makes them render
     * rather than requiring each one to be edited.
     */
    public get Icon(): string {
        return NormalizeIconClass(this.Contribution.Icon) || 'fa-solid fa-puzzle-piece';
    }

    /**
     * The key a bare strip is filed under in the rail, when it replaces blocks and so belongs to
     * their tab. Null for a strip that replaces nothing, which sits above every tab.
     */
    public get BareTabKey(): string | null {
        return ReplacedSectionKeys(this.Contribution.Metadata).length > 0 ? this.SectionKey : null;
    }

    public get IsBare(): boolean {
        return (this.Contribution.Presentation ?? this.Contribution.Metadata.presentation) === 'bare';
    }

    public get IsRelatedClaim(): boolean {
        return !!this.Contribution.Metadata.relatedEntity?.trim();
    }

    public get Variant(): 'default' | 'related-entity' {
        return this.IsRelatedClaim ? 'related-entity' : 'default';
    }

    /**
     * The registration this panel renders, which it holds as a whole contribution rather
     * than as the bare bag the slot host assigns. Answers `DisplayOrder` on the base.
     */
    protected override get PanelMetadata(): FormPanelRegistrationMetadata | undefined {
        return this.Contribution?.Metadata ?? super.PanelMetadata;
    }
}
