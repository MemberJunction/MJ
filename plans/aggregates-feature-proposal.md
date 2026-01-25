# RunView Aggregates Feature - Full Stack Proposal

## Executive Summary

Add server-side aggregate calculation capability to RunView, enabling grids to display summary statistics (sums, averages, counts, complex formulas) calculated on the full dataset regardless of pagination mode. Aggregates run as a parallel SQL query alongside the row data query, with results returned in a new `AggregateResults` property.

---

## Part 1: Core Layer Changes

### 1.1 RunViewParams Extension

**File**: `packages/MJCore/src/views/runView.ts`

```typescript
/**
 * Single aggregate expression to compute
 */
export interface AggregateExpression {
  /**
   * SQL expression for the aggregate.
   * Examples:
   *   - "SUM(OrderTotal)"
   *   - "AVG(Price)"
   *   - "COUNT(*)"
   *   - "MAX(CreatedAt)"
   *   - "SUM(Quantity * Price * (1 - Discount/100))"
   */
  expression: string;

  /**
   * Optional alias for the result (used in error messages and debugging).
   * If not provided, defaults to the expression itself.
   */
  alias?: string;
}

export class RunViewParams {
  // ... existing properties ...

  /**
   * Optional aggregate expressions to calculate on the full result set.
   * These run as a parallel query and are NOT affected by pagination (StartRow/MaxRows).
   * The WHERE clause (including filters and RLS) IS applied to aggregates.
   *
   * Results are returned in AggregateResults in the same order as this array.
   *
   * @example
   * ```typescript
   * params.Aggregates = [
   *   { expression: 'SUM(OrderTotal)', alias: 'TotalRevenue' },
   *   { expression: 'COUNT(*)', alias: 'OrderCount' },
   *   { expression: 'AVG(OrderTotal)', alias: 'AverageOrder' },
   *   { expression: 'MAX(OrderDate)', alias: 'LatestOrder' }
   * ];
   * ```
   */
  Aggregates?: AggregateExpression[];
}
```

### 1.2 RunViewResult Extension

**File**: `packages/MJCore/src/generic/interfaces.ts`

```typescript
/**
 * Single aggregate result value
 */
export type AggregateValue = number | string | Date | boolean | null;

/**
 * Result of a single aggregate expression
 */
export interface AggregateResult {
  /** The expression that was calculated */
  expression: string;
  /** The alias (or expression if no alias provided) */
  alias: string;
  /** The calculated value */
  value: AggregateValue;
  /** If calculation failed, the error message */
  error?: string;
}

export type RunViewResult<T = any> = {
  Success: boolean;
  Results: Array<T>;
  UserViewRunID?: string;
  RowCount: number;
  TotalRowCount: number;
  ExecutionTime: number;
  ErrorMessage: string;

  // NEW
  /**
   * Results of aggregate calculations, in same order as input Aggregates array.
   * Only present if Aggregates were requested.
   */
  AggregateResults?: AggregateResult[];

  /**
   * Execution time for aggregate query specifically (ms).
   * Only present if Aggregates were requested.
   */
  AggregateExecutionTime?: number;
}
```

---

## Part 2: GraphQL Layer Changes

### 2.1 Input Types

**File**: `packages/MJServer/src/generic/RunViewResolver.ts`

Add to all three input types (RunViewByIDInput, RunViewByNameInput, RunDynamicViewInput):

```typescript
@InputType()
export class AggregateExpressionInput {
  @Field()
  expression: string;

  @Field({ nullable: true })
  alias?: string;
}

// Add to existing input types:
@Field(() => [AggregateExpressionInput], { nullable: true })
Aggregates?: AggregateExpressionInput[];
```

### 2.2 Output Types

```typescript
@ObjectType()
export class AggregateResultOutput {
  @Field()
  expression: string;

  @Field()
  alias: string;

  @Field(() => GraphQLJSON, { nullable: true })
  value: any;  // GraphQL can't type union well, use JSON

  @Field({ nullable: true })
  error?: string;
}

// Add to RunViewResult output:
@Field(() => [AggregateResultOutput], { nullable: true })
AggregateResults?: AggregateResultOutput[];

@Field({ nullable: true })
AggregateExecutionTime?: number;
```

---

## Part 3: SQL Server Provider Changes

### 3.1 Aggregate Expression Validation

**File**: `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts`

Add new validation function:

```typescript
/**
 * Allowed SQL aggregate functions for user-provided expressions
 */
const ALLOWED_AGGREGATE_FUNCTIONS = [
  'SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'COUNT_BIG',
  'STDEV', 'STDEVP', 'VAR', 'VARP',
  'STRING_AGG', 'CHECKSUM_AGG'
] as const;

/**
 * Validates an aggregate expression for SQL injection and allowed patterns.
 *
 * @param expression The SQL expression to validate
 * @param entityFields Valid field names for this entity
 * @returns Validation result with error message if invalid
 */
function validateAggregateExpression(
  expression: string,
  entityFields: string[]
): { valid: boolean; error?: string } {

  // 1. Block dangerous SQL patterns
  const dangerousPatterns = [
    /;/,                          // Statement terminator
    /--/,                         // SQL comment
    /\/\*/,                       // Block comment start
    /\bEXEC\b/i,                  // Execute
    /\bEXECUTE\b/i,
    /\bXP_/i,                     // Extended stored procs
    /\bSP_/i,                     // System stored procs
    /\bDROP\b/i,
    /\bDELETE\b/i,
    /\bUPDATE\b/i,
    /\bINSERT\b/i,
    /\bTRUNCATE\b/i,
    /\bALTER\b/i,
    /\bCREATE\b/i,
    /\bGRANT\b/i,
    /\bREVOKE\b/i,
    /\bDENY\b/i,
    /\bOPENROWSET\b/i,
    /\bOPENQUERY\b/i,
    /\bLINKED\b/i,
    /\bCURSOR\b/i,
    /\bDECLARE\b/i,
    /\bSET\b\s+/i,                // SET statements (but allow SET operations in math)
    /\bWAITFOR\b/i,
    /\bSHUTDOWN\b/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(expression)) {
      return {
        valid: false,
        error: `Expression contains disallowed SQL keyword matching: ${pattern.source}`
      };
    }
  }

  // 2. Block subqueries
  if (/\bSELECT\b/i.test(expression)) {
    return {
      valid: false,
      error: 'Subqueries (SELECT) are not allowed in aggregate expressions'
    };
  }

  // 3. Validate function names are in allowlist
  const functionPattern = /\b([A-Z_][A-Z0-9_]*)\s*\(/gi;
  let match;
  const usedFunctions: string[] = [];

  while ((match = functionPattern.exec(expression)) !== null) {
    const fnName = match[1].toUpperCase();
    usedFunctions.push(fnName);

    // Skip math operators that look like functions
    const mathOps = ['ABS', 'CEILING', 'FLOOR', 'ROUND', 'POWER', 'SQRT', 'LOG', 'LOG10', 'EXP', 'SIGN'];
    const dateOps = ['DATEPART', 'DATEDIFF', 'DATEADD', 'YEAR', 'MONTH', 'DAY', 'GETDATE', 'GETUTCDATE'];
    const castOps = ['CAST', 'CONVERT', 'ISNULL', 'COALESCE', 'NULLIF', 'IIF', 'CASE'];

    const allowedFunctions = [
      ...ALLOWED_AGGREGATE_FUNCTIONS,
      ...mathOps,
      ...dateOps,
      ...castOps
    ];

    if (!allowedFunctions.includes(fnName)) {
      return {
        valid: false,
        error: `Function '${fnName}' is not allowed in aggregate expressions. ` +
               `Allowed aggregate functions: ${ALLOWED_AGGREGATE_FUNCTIONS.join(', ')}`
      };
    }
  }

  // 4. Ensure at least one aggregate function is used (or it's a simple field reference)
  const hasAggregate = usedFunctions.some(fn =>
    (ALLOWED_AGGREGATE_FUNCTIONS as readonly string[]).includes(fn)
  );

  // Allow simple expressions like field arithmetic, but warn if no aggregate
  // This is OK: "Price * 1.1" but meaningless without GROUP BY
  // For now, we allow it as the caller may know what they're doing

  // 5. Validate field references exist (optional - could be strict or lenient)
  // Extract potential field names (words not followed by parentheses)
  const fieldPattern = /\b([A-Z_][A-Z0-9_]*)\b(?!\s*\()/gi;
  const potentialFields: string[] = [];
  while ((match = fieldPattern.exec(expression)) !== null) {
    const word = match[1];
    // Skip SQL keywords and literals
    const skipWords = ['AND', 'OR', 'NOT', 'AS', 'NULL', 'TRUE', 'FALSE', 'WHEN', 'THEN', 'ELSE', 'END', 'OVER', 'PARTITION', 'BY', 'ORDER', 'ROWS', 'RANGE', 'BETWEEN', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT', 'ROW'];
    if (!skipWords.includes(word.toUpperCase())) {
      potentialFields.push(word);
    }
  }

  // Lenient validation: just check that referenced fields exist
  // (Skip for now - entity fields may include computed columns not in Fields array)

  return { valid: true };
}
```

### 3.2 InternalRunView Modification

**File**: `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts`

Modify `InternalRunView` to handle aggregates:

```typescript
protected async InternalRunView(
  params: RunViewParams,
  contextUser?: UserInfo
): Promise<RunViewResult> {

  // ... existing code up to WHERE clause construction (around line 1535) ...

  // After WHERE clause is built, before ORDER BY:

  // Build aggregate query if requested
  let aggregateQuery: string | null = null;
  let aggregateResults: AggregateResult[] | undefined;
  let aggregateExecutionTime: number | undefined;

  if (params.Aggregates && params.Aggregates.length > 0) {
    // Validate all expressions first
    const entityFields = entity.Fields.map(f => f.Name);

    for (const agg of params.Aggregates) {
      const validation = validateAggregateExpression(agg.expression, entityFields);
      if (!validation.valid) {
        throw new Error(
          `Invalid aggregate expression '${agg.alias || agg.expression}': ${validation.error}`
        );
      }
    }

    // Build SELECT clause with all aggregate expressions
    const selectExpressions = params.Aggregates.map((agg, idx) => {
      const alias = agg.alias || `Agg${idx}`;
      // Wrap alias in brackets to handle spaces/special chars
      return `${agg.expression} AS [${alias}]`;
    }).join(', ');

    // Build aggregate query (same WHERE, no ORDER BY, no pagination)
    aggregateQuery = `
      SELECT ${selectExpressions}
      FROM [${entity.SchemaName}].[${baseView}]
      ${sWhereSQL ? `WHERE ${sWhereSQL}` : ''}
    `;
  }

  // ... continue with ORDER BY and pagination for main query ...

  // Execute queries in parallel
  const startTime = Date.now();

  const queryPromises: Promise<any>[] = [];

  // Main data query (unless count_only)
  if (params.ResultType !== 'count_only') {
    queryPromises.push(
      this.executeSQLQuery(mainQuery, contextUser).then(r => ({ type: 'data', result: r }))
    );
  }

  // Count query
  if (shouldRunCountQuery) {
    queryPromises.push(
      this.executeSQLQuery(countQuery, contextUser).then(r => ({ type: 'count', result: r }))
    );
  }

  // Aggregate query
  if (aggregateQuery) {
    const aggStartTime = Date.now();
    queryPromises.push(
      this.executeSQLQuery(aggregateQuery, contextUser).then(r => ({
        type: 'aggregate',
        result: r,
        executionTime: Date.now() - aggStartTime
      }))
    );
  }

  // Wait for all queries
  const queryResults = await Promise.all(queryPromises);

  // Process results
  let dataResult: any[] = [];
  let totalRowCount = 0;

  for (const qr of queryResults) {
    if (qr.type === 'data') {
      dataResult = qr.result;
    } else if (qr.type === 'count') {
      totalRowCount = qr.result[0]?.TotalRowCount || 0;
    } else if (qr.type === 'aggregate') {
      aggregateExecutionTime = qr.executionTime;

      // Map aggregate results back to input order
      const aggRow = qr.result[0]; // Single row with all aggregates

      if (aggRow) {
        aggregateResults = params.Aggregates!.map((agg, idx) => {
          const alias = agg.alias || `Agg${idx}`;
          const value = aggRow[alias];

          return {
            expression: agg.expression,
            alias: agg.alias || agg.expression,
            value: this.convertAggregateValue(value)
          };
        });
      } else {
        // No rows matched - return nulls
        aggregateResults = params.Aggregates!.map(agg => ({
          expression: agg.expression,
          alias: agg.alias || agg.expression,
          value: null
        }));
      }
    }
  }

  const executionTime = Date.now() - startTime;

  // Build result
  const result: RunViewResult = {
    Success: true,
    Results: dataResult,
    RowCount: dataResult.length,
    TotalRowCount: totalRowCount || dataResult.length,
    ExecutionTime: executionTime,
    ErrorMessage: '',
    AggregateResults: aggregateResults,
    AggregateExecutionTime: aggregateExecutionTime
  };

  return result;
}

/**
 * Convert SQL aggregate value to appropriate JS type
 */
private convertAggregateValue(value: any): AggregateValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  // Handle SQL Server specific types (BigInt, Decimal, etc.)
  if (typeof value === 'bigint') {
    return Number(value);
  }
  // Default to string representation
  return String(value);
}
```

---

## Part 4: UserView GridState Extension

### 4.1 Aggregate Configuration Types

**File**: `packages/MJCoreEntities/src/custom/UserViewEntity.ts`

Add new types for aggregate persistence:

```typescript
/**
 * Display type for an aggregate value
 */
export type AggregateDisplayType = 'column' | 'card';

/**
 * Value formatting options for aggregates
 */
export interface AggregateValueFormat {
  /** How to format the value */
  type: 'number' | 'currency' | 'percent' | 'date' | 'datetime' | 'text';

  /** Decimal places for number/currency/percent */
  decimals?: number;

  /** Currency code (ISO 4217) for currency type */
  currencyCode?: string;

  /** Date format for date/datetime types */
  dateFormat?: 'short' | 'medium' | 'long' | 'relative' | string;

  /** Whether to show thousands separator */
  thousandsSeparator?: boolean;

  /** Prefix to add before value (e.g., "$") */
  prefix?: string;

  /** Suffix to add after value (e.g., " units") */
  suffix?: string;
}

/**
 * Conditional styling based on value
 */
export interface AggregateConditionalStyle {
  /** Condition type */
  condition: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'between';

  /** Comparison value */
  value: number;

  /** Second value for 'between' condition */
  value2?: number;

  /** Style to apply when condition matches */
  style: 'success' | 'warning' | 'danger' | 'info' | 'muted';
}

/**
 * Configuration for a single aggregate
 */
export interface ViewGridAggregate {
  /**
   * Unique ID for this aggregate (for UI reference).
   * Auto-generated if not provided.
   */
  id?: string;

  /**
   * SQL expression to calculate.
   * Examples:
   *   - "SUM(OrderTotal)"
   *   - "COUNT(*)"
   *   - "SUM(Quantity * Price * (1 - Discount/100))"
   *
   * If smartPrompt is set and expression is empty, the expression will be
   * auto-generated from the natural language prompt.
   */
  expression: string;

  /**
   * Natural language prompt for AI-generated expression.
   * When set, the server will use AI to generate/update the expression
   * based on this description.
   *
   * Examples:
   *   - "Total revenue"
   *   - "Average order size excluding cancelled orders"
   *   - "Count of unique customers"
   *
   * The generated expression is stored in `expression` for caching.
   * Re-generation only happens when smartPrompt changes.
   */
  smartPrompt?: string;

  /**
   * Display type:
   * - 'column': Show in pinned row under a specific column
   * - 'card': Show in summary card panel
   */
  displayType: AggregateDisplayType;

  /**
   * For 'column' displayType: which column to display under.
   * Should match a field name in the grid.
   */
  column?: string;

  /** Human-readable label */
  label: string;

  /** Optional description (shown in tooltip) */
  description?: string;

  /** Value formatting */
  format?: AggregateValueFormat;

  /** Icon for card display (Font Awesome class) */
  icon?: string;

  /**
   * Conditional styling rules (applied in order, first match wins).
   * Used for visual indicators like red/yellow/green based on value.
   */
  conditionalStyles?: AggregateConditionalStyle[];

  /**
   * Whether this aggregate is enabled (visible).
   * Allows users to toggle without deleting configuration.
   */
  enabled?: boolean;

  /**
   * Sort order for display (lower = earlier).
   * Cards are sorted by this, columns use column order.
   */
  order?: number;
}

/**
 * Display settings for the aggregate panel/row
 */
export interface ViewGridAggregateDisplay {
  /** Whether to show column-bound aggregates */
  showColumnAggregates?: boolean;

  /** Where to show column aggregates: pinned top or bottom row */
  columnPosition?: 'top' | 'bottom';

  /** Whether to show card aggregates */
  showCardAggregates?: boolean;

  /** Where to show the card panel */
  cardPosition?: 'right' | 'bottom';

  /** Card panel width in pixels (for 'right' position) */
  cardPanelWidth?: number;

  /** Card layout style */
  cardLayout?: 'horizontal' | 'vertical' | 'grid';

  /** Number of columns for 'grid' layout */
  cardGridColumns?: number;

  /** Card panel title (optional) */
  cardPanelTitle?: string;

  /** Whether card panel is collapsible */
  cardPanelCollapsible?: boolean;

  /** Whether card panel starts collapsed */
  cardPanelStartCollapsed?: boolean;
}

/**
 * Complete aggregate configuration for a view
 */
export interface ViewGridAggregatesConfig {
  /** Display settings for aggregate panel/row */
  display?: ViewGridAggregateDisplay;

  /**
   * Aggregate expressions and their display configuration.
   *
   * Each aggregate can optionally have a `smartPrompt` for AI-generated expressions.
   * When smartPrompt is set:
   *   - If expression is empty, server generates it from the prompt
   *   - If expression exists, it's cached; regenerate only when smartPrompt changes
   *
   * This approach keeps expression + its prompt together for:
   *   - Clear 1:1 mapping between prompts and expressions
   *   - Easy editing of individual aggregates
   *   - No separate array synchronization needed
   */
  expressions?: ViewGridAggregate[];
}

// Update ViewGridState
export class ViewGridState {
  /** Sort settings - array of field/direction pairs */
  sortSettings?: ViewGridSortSetting[];

  /** Column settings - visibility, width, order, pinning, etc. */
  columnSettings?: ViewGridColumnSetting[];

  /** Filter state (Kendo-compatible format) */
  filter?: ViewFilterInfo;

  // NEW
  /** Aggregate calculations and display configuration */
  aggregates?: ViewGridAggregatesConfig;
}
```

### 4.2 Default Aggregate Display Settings

```typescript
export const DEFAULT_AGGREGATE_DISPLAY: Required<ViewGridAggregateDisplay> = {
  showColumnAggregates: true,
  columnPosition: 'bottom',
  showCardAggregates: true,
  cardPosition: 'right',
  cardPanelWidth: 280,
  cardLayout: 'vertical',
  cardGridColumns: 2,
  cardPanelTitle: 'Summary',
  cardPanelCollapsible: true,
  cardPanelStartCollapsed: false
};
```

---

## Part 5: Smart Aggregate Generation (AI)

### 5.1 Per-Expression Smart Prompts

Each `ViewGridAggregate` can have an optional `smartPrompt` field. When present:

1. **On save/load**: If `smartPrompt` is set but `expression` is empty, generate expression from prompt
2. **On prompt change**: If `smartPrompt` changes, regenerate the expression
3. **Caching**: Generated expressions are cached in `expression` field to avoid re-generation on every load

This per-expression approach is better than a separate array because:
- Clear 1:1 mapping between prompts and expressions
- No array index synchronization issues
- User can mix manual expressions with AI-generated ones
- Easy to edit individual aggregates
- Label, format, icon etc. stay with the expression

### 5.2 Server-Side AI Integration

**File**: `packages/MJCoreEntities/src/custom/UserViewEntity.ts`

```typescript
/**
 * Generate a single aggregate expression from natural language prompt.
 * Called when ViewGridAggregate has smartPrompt but no expression.
 *
 * @param prompt User's natural language description
 * @param entityInfo Entity metadata for context
 * @param existingConfig Partial config (label, displayType, etc.) to preserve
 * @returns Generated expression and optional suggestions for label/format
 */
public async GenerateSmartAggregate(
  prompt: string,
  entityInfo: EntityInfo,
  existingConfig?: Partial<ViewGridAggregate>
): Promise<{
  expression: string;
  suggestedLabel?: string;
  suggestedFormat?: AggregateValueFormat;
  suggestedIcon?: string;
  explanation?: string;
}> {
  // Stub - server subclass implements with AI
  return { expression: '', explanation: 'Not implemented' };
}

/**
 * Process all aggregates in config, generating expressions for any with smartPrompt.
 * Called before saving or when loading a view with smart aggregates.
 *
 * @param config The aggregate config to process
 * @param entityInfo Entity metadata for context
 * @returns Updated config with all expressions populated
 */
public async ProcessSmartAggregates(
  config: ViewGridAggregatesConfig,
  entityInfo: EntityInfo
): Promise<ViewGridAggregatesConfig> {
  if (!config.expressions?.length) return config;

  const processed = await Promise.all(
    config.expressions.map(async (agg) => {
      // Only generate if smartPrompt is set and expression is empty
      if (agg.smartPrompt && !agg.expression) {
        const result = await this.GenerateSmartAggregate(
          agg.smartPrompt,
          entityInfo,
          agg
        );
        return {
          ...agg,
          expression: result.expression,
          // Only apply suggestions if not already set
          label: agg.label || result.suggestedLabel || agg.smartPrompt,
          format: agg.format || result.suggestedFormat,
          icon: agg.icon || result.suggestedIcon
        };
      }
      return agg;
    })
  );

  return { ...config, expressions: processed };
}
```

### 5.3 AI Prompt Template

```typescript
const SMART_AGGREGATE_SYSTEM_PROMPT = `
You are a SQL aggregate expression generator for MemberJunction.
Given an entity schema and a natural language description, generate a SINGLE SQL aggregate expression.

RULES:
1. Only use allowed aggregate functions: SUM, AVG, MIN, MAX, COUNT, COUNT_BIG, STDEV, STDEVP, VAR, VARP
2. Only reference fields that exist in the entity
3. For complex calculations, combine fields with arithmetic: +, -, *, /
4. Use ISNULL/COALESCE to handle NULL values appropriately
5. Return exactly ONE expression (not multiple)

ENTITY SCHEMA:
{entityFieldsJson}

USER REQUEST:
{userPrompt}

OUTPUT FORMAT:
Return a JSON object with:
- "expression": the SQL aggregate expression
- "suggestedLabel": human-friendly label for the aggregate
- "suggestedFormat": formatting options (type, decimals, currencyCode, etc.)
- "suggestedIcon": Font Awesome icon class if appropriate
- "explanation": brief explanation of what this calculates

Example output for "total revenue after discounts":
{
  "expression": "SUM(Quantity * Price * (1 - ISNULL(Discount, 0) / 100.0))",
  "suggestedLabel": "Net Revenue",
  "suggestedFormat": { "type": "currency", "currencyCode": "USD", "decimals": 2 },
  "suggestedIcon": "fa-solid fa-dollar-sign",
  "explanation": "Calculates total revenue accounting for line-item discounts as percentages."
}

Example output for "average order value":
{
  "expression": "AVG(OrderTotal)",
  "suggestedLabel": "Average Order",
  "suggestedFormat": { "type": "currency", "currencyCode": "USD", "decimals": 2 },
  "suggestedIcon": "fa-solid fa-chart-line",
  "explanation": "Calculates the mean order value across all orders."
}
`;
```

---

## Part 6: Angular UI Components

### 6.1 Aggregate Panel Component

**File**: `packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/components/aggregate-panel/`

```typescript
@Component({
  selector: 'mj-aggregate-panel',
  template: `
    <div class="aggregate-panel"
         [class.position-right]="position === 'right'"
         [class.position-bottom]="position === 'bottom'"
         [class.collapsed]="isCollapsed"
         [style.width.px]="position === 'right' ? width : null">

      <!-- Header -->
      <div class="panel-header" *ngIf="title || collapsible">
        <span class="panel-title">{{ title }}</span>
        <button *ngIf="collapsible"
                class="collapse-toggle"
                (click)="toggleCollapse()">
          <i class="fa-solid" [class.fa-chevron-down]="isCollapsed"
                              [class.fa-chevron-up]="!isCollapsed"></i>
        </button>
      </div>

      <!-- Cards -->
      <div class="panel-content"
           [class.layout-horizontal]="layout === 'horizontal'"
           [class.layout-vertical]="layout === 'vertical'"
           [class.layout-grid]="layout === 'grid'"
           [style.--grid-columns]="gridColumns"
           *ngIf="!isCollapsed">

        <div *ngFor="let agg of aggregates"
             class="aggregate-card"
             [class]="getStyleClass(agg)"
             [title]="agg.description">

          <div class="card-icon" *ngIf="agg.icon">
            <i [class]="agg.icon"></i>
          </div>

          <div class="card-content">
            <div class="card-value">{{ formatValue(agg) }}</div>
            <div class="card-label">{{ agg.label }}</div>
          </div>
        </div>

      </div>
    </div>
  `,
  styleUrls: ['./aggregate-panel.component.css']
})
export class AggregatePanelComponent {
  @Input() aggregates: ViewGridAggregate[] = [];
  @Input() values: Map<string, AggregateValue> = new Map();
  @Input() position: 'right' | 'bottom' = 'right';
  @Input() width: number = 280;
  @Input() layout: 'horizontal' | 'vertical' | 'grid' = 'vertical';
  @Input() gridColumns: number = 2;
  @Input() title: string = 'Summary';
  @Input() collapsible: boolean = true;
  @Input() startCollapsed: boolean = false;

  isCollapsed = false;

  ngOnInit() {
    this.isCollapsed = this.startCollapsed;
  }

  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
  }

  formatValue(agg: ViewGridAggregate): string {
    const value = this.values.get(agg.id || agg.expression);
    if (value == null) return '—';

    const format = agg.format || { type: 'number' };
    return this.formatByType(value, format);
  }

  getStyleClass(agg: ViewGridAggregate): string {
    const value = this.values.get(agg.id || agg.expression);
    if (value == null || !agg.conditionalStyles?.length) return '';

    for (const rule of agg.conditionalStyles) {
      if (this.evaluateCondition(value, rule)) {
        return `style-${rule.style}`;
      }
    }
    return '';
  }

  private formatByType(value: AggregateValue, format: AggregateValueFormat): string {
    // Implementation for number, currency, percent, date formatting
    // Uses Intl.NumberFormat, Intl.DateTimeFormat, etc.
  }

  private evaluateCondition(value: AggregateValue, rule: AggregateConditionalStyle): boolean {
    if (typeof value !== 'number') return false;

    switch (rule.condition) {
      case 'gt': return value > rule.value;
      case 'gte': return value >= rule.value;
      case 'lt': return value < rule.value;
      case 'lte': return value <= rule.value;
      case 'eq': return value === rule.value;
      case 'neq': return value !== rule.value;
      case 'between': return value >= rule.value && value <= (rule.value2 ?? rule.value);
      default: return false;
    }
  }
}
```

### 6.2 Aggregate Setup Dialog

For the 80% simple use case:

```typescript
@Component({
  selector: 'mj-aggregate-setup-dialog',
  template: `
    <kendo-dialog [title]="'Add Summary'" *ngIf="visible" (close)="onCancel()">

      <!-- Simple Mode (Default) -->
      <div class="setup-mode-simple" *ngIf="mode === 'simple'">
        <h3>Quick Add</h3>
        <p>Select a column and calculation type:</p>

        <div class="field-row">
          <label>Column</label>
          <kendo-dropdownlist
            [data]="numericFields"
            [textField]="'DisplayName'"
            [valueField]="'Name'"
            [(ngModel)]="selectedField"
            (valueChange)="onFieldChange()">
          </kendo-dropdownlist>
        </div>

        <div class="field-row">
          <label>Calculation</label>
          <kendo-buttongroup selection="single" [(value)]="selectedFunction">
            <button kendoButton [value]="'SUM'" title="Sum all values">Σ Sum</button>
            <button kendoButton [value]="'AVG'" title="Average of values">x̄ Avg</button>
            <button kendoButton [value]="'COUNT'" title="Count rows"># Count</button>
            <button kendoButton [value]="'MIN'" title="Minimum value">↓ Min</button>
            <button kendoButton [value]="'MAX'" title="Maximum value">↑ Max</button>
          </kendo-buttongroup>
        </div>

        <div class="field-row">
          <label>Display As</label>
          <kendo-buttongroup selection="single" [(value)]="displayType">
            <button kendoButton [value]="'column'" title="Show under column">
              <i class="fa-solid fa-table-columns"></i> Under Column
            </button>
            <button kendoButton [value]="'card'" title="Show in summary card">
              <i class="fa-solid fa-id-card"></i> Summary Card
            </button>
          </kendo-buttongroup>
        </div>

        <div class="preview">
          <strong>Preview:</strong> {{ getPreviewExpression() }}
        </div>

        <div class="mode-switch">
          <a (click)="mode = 'advanced'">Advanced mode (custom expression)</a>
          <a (click)="mode = 'smart'">Use AI to describe what you want</a>
        </div>
      </div>

      <!-- Smart Mode (AI) - Per-expression prompt -->
      <div class="setup-mode-smart" *ngIf="mode === 'smart'">
        <h3>Describe What You Want</h3>
        <p>Tell us in plain English what calculation you need:</p>

        <kendo-textarea
          [(ngModel)]="smartPrompt"
          [rows]="3"
          placeholder="Example: Total revenue after discounts">
        </kendo-textarea>

        <div class="field-row">
          <label>Display As</label>
          <kendo-buttongroup selection="single" [(value)]="displayType">
            <button kendoButton [value]="'column'" title="Show under column">
              <i class="fa-solid fa-table-columns"></i> Under Column
            </button>
            <button kendoButton [value]="'card'" title="Show in summary card">
              <i class="fa-solid fa-id-card"></i> Summary Card
            </button>
          </kendo-buttongroup>
        </div>

        <button kendoButton (click)="generateFromPrompt()" [disabled]="!smartPrompt || generating">
          <i class="fa-solid fa-wand-magic-sparkles"></i>
          {{ generating ? 'Generating...' : 'Generate Preview' }}
        </button>

        <div *ngIf="generatedExpression" class="generated-preview">
          <h4>Generated:</h4>
          <div class="generated-item">
            <span class="label">{{ generatedLabel || smartPrompt }}</span>
            <code>{{ generatedExpression }}</code>
          </div>
          <small class="hint">
            The prompt is saved with the aggregate. You can edit it later to regenerate.
          </small>
        </div>

        <div class="mode-switch">
          <a (click)="mode = 'simple'">Back to simple mode</a>
        </div>
      </div>

      <!-- Advanced Mode -->
      <div class="setup-mode-advanced" *ngIf="mode === 'advanced'">
        <h3>Custom Expression</h3>

        <div class="field-row">
          <label>SQL Expression</label>
          <kendo-textarea
            [(ngModel)]="customExpression"
            [rows]="3"
            placeholder="SUM(Quantity * Price * (1 - Discount/100))">
          </kendo-textarea>
          <small>Use SQL aggregate functions: SUM, AVG, COUNT, MIN, MAX, STDEV</small>
        </div>

        <div class="field-row">
          <label>Label</label>
          <kendo-textbox [(ngModel)]="customLabel" placeholder="Net Revenue"></kendo-textbox>
        </div>

        <!-- Format options, conditional styling, etc. -->

        <div class="mode-switch">
          <a (click)="mode = 'simple'">Back to simple mode</a>
        </div>
      </div>

      <kendo-dialog-actions>
        <button kendoButton (click)="onCancel()">Cancel</button>
        <button kendoButton [primary]="true" (click)="onAdd()">Add</button>
      </kendo-dialog-actions>
    </kendo-dialog>
  `
})
export class AggregateSetupDialogComponent {
  @Input() visible = false;
  @Input() entityInfo: EntityInfo;
  @Output() aggregateAdded = new EventEmitter<ViewGridAggregate>();
  @Output() closed = new EventEmitter<void>();

  mode: 'simple' | 'advanced' | 'smart' = 'simple';

  // Simple mode
  selectedField: EntityFieldInfo | null = null;
  selectedFunction: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX' = 'SUM';
  displayType: 'column' | 'card' = 'column';

  // Smart mode - per-expression prompt
  smartPrompt = '';
  generating = false;
  generatedExpression = '';
  generatedLabel = '';
  generatedFormat: AggregateValueFormat | null = null;

  // Advanced mode
  customExpression = '';
  customLabel = '';

  get numericFields(): EntityFieldInfo[] {
    return this.entityInfo?.Fields.filter(f =>
      f.TSType === 'number' || f.Type.includes('int') || f.Type.includes('decimal') || f.Type.includes('money')
    ) || [];
  }

  getPreviewExpression(): string {
    if (!this.selectedField) return '';
    if (this.selectedFunction === 'COUNT') return 'COUNT(*)';
    return `${this.selectedFunction}(${this.selectedField.Name})`;
  }

  async generateFromPrompt() {
    this.generating = true;
    try {
      // Call server to generate single expression from prompt
      const result = await this.aggregateService.generateSmartAggregate(
        this.smartPrompt,
        this.entityInfo
      );
      this.generatedExpression = result.expression;
      this.generatedLabel = result.suggestedLabel || '';
      this.generatedFormat = result.suggestedFormat || null;
    } finally {
      this.generating = false;
    }
  }

  onAdd() {
    let aggregate: ViewGridAggregate;

    switch (this.mode) {
      case 'simple':
        aggregate = {
          expression: this.getPreviewExpression(),
          displayType: this.displayType,
          column: this.displayType === 'column' ? this.selectedField?.Name : undefined,
          label: `${this.selectedFunction} of ${this.selectedField?.DisplayName || this.selectedField?.Name}`,
          format: { type: 'number', thousandsSeparator: true }
        };
        break;

      case 'smart':
        // Save smartPrompt with the aggregate for future regeneration
        aggregate = {
          expression: this.generatedExpression,
          smartPrompt: this.smartPrompt, // <-- Key: save prompt with expression
          displayType: this.displayType,
          label: this.generatedLabel || this.smartPrompt,
          format: this.generatedFormat || undefined
        };
        break;

      case 'advanced':
        aggregate = {
          expression: this.customExpression,
          displayType: this.displayType,
          label: this.customLabel || this.customExpression
        };
        break;
    }

    this.aggregateAdded.emit(aggregate);
    this.onCancel();
  }

  onCancel() {
    this.visible = false;
    this.resetForm();
    this.closed.emit();
  }

  private resetForm() {
    this.mode = 'simple';
    this.selectedField = null;
    this.selectedFunction = 'SUM';
    this.displayType = 'column';
    this.smartPrompt = '';
    this.generatedExpression = '';
    this.generatedLabel = '';
    this.generatedFormat = null;
    this.customExpression = '';
    this.customLabel = '';
  }
}
```

---

## Part 7: Implementation Phases

### Phase 1: SQL Validation Consolidation (Week 1 - Part A)
1. Create `SQLExpressionValidator` class in MJGlobal (no dependencies)
2. Consolidate `DANGEROUS_SQL_KEYWORDS` and `ALLOWED_SQL_FUNCTIONS`
3. Implement context-aware validation (where_clause, order_by, aggregate)
4. Refactor `SQLServerDataProvider.validateUserProvidedSQLClause` to use new utility
5. Update RunQuery filters to use new validator
6. Unit tests for all validation scenarios

### Phase 1: Core Foundation (Week 1 - Part B)
1. Add `Aggregates` to `RunViewParams`
2. Add `AggregateResults` to `RunViewResult`
3. Implement aggregate validation using `SQLExpressionValidator`
4. Implement parallel query execution in `SQLServerDataProvider`
5. Add GraphQL types and resolver changes
6. Unit tests for aggregate query generation

### Phase 2: Persistence Layer (Week 2)
1. Add `ViewGridAggregatesConfig` types to `UserViewEntity.ts`
2. Add `ViewGridAggregate` with `smartPrompt` field
3. Update `ViewGridState` class
4. Ensure backward compatibility (existing views without aggregates)
5. Integration tests

### Phase 3: Angular UI - Aggregates Display (Week 3)
1. Create `AggregatePanelComponent` for card display
2. Integrate pinned bottom/top row for column aggregates
3. Add aggregate panel to `EntityDataGridComponent`
4. Add display settings to view properties dialog
5. CSS styling and responsive design

### Phase 4: Angular UI - Setup Experience (Week 4)
1. Create `AggregateSetupDialogComponent`
2. Simple mode (column + function selection)
3. Advanced mode (custom expression)
4. Right-click column header → "Add aggregate"
5. Aggregate management in view properties

### Phase 5: Smart Aggregates (Week 5)
1. Implement `GenerateSmartAggregate` on server (single expression)
2. Implement `ProcessSmartAggregates` for batch processing
3. AI prompt template and response parsing
4. Integrate smart mode in setup dialog (per-expression prompt)
5. Cache generated expressions, regenerate only on prompt change
6. Error handling and validation

### Phase 6: Polish & Documentation (Week 6)
1. Performance optimization
2. Error states and loading indicators
3. Accessibility review
4. Documentation updates
5. End-to-end testing

---

## Part 8: SQL Examples

### Simple Aggregates
```sql
-- Main query (paginated)
SELECT TOP 100 [ID], [CustomerName], [OrderDate], [OrderTotal]
FROM [dbo].[vwOrders]
WHERE [Status] = 'Completed'
ORDER BY [OrderDate] DESC
OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY;

-- Aggregate query (parallel, full dataset)
SELECT
  SUM([OrderTotal]) AS [TotalRevenue],
  COUNT(*) AS [OrderCount],
  AVG([OrderTotal]) AS [AverageOrder],
  MAX([OrderDate]) AS [LatestOrder]
FROM [dbo].[vwOrders]
WHERE [Status] = 'Completed';
```

### Complex Formula
```sql
-- User wants: Net revenue after discounts
SELECT
  SUM([Quantity] * [Price] * (1 - ISNULL([Discount], 0) / 100.0)) AS [NetRevenue],
  COUNT(DISTINCT [CustomerID]) AS [UniqueCustomers],
  AVG([Quantity] * [Price]) AS [AvgLineValue]
FROM [dbo].[vwOrderLines]
WHERE [OrderDate] >= '2024-01-01';
```

---

## Part 9: Security Considerations - Unified SQL Validation

### Current State Analysis

MemberJunction has two separate SQL validation implementations that should be consolidated:

#### 1. SQLServerDataProvider.validateUserProvidedSQLClause()
**File**: `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts` (lines 2192-2228)

```typescript
// Basic pattern matching - strips string literals first
const forbiddenPatterns: RegExp[] = [
  /\binsert\b/, /\bupdate\b/, /\bdelete\b/, /\bexec\b/,
  /\bexecute\b/, /\bdrop\b/, /--/, /\/\*/, /\*\//,
  /\bunion\b/, /\bcast\b/, /\bxp_/, /;/,
];
```

#### 2. runQuerySQLFilterImplementations.ts
**File**: `packages/MJCore/src/generic/runQuerySQLFilterImplementations.ts`

More comprehensive with:
- `DANGEROUS_SQL_KEYWORDS` - extensive list (DDL, DML, DCL, transaction control, etc.)
- `ALLOWED_SQL_KEYWORDS` - whitelist of safe functions (COUNT, SUM, AVG, etc.)
- `sqlNoKeywordsExpression` filter function with detailed validation
- `RunQuerySQLFilterManager` singleton class

### Proposed Unified Approach

Create a single, reusable SQL validation utility in **MJGlobal** (lowest-level package, no dependencies) that all packages can use.

#### New File: `packages/MJGlobal/src/SQLExpressionValidator.ts`

```typescript
/**
 * @fileoverview Unified SQL Expression Validation
 *
 * Central utility for validating user-provided SQL expressions against injection attacks.
 * Used by RunView, aggregates, smart filters, and any other feature accepting SQL input.
 *
 * Located in MJGlobal (lowest-level package) so all packages can use it.
 *
 * @module @memberjunction/global/SQLExpressionValidator
 */

/**
 * Dangerous SQL keywords that are never allowed
 */
export const DANGEROUS_SQL_KEYWORDS = [
  // DDL (Data Definition Language)
  'DROP', 'CREATE', 'ALTER', 'TRUNCATE', 'RENAME',

  // DML (Data Manipulation Language)
  'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'REPLACE',

  // DCL (Data Control Language)
  'GRANT', 'REVOKE', 'DENY',

  // Execution and procedures
  'EXEC', 'EXECUTE', 'CALL', 'PROCEDURE', 'FUNCTION',

  // Transaction control
  'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',

  // Database/schema operations
  'USE', 'DATABASE', 'SCHEMA',

  // Control flow (dangerous in expressions)
  'IF', 'WHILE', 'LOOP', 'FOR', 'GOTO',

  // Union/set operations (injection vectors)
  'UNION', 'INTERSECT', 'EXCEPT',

  // Subquery keywords (when used maliciously)
  'EXISTS', 'ANY', 'ALL', 'SOME',

  // Comments (injection technique)
  '--', '/*', '*/',

  // File/external operations
  'BULK', 'OPENROWSET', 'OPENDATASOURCE', 'OPENQUERY',

  // Extended stored procedures
  'XP_', 'SP_',

  // Dynamic SQL
  'DYNAMIC', 'PREPARE', 'DEALLOCATE',

  // Time-based injection
  'WAITFOR', 'DELAY', 'SLEEP',

  // System operations
  'SHUTDOWN', 'RECONFIGURE'
] as const;

/**
 * Safe SQL functions allowed in expressions
 */
export const ALLOWED_SQL_FUNCTIONS = {
  // Aggregate functions
  aggregates: ['COUNT', 'COUNT_BIG', 'SUM', 'AVG', 'MIN', 'MAX', 'STDEV', 'STDEVP', 'VAR', 'VARP', 'STRING_AGG', 'CHECKSUM_AGG'],

  // Math functions
  math: ['ABS', 'CEILING', 'FLOOR', 'ROUND', 'POWER', 'SQRT', 'LOG', 'LOG10', 'EXP', 'SIGN', 'RAND'],

  // String functions (read-only)
  string: ['LEN', 'LENGTH', 'UPPER', 'LOWER', 'LTRIM', 'RTRIM', 'TRIM', 'LEFT', 'RIGHT', 'SUBSTRING', 'CHARINDEX', 'REPLACE', 'CONCAT', 'STUFF'],

  // Date functions
  date: ['DATEPART', 'DATEDIFF', 'DATEADD', 'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND', 'GETDATE', 'GETUTCDATE', 'SYSDATETIME', 'EOMONTH'],

  // Type conversion (safe subset)
  conversion: ['CAST', 'CONVERT', 'TRY_CAST', 'TRY_CONVERT', 'FORMAT'],

  // Null handling
  nullHandling: ['ISNULL', 'COALESCE', 'NULLIF', 'IIF'],

  // Case expressions
  conditional: ['CASE', 'WHEN', 'THEN', 'ELSE', 'END'],

  // Logical operators
  logical: ['AND', 'OR', 'NOT', 'IS', 'NULL', 'LIKE', 'BETWEEN', 'IN'],

  // Sort/order
  ordering: ['ASC', 'ASCENDING', 'DESC', 'DESCENDING', 'OVER', 'PARTITION', 'BY', 'ORDER']
} as const;

/**
 * Validation context - affects what's allowed
 */
export type SQLValidationContext =
  | 'where_clause'      // WHERE expressions (most permissive)
  | 'order_by'          // ORDER BY expressions
  | 'aggregate'         // Aggregate expressions (must include aggregate function)
  | 'field_reference';  // Simple field references only

/**
 * Validation result with detailed error information
 */
export interface SQLValidationResult {
  valid: boolean;
  error?: string;
  /** Specific keyword or pattern that triggered the error */
  trigger?: string;
  /** Suggested fix if available */
  suggestion?: string;
}

/**
 * Options for SQL expression validation
 */
export interface SQLValidationOptions {
  /** Validation context affects what's allowed */
  context: SQLValidationContext;

  /** Entity field names for validation (optional - enables field checking) */
  entityFields?: string[];

  /** Whether to require at least one aggregate function (for 'aggregate' context) */
  requireAggregate?: boolean;

  /** Whether to allow SELECT keyword (normally blocked) */
  allowSubqueries?: boolean;

  /** Custom allowed keywords to add */
  additionalAllowed?: string[];

  /** Custom blocked keywords to add */
  additionalBlocked?: string[];
}

/**
 * Central SQL expression validator
 */
export class SQLExpressionValidator {
  private static instance: SQLExpressionValidator;

  private constructor() {}

  public static get Instance(): SQLExpressionValidator {
    if (!this.instance) {
      this.instance = new SQLExpressionValidator();
    }
    return this.instance;
  }

  /**
   * Validate a SQL expression for injection and allowed patterns
   */
  public validate(expression: string, options: SQLValidationOptions): SQLValidationResult {
    if (!expression || typeof expression !== 'string') {
      return { valid: false, error: 'Expression cannot be empty' };
    }

    const trimmed = expression.trim();
    if (!trimmed) {
      return { valid: false, error: 'Expression cannot be empty' };
    }

    // Step 1: Remove string literals to avoid false positives
    const withoutStrings = this.removeStringLiterals(trimmed);

    // Step 2: Check for dangerous patterns
    const dangerCheck = this.checkDangerousPatterns(withoutStrings, options);
    if (!dangerCheck.valid) return dangerCheck;

    // Step 3: Validate function names are in allowlist
    const functionCheck = this.checkFunctionNames(withoutStrings, options);
    if (!functionCheck.valid) return functionCheck;

    // Step 4: Context-specific validation
    const contextCheck = this.checkContextRules(withoutStrings, options);
    if (!contextCheck.valid) return contextCheck;

    // Step 5: Optional field reference validation
    if (options.entityFields?.length) {
      const fieldCheck = this.checkFieldReferences(withoutStrings, options.entityFields);
      if (!fieldCheck.valid) return fieldCheck;
    }

    return { valid: true };
  }

  /**
   * Remove string literals to avoid false positives in keyword detection
   */
  private removeStringLiterals(expression: string): string {
    // Match both single and double quoted strings, handling escaped quotes
    const stringPattern = /(['"])(?:(?=(\\?))\2[\s\S])*?\1/g;
    return expression.replace(stringPattern, '');
  }

  /**
   * Check for dangerous SQL patterns
   */
  private checkDangerousPatterns(expression: string, options: SQLValidationOptions): SQLValidationResult {
    const upper = expression.toUpperCase();

    // Build blocked list
    const blocked = [...DANGEROUS_SQL_KEYWORDS];
    if (options.additionalBlocked) {
      blocked.push(...options.additionalBlocked);
    }

    // Add SELECT to blocked unless explicitly allowed
    if (!options.allowSubqueries && !blocked.includes('SELECT')) {
      blocked.push('SELECT');
    }

    for (const keyword of blocked) {
      // Use word boundaries to avoid false positives
      const pattern = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'i');
      if (pattern.test(upper)) {
        return {
          valid: false,
          error: `Dangerous SQL keyword detected: ${keyword}`,
          trigger: keyword,
          suggestion: keyword === 'SELECT' ? 'Subqueries are not allowed. Use a direct expression instead.' : undefined
        };
      }
    }

    // Check comment patterns
    if (upper.includes('--') || upper.includes('/*') || upper.includes('*/')) {
      return { valid: false, error: 'Comments are not allowed in SQL expressions', trigger: 'comment' };
    }

    // Check statement terminator
    if (expression.includes(';')) {
      return { valid: false, error: 'Semicolons are not allowed in SQL expressions', trigger: ';' };
    }

    return { valid: true };
  }

  /**
   * Check that function names are in the allowlist
   */
  private checkFunctionNames(expression: string, options: SQLValidationOptions): SQLValidationResult {
    // Extract function calls (word followed by opening paren)
    const functionPattern = /\b([A-Z_][A-Z0-9_]*)\s*\(/gi;
    let match;

    // Build allowed functions list
    const allowed = new Set<string>();
    Object.values(ALLOWED_SQL_FUNCTIONS).flat().forEach(fn => allowed.add(fn.toUpperCase()));
    if (options.additionalAllowed) {
      options.additionalAllowed.forEach(fn => allowed.add(fn.toUpperCase()));
    }

    while ((match = functionPattern.exec(expression)) !== null) {
      const fnName = match[1].toUpperCase();
      if (!allowed.has(fnName)) {
        return {
          valid: false,
          error: `Function '${fnName}' is not allowed`,
          trigger: fnName,
          suggestion: `Allowed functions: ${Array.from(allowed).slice(0, 10).join(', ')}...`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Context-specific validation rules
   */
  private checkContextRules(expression: string, options: SQLValidationOptions): SQLValidationResult {
    if (options.context === 'aggregate' && options.requireAggregate !== false) {
      // Ensure at least one aggregate function is present
      const hasAggregate = ALLOWED_SQL_FUNCTIONS.aggregates.some(fn => {
        const pattern = new RegExp(`\\b${fn}\\s*\\(`, 'i');
        return pattern.test(expression);
      });

      if (!hasAggregate) {
        return {
          valid: false,
          error: 'Aggregate expression must contain at least one aggregate function',
          suggestion: `Use one of: ${ALLOWED_SQL_FUNCTIONS.aggregates.join(', ')}`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Validate field references exist in entity
   */
  private checkFieldReferences(expression: string, entityFields: string[]): SQLValidationResult {
    // Extract potential field names (words not followed by parentheses)
    const fieldPattern = /\b([A-Z_][A-Z0-9_]*)\b(?!\s*\()/gi;
    const fieldSet = new Set(entityFields.map(f => f.toUpperCase()));

    // Build set of all allowed keywords (not just functions)
    const allAllowed = new Set<string>();
    Object.values(ALLOWED_SQL_FUNCTIONS).flat().forEach(k => allAllowed.add(k.toUpperCase()));

    let match;
    const unknownFields: string[] = [];

    while ((match = fieldPattern.exec(expression)) !== null) {
      const word = match[1].toUpperCase();
      // Skip if it's an allowed keyword or a known field
      if (!allAllowed.has(word) && !fieldSet.has(word)) {
        unknownFields.push(match[1]);
      }
    }

    // Note: We return valid=true even with unknown fields (lenient mode)
    // Computed columns and virtual fields may not be in the fields array
    // Could add a strict option if needed

    return { valid: true };
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
```

### Integration with SQLServerDataProvider

Refactor `validateUserProvidedSQLClause` to use the new utility:

```typescript
// In SQLServerDataProvider.ts

import { SQLExpressionValidator } from '@memberjunction/global';

protected validateUserProvidedSQLClause(clause: string, context: SQLValidationContext = 'where_clause'): boolean {
  return SQLExpressionValidator.Instance.validate(clause, { context }).valid;
}
```

### Integration with Aggregates

The aggregate validation uses the same utility with `context: 'aggregate'`:

```typescript
import { SQLExpressionValidator } from '@memberjunction/global';

// Validate aggregate expression
const result = SQLExpressionValidator.Instance.validate(expression, {
  context: 'aggregate',
  requireAggregate: true,
  entityFields: entity.Fields.map(f => f.Name)
});

if (!result.valid) {
  throw new Error(`Invalid aggregate: ${result.error}`);
}
```

### Permission Model
- Aggregates use **same permission check** as row data
- If user can't see the rows, they can't see aggregates
- RLS filters apply to aggregate calculations

---

## Part 10: Open Questions

1. **Caching**: Should aggregate results be cached separately? They're more stable than row data during scrolling.

2. **Real-time updates**: When grid data changes (edit/delete), should aggregates auto-refresh?

3. **Selected rows**: Support "aggregate selected rows only"? This would require client-side calculation.

4. **Export**: Include aggregates in Excel/CSV exports? As footer row?

5. **Performance threshold**: For very complex aggregates or huge datasets, should we have a timeout or sampling option?

6. **SQL Validation strictness**: Should `SQLExpressionValidator` be lenient (warn on unknown fields) or strict (reject unknown fields)? Lenient allows computed columns not in metadata; strict catches typos.

7. **Smart prompt regeneration**: When should we regenerate an expression from its `smartPrompt`?
   - Option A: Only when expression is empty (user must clear to regenerate)
   - Option B: When prompt text changes (hash comparison)
   - Option C: Explicit "Regenerate" button in UI

---

## Appendix: Type Summary

```typescript
// Core Layer
interface AggregateExpression { expression: string; alias?: string; }
type AggregateValue = number | string | Date | boolean | null;
interface AggregateResult { expression: string; alias: string; value: AggregateValue; error?: string; }

// RunView
class RunViewParams { Aggregates?: AggregateExpression[]; }
type RunViewResult { AggregateResults?: AggregateResult[]; AggregateExecutionTime?: number; }

// GridState Persistence
interface ViewGridAggregate {
  id?; expression; smartPrompt?; displayType; column?;
  label; description?; format?; icon?; conditionalStyles?; enabled?; order?;
}
interface ViewGridAggregateDisplay { showColumnAggregates?; columnPosition?; showCardAggregates?; cardPosition?; cardPanelWidth?; cardLayout?; ... }
interface ViewGridAggregatesConfig { display?; expressions?: ViewGridAggregate[]; }
class ViewGridState { aggregates?: ViewGridAggregatesConfig; }

// SQL Validation (NEW - unified, in MJGlobal)
interface SQLValidationResult { valid: boolean; error?; trigger?; suggestion?; }
interface SQLValidationOptions { context: SQLValidationContext; entityFields?; requireAggregate?; ... }
type SQLValidationContext = 'where_clause' | 'order_by' | 'aggregate' | 'field_reference';
class SQLExpressionValidator { static Instance; validate(expr, opts): SQLValidationResult; }
```
