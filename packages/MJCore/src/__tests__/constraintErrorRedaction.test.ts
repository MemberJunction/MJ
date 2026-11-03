/**
 * Constraint errors returned to a caller must not carry the value of a column field-level
 * security withholds from them. A duplicate-key error on a unique index lists every value in
 * the index, so a caller denied one of those columns would read its stored value in the error.
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo } from '../generic/entityInfo';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';
import {
    RedactConstraintValues,
    REDACTED_CONSTRAINT_VALUES,
    SaveErrorMessageForUser,
    StripExecutedSQL,
} from '../generic/constraintErrorRedaction';

const HR_ROLE = 'A0000000-0000-0000-0000-000000000001';
const STAFF_ROLE = 'A0000000-0000-0000-0000-000000000002';

describe('RedactConstraintValues', () => {
    it('removes the SQL Server unique key value list and keeps the constraint name', () => {
        const msg = "Violation of UNIQUE KEY constraint 'UQ_Employee_Email_Salary'. Cannot insert duplicate key in object 'dbo.Employee'. The duplicate key value is (a@example.com, 90000).";
        const out = RedactConstraintValues(msg);
        expect(out).toContain('UQ_Employee_Email_Salary');
        expect(out).toContain(`The duplicate key value is ${REDACTED_CONSTRAINT_VALUES}`);
        expect(out).not.toContain('90000');
        expect(out).not.toContain('a@example.com');
    });

    it('removes the SQL Server unique index value list, including values with parentheses', () => {
        const msg = "Cannot insert duplicate key row in object 'dbo.Employee' with unique index 'IX_Employee_Code'. The duplicate key value is (A (1), secret).";
        const out = RedactConstraintValues(msg);
        expect(out).toContain('IX_Employee_Code');
        expect(out).not.toContain('secret');
        expect(out).not.toContain('A (1)');
    });

    it('removes the SQL Server truncated value', () => {
        const msg = "String or binary data would be truncated in table 'db.dbo.Employee', column 'Notes'. Truncated value: 'confidential'.";
        const out = RedactConstraintValues(msg);
        expect(out).toContain("column 'Notes'");
        expect(out).not.toContain('confidential');
    });

    it('removes PostgreSQL duplicate-key values and keeps the column names', () => {
        const msg = 'duplicate key value violates unique constraint "uq_employee_email_salary"\nKey ("Email", "Salary")=(a@example.com, 90000) already exists.';
        const out = RedactConstraintValues(msg);
        expect(out).toContain('uq_employee_email_salary');
        expect(out).toContain(`Key ("Email", "Salary")=${REDACTED_CONSTRAINT_VALUES} already exists.`);
        expect(out).not.toContain('90000');
    });

    it('removes PostgreSQL foreign-key detail values', () => {
        const msg = 'insert or update on table "employee" violates foreign key constraint "fk_dept"\nKey ("DepartmentID")=(42) is not present in table "department".';
        const out = RedactConstraintValues(msg);
        expect(out).toContain('fk_dept');
        expect(out).not.toContain('(42)');
    });

    it('removes the PostgreSQL failing row of a check constraint', () => {
        const msg = 'new row for relation "employee" violates check constraint "ck_salary"\nFailing row contains (1, a@example.com, 90000).';
        const out = RedactConstraintValues(msg);
        expect(out).toContain('ck_salary');
        expect(out).toContain(`Failing row contains ${REDACTED_CONSTRAINT_VALUES}`);
        expect(out).not.toContain('90000');
    });

    it('leaves a SQL Server check-constraint message, which carries no values, unchanged', () => {
        const msg = 'The INSERT statement conflicted with the CHECK constraint "CK_Salary". The conflict occurred in database "db", table "dbo.Employee", column \'Salary\'.';
        expect(RedactConstraintValues(msg)).toBe(msg);
    });

    it('leaves an empty message alone', () => {
        expect(RedactConstraintValues('')).toBe('');
    });
});

function employees(enableFieldLevelSecurity = true): EntityInfo {
    const field = (name: string, i: number, staffRead: 'Allow' | 'Deny') => ({
        ID: `F-${name}`, EntityID: 'E-Emp', Sequence: i, Name: name, Entity: 'Employees', Type: 'nvarchar',
        IsPrimaryKey: name === 'ID',
        EntityFieldPermissions: [
            { ID: `P-${name}-hr`, EntityFieldID: `F-${name}`, RoleID: HR_ROLE, ReadAccess: 'Allow', UpdateAccess: 'Allow', CreateAccess: 'Allow' },
            { ID: `P-${name}-staff`, EntityFieldID: `F-${name}`, RoleID: STAFF_ROLE, ReadAccess: staffRead, UpdateAccess: 'No Access', CreateAccess: 'No Access' },
        ],
    });
    return new EntityInfo({
        ID: 'E-Emp', Name: 'Employees', SchemaName: 'dbo', BaseTable: 'Employee', BaseView: 'vwEmployees',
        EnableFieldLevelSecurity: enableFieldLevelSecurity, Permissions: [],
        Fields: [field('ID', 1, 'Allow'), field('Email', 2, 'Allow'), field('Salary', 3, 'Deny')],
    });
}

function user(roleID: string): UserInfo {
    const u = new UserInfo();
    u.ID = `U-${roleID}`;
    u.Name = 'Test User';
    u.IsActive = true;
    (u as unknown as Record<string, unknown>)['_UserRoles'] = [new UserRoleInfo({ UserID: u.ID, RoleID: roleID, Role: 'R' })];
    return u;
}

describe('StripExecutedSQL', () => {
    it('cuts the message at the Query line', () => {
        expect(StripExecutedSQL('Error executing SQL\n    Error: boom\n    Query: SELECT 1\n    Parameters: None')).toBe('Error executing SQL\n    Error: boom');
    });

    it('leaves a message without SQL unchanged', () => {
        expect(StripExecutedSQL('boom')).toBe('boom');
    });
});

describe('SaveErrorMessageForUser', () => {
    const msg = "Violation of UNIQUE KEY constraint 'UQ_x'. The duplicate key value is (a@example.com, 90000).";

    it('redacts for a caller denied a column of the entity', () => {
        expect(SaveErrorMessageForUser(msg, employees(), user(STAFF_ROLE))).not.toContain('90000');
    });

    it('keeps the full message for a caller with no denials', () => {
        expect(SaveErrorMessageForUser(msg, employees(), user(HR_ROLE))).toBe(msg);
    });

    it('keeps the full message when field-level security is off for the entity', () => {
        expect(SaveErrorMessageForUser(msg, employees(false), user(STAFF_ROLE))).toBe(msg);
    });

    it('drops the executed SQL, which can carry stored values, for a caller denied a column', () => {
        const withSQL = `Error executing SQL\n    Error: ${msg}\n    Query: EXEC spUpdate @FullRecordJSON=N'{"Salary":90000}'\n    Parameters: None`;
        const out = SaveErrorMessageForUser(withSQL, employees(), user(STAFF_ROLE));
        expect(out).toContain('UQ_x');
        expect(out).not.toContain('Query:');
        expect(out).not.toContain('90000');
        expect(SaveErrorMessageForUser(withSQL, employees(), user(HR_ROLE))).toBe(withSQL);
    });

    it('redacts when there is no user to check against', () => {
        expect(SaveErrorMessageForUser(msg, employees(), undefined)).not.toContain('90000');
    });
});
