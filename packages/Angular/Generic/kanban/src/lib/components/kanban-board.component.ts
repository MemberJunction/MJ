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
                    <div class="column-header" [style.border-top-color]="col.Color || '#94a3b8'">
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
                                              [style.background]="card.BadgeColor || '#f1f5f9'"
                                              [style.color]="card.BadgeColor ? '#fff' : '#64748b'">
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
        :host { display: block; }

        .mj-kanban-board {
            display: flex;
            gap: 12px;
            overflow-x: auto;
            padding: 4px 0 8px 0;
            min-height: 300px;
        }

        .mj-kanban-column {
            flex: 0 0 260px;
            background: #f8fafc;
            border-radius: 10px;
            display: flex;
            flex-direction: column;
            transition: background 0.15s;
        }

        .mj-kanban-column.drag-over {
            background: #eef2ff;
        }

        .column-header {
            padding: 10px 14px;
            font-weight: 600;
            font-size: 13px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 3px solid #94a3b8;
            border-radius: 10px 10px 0 0;
            color: #1e293b;
        }

        .column-count {
            background: #e2e8f0;
            border-radius: 10px;
            padding: 1px 8px;
            font-size: 11px;
            font-weight: 700;
            color: #64748b;
        }

        .column-body {
            flex: 1;
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            min-height: 80px;
        }

        .mj-kanban-card {
            background: #fff;
            border: 1px solid #e2e8f0;
            border-left: 3px solid transparent;
            border-radius: 8px;
            padding: 10px 12px;
            cursor: grab;
            transition: box-shadow 0.15s, opacity 0.15s;
        }

        .mj-kanban-card:hover {
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .mj-kanban-card:active { cursor: grabbing; }

        .mj-kanban-card.dragging {
            opacity: 0.4;
        }

        .card-title {
            font-size: 14px;
            font-weight: 500;
            color: #1e293b;
            line-height: 1.3;
        }

        .card-subtitle {
            font-size: 12px;
            color: #94a3b8;
            margin-top: 4px;
            line-height: 1.3;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .card-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 8px;
            gap: 8px;
        }

        .card-badge {
            font-size: 11px;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 6px;
        }

        .card-footer-text {
            font-size: 12px;
            color: #94a3b8;
        }

        .empty-column {
            text-align: center;
            color: #cbd5e1;
            font-size: 13px;
            padding: 24px 8px;
            border: 2px dashed #e2e8f0;
            border-radius: 8px;
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
