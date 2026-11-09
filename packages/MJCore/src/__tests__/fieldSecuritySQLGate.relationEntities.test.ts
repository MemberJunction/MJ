import { describe, it, expect } from 'vitest';
import { EntityInfo } from '../generic/entityInfo';
import { FieldSecuritySQLGate } from '../generic/fieldSecuritySQLGate';

/**
 * `RelationEntities` lists the entities a statement reads as relations, so a saved query is
 * checked against what its SQL reads rather than its declared entity rows.
 */
function entity(id: string, name: string, table: string, view: string): EntityInfo {
    return new EntityInfo({ ID: id, Name: name, SchemaName: '__mj', BaseTable: table, BaseView: view, Fields: [] });
}

const people = entity('E1', 'People', 'Person', 'vwPeople');
const payroll = entity('E2', 'Payroll', 'Payroll', 'vwPayroll');
const projects = entity('E3', 'Projects', 'Project', 'vwProjects');
const catalog = [people, payroll, projects];

function names(sql: string): string[] | null {
    return FieldSecuritySQLGate.RelationEntities(sql, catalog, 'sqlserver')?.map(e => e.Name).sort() ?? null;
}

describe('FieldSecuritySQLGate.RelationEntities', () => {
    it('finds views and base tables after FROM, JOIN, APPLY and in a FROM list, qualified or not', () => {
        expect(names('SELECT 1 FROM [__mj].[vwPeople] p JOIN __mj.Payroll y ON y.ID = p.ID')).toEqual(['Payroll', 'People']);
        expect(names('SELECT 1 FROM vwPeople p, vwProjects j')).toEqual(['People', 'Projects']);
        expect(names('SELECT 1 FROM vwPeople p CROSS APPLY (SELECT TOP 1 ID FROM vwPayroll) x')).toEqual(['Payroll', 'People']);
    });

    it('finds a relation inside a subquery or a CTE body', () => {
        expect(names('WITH x AS (SELECT ID FROM vwPayroll) SELECT ID FROM vwProjects WHERE ID IN (SELECT ID FROM x)')).toEqual(['Payroll', 'Projects']);
    });

    it('ignores a name used as a column, in a literal or in a comment', () => {
        expect(names("SELECT p.Payroll, 'FROM vwPayroll' AS s FROM vwPeople p /* JOIN vwProjects */")).toEqual(['People']);
    });

    it('finds the relations of a parenthesized join', () => {
        expect(names('SELECT y.Amount FROM (__mj.vwPayroll y CROSS JOIN __mj.vwProjects q)')).toEqual(['Payroll', 'Projects']);
        expect(names('SELECT 1 FROM ((vwPayroll y JOIN vwPeople p ON p.ID = y.ID) CROSS JOIN vwProjects q)')).toEqual(['Payroll', 'People', 'Projects']);
        expect(names('SELECT 1 FROM vwPeople p, (vwPayroll y CROSS JOIN vwProjects q)')).toEqual(['Payroll', 'People', 'Projects']);
        expect(names('SELECT 1 FROM (vwPayroll y, vwProjects q)')).toEqual(['Payroll', 'Projects']);
    });

    it('finds a PostgreSQL FROM ONLY relation', () => {
        expect(FieldSecuritySQLGate.RelationEntities('SELECT y."Amount" FROM ONLY __mj."vwPayroll" y', catalog, 'postgresql')?.map(e => e.Name)).toEqual(['Payroll']);
    });

    it('returns null for text it cannot read', () => {
        expect(names("SELECT 'unterminated FROM vwPeople")).toBeNull();
    });
});
