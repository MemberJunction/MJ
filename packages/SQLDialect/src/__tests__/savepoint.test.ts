import { describe, it, expect } from 'vitest';
import { SQLServerDialect } from '../sqlServerDialect.js';
import { PostgreSQLDialect } from '../postgresqlDialect.js';

describe('SQLDialect savepoint SQL', () => {
    it('SQL Server uses SAVE / ROLLBACK TRANSACTION and does not release', () => {
        const d = new SQLServerDialect();
        expect(d.CreateSavepointSQL('SavePoint_1')).toBe('SAVE TRANSACTION SavePoint_1');
        expect(d.RollbackToSavepointSQL('SavePoint_1')).toBe('ROLLBACK TRANSACTION SavePoint_1');
        expect(d.ReleaseSavepointSQL('SavePoint_1')).toBeNull();
    });

    it('PostgreSQL uses SAVEPOINT / RELEASE / ROLLBACK TO', () => {
        const d = new PostgreSQLDialect();
        expect(d.CreateSavepointSQL('mj_sp_1')).toBe('SAVEPOINT mj_sp_1');
        expect(d.ReleaseSavepointSQL('mj_sp_1')).toBe('RELEASE SAVEPOINT mj_sp_1');
        expect(d.RollbackToSavepointSQL('mj_sp_1')).toBe('ROLLBACK TO SAVEPOINT mj_sp_1');
    });
});
