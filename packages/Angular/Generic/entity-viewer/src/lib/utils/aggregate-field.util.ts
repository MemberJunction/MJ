import type { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import type { MJUserViewEntity_IGridAggregate as ViewGridAggregate } from '@memberjunction/core-entities';

/**
 * The one column an aggregate summarises, or null when it summarises anything more complex.
 *
 * An aggregate carries an expression and a value, never field metadata, so the column has to be
 * read out of the expression: `MIN(IntakeDate)` and `MAX([Intake Date])` name one column, while
 * `COUNT(*)`, `SUM(Amount) + 1` and `MIN(YEAR(IntakeDate))` do not. When the expression gives
 * nothing, the column the aggregate is pinned under is the fallback.
 *
 * Parsed positionally rather than with a pattern: a regular expression over user-authored text is
 * where backtracking blow-ups live (CodeQL js/polynomial-redos).
 */
export function AggregateFieldName(agg: Pick<ViewGridAggregate, 'expression' | 'column'>): string | null {
    return singleFieldOfExpression(agg.expression) ?? agg.column ?? null;
}

/**
 * The entity field an aggregate summarises, or null when it cannot be resolved. Resolving the
 * field is what lets a display path tell a `date` column (a calendar day) from a timestamp (an
 * instant) and render each in the right zone.
 */
export function AggregateField(agg: Pick<ViewGridAggregate, 'expression' | 'column'>, entity: EntityInfo | null | undefined): EntityFieldInfo | null {
    const name = AggregateFieldName(agg);
    if (!name || !entity) return null;
    return entity.Fields.find(f => f.Name === name) ?? null;
}

function singleFieldOfExpression(expression: string | undefined): string | null {
    const text = (expression ?? '').trim();
    const open = text.indexOf('(');
    if (open <= 0 || !text.endsWith(')') || text.indexOf(')') !== text.length - 1) return null;
    if (!/^\w+$/.test(text.substring(0, open).trim())) return null;
    let inner = text.substring(open + 1, text.length - 1).trim();
    if (inner.startsWith('[') && inner.endsWith(']')) inner = inner.substring(1, inner.length - 1).trim();
    if (inner.length === 0 || inner === '*' || inner.includes('(') || inner.includes(',')) return null;
    return inner;
}
