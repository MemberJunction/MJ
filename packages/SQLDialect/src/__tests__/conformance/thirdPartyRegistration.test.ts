/**
 * A third-party dialect registered with the class factory under QueryDialect resolves by its key,
 * next to the built-in dialects, and cannot replace a built-in key.
 */
import { describe, it, expect } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { QueryDialect } from '../../queryDialect.js';
import { AnsiQueryDialect } from '../../dialects/ansi.js';
import { GetDialect, GetQueryDialect, RegisteredDialectKeys } from '../../dialectFactory.js';
import { SQLServerDialect } from '../../sqlServerDialect.js';
import type { DialectKey } from '../../facets/dialectKey.js';

@RegisterClass(QueryDialect, 'teradata-test')
class TeradataTestDialect extends AnsiQueryDialect {
    get Key(): DialectKey {
        return 'teradata-test';
    }

    get DisplayName(): string {
        return 'Teradata (test)';
    }
}

@RegisterClass(QueryDialect, 'sqlserver')
class ImpostorSqlServerDialect extends AnsiQueryDialect {
    get Key(): DialectKey {
        return 'sqlserver';
    }

    get DisplayName(): string {
        return 'Impostor';
    }
}

describe('third-party dialect registration', () => {
    it('resolves a registered key', () => {
        expect(GetQueryDialect('teradata-test')).toBeInstanceOf(TeradataTestDialect);
        expect(RegisteredDialectKeys()).toContain('teradata-test');
    });

    it('is not served as a full SQL dialect', () => {
        expect(() => GetDialect('teradata-test')).toThrow(/No SQLDialect registered/);
    });

    it('cannot replace a built-in key', () => {
        expect(GetQueryDialect('sqlserver')).not.toBeInstanceOf(ImpostorSqlServerDialect);
        expect(GetDialect('sqlserver')).toBeInstanceOf(SQLServerDialect);
    });
});
