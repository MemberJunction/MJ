import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    EventEmitter,
    HostListener,
    Input,
    Output,
    ViewChild,
    forwardRef,
    inject,
} from '@angular/core';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import {
    DEFAULT_ICON_STYLE,
    FALLBACK_ICON_NAMES,
    FilterIconNames,
    IconNameOf,
    NormalizeIconClass,
    ScanLoadedIconNames,
} from './font-awesome-icons';

/**
 * mj-icon-picker — pick a Font Awesome icon by looking at it.
 *
 * Typing a class name is not something to ask of a user: the name has to be remembered
 * exactly, and Font Awesome needs a style class beside it — `fa-chart-column` on its own
 * renders nothing at all, which looks like a bug rather than a missing word. This searches
 * the icons the page has actually loaded and writes a complete class string.
 *
 * The text box stays, because a user who knows the name is faster typing it, and because a
 * value from elsewhere must remain editable. What it emits is normalized either way.
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

    /** The style prefix given to a bare name. Solid unless the host says otherwise. */
    @Input() Style = DEFAULT_ICON_STYLE;

    private _value = '';
    private readonly host = inject(ElementRef<HTMLElement>);
    private readonly cdr = inject(ChangeDetectorRef);

    @ViewChild('search') private searchBox?: ElementRef<HTMLInputElement>;

    /** What is in the text box, which may not yet be a complete class string. */
    public text = '';

    /** Whether the icon grid is open. */
    public IsOpen = false;

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

    private catalogue: string[] | null = null;

    /** The icon drawn in the preview, or '' when nothing is set. */
    public get Preview(): string {
        return NormalizeIconClass(this.text, this.Style);
    }

    /** The current icon's bare name, for the grid's selected state. */
    public get SelectedName(): string {
        return IconNameOf(this.Preview);
    }

    /** The icons to show, narrowed by the grid's search box. */
    public get Results(): string[] {
        return FilterIconNames(this.Icons, this.Search);
    }

    /**
     * Every icon name on offer.
     *
     * Read once, on first open rather than at construction: scanning the stylesheets walks
     * every rule in the document, which is thousands of them with Font Awesome loaded, and
     * a form that never opens the picker should not pay for it.
     */
    public get Icons(): string[] {
        if (!this.catalogue) {
            const scanned = ScanLoadedIconNames(this.host.nativeElement.ownerDocument ?? document);
            this.catalogue = scanned.length > 0 ? scanned : [...FALLBACK_ICON_NAMES];
        }
        return this.catalogue;
    }

    /** True when the stylesheet could not be read and the short list is standing in. */
    public get IsFallbackCatalogue(): boolean {
        return this.Icons.length === FALLBACK_ICON_NAMES.length
            && this.Icons[0] === FALLBACK_ICON_NAMES[0];
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

    public Choose(name: string): void {
        const value = NormalizeIconClass(name, this.Style);
        this.text = value;
        this.commit(value);
        this.Close();
    }

    /** Clears the icon. A panel with none is a normal thing to want. */
    public Clear(): void {
        this.text = '';
        this.commit('');
    }

    @HostListener('document:mousedown', ['$event'])
    public OnDocumentMouseDown(event: MouseEvent): void {
        if (!this.IsOpen) return;
        if (!this.host.nativeElement.contains(event.target as Node)) this.Close();
    }

    @HostListener('keydown.escape')
    public OnEscape(): void {
        this.Close();
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
