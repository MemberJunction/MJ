import { Component, Input } from '@angular/core';

/** A small coloured label beside the title. `Kind` picks the tone; '' is neutral. */
export interface ShelterHeroChip {
    Text: string;
    Kind?: 'ok' | 'warn' | 'error' | 'info' | 'muted' | '';
}

/**
 * An optional capacity gauge. Rendered as discrete pips when `Total` is small enough to count at a
 * glance, and as a proportional bar above that -- 60 pips would be noise, 3 pips are instantly
 * readable and exact in a way a bar never is.
 */
export interface ShelterHeroGauge {
    Used: number;
    Total: number;
    Label: string;
    /** Text under the gauge, e.g. "1 space open". */
    Caption?: string;
}

/** One label-over-value figure in the hero's bottom band. */
export interface ShelterHeroStat {
    Label: string;
    Value: string;
    /** Optional second line, e.g. a qualifier under a number. */
    Sub?: string;
    /** Tints the value when something needs attention. */
    Tone?: 'warn' | 'error';
}

/**
 * MJ Academy — the shared identity banner for every Harbor Street form.
 *
 * Modelled on bizapps-orders' `<mjo-doc-hero>`: ONE presentational component with pure @Input()s
 * and one stylesheet, which every entity's header then feeds. That is what makes headers cheap at
 * scale -- orders ships ~45 of them without 45 layouts, because each entity contributes only its
 * title, chips and figures. Two entities is a small version of the same win: Animal and Housing
 * cannot drift apart, because there is only one place the appearance lives.
 *
 * It knows nothing about MemberJunction on purpose -- no entity type, no record, no provider. That
 * keeps it reusable from a form panel, a custom form, or a dashboard without dragging form
 * machinery along.
 */
@Component({
    standalone: false,
    selector: 'shelter-hero',
    templateUrl: './shelter-hero.component.html',
    styleUrls: ['./shelter-hero.component.css'],
})
export class ShelterHeroComponent {
    /** The record's name. Callers pass a fallback for an unsaved record. */
    @Input() Title = '';
    /** One quiet line under the title -- breed, building, whatever identifies it. */
    @Input() Subtitle = '';
    /** Font Awesome class, used only when no image is supplied. */
    @Input() Icon = 'fa-solid fa-paw';
    /** A data URI or URL. When absent the icon shows instead. */
    @Input() PhotoSrc: string | null = null;
    @Input() Chips: ShelterHeroChip[] = [];
    @Input() Stats: ShelterHeroStat[] = [];
    @Input() Gauge: ShelterHeroGauge | null = null;
    /**
     * True for entities that never carry a photo (Housing). Renders a small icon chip instead of
     * the 104px portrait square, which would otherwise be a large empty box holding one glyph.
     * Not inferred from `PhotoSrc` being null: an Animal with no photo yet should still reserve
     * the portrait, or its hero would resize the moment someone uploads one.
     */
    @Input() IconOnly = false;

    /** Above this, individual pips stop being countable and a proportional bar reads better. */
    private static readonly MAX_PIPS = 12;

    public get UsePips(): boolean {
        const t = this.Gauge?.Total ?? 0;
        return t > 0 && t <= ShelterHeroComponent.MAX_PIPS;
    }

    /** One entry per unit of capacity; true means occupied. */
    public get Pips(): boolean[] {
        const g = this.Gauge;
        if (!g) return [];
        return Array.from({ length: g.Total }, (_, i) => i < g.Used);
    }

    public get FillPercent(): number {
        const g = this.Gauge;
        if (!g || g.Total <= 0) return 0;
        return Math.min(100, Math.max(0, (g.Used / g.Total) * 100));
    }

    /** Full is worth flagging; over-capacity more so. */
    public get GaugeTone(): 'ok' | 'warn' | 'error' {
        const g = this.Gauge;
        if (!g || g.Total <= 0) return 'ok';
        if (g.Used > g.Total) return 'error';
        return g.Used >= g.Total ? 'warn' : 'ok';
    }
}
