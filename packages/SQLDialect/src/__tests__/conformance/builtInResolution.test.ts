/**
 * Built-in dialects resolve without the class factory. Here the class factory knows no classes, as
 * in a test that stubs `@memberjunction/global`; every built-in key must still resolve.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    const emptyFactory = {
        GetRegistration: () => null,
        GetAllRegistrations: () => [],
        CreateInstance: () => null,
        Register: () => undefined,
    };
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
        MJGlobal: { Instance: { ClassFactory: emptyFactory } },
    };
});

import { GetDialect, GetQueryDialect, RegisteredDialectKeys } from '../../dialectFactory.js';
import { SQLDialect } from '../../sqlDialect.js';

describe('built-in dialects with an empty class factory', () => {
    it('serves the platform dialects', () => {
        expect(GetDialect('sqlserver')).toBeInstanceOf(SQLDialect);
        expect(GetDialect('postgresql').PlatformKey).toBe('postgresql');
    });

    it.each(['sqlserver', 'postgresql', 'mysql', 'oracle', 'snowflake', 'databricks'])('resolves %s as a query dialect', key => {
        expect(GetQueryDialect(key).Key).toBe(key);
    });

    it('lists the built-in keys', () => {
        expect(RegisteredDialectKeys()).toEqual(['sqlserver', 'postgresql', 'mysql', 'oracle', 'snowflake', 'databricks']);
    });

    it('still refuses keys that are neither built in nor registered', () => {
        expect(() => GetQueryDialect('teradata')).toThrow(/No QueryDialect registered/);
        expect(() => GetDialect('mysql')).toThrow(/No SQLDialect registered/);
    });
});
