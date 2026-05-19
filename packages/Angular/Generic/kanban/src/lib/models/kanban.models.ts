/**
 * A single card displayed on the Kanban board.
 */
export interface KanbanCardData {
    /** Unique identifier for this card. */
    ID: string;
    /** Primary text displayed on the card. */
    Title: string;
    /** Secondary text displayed below the title. */
    Subtitle?: string;
    /** Left-border accent color (CSS color value). */
    Color?: string;
    /** Small badge text, e.g. priority level. */
    BadgeText?: string;
    /** Background color for the badge. */
    BadgeColor?: string;
    /** Text shown in the card footer, e.g. a due date. */
    FooterText?: string;
    /** The column key this card belongs to. */
    ColumnKey: string;
    /** Arbitrary consumer data passed through with events. */
    Data?: any;
}

/**
 * Defines a single column on the Kanban board.
 */
export interface KanbanColumnDef {
    /** Unique key identifying this column. Cards with matching `ColumnKey` appear here. */
    Key: string;
    /** Display label shown in the column header. */
    Label: string;
    /** Header accent color (CSS color value). */
    Color?: string;
}

/**
 * Event emitted when a card is dragged from one column to another.
 */
export interface KanbanCardMovedEvent {
    /** The card that was moved. */
    Card: KanbanCardData;
    /** The column key the card was dragged from. */
    FromColumn: string;
    /** The column key the card was dropped into. */
    ToColumn: string;
}
