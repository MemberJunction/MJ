/**
 * Persisted grid configuration for a User View.
 *
 * Stored in the `GridState` column of the `User Views` entity. Contains column layout,
 * sort settings, filter state, and aggregate configuration. An empty `{}` is valid and
 * means "use entity-metadata defaults for all columns."
 *
 * The runtime class `ViewGridState` in MJUserViewEntityExtended mirrors this shape but
 * adds constructor logic. This interface represents the raw serialized form.
 */
export interface IGridState {
    /** Sort settings — array of field/direction pairs applied left-to-right */
    sortSettings?: IGridSortSetting[];
    /** Column settings — visibility, width, order, pinning, formatting */
    columnSettings?: IGridColumnSetting[];
    /** Filter state (composite filter tree with logic operators) */
    filter?: IFilterNode;
    /** Aggregate calculations and display configuration */
    aggregates?: IGridAggregatesConfig;
}

/**
 * A single sort-field entry within the grid's persisted sort configuration.
 *
 * Used inside {@link IGridState}.sortSettings to define multi-column sorting
 * applied left-to-right in the entity data grid.
 */
export interface IGridSortSetting {
    /** Field name to sort by */
    field: string;
    /** Sort direction */
    dir: 'asc' | 'desc';
}

/**
 * Persisted configuration for a single column in the entity data grid.
 *
 * Used inside {@link IGridState}.columnSettings. This is the serializable form
 * of `ViewColumnInfo` — it omits the non-persisted `EntityField` reference and
 * stores only user-chosen overrides for visibility, width, ordering, pinning,
 * and formatting.
 */
export interface IGridColumnSetting {
    /** Entity field ID */
    ID?: string;
    /** Field name */
    Name: string;
    /** Display name for column header (from entity metadata) */
    DisplayName?: string;
    /** User-defined display name override for column header */
    userDisplayName?: string;
    /** Whether column is hidden */
    hidden?: boolean;
    /** Column width in pixels */
    width?: number;
    /** Column order index */
    orderIndex?: number;
    /** Column pinning position ('left', 'right', or null for unpinned) */
    pinned?: 'left' | 'right' | null;
    /** Flex grow factor (for auto-sizing columns) */
    flex?: number;
    /** Minimum column width */
    minWidth?: number;
    /** Maximum column width */
    maxWidth?: number;
    /** Column formatting configuration */
    format?: IColumnFormat;
}

/**
 * Column formatting configuration for the entity data grid.
 *
 * Controls value display (number/currency/date/boolean formatting), text alignment,
 * header and cell styling, and conditional formatting rules. Used inside
 * {@link IGridColumnSetting}.format.
 *
 * Setting `type: 'auto'` tells the grid to infer formatting from entity field metadata.
 */
export interface IColumnFormat {
    /** Format type — 'auto' uses smart defaults based on field metadata */
    type?: 'auto' | 'number' | 'currency' | 'percent' | 'date' | 'datetime' | 'boolean' | 'text';
    /** Decimal places for number/currency/percent types */
    decimals?: number;
    /** Currency code (ISO 4217) for currency type, e.g. 'USD', 'EUR' */
    currencyCode?: string;
    /** Show thousands separator for number types */
    thousandsSeparator?: boolean;
    /** Date format preset or custom pattern */
    dateFormat?: 'short' | 'medium' | 'long' | string;
    /** Label to display for true values (boolean type) */
    trueLabel?: string;
    /** Label to display for false values (boolean type) */
    falseLabel?: string;
    /** How to display boolean values */
    booleanDisplay?: 'text' | 'checkbox' | 'icon';
    /** Text alignment */
    align?: 'left' | 'center' | 'right';
    /** Header styling (bold, italic, color, etc.) */
    headerStyle?: IColumnTextStyle;
    /** Cell styling (applies to all cells in the column) */
    cellStyle?: IColumnTextStyle;
    /** Conditional formatting rules (applied in order, first match wins) */
    conditionalRules?: IColumnConditionalRule[];
}

/**
 * Text styling options for grid column headers and cells.
 *
 * Used inside {@link IColumnFormat}.headerStyle, {@link IColumnFormat}.cellStyle,
 * and {@link IColumnConditionalRule}.style to control font weight, style,
 * decoration, and color.
 */
export interface IColumnTextStyle {
    /** Bold text */
    bold?: boolean;
    /** Italic text */
    italic?: boolean;
    /** Underlined text */
    underline?: boolean;
    /** Text color (CSS color value) */
    color?: string;
    /** Background color (CSS color value) */
    backgroundColor?: string;
}

/**
 * Conditional formatting rule for dynamic cell styling in the entity data grid.
 *
 * Used inside {@link IColumnFormat}.conditionalRules. Rules are evaluated in order;
 * the first match wins. Each rule compares the cell value against a condition and
 * applies the associated {@link IColumnTextStyle} when the condition is met.
 */
export interface IColumnConditionalRule {
    /** Condition type */
    condition: 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual' | 'between' | 'contains' | 'startsWith' | 'endsWith' | 'isEmpty' | 'isNotEmpty';
    /** Value to compare against */
    value?: string | number | boolean;
    /** Second value for 'between' condition */
    value2?: number;
    /** Style to apply when condition is met */
    style: IColumnTextStyle;
}

/**
 * A single node in a composite filter tree, used inside {@link IGridState}.filter.
 *
 * Each node is either a **leaf condition** (has `field`, `operator`, `value`) or a
 * **composite group** (has `logic` and nested `filters`). This recursive structure
 * supports arbitrarily deep AND/OR filter expressions.
 */
export interface IFilterNode {
    /** Logic operator for composite groups */
    logic?: 'and' | 'or';
    /** Nested filter nodes (for composite groups) */
    filters?: IFilterNode[];
    /** Field name (for leaf conditions) */
    field?: string;
    /** Comparison operator (for leaf conditions) */
    operator?: string;
    /** Comparison value (for leaf conditions) */
    value?: string | number | boolean | null;
}

/**
 * Complete aggregate configuration for a view's grid, stored inside
 * {@link IGridState}.aggregates.
 *
 * Contains display settings (where/how to show aggregates) and an array of
 * aggregate expressions — each of which can be an explicit SQL expression or
 * an AI-generated expression from a natural-language `smartPrompt`.
 */
export interface IGridAggregatesConfig {
    /** Display settings for aggregate panel/row */
    display?: IGridAggregateDisplay;
    /** Aggregate expressions and their display configuration */
    expressions?: IGridAggregate[];
}

/**
 * Display settings for the aggregate panel and pinned summary row.
 *
 * Used inside {@link IGridAggregatesConfig}.display to control where and how
 * aggregate values are rendered — as pinned rows under columns, as summary
 * cards in a side/bottom panel, or both.
 */
export interface IGridAggregateDisplay {
    /** Whether to show column-bound aggregates in pinned row */
    showColumnAggregates?: boolean;
    /** Where to show column aggregates: pinned top or bottom row */
    columnPosition?: 'top' | 'bottom';
    /** Whether to show card aggregates in a panel */
    showCardAggregates?: boolean;
    /** Where to show the card panel */
    cardPosition?: 'right' | 'bottom';
    /** Card panel width in pixels (for 'right' position) */
    cardPanelWidth?: number;
    /** Card layout style */
    cardLayout?: 'horizontal' | 'vertical' | 'grid';
    /** Number of columns for 'grid' layout */
    cardGridColumns?: number;
    /** Card panel title */
    cardPanelTitle?: string;
    /** Whether card panel is collapsible */
    cardPanelCollapsible?: boolean;
    /** Whether card panel starts collapsed */
    cardPanelStartCollapsed?: boolean;
}

/**
 * Configuration for a single aggregate expression in the entity data grid.
 *
 * Used inside {@link IGridAggregatesConfig}.expressions. Each aggregate can be
 * displayed as a pinned-row value under a column or as a summary card in a panel.
 * Supports both explicit SQL expressions and AI-generated expressions via
 * `smartPrompt`.
 */
export interface IGridAggregate {
    /** Unique ID for this aggregate (auto-generated if not provided) */
    id?: string;
    /** SQL expression to calculate (e.g. "SUM(OrderTotal)", "COUNT(*)") */
    expression: string;
    /** Natural language prompt for AI-generated expression */
    smartPrompt?: string;
    /** Display type: 'column' (pinned row) or 'card' (summary panel) */
    displayType: 'column' | 'card';
    /** For 'column' displayType: which column to display under */
    column?: string;
    /** Human-readable label */
    label: string;
    /** Optional description (shown in tooltip) */
    description?: string;
    /** Value formatting */
    format?: IAggregateValueFormat;
    /** Icon for card display (Font Awesome class) */
    icon?: string;
    /** Conditional styling rules (applied in order, first match wins) */
    conditionalStyles?: IAggregateConditionalStyle[];
    /** Whether this aggregate is enabled (visible) */
    enabled?: boolean;
    /** Sort order for display (lower = earlier) */
    order?: number;
}

/**
 * Value formatting options for aggregate results.
 *
 * Used inside {@link IGridAggregate}.format to control how the computed
 * aggregate value is displayed — decimal precision, currency symbols,
 * thousands separators, and prefix/suffix decorations.
 */
export interface IAggregateValueFormat {
    /** Number of decimal places */
    decimals?: number;
    /** Currency code (ISO 4217), e.g. 'USD', 'EUR' */
    currencyCode?: string;
    /** Show thousands separator */
    thousandsSeparator?: boolean;
    /** Prefix to add before value (e.g. '$') */
    prefix?: string;
    /** Suffix to add after value (e.g. '%') */
    suffix?: string;
    /** Date format for date aggregates */
    dateFormat?: string;
}

/**
 * Conditional styling rule for aggregate values, providing visual indicators
 * (green/yellow/red) based on the computed result.
 *
 * Used inside {@link IGridAggregate}.conditionalStyles. Rules are evaluated
 * in order; the first match wins.
 */
export interface IAggregateConditionalStyle {
    /** Condition operator */
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between';
    /** Value to compare against */
    value: number | string;
    /** Second value for 'between' operator */
    value2?: number | string;
    /** Style class to apply */
    style: 'success' | 'warning' | 'danger' | 'info' | 'muted';
}
