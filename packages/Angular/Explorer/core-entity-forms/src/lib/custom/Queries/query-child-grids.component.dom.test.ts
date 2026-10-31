import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import type { MJQueryFieldEntity, MJQueryParameterEntity } from '@memberjunction/core-entities';
import { QueryFieldsGridComponent } from './query-fields-grid.component';
import { QueryParametersGridComponent } from './query-parameters-grid.component';

/**
 * DOM coverage for the query form's field and parameter grids: facts (name, order, type,
 * nullability, source, detection method; a parameter's existence) are shown read-only, annotations
 * are inputs in edit mode, a source that maps to an entity field is a link, and removing a row is
 * an event the form turns into a collection removal.
 */

type FieldShape = Pick<MJQueryFieldEntity, 'ID' | 'IsSaved' | 'Name' | 'Sequence' | 'SQLBaseType' | 'SQLFullType' | 'IsNullable' | 'IsComputed' | 'IsSummary'
    | 'Description' | 'ComputationDescription' | 'SummaryDescription' | 'DetectionMethod' | 'SourceEntityFieldID' | 'SourceEntity' | 'SourceFieldName' | 'SourceEntityField' | 'SourceObjectName'>;
const field = (over: Partial<FieldShape> = {}): MJQueryFieldEntity => {
    const shape: FieldShape = {
        ID: 'f-1', IsSaved: true, Name: 'Email', Sequence: 1, SQLBaseType: 'nvarchar', SQLFullType: 'nvarchar(100)', IsNullable: true,
        IsComputed: false, IsSummary: false, Description: 'The user\'s email.', ComputationDescription: null, SummaryDescription: null,
        DetectionMethod: 'Database', SourceEntityFieldID: 'ef-1', SourceEntity: 'MJ: Users', SourceFieldName: 'Email', SourceEntityField: 'Email', SourceObjectName: null,
        ...over,
    };
    return shape as MJQueryFieldEntity;
};

type ParamShape = Pick<MJQueryParameterEntity, 'ID' | 'IsSaved' | 'Name' | 'Type' | 'IsRequired' | 'DefaultValue' | 'SampleValue' | 'IsServerSet' | 'Description' | 'DetectionMethod'>;
const param = (over: Partial<ParamShape> = {}): MJQueryParameterEntity => {
    const shape: ParamShape = {
        ID: 'p-1', IsSaved: true, Name: 'Region', Type: 'string', IsRequired: true, DefaultValue: null, SampleValue: 'West',
        IsServerSet: false, Description: 'Sales region', DetectionMethod: 'Parser', ...over,
    };
    return shape as MJQueryParameterEntity;
};

const cellsOf = (row: Element): string[] => Array.from(row.querySelectorAll('td')).map(td => (td.textContent ?? '').trim());

describe('QueryFieldsGridComponent (DOM)', () => {
    const render = (inputs: Record<string, unknown>) => renderComponentFixture(QueryFieldsGridComponent, { inputs });

    it('shows the facts of each field: order, name, type, nullability, source and detection method', () => {
        const f = render({ Fields: [field(), field({ ID: 'f-2', Sequence: 2, Name: 'Total', SQLFullType: 'money', IsNullable: null, IsComputed: true,
            SourceEntityFieldID: null, SourceEntity: null, SourceFieldName: null, Description: null })] });
        const rows = queryAll(f, 'tr.qcg-row');
        expect(cellsOf(rows[0]).slice(0, 6)).toEqual(['1', 'Email', 'nvarchar(100)', 'Yes', 'MJ: Users.Email', 'Database']);
        expect(cellsOf(rows[1])[1]).toContain('computed');
        expect(cellsOf(rows[1])[3]).toBe('—');
    });

    it('links a column that maps to an entity field, and emits that field\'s ID', () => {
        const f = render({ Fields: [field()] });
        const opened = capture(f.componentInstance.OpenSourceField);
        (query(f, '.qcg-link') as HTMLButtonElement).click();
        expect(opened).toEqual(['ef-1']);
    });

    it('shows the server-reported object for a column no entity reads', () => {
        const f = render({ Fields: [field({ SourceEntityFieldID: null, SourceEntity: null, SourceObjectName: '__mj.flyway_schema_history.version' })] });
        expect(query(f, '.qcg-link')).toBeNull();
        expect(query(f, '.qcg-object')?.textContent).toBe('__mj.flyway_schema_history.version');
    });

    it('in edit mode makes only the annotations editable on a stored field', () => {
        const f = render({ Fields: [field()], EditMode: true });
        const row = queryAll(f, 'tr.qcg-row')[0];
        expect(row.querySelector('input.qcg-input'), 'the name of a stored field is a fact').toBeNull();
        expect(row.querySelectorAll('textarea').length).toBe(1);
        expect(row.querySelector('input[type="checkbox"]')).not.toBeNull();
        expect(cellsOf(row)[2]).toBe('nvarchar(100)');
    });

    it('lets a new field declare its name, and emits Remove for a row', () => {
        const fresh = field({ ID: '', IsSaved: false, Name: 'field2' });
        const f = render({ Fields: [fresh], EditMode: true });
        expect(query(f, 'input.qcg-input')).not.toBeNull();
        const removed = capture(f.componentInstance.Remove);
        (query(f, '.qcg-actions button') as HTMLButtonElement).click();
        expect(removed).toEqual([fresh]);
    });

    it('reports an annotation edit', async () => {
        const row = field();
        const f = render({ Fields: [row], EditMode: true });
        const changed = capture(f.componentInstance.Changed);
        const box = query(f, 'textarea') as HTMLTextAreaElement;
        box.value = 'Primary contact email';
        box.dispatchEvent(new Event('input'));
        await f.whenStable();
        expect(row.Description).toBe('Primary contact email');
        expect(changed.length).toBeGreaterThan(0);
    });
});

describe('QueryParametersGridComponent (DOM)', () => {
    const render = (inputs: Record<string, unknown>) => renderComponentFixture(QueryParametersGridComponent, { inputs });

    it('shows each parameter read-only outside edit mode', () => {
        const f = render({ Parameters: [param()] });
        expect(cellsOf(queryAll(f, 'tr.qcg-row')[0])).toEqual(['Region', 'string', 'Yes', '—', 'West', 'No', 'Parser', 'Sales region']);
        expect(query(f, 'input, select, textarea')).toBeNull();
    });

    it('in edit mode keeps a stored parameter\'s name read-only and its annotations editable', () => {
        const f = render({ Parameters: [param()], EditMode: true });
        const row = queryAll(f, 'tr.qcg-row')[0];
        expect(row.querySelector('td.qcg-name input'), 'which parameters exist is a fact of the SQL').toBeNull();
        expect(row.querySelector('select')).not.toBeNull();
        expect(row.querySelectorAll('input[type="checkbox"]').length).toBe(2);
        expect(row.querySelector('textarea')).not.toBeNull();
    });

    it('lets a new parameter declare its name', () => {
        const f = render({ Parameters: [param({ ID: '', IsSaved: false, Name: 'param1' })], EditMode: true });
        expect(query(f, 'td.qcg-name input')).not.toBeNull();
    });

    it('emits Remove for a row', () => {
        const p = param();
        const f = render({ Parameters: [p], EditMode: true });
        const removed = capture(f.componentInstance.Remove);
        (query(f, '.qcg-actions button') as HTMLButtonElement).click();
        expect(removed).toEqual([p]);
    });
});
