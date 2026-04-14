import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UUIDsEqual } from '@memberjunction/global';
import { KanbanCardData, KanbanColumnDef, KanbanCardMovedEvent } from '../models/kanban.models';

/**
 * Generic Kanban board component with drag-and-drop column management.
 *
 * This component is entity-agnostic — it renders cards and columns from
 * the data you provide and emits events when cards are moved or clicked.
 * It does NOT manage persistence; the consuming application handles saves.
 *
 * @example
 * ```html
 * <mj-kanban-board
 *     [Columns]="statusColumns"
 *     [Cards]="taskCards"
 *     (CardMoved)="onCardMoved($event)"
 *     (CardClicked)="onCardClicked($event)">
 * </mj-kanban-board>
 * ```
 */
@Component({
    selector: 'mj-kanban-board',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="mj-kanban-board">
            @for (col of Columns; track col.Key) {
                <div class="mj-kanban-column"
                     [class.drag-over]="dragOverColumn === col.Key"
                     (dragover)="onDragOver($event, col.Key)"
                     (dragleave)="onDragLeave(col.Key)"
                     (drop)="onDrop($event, col.Key)">
                    <div class="column-header" [style.border-top-color]="col.Color || 'var(--mj-border-default)'">
                        <span class="column-title">{{ col.Label }}</span>
                        <span class="column-count">{{ getColumnCards(col.Key).length }}</span>
                    </div>
                    <div class="column-body">
                        @for (card of getColumnCards(col.Key); track card.ID) {
                            <div class="mj-kanban-card"
                                 [style.border-left-color]="card.Color || 'transparent'"
                                 [class.dragging]="isDragging(card.ID)"
                                 [draggable]="!ReadOnly"
                                 (dragstart)="onDragStart($event, card, col.Key)"
                                 (dragend)="onDragEnd()"
                                 (click)="CardClicked.emit(card)">
                                <div class="card-title">{{ card.Title }}</div>
                                @if (card.Subtitle) {
                                    <div class="card-subtitle">{{ card.Subtitle }}</div>
                                }
                                <div class="card-footer">
                                    @if (card.BadgeText) {
                                        <span class="card-badge"
                                              [style.background]="card.BadgeColor || 'var(--mj-bg-surface-sunken)'"
                                              [style.color]="card.BadgeColor ? 'var(--mj-text-inverse)' : 'var(--mj-text-secondary)'">
                                            {{ card.BadgeText }}
                                        </span>
                                    }
                                    @if (card.FooterText) {
                                        <span class="card-footer-text">{{ card.FooterText }}</span>
                                    }
                                </div>
                            </div>
                        }
                        @if (getColumnCards(col.Key).length === 0) {
                            <div class="empty-column">
                                @if (!ReadOnly) {
                                    Drop here
                                } @else {
                                    No items
                                }
                            </div>
                        }
                    </div>
                </div>
            }
        </div>
    `,
    styles: [`
        :host { display: block; font-family: var(--mj-font-family); }

        .mj-kanban-board {
            display: flex;
            gap: var(--mj-space-3);
            overflow-x: auto;
            padding: var(--mj-space-1) 0 var(--mj-space-2) 0;
            min-height: 300px;
        }

        .mj-kanban-column {
            flex: 0 0 260px;
            background: var(--mj-bg-surface-sunken);
            border-radius: var(--mj-radius-lg);
            display: flex;
            flex-direction: column;
            transition: background var(--mj-transition-fast);
        }

        .mj-kanban-column.drag-over {
            background: var(--mj-brand-primary-light);
        }

        .column-header {
            padding: var(--mj-space-2-5) var(--mj-space-3-5);
            font-weight: var(--mj-font-semibold);
            font-size: var(--mj-text-sm);
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 3px solid var(--mj-border-default);
            border-radius: var(--mj-radius-lg) var(--mj-radius-lg) 0 0;
            color: var(--mj-text-primary);
        }

        .column-count {
            background: var(--mj-bg-surface-hover);
            border-radius: var(--mj-radius-lg);
            padding: var(--mj-space-px) var(--mj-space-2);
            font-size: var(--mj-text-xs);
            font-weight: var(--mj-font-bold);
            color: var(--mj-text-secondary);
        }

        .column-body {
            flex: 1;
            padding: var(--mj-space-2);
            display: flex;
            flex-direction: column;
            gap: var(--mj-space-1-5);
            min-height: 80px;
        }

        .mj-kanban-card {
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-subtle);
            border-left: 3px solid transparent;
            border-radius: var(--mj-radius-md);
            padding: var(--mj-space-2-5) var(--mj-space-3);
            cursor: grab;
            transition: box-shadow var(--mj-transition-fast), opacity var(--mj-transition-fast);
        }

        .mj-kanban-card:hover {
            box-shadow: var(--mj-shadow-sm);
        }

        .mj-kanban-card:active { cursor: grabbing; }

        .mj-kanban-card.dragging {
            opacity: 0.4;
        }

        .card-title {
            font-size: var(--mj-text-sm);
            font-weight: var(--mj-font-medium);
            color: var(--mj-text-primary);
            line-height: var(--mj-leading-snug);
        }

        .card-subtitle {
            font-size: var(--mj-text-xs);
            color: var(--mj-text-muted);
            margin-top: var(--mj-space-1);
            line-height: var(--mj-leading-snug);
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .card-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: var(--mj-space-2);
            gap: var(--mj-space-2);
        }

        .card-badge {
            font-size: var(--mj-text-xs);
            font-weight: var(--mj-font-semibold);
            padding: var(--mj-space-0-5) var(--mj-space-2);
            border-radius: var(--mj-radius-sm);
        }

        .card-footer-text {
            font-size: var(--mj-text-xs);
            color: var(--mj-text-muted);
        }

        .empty-column {
            text-align: center;
            color: var(--mj-text-disabled);
            font-size: var(--mj-text-sm);
            padding: var(--mj-space-6) var(--mj-space-2);
            border: 2px dashed var(--mj-border-subtle);
            border-radius: var(--mj-radius-md);
        }
    `]
})
export class MjKanbanBoardComponent {
    /** Column definitions. Order determines display order. */
    @Input() Columns: KanbanColumnDef[] = [];

    /** All cards to display. Each card's `ColumnKey` determines which column it appears in. */
    @Input() Cards: KanbanCardData[] = [];

    /** Disables drag-and-drop when true. */
    @Input() ReadOnly = false;

    /** Emitted when a card is dragged to a different column. */
    @Output() CardMoved = new EventEmitter<KanbanCardMovedEvent>();

    /** Emitted when a card is clicked (not dragged). */
    @Output() CardClicked = new EventEmitter<KanbanCardData>();

    /** @internal */
    dragCardID: string | null = null;
    /** @internal */
    dragCard: KanbanCardData | null = null;
    /** @internal */
    dragSourceColumn: string | null = null;
    /** @internal */
    dragOverColumn: string | null = null;

    private cdr = inject(ChangeDetectorRef);

    /** @internal Returns true if the given card is currently being dragged. */
    isDragging(cardID: string): boolean {
        return this.dragCardID != null && UUIDsEqual(this.dragCardID, cardID);
    }

    /** Returns cards belonging to a specific column. */
    getColumnCards(columnKey: string): KanbanCardData[] {
        return this.Cards.filter(c => c.ColumnKey === columnKey);
    }

    /** @internal */
    onDragStart(event: DragEvent, card: KanbanCardData, columnKey: string): void {
        this.dragCardID = card.ID;
        this.dragCard = card;
        this.dragSourceColumn = columnKey;
        event.dataTransfer?.setData('text/plain', card.ID);
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
        }
    }

    /** @internal */
    onDragEnd(): void {
        this.dragCardID = null;
        this.dragCard = null;
        this.dragSourceColumn = null;
        this.dragOverColumn = null;
        this.cdr.markForCheck();
    }

    /** @internal */
    onDragOver(event: DragEvent, columnKey: string): void {
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
        }
        if (this.dragOverColumn !== columnKey) {
            this.dragOverColumn = columnKey;
            this.cdr.markForCheck();
        }
    }

    /** @internal */
    onDragLeave(columnKey: string): void {
        if (this.dragOverColumn === columnKey) {
            this.dragOverColumn = null;
            this.cdr.markForCheck();
        }
    }

    /** @internal */
    onDrop(event: DragEvent, targetColumn: string): void {
        event.preventDefault();
        this.dragOverColumn = null;

        if (!this.dragCard || this.dragSourceColumn === targetColumn) {
            this.onDragEnd();
            return;
        }

        this.CardMoved.emit({
            Card: this.dragCard,
            FromColumn: this.dragSourceColumn!,
            ToColumn: targetColumn,
        });

        this.onDragEnd();
    }
}
