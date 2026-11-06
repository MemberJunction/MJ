import { describe, it, expect } from 'vitest';
import { BaseEntity, CompositeKey, EntityFieldInfo, EntityInfo, UserInfo } from '@memberjunction/core';
import { GenericDatabaseProvider } from '../GenericDatabaseProvider';

type KeyLiterals = {
    RenderPrimaryKeyLiteral(field: EntityFieldInfo | undefined, value: unknown, entityName: string): string;
    BuildPrimaryKeyWhereClause(entityInfo: EntityInfo, compositeKey: CompositeKey): string;
    QuoteIdentifier(name: string): string;
};

const numericKey = { Name: 'ID', CodeName: 'ID', NeedsQuotes: false } as EntityFieldInfo;
const textKey = { Name: 'Code', CodeName: 'Code', NeedsQuotes: true } as EntityFieldInfo;

/** The two methods under test, on a stand-in with the one dialect call they make. */
const literals = Object.create(GenericDatabaseProvider.prototype) as KeyLiterals;
literals.QuoteIdentifier = (name: string) => `[${name}]`;

function whereFor(field: EntityFieldInfo, value: unknown): string {
    const entityInfo = { Name: 'Widgets', PrimaryKeys: [field] } as EntityInfo;
    const key = { KeyValuePairs: [{ FieldName: field.Name, Value: value }] } as CompositeKey;
    return literals.BuildPrimaryKeyWhereClause(entityInfo, key);
}

describe('GenericDatabaseProvider primary key literals', () => {
    it.each([
        [5, '5'],
        ['42', '42'],
        [-3, '-3'],
        ['1.5', '1.5'],
    ])('renders the numeric key %s as a plain number', (value, expected) => {
        expect(literals.RenderPrimaryKeyLiteral(numericKey, value, 'Widgets')).toBe(expected);
    });

    it.each([['abc'], ['1 OR 1'], ['1;2'], ['1--'], [''], ['NaN'], [null], [undefined], [{ a: 1 }]])(
        'refuses %s for a numeric key',
        (value) => {
            expect(() => literals.RenderPrimaryKeyLiteral(numericKey, value, 'Widgets')).toThrow(
                'Invalid non-numeric value provided for numeric key field ID on entity Widgets'
            );
        }
    );

    it('treats a key with no field metadata as numeric, so it cannot pass unchecked', () => {
        expect(() => literals.RenderPrimaryKeyLiteral(undefined, 'abc', 'Widgets')).toThrow('Invalid non-numeric value');
    });

    it('quotes a text key and escapes embedded quotes', () => {
        expect(literals.RenderPrimaryKeyLiteral(textKey, "O'Brien", 'Widgets')).toBe("'O''Brien'");
    });

    it('builds the WHERE predicate through the same check', () => {
        expect(whereFor(numericKey, 7)).toBe('[ID]=7');
        expect(whereFor(textKey, "a'b")).toBe("[Code]='a''b'");
        expect(() => whereFor(numericKey, 'abc')).toThrow('Invalid non-numeric value');
    });
});

describe('GenericDatabaseProvider Load key', () => {
    type Loader = {
        Load(entity: BaseEntity, key: CompositeKey, relationships: string[] | null, user: UserInfo | null): Promise<Record<string, unknown> | null>;
        QuoteIdentifier(name: string): string;
        QuoteSchemaAndView(schema: string, view: string): string;
        ExecuteSQL(sql: string): Promise<Record<string, unknown>[]>;
    };

    /** Loads through a stand-in provider and returns the SQL it ran. */
    async function load(value: unknown): Promise<string[]> {
        const statements: string[] = [];
        const loader = Object.create(GenericDatabaseProvider.prototype) as Loader;
        loader.QuoteIdentifier = (name: string) => `[${name}]`;
        loader.QuoteSchemaAndView = (schema: string, view: string) => `[${schema}].[${view}]`;
        loader.ExecuteSQL = async (sql: string) => {
            statements.push(sql);
            return [];
        };
        Object.assign(loader, { PostProcessRows: async () => [] });
        const entity = { EntityInfo: { Name: 'Widgets', SchemaName: 'dbo', BaseView: 'vwWidgets', PrimaryKeys: [numericKey] } } as unknown as BaseEntity;
        const key = { KeyValuePairs: [{ FieldName: 'ID', Value: value }] } as CompositeKey;
        await loader.Load(entity, key, null, null);
        return statements;
    }

    it('selects by a numeric key', async () => {
        expect(await load(5)).toEqual(['SELECT * FROM [dbo].[vwWidgets] WHERE [ID]=5']);
    });

    it('refuses a non-numeric value before any SQL runs', async () => {
        await expect(load('5 x')).rejects.toThrow('Invalid non-numeric value provided for numeric key field ID on entity Widgets');
    });
});
