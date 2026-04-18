/**
 * @fileoverview Search Input Component
 *
 * A reusable search text input for navbar/hero placement.
 * Features debounced query emission, keyboard shortcut hint,
 * clear button, and focus management.
 */

import {
    Component,
    ElementRef,
    EventEmitter,
    Input,
    OnDestroy,
    OnInit,
    Output,
    ViewChild,
    ChangeDetectorRef,
    inject
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

@Component({
    standalone: false,
    selector: 'mj-search-input',
    templateUrl: './search-input.component.html',
    styleUrls: ['./search-input.component.css']
})
export class SearchInputComponent implements OnInit, OnDestroy {
    private cdr = inject(ChangeDetectorRef);
    private destroy$ = new Subject<void>();
    private queryInput$ = new Subject<string>();

    @ViewChild('inputEl') inputRef!: ElementRef<HTMLInputElement>;

    // --- Configuration Inputs ---

    /** Placeholder text shown in the input */
    @Input() Placeholder = 'Search...';

    /** Current query value (two-way bindable via QueryChange) */
    private _Query = '';

    @Input()
    set Query(value: string) {
        if (value !== this._Query) {
            this._Query = value;
            this.cdr.detectChanges();
        }
    }
    get Query(): string {
        return this._Query;
    }

    /** Whether to show the keyboard shortcut hint badge */
    @Input() ShowShortcutHint = true;

    /** Text to display in the shortcut hint badge */
    @Input() ShortcutHint = 'Ctrl+K';

    /** Debounce time in milliseconds before QueryChange emits */
    @Input() DebounceMs = 400;

    // --- Outputs ---

    /** Emitted after debounce when query text changes */
    @Output() QueryChange = new EventEmitter<string>();

    /** Emitted immediately when the user presses Enter */
    @Output() QuerySubmit = new EventEmitter<string>();

    /** Emitted when the input receives focus */
    @Output() InputFocused = new EventEmitter<void>();

    /** Emitted when the input loses focus */
    @Output() InputBlurred = new EventEmitter<void>();

    /** Emitted when the user presses Escape in the input */
    @Output() InputEscaped = new EventEmitter<void>();

    /** Emitted when the user clears the input via the clear button */
    @Output() InputCleared = new EventEmitter<void>();

    // --- Internal state ---

    /** Whether the input currently has focus */
    public IsFocused = false;

    ngOnInit(): void {
        this.setupDebounce();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // --- Public Methods ---

    /** Programmatically focus the input element */
    public Focus(): void {
        this.inputRef?.nativeElement?.focus();
    }

    /** Clear the query and emit InputCleared */
    public Clear(): void {
        this._Query = '';
        this.queryInput$.next('');
        this.QueryChange.emit('');
        this.InputCleared.emit();
        this.Focus();
        this.cdr.detectChanges();
    }

    // --- Template event handlers ---

    /** Handle native input event */
    public OnInput(value: string): void {
        this._Query = value;
        this.queryInput$.next(value);
    }

    /** Handle keydown events on the input */
    public OnKeydown(event: KeyboardEvent): void {
        switch (event.key) {
            case 'Enter':
                event.preventDefault();
                this.QuerySubmit.emit(this._Query);
                break;
            case 'Escape':
                event.preventDefault();
                this.InputEscaped.emit();
                break;
        }
    }

    /** Handle focus event */
    public OnFocus(): void {
        this.IsFocused = true;
        this.InputFocused.emit();
        this.cdr.detectChanges();
    }

    /** Handle click — re-opens suggest when input already has focus */
    public OnClick(): void {
        if (this.IsFocused) {
            this.InputFocused.emit();
        }
    }

    /** Handle blur event */
    public OnBlur(): void {
        this.IsFocused = false;
        this.InputBlurred.emit();
        this.cdr.detectChanges();
    }

    // --- Private ---

    private setupDebounce(): void {
        this.queryInput$
            .pipe(
                debounceTime(this.DebounceMs),
                distinctUntilChanged(),
                takeUntil(this.destroy$)
            )
            .subscribe(value => {
                this.QueryChange.emit(value);
            });
    }
}
