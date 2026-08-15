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

/**
 * Responsive Card Grid container that manages responsive layout and card maximization state.
 */
@Component({
    selector: 'mj-card-grid',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrls: ['./card-grid.scss'],
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
    styleUrls: ['./card-grid.scss'],
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
