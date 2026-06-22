/**
 * @fileoverview Pure mapping from a host-supplied {@link EntityActionUXContext} to the engine/transport
 * {@link RecordProcessScope}. Extracted so it's unit-testable without instantiating a component.
 * @module @memberjunction/ng-entity-action-ux
 */
import type { RecordProcessScopeOverride } from '@memberjunction/record-set-processor-base';
import type { EntityActionUXContext } from './runtime-ux-context';

/** Builds the run scope from the grid/list context the host assembled. */
export function buildRecordProcessScope(context: EntityActionUXContext): RecordProcessScopeOverride {
    switch (context.ScopeKind) {
        case 'view':
            return { Kind: 'view', ViewID: context.ViewID ?? '' };
        case 'list':
            return { Kind: 'list', ListID: context.ListID ?? '' };
        case 'filter':
            return { Kind: 'filter', Filter: context.Filter };
        case 'records':
        default:
            return { Kind: 'records', RecordIDs: context.SelectedRecordIDs ?? [] };
    }
}

/** Renders an arbitrary value for the diff/preview table. */
export function displayValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '(empty)';
    if (value instanceof Date) return value.toLocaleString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}
