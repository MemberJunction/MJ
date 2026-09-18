/**
 * Field-Level Security — DB-tier emission (SQL Server).
 *
 * Covers three behaviors of the permission emitters:
 *   - column-level DENY emission: explicit `ReadAccess='Deny'` rows only, on entities with
 *     `EnableFieldLevelSecurity`, custom roles only (RoleSQLNameByID excludes standard roles),
 *     service-login backstop skips poisoned roles with a warning, unrestrictable targets
 *     filtered defensively.
 *   - catalog-driven wipe-and-reassert: every live managed-scope permission entry gets a
 *     REVOKE preamble (object- and column-level) so grant/deny REMOVAL propagates.
 *   - blank-SQLName roles log one app-tier-only INFO line per role per run.
 *
 * All emission logic is synchronous string building against a mocked
 * FieldSecurityRunContext — no database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { logStatusSpy, logWarningSpy } = vi.hoisted(() => ({
    logStatusSpy: vi.fn(),
    logWarningSpy: vi.fn(),
}));

vi.mock('../Misc/status_logging', () => ({
    logStatus: logStatusSpy,
    logWarning: logWarningSpy,
    logError: vi.fn(),
    logMessage: vi.fn(),
    startSpinner: vi.fn(),
    updateSpinner: vi.fn(),
    succeedSpinner: vi.fn(),
    failSpinner: vi.fn(),
}));

import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { FieldSecurityRunContext } from '../Database/codeGenDatabaseProvider';
import { EntityInfo } from '@memberjunction/core';

const CUSTOM_ROLE_ID = 'a0000000-0000-0000-0000-00000000000c';
const POISONED_ROLE_ID = 'a0000000-0000-0000-0000-00000000000d';
const STANDARD_ROLE_ID = 'a0000000-0000-0000-0000-00000000000e';

function employeeEntity(opts: {
    salaryPerms?: Record<string, unknown>[];
    bonusPerms?: Record<string, unknown>[];
    pkPerms?: Record<string, unknown>[];
    permissions?: Record<string, unknown>[];
    enableFieldLevelSecurity?: boolean;
} = {}): EntityInfo {
    return new EntityInfo({
        ID: 'entity-employees',
        Name: 'Employees',
        SchemaName: 'dbo',
        BaseTable: 'Employee',
        BaseView: 'vwEmployees',
        IncludeInAPI: true,
        EnableFieldLevelSecurity: opts.enableFieldLevelSecurity ?? true,
        Permissions: opts.permissions ?? [
            { EntityID: 'entity-employees', RoleID: CUSTOM_ROLE_ID, Role: 'Payroll Auditors', RoleSQLName: 'cdp_payroll', CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: false },
        ],
        Fields: [
            { ID: 'f-id', EntityID: 'entity-employees', Sequence: 1, Name: 'ID', Entity: 'Employees', Type: 'uniqueidentifier', IsPrimaryKey: true, EntityFieldPermissions: opts.pkPerms ?? [] },
            { ID: 'f-name', EntityID: 'entity-employees', Sequence: 2, Name: 'Name', Entity: 'Employees', Type: 'nvarchar' },
            { ID: 'f-salary', EntityID: 'entity-employees', Sequence: 3, Name: 'Salary', Entity: 'Employees', Type: 'money', EntityFieldPermissions: opts.salaryPerms ?? [] },
            { ID: 'f-bonus', EntityID: 'entity-employees', Sequence: 4, Name: 'Bonus', Entity: 'Employees', Type: 'money', EntityFieldPermissions: opts.bonusPerms ?? [] },
        ],
    });
}

/**
 * A row denying READ on `fieldId` for `roleId`. `readAccess` is parameterized so the tests can
 * express the two non-Deny states — `No Access` (neutral, and NOT mirrored to the DB tier) and
 * `Allow` — against the same shape.
 */
function denyRow(fieldId: string, roleId: string, readAccess: string = 'Deny'): Record<string, unknown> {
    return {
        ID: `p-${fieldId}-${roleId}`,
        EntityFieldID: fieldId,
        RoleID: roleId,
        ReadAccess: readAccess,
        UpdateAccess: readAccess === 'Allow' ? 'Allow' : 'Deny',
        CreateAccess: 'No Access',
    };
}

function makeContext(overrides: Partial<FieldSecurityRunContext> = {}): FieldSecurityRunContext {
    return {
        ServiceProtectedRoleSQLNames: new Set<string>(['cdp_poisoned']),
        CatalogPermissions: new Map(),
        RoleSQLNameByID: new Map([
            [CUSTOM_ROLE_ID, 'cdp_payroll'],
            [POISONED_ROLE_ID, 'cdp_poisoned'],
            // STANDARD_ROLE_ID deliberately absent — standard roles never enter the map
        ]),
        ...overrides,
    };
}

function makeProvider(context: FieldSecurityRunContext | null): SQLServerCodeGenProvider {
    const provider = new SQLServerCodeGenProvider();
    provider.SetFieldSecurityRunContext(context);
    return provider;
}

beforeEach(() => {
    logStatusSpy.mockClear();
    logWarningSpy.mockClear();
});

// ═══════════════════════════════════════════════════════════════════════════
// B1 — column-level DENY emission
// ═══════════════════════════════════════════════════════════════════════════

describe('generateViewPermissions — field-security DENY emission', () => {
    it('emits a column DENY for an explicit ReadAccess=Deny row targeting a custom role', () => {
        const provider = makeProvider(makeContext());
        const entity = employeeEntity({ salaryPerms: [denyRow('f-salary', CUSTOM_ROLE_ID)] });
        const sql = provider.generateViewPermissions(entity);
        expect(sql).toContain('DENY SELECT ([Salary]) ON [dbo].[vwEmployees] TO [cdp_payroll]');
        expect(sql).toContain('GRANT SELECT ON [dbo].[vwEmployees] TO [cdp_payroll]');
        // the safe pattern: object-level GRANT before column-level DENY
        expect(sql.indexOf('GRANT SELECT')).toBeLessThan(sql.indexOf('DENY SELECT'));
    });

    it('combines multiple denied columns for one role into a single DENY statement', () => {
        const provider = makeProvider(makeContext());
        const entity = employeeEntity({
            salaryPerms: [denyRow('f-salary', CUSTOM_ROLE_ID)],
            bonusPerms: [denyRow('f-bonus', CUSTOM_ROLE_ID)],
        });
        const sql = provider.generateViewPermissions(entity);
        expect(sql).toContain('DENY SELECT ([Salary], [Bonus]) ON [dbo].[vwEmployees] TO [cdp_payroll]');
        expect(sql.match(/DENY SELECT/g)).toHaveLength(1);
    });

    it('NEVER synthesizes a DENY from Allow rows', () => {
        const provider = makeProvider(makeContext());
        const entity = employeeEntity({ salaryPerms: [denyRow('f-salary', CUSTOM_ROLE_ID, 'Allow')] });
        expect(provider.generateViewPermissions(entity)).not.toContain('DENY');
    });

    it('NEVER synthesizes a DENY from a No Access row — neutral is not a denial', () => {
        // No Access blocks nothing on its own: another role's Allow still wins at the app tier.
        // Mirroring it as a column DENY would make the DB tier STRICTER than the app tier,
        // when it is meant to be a conservative subset.
        const provider = makeProvider(makeContext());
        const entity = employeeEntity({ salaryPerms: [denyRow('f-salary', CUSTOM_ROLE_ID, 'No Access')] });
        expect(provider.generateViewPermissions(entity)).not.toContain('DENY');
    });

    it('emits nothing when the entity has field security DISABLED', () => {
        // Rows on a disabled entity are retained but inactive at the app tier. Mirroring them
        // would make the two tiers disagree — and the DB tier is the one an administrator
        // cannot see. Disabling therefore revokes the DENYs on the next run.
        const provider = makeProvider(makeContext());
        const entity = employeeEntity({
            salaryPerms: [denyRow('f-salary', CUSTOM_ROLE_ID)],
            enableFieldLevelSecurity: false,
        });
        expect(provider.generateViewPermissions(entity)).not.toContain('DENY');
    });

    it('skips roles absent from RoleSQLNameByID (standard roles / blank SQLName)', () => {
        const provider = makeProvider(makeContext());
        const entity = employeeEntity({ salaryPerms: [denyRow('f-salary', STANDARD_ROLE_ID)] });
        expect(provider.generateViewPermissions(entity)).not.toContain('DENY');
    });

    it('service-login backstop: skips a poisoned role with a prominent warning, once per run', () => {
        const provider = makeProvider(makeContext());
        const entity = employeeEntity({
            salaryPerms: [denyRow('f-salary', POISONED_ROLE_ID)],
            bonusPerms: [denyRow('f-bonus', POISONED_ROLE_ID)],
        });
        const sql = provider.generateViewPermissions(entity);
        expect(sql).not.toContain('DENY');
        expect(logWarningSpy).toHaveBeenCalledTimes(1);
        expect(String(logWarningSpy.mock.calls[0][0])).toContain('cdp_poisoned');
    });

    it('filters unrestrictable targets defensively (a Deny row on a PK emits nothing)', () => {
        const provider = makeProvider(makeContext());
        const entity = employeeEntity({ pkPerms: [denyRow('f-id', CUSTOM_ROLE_ID)] });
        expect(provider.generateViewPermissions(entity)).not.toContain('DENY');
    });

    it('degrades to grants-only when no run context is set (catalog unreadable)', () => {
        const provider = makeProvider(null);
        const entity = employeeEntity({ salaryPerms: [denyRow('f-salary', CUSTOM_ROLE_ID)] });
        const sql = provider.generateViewPermissions(entity);
        expect(sql).not.toContain('DENY');
        expect(sql).not.toContain('REVOKE');
        expect(sql).toContain('GRANT SELECT ON [dbo].[vwEmployees] TO [cdp_payroll]');
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// B2 — catalog-driven wipe-and-reassert
// ═══════════════════════════════════════════════════════════════════════════

describe('reconciliation REVOKE preamble', () => {
    it('REVOKEs every live managed-scope entry on the view (object- and column-level) before re-asserting', () => {
        const provider = makeProvider(makeContext({
            CatalogPermissions: new Map([
                ['dbo.vwemployees', [
                    { RoleName: 'cdp_payroll', PermissionName: 'SELECT', StateDesc: 'GRANT', ColumnName: null },
                    { RoleName: 'cdp_payroll', PermissionName: 'SELECT', StateDesc: 'DENY', ColumnName: 'Salary' },
                    { RoleName: 'cdp_stale', PermissionName: 'SELECT', StateDesc: 'GRANT', ColumnName: null },
                ]],
            ]),
        }));
        const sql = provider.generateViewPermissions(employeeEntity());
        expect(sql).toContain('REVOKE SELECT ON [dbo].[vwEmployees] FROM [cdp_payroll]');
        expect(sql).toContain('REVOKE SELECT ([Salary]) ON [dbo].[vwEmployees] FROM [cdp_payroll]');
        // the stale role's grant is revoked and — having no EntityPermission row — never re-asserted
        expect(sql).toContain('REVOKE SELECT ON [dbo].[vwEmployees] FROM [cdp_stale]');
        expect(sql).not.toContain('GRANT SELECT ON [dbo].[vwEmployees] TO [cdp_stale]');
        // wipe before assert
        expect(sql.indexOf('REVOKE')).toBeLessThan(sql.indexOf('GRANT'));
    });

    it('emits EXECUTE REVOKEs for CRUD procs from the same catalog snapshot', () => {
        const provider = makeProvider(makeContext({
            CatalogPermissions: new Map([
                ['dbo.spupdateemployee', [
                    { RoleName: 'cdp_stale', PermissionName: 'EXECUTE', StateDesc: 'GRANT', ColumnName: null },
                ]],
            ]),
        }));
        const sql = provider.generateCRUDPermissions(employeeEntity(), 'spUpdateEmployee', 'Update');
        expect(sql).toContain('REVOKE EXECUTE ON [dbo].[spUpdateEmployee] FROM [cdp_stale]');
        expect(sql).toContain('GRANT EXECUTE ON [dbo].[spUpdateEmployee] TO [cdp_payroll]');
    });

    it('emits nothing extra when the catalog has no entries for the object', () => {
        const provider = makeProvider(makeContext());
        const sql = provider.generateViewPermissions(employeeEntity());
        expect(sql).not.toContain('REVOKE');
        expect(sql).toContain('GRANT SELECT ON [dbo].[vwEmployees] TO [cdp_payroll]');
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// B3 — app-tier-only role skip visibility
// ═══════════════════════════════════════════════════════════════════════════

describe('blank-SQLName skip logging', () => {
    it('logs one INFO line per app-tier-only role per run, across entities and emitters', () => {
        const provider = makeProvider(makeContext());
        const permissions = [
            { EntityID: 'entity-employees', RoleID: STANDARD_ROLE_ID, Role: 'Magic Link Baseline', RoleSQLName: '', CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: false },
        ];
        const entity = employeeEntity({ permissions });
        provider.generateViewPermissions(entity);
        provider.generateCRUDPermissions(entity, 'spUpdateEmployee', 'Update');
        provider.generateViewPermissions(employeeEntity({ permissions }));

        const appTierLogs = logStatusSpy.mock.calls.filter(c => String(c[0]).includes('app-tier-only'));
        expect(appTierLogs).toHaveLength(1);
        expect(String(appTierLogs[0][0])).toContain('Magic Link Baseline');
    });
});
