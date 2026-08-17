import {
    Component,
    Directive,
    Input,
    Output,
    EventEmitter,
    TemplateRef,
    ContentChild,
    HostListener,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    inject,
    OnInit,
    OnDestroy,
    OnChanges,
    SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BehaviorSubject, Subscription } from 'rxjs';

let nextCardId = 0;

/**
 * Directive to provide a custom template for the Card Title.
 */
@Directive({
    selector: '[mjCardTitle]',
    standalone: true,
})
export class MJCardTitleDirective {
    constructor(public templateRef: TemplateRef<unknown>) {}
}

/**
 * Directive to provide custom action controls in the Card Header.
 */
@Directive({
    selector: '[mjCardActions]',
    standalone: true,
})
export class MJCardActionsDirective {
    constructor(public templateRef: TemplateRef<unknown>) {}
}

/**
 * Directive to provide custom tools/badges in the Card Header.
 */
@Directive({
    selector: '[mjCardTools]',
    standalone: true,
})
export class MJCardToolsDirective {
    constructor(public templateRef: TemplateRef<unknown>) {}
}

/**
 * Directive to provide a custom template for the Card Footer.
 */
@Directive({
    selector: '[mjCardFooter]',
    standalone: true,
})
export class MJCardFooterDirective {
    constructor(public templateRef: TemplateRef<unknown>) {}
}

const CARD_GRID_CSS = `
:host {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    box-sizing: border-box;
}

.mj-card-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
    gap: var(--mj-card-grid-gap, var(--mj-space-4, 16px));
    width: 100%;
    position: relative;
    box-sizing: border-box;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.mj-card-grid--has-maximized {
    grid-template-columns: 1fr !important;
}

@media (max-width: 640px) {
    .mj-card-grid {
        grid-template-columns: 1fr !important;
    }
}

mj-card {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
}

.mj-card {
    display: flex;
    flex-direction: column;
    flex: 1 1 100%;
    height: 100%;
    min-height: 290px;
    background: var(--mj-bg-surface-card, var(--mj-bg-surface, #141f33));
    border: 1px solid var(--mj-border-default, #2a3852);
    border-radius: var(--mj-radius-xl, 16px);
    box-shadow: var(--mj-shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.08));
    padding: var(--mj-space-4, 16px) var(--mj-space-5, 20px);
    box-sizing: border-box;
    transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
    position: relative;
    min-width: 0;
}

.mj-card:hover {
    border-color: color-mix(in srgb, var(--mj-brand-primary, #38bdf8) 40%, var(--mj-border-default, #2a3852));
}

.mj-card--maximized {
    grid-column: 1 / -1;
    width: 100%;
    min-height: 480px;
    box-shadow: var(--mj-shadow-lg, 0 10px 25px rgba(0, 0, 0, 0.25));
    border-color: var(--mj-brand-primary, #38bdf8);
    z-index: 10;
}

.mj-card--hidden {
    display: none !important;
}

.mj-card__header {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--mj-space-3, 12px);
    margin-bottom: var(--mj-space-3, 12px);
    min-height: 28px;
    width: 100%;
}

.mj-card__title-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1 1 auto;
}

.mj-card__title-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: var(--mj-space-2, 8px);
    min-width: 0;
}

.mj-card__icon {
    color: var(--mj-brand-primary, #38bdf8);
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.mj-card__title {
    font-size: 14px;
    font-weight: 700;
    color: var(--mj-text-primary, #ffffff);
    letter-spacing: -0.01em;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.mj-card__subtitle {
    font-size: 11.5px;
    font-weight: 500;
    color: var(--mj-text-muted, #94a3b8);
    margin: 0;
    padding-left: 22px;
}

.mj-card__actions {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: var(--mj-space-2, 8px);
    flex-shrink: 0;
    margin-left: auto;
}

.mj-card__toggle-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--mj-radius-sm, 6px);
    background: transparent;
    border: 1px solid transparent;
    color: var(--mj-text-muted, #94a3b8);
    cursor: pointer;
    padding: 0;
    font-size: 12px;
    transition: all 0.15s ease;
}

.mj-card__toggle-btn:hover {
    color: var(--mj-text-primary, #ffffff);
    background: var(--mj-bg-surface-sunken, rgba(255, 255, 255, 0.06));
    border-color: var(--mj-border-default, #2a3852);
}

.mj-card__toggle-btn:focus-visible {
    outline: 2px solid var(--mj-brand-primary, #38bdf8);
    outline-offset: 1px;
}

.mj-card__body {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-width: 0;
}

.mj-card__footer {
    margin-top: auto;
    padding-top: var(--mj-space-3, 12px);
    border-top: 1px solid var(--mj-border-default, #2a3852);
}
`;

/**
 * Responsive Card Grid container that manages responsive layout and card maximization state.
 */
@Component({
    selector: 'mj-card-grid',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: [CARD_GRID_CSS],
    template: `
        <div class="mj-card-grid"
             [class.mj-card-grid--has-maximized]="!!MaximizedCardId"
             [style.--mj-card-grid-columns]="Columns"
             [style.--mj-card-grid-gap]="Gap">
            <ng-content></ng-content>
        </div>
    `,
})
export class MJCardGridComponent implements OnChanges {
    private cdr = inject(ChangeDetectorRef);

    /** Stream of the currently maximized card ID across all children. */
    public readonly maximizedCard$ = new BehaviorSubject<string | null>(null);

    /** Number of columns for standard layout (defaults to 2). */
    @Input() Columns: number | string = 2;

    /** CSS gap between cards (defaults to var(--mj-space-4)). */
    @Input() Gap = 'var(--mj-space-4, 16px)';

    /** Currently maximized card ID. When set, only this card is shown full-width. */
    @Input() MaximizedCardId: string | null = null;

    /** Emits when the maximized card ID changes (two-way binding support). */
    @Output() MaximizedCardIdChange = new EventEmitter<string | null>();

    /** Emits the card ID when a card is maximized. */
    @Output() CardMaximized = new EventEmitter<string>();

    /** Emits when the maximized card is restored back to the grid view. */
    @Output() CardRestored = new EventEmitter<void>();

    public ngOnChanges(changes: SimpleChanges): void {
        if (changes['MaximizedCardId'] && !changes['MaximizedCardId'].firstChange) {
            this.maximizedCard$.next(this.MaximizedCardId);
        }
    }

    /** Pressing Escape restores the grid view if a card is maximized. */
    @HostListener('window:keydown.escape')
    public OnEscape(): void {
        if (this.MaximizedCardId) {
            this.Restore();
        }
    }

    public MaximizeCard(cardId: string): void {
        this.MaximizedCardId = cardId;
        this.maximizedCard$.next(cardId);
        this.MaximizedCardIdChange.emit(cardId);
        this.CardMaximized.emit(cardId);
        this.cdr.markForCheck();
    }

    public Restore(): void {
        if (!this.MaximizedCardId) return;
        this.MaximizedCardId = null;
        this.maximizedCard$.next(null);
        this.MaximizedCardIdChange.emit(null);
        this.CardRestored.emit();
        this.cdr.markForCheck();
    }

    public IsCardMaximized(cardId: string): boolean {
        return this.MaximizedCardId === cardId;
    }

    public IsCardHidden(cardId: string): boolean {
        return !!this.MaximizedCardId && this.MaximizedCardId !== cardId;
    }
}

/**
 * Modular card component with header title, icon, actions, and maximize/restore capability.
 */
@Component({
    selector: 'mj-card',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: [CARD_GRID_CSS],
    template: `
        <div class="mj-card"
             [class.mj-card--maximized]="IsMaximized"
             [class.mj-card--hidden]="IsHidden"
             role="region"
             [attr.aria-label]="Title || 'Card'">
            
            <!-- Card Header -->
            @if (ShowHeader) {
                <div class="mj-card__header">
                    <div class="mj-card__title-group">
                        <div class="mj-card__title-row">
                            @if (Icon) {
                                <span class="mj-card__icon" aria-hidden="true">
                                    <i [class]="Icon"></i>
                                </span>
                            }
                            @if (TitleTemplate) {
                                <ng-container [ngTemplateOutlet]="TitleTemplate.templateRef"></ng-container>
                            } @else if (Title) {
                                <h3 class="mj-card__title">{{ Title }}</h3>
                            }
                        </div>
                        @if (Subtitle) {
                            <span class="mj-card__subtitle">{{ Subtitle }}</span>
                        }
                    </div>

                    <div class="mj-card__actions">
                        @if (ToolsTemplate) {
                            <ng-container [ngTemplateOutlet]="ToolsTemplate.templateRef"></ng-container>
                        }
                        @if (ActionsTemplate) {
                            <ng-container [ngTemplateOutlet]="ActionsTemplate.templateRef"></ng-container>
                        }
                        @if (AllowMaximize) {
                            <button type="button"
                                    class="mj-card__toggle-btn"
                                    [title]="IsMaximized ? RestoreTooltip : MaximizeTooltip"
                                    [attr.aria-label]="IsMaximized ? RestoreTooltip : MaximizeTooltip"
                                    (click)="ToggleMaximize($event)">
                                @if (IsMaximized) {
                                    <i class="fa-solid fa-compress" aria-hidden="true"></i>
                                } @else {
                                    <i class="fa-solid fa-expand" aria-hidden="true"></i>
                                }
                            </button>
                        }
                    </div>
                </div>
            }

            <!-- Card Body -->
            <div class="mj-card__body">
                <ng-content></ng-content>
            </div>

            <!-- Card Footer -->
            @if (FooterTemplate) {
                <div class="mj-card__footer">
                    <ng-container [ngTemplateOutlet]="FooterTemplate.templateRef"></ng-container>
                </div>
            }
        </div>
    `,
})
export class MJCardComponent implements OnInit, OnDestroy {
    private grid = inject(MJCardGridComponent, { optional: true });
    private cdr = inject(ChangeDetectorRef);
    private sub?: Subscription;

    @Input() CardId = `mj-card-${++nextCardId}`;
    @Input() Title?: string;
    @Input() Subtitle?: string;
    @Input() Icon?: string;
    @Input() AllowMaximize = true;
    @Input() MaximizeTooltip = 'Expand card';
    @Input() RestoreTooltip = 'Restore view';
    @Input() ShowHeader = true;

    @Output() Maximize = new EventEmitter<void>();
    @Output() Restore = new EventEmitter<void>();

    @ContentChild(MJCardTitleDirective) TitleTemplate?: MJCardTitleDirective;
    @ContentChild(MJCardActionsDirective) ActionsTemplate?: MJCardActionsDirective;
    @ContentChild(MJCardToolsDirective) ToolsTemplate?: MJCardToolsDirective;
    @ContentChild(MJCardFooterDirective) FooterTemplate?: MJCardFooterDirective;

    public get IsMaximized(): boolean {
        if (this.grid) {
            return this.grid.IsCardMaximized(this.CardId);
        }
        return false;
    }

    public get IsHidden(): boolean {
        if (this.grid) {
            return this.grid.IsCardHidden(this.CardId);
        }
        return false;
    }

    public ngOnInit(): void {
        if (!this.CardId) {
            this.CardId = `mj-card-${++nextCardId}`;
        }
        if (this.grid) {
            this.sub = this.grid.maximizedCard$.subscribe(() => {
                this.cdr.markForCheck();
            });
        }
    }

    public ngOnDestroy(): void {
        this.sub?.unsubscribe();
    }

    public ToggleMaximize(event?: MouseEvent): void {
        if (event) {
            event.stopPropagation();
        }
        if (this.IsMaximized) {
            this.grid?.Restore();
            this.Restore.emit();
        } else {
            this.grid?.MaximizeCard(this.CardId);
            this.Maximize.emit();
        }
        this.cdr.markForCheck();
    }
}
