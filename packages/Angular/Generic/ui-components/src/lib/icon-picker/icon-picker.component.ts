import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    EventEmitter,
    Input,
    Output,
    ViewChild,
    forwardRef,
    inject,
} from '@angular/core';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { OverlayModule, ConnectedPosition } from '@angular/cdk/overlay';
import {
    DEFAULT_ICON_STYLE,
    FilterIcons,
    IconNameOf,
    NormalizeIconClass,
    type FontAwesomeIcon,
} from './font-awesome-icons';
import { IconCatalogueService } from './icon-catalogue.service';

/**
 * mj-icon-picker — choose a Font Awesome icon by looking at it.
 *
 * Typing a class name is not something to ask of a user: the name has to be remembered
 * exactly, and Font Awesome needs a style class beside it — `fa-chart-column` on its own
 * renders nothing at all, which looks like a bug rather than a missing word. This searches
 * the icons the page has actually loaded and writes a complete class string.
 *
 * The text box stays, because a user who knows the name is faster typing it, and because a
 * value from elsewhere must remain editable. What it emits is normalized either way.
 *
 * The grid opens in an overlay rather than inside the field. Anchored in the field it sat
 * in whatever scrolling box the host had, widened that box and left the surrounding panel
 * scrolling sideways — a picker must not resize the form it is part of.
 *
 * @example
 * ```html
 * <mj-icon-picker [(ngModel)]="Icon" Placeholder="Search icons"></mj-icon-picker>
 * ```
 */
@Component({
    standalone: true,
    selector: 'mj-icon-picker',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [OverlayModule],
    providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MjIconPickerComponent), multi: true }],
    templateUrl: './icon-picker.component.html',
    styleUrls: ['./icon-picker.component.css'],
})
export class MjIconPickerComponent implements ControlValueAccessor {
    /** The icon class string, e.g. `fa-solid fa-chart-column`. */
    @Input()
    set Value(value: string) {
        this._value = value ?? '';
        this.text = this._value;
    }
    get Value(): string { return this._value; }

    @Output() ValueChange = new EventEmitter<string>();

    @Input() Placeholder = 'Search icons, or type a class';

    /** Accessible name for the text box, when no visible label sits beside it. */
    @Input() AriaLabel = 'Icon';

    /** Disables both the box and the browse button. */
    @Input() Disabled = false;

    /** The style given to a name typed by hand, when it names none itself. */
    @Input() Style = DEFAULT_ICON_STYLE;

    private _value = '';
    private readonly host = inject(ElementRef<HTMLElement>);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly catalogue = inject(IconCatalogueService);

    @ViewChild('search') private searchBox?: ElementRef<HTMLInputElement>;

    /** What is in the text box, which may not yet be a complete class string. */
    public text = '';

    /** Whether the icon grid is open. */
    public IsOpen = false;

    /** Width the overlay opens at, so the grid is usable beside a narrow field. */
    public static readonly GRID_WIDTH = 320;

    public readonly GridWidth = MjIconPickerComponent.GRID_WIDTH;

    /** Below the field, or above it when there is no room. */
    public readonly Positions: ConnectedPosition[] = [
        { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
        { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 },
    ];

    /** What the user typed into the grid's own search box. */
    public get Search(): string { return this.search; }

    /**
     * Setting it marks the view, because this component is OnPush and the search may be
     * set by a host as well as by the box — a value that does not repaint the grid is
     * worse than no search at all.
     */
    public set Search(value: string) {
        this.search = value ?? '';
        this.cdr.markForCheck();
    }

    private search = '';

    /** The icon drawn in the preview, or '' when nothing is set. */
    public get Preview(): string {
        return NormalizeIconClass(this.text, this.Style);
    }

    /** The current icon's bare name, for the grid's selected state. */
    public get SelectedName(): string {
        return IconNameOf(this.Preview);
    }

    /** The icons to show, narrowed by the grid's search box. */
    public get Results(): FontAwesomeIcon[] {
        return FilterIcons(this.Icons, this.search);
    }

    /** Every icon on offer, each with the style that actually draws it. */
    public get Icons(): readonly FontAwesomeIcon[] {
        return this.catalogue.Icons(this.ownerDocument);
    }

    /** True when the page could not be read and the short list is standing in. */
    public get IsFallbackCatalogue(): boolean {
        return this.catalogue.IsFallback(this.ownerDocument);
    }

    private get ownerDocument(): Document {
        return this.host.nativeElement.ownerDocument ?? document;
    }

    /** The complete class string for one grid cell. */
    public ClassFor(icon: FontAwesomeIcon): string {
        return `${icon.Style} fa-${icon.Name}`;
    }

    public Toggle(): void {
        if (this.Disabled) return;
        this.IsOpen = !this.IsOpen;
        if (this.IsOpen) {
            this.Search = '';
            // After the grid exists, so there is something to focus.
            setTimeout(() => this.searchBox?.nativeElement.focus(), 0);
        }
        this.cdr.markForCheck();
    }

    public Close(): void {
        if (!this.IsOpen) return;
        this.IsOpen = false;
        this.cdr.markForCheck();
    }

    /** Typed text is normalized on the way out, so a bare name still renders. */
    public OnTextChanged(raw: string): void {
        this.text = raw;
        this.commit(NormalizeIconClass(raw, this.Style));
        this.cdr.markForCheck();
    }

    /** Writes the icon in the style that draws it, not in whatever the field defaulted to. */
    public Choose(icon: FontAwesomeIcon): void {
        const value = this.ClassFor(icon);
        this.text = value;
        this.commit(value);
        this.Close();
    }

    /** Clears the icon. A panel with none is a normal thing to want. */
    public Clear(): void {
        this.text = '';
        this.commit('');
    }

    private commit(value: string): void {
        if (value === this._value) return;
        this._value = value;
        this.ValueChange.emit(value);
        this.onChange(value);
        this.cdr.markForCheck();
    }

    // ---- ControlValueAccessor ----

    private onChange: (value: string) => void = () => undefined;
    private onTouched: () => void = () => undefined;

    public writeValue(value: string | null): void {
        this._value = value ?? '';
        this.text = this._value;
        this.cdr.markForCheck();
    }

    public registerOnChange(fn: (value: string) => void): void { this.onChange = fn; }
    public registerOnTouched(fn: () => void): void { this.onTouched = fn; }
    public setDisabledState(disabled: boolean): void {
        this.Disabled = disabled;
        this.cdr.markForCheck();
    }

    public OnBlur(): void { this.onTouched(); }
}
