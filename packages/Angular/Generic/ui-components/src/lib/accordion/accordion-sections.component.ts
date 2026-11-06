import {
    AfterContentInit, ChangeDetectorRef, Component, ContentChildren, EventEmitter, Input, OnDestroy, Output, QueryList, inject,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { MJAccordionPanelComponent } from './accordion.component';
import { MJSectionPickerComponent, SectionPickerItem } from '../section-picker/section-picker.component';

/**
 * The phone presentation of a stack of `<mj-accordion-panel>`s. Disabled, it renders nothing
 * of its own and the panels behave as accordions. Enabled, it puts an `<mj-section-picker>`
 * above them and shows one top-level panel at a time with its accordion chrome gone; panels
 * nested inside that section render as plain headed blocks. It has no breakpoint logic: the
 * caller decides (`[Enabled]="IsPhone"`).
 *
 * Top-level means a direct child (an `@if` around a panel is fine). Give each panel a
 * `SectionKey` so the active section survives panels appearing or disappearing, and a
 * `SectionTitle` when its title template carries badges.
 *
 * ```html
 * <mj-accordion-sections [Enabled]="IsPhone" [(ActiveKey)]="phoneSection">
 *   <mj-accordion-panel SectionKey="input" SectionTitle="Input">…</mj-accordion-panel>
 *   <mj-accordion-panel SectionKey="result" SectionTitle="Result">…</mj-accordion-panel>
 * </mj-accordion-sections>
 * ```
 */
@Component({
    standalone: true,
    selector: 'mj-accordion-sections',
    imports: [MJSectionPickerComponent],
    template: `
    @if (Enabled && Items.length > 0) {
      <mj-section-picker class="mj-accordion-sections-picker"
                         [Items]="Items"
                         [ActiveKey]="ResolvedActiveKey"
                         (ActiveKeyChange)="Activate($event)"></mj-section-picker>
    }
    <ng-content></ng-content>
  `,
    styles: [`
    :host { display: block; min-width: 0; }
    .mj-accordion-sections-picker {
      position: sticky;
      top: 0;
      z-index: 5;
      display: block;
      margin-bottom: var(--mj-space-2, 8px);
      background: var(--mj-bg-surface);
      border-bottom: 1px solid var(--mj-border-default);
    }
  `],
})
export class MJAccordionSectionsComponent implements AfterContentInit, OnDestroy {
    private readonly cdr = inject(ChangeDetectorRef);
    private sub: Subscription | null = null;

    @ContentChildren(MJAccordionPanelComponent, { descendants: false })
    private panelList?: QueryList<MJAccordionPanelComponent>;

    private _enabled = false;
    /** Show the panels as sections behind a picker; false renders them as accordions. */
    @Input()
    set Enabled(value: boolean) {
        if (value === this._enabled) return;
        this._enabled = value;
        this.apply();
    }
    get Enabled(): boolean {
        return this._enabled;
    }

    private _activeKey: string | null = null;
    /** Key of the visible section; falls back to the first panel. */
    @Input()
    set ActiveKey(value: string | null) {
        if (value === this._activeKey) return;
        this._activeKey = value;
        this.apply();
    }
    get ActiveKey(): string | null {
        return this._activeKey;
    }

    /** Emitted with the key the user picked. */
    @Output() ActiveKeyChange = new EventEmitter<string>();

    /** The top-level panels, in document order. */
    public get Panels(): MJAccordionPanelComponent[] {
        return this.panelList?.toArray() ?? [];
    }

    /** The panels as section picker items. */
    public get Items(): SectionPickerItem[] {
        return this.Panels.map((p, i) => ({
            Key: this.keyOf(p, i),
            Title: p.ResolvedSectionTitle(),
            Icon: p.SectionIcon ?? undefined,
            Count: p.SectionCount,
        }));
    }

    /** The active key if it names a panel, otherwise the first panel's key. */
    public get ResolvedActiveKey(): string {
        const keys = this.Panels.map((p, i) => this.keyOf(p, i));
        return this._activeKey && keys.includes(this._activeKey) ? this._activeKey : keys[0] ?? '';
    }

    public Activate(key: string): void {
        this._activeKey = key;
        this.apply();
        this.ActiveKeyChange.emit(key);
    }

    ngAfterContentInit(): void {
        this.apply();
        // Panels added or removed by an @if: re-apply after the pass that changed the list.
        this.sub = this.panelList?.changes.subscribe(() => queueMicrotask(() => this.apply())) ?? null;
    }

    ngOnDestroy(): void {
        this.sub?.unsubscribe();
    }

    private keyOf(panel: MJAccordionPanelComponent, index: number): string {
        return panel.SectionKey || `section-${index}`;
    }

    private apply(): void {
        if (!this.panelList) return;
        const active = this.ResolvedActiveKey;
        this.Panels.forEach((p, i) => p.SetSectionState(this._enabled, this.keyOf(p, i) === active));
        this.cdr.markForCheck();
    }
}
