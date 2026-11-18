import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    PostgreSQLAutoQuoteAuditor,
    AutoQuotePostgreSQLIdentifiersAudited,
    ChangedIdentifiers,
    FirstCallerFrame,
    DefaultPostgreSQLAutoQuoteAuditEnabled,
} from '../postgresqlAutoQuoteAudit';
import { AutoQuotePostgreSQLIdentifiers } from '../postgresqlAutoQuote';

/**
 * #4435 phase 1: the auto-quote shim's change-only audit. It must log a statement the shim changes
 * once, never log one it leaves alone, stay silent when off, and never change the shim's output.
 */
describe('PostgreSQLAutoQuoteAuditor', () => {
    const auditor = PostgreSQLAutoQuoteAuditor.Instance;
    let lines: string[];
    const log = (m: string): void => {
        lines.push(m);
    };

    beforeEach(() => {
        lines = [];
        auditor.Configure({ Enabled: true, MaxDistinctStatements: 1000 });
        auditor.Reset();
    });

    afterEach(() => {
        auditor.Configure({});
        auditor.Reset();
    });

    it('logs a changed statement once, with the quoted identifiers and the statement', () => {
        const sql = 'SELECT ID, Name FROM __mj.vwUsers WHERE IsActive = true';
        const out1 = AutoQuotePostgreSQLIdentifiersAudited(sql, 'runtime', log);
        const out2 = AutoQuotePostgreSQLIdentifiersAudited(sql, 'runtime', log);
        expect(out1).toBe(AutoQuotePostgreSQLIdentifiers(sql));
        expect(out2).toBe(out1);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('[pgAutoQuoteAudit] runtime');
        expect(lines[0]).toContain('quoted: ID, IsActive, Name, vwUsers');
        expect(lines[0]).toContain(`sql: ${sql}`);
        expect(lines[0]).toMatch(/caller: \S/);
    });

    it('never logs a statement the shim leaves unchanged', () => {
        const sql = 'SELECT "ID" FROM __mj."vwUsers"';
        expect(AutoQuotePostgreSQLIdentifiersAudited(sql, 'codegen', log)).toBe(sql);
        expect(lines).toHaveLength(0);
        expect(auditor.LoggedCount).toBe(0);
    });

    it('logs nothing when the audit is off, and still returns the rewritten SQL', () => {
        auditor.Configure({ Enabled: false });
        const sql = 'SELECT Name FROM __mj.vwUsers';
        expect(AutoQuotePostgreSQLIdentifiersAudited(sql, 'runtime', log)).toBe(AutoQuotePostgreSQLIdentifiers(sql));
        expect(lines).toHaveLength(0);
    });

    it('stops logging new statements past the cap and counts them', () => {
        auditor.Configure({ Enabled: true, MaxDistinctStatements: 1 });
        AutoQuotePostgreSQLIdentifiersAudited('SELECT Name FROM __mj.vwUsers', 'runtime', log);
        AutoQuotePostgreSQLIdentifiersAudited('SELECT Email FROM __mj.vwUsers', 'runtime', log);
        expect(lines).toHaveLength(1);
        expect(auditor.SuppressedCount).toBe(1);
    });

    it('defaults to off in production and on elsewhere', () => {
        const saved = process.env.NODE_ENV;
        try {
            process.env.NODE_ENV = 'production';
            expect(DefaultPostgreSQLAutoQuoteAuditEnabled()).toBe(false);
            process.env.NODE_ENV = 'development';
            expect(DefaultPostgreSQLAutoQuoteAuditEnabled()).toBe(true);
        } finally {
            process.env.NODE_ENV = saved;
        }
    });
});

describe('ChangedIdentifiers', () => {
    it('lists only names the rewrite newly quoted', () => {
        expect(ChangedIdentifiers('SELECT "ID", Name FROM t', 'SELECT "ID", "Name" FROM t')).toEqual(['Name']);
    });
});

describe('FirstCallerFrame', () => {
    it('skips the shim, its call sites and the pg driver', () => {
        const stack = [
            'Error',
            '    at PostgreSQLAutoQuoteAuditor.Record (/x/SQLDialect/dist/postgresqlAutoQuoteAudit.js:1:1)',
            '    at PostgreSQLDataProvider.AutoQuoteIdentifiers (/x/PostgreSQLDataProvider/dist/PostgreSQLDataProvider.js:2:2)',
            '    at Client.query (/x/node_modules/pg/lib/client.js:3:3)',
            '    at MemoryManagerAgent.loadNotes (/x/AI/Agents/dist/memory-manager-agent.js:4:4)',
        ].join('\n');
        expect(FirstCallerFrame(stack)).toBe('MemoryManagerAgent.loadNotes (/x/AI/Agents/dist/memory-manager-agent.js:4:4)');
    });

    it('returns undefined without a stack', () => {
        expect(FirstCallerFrame(undefined)).toBeUndefined();
    });
});
