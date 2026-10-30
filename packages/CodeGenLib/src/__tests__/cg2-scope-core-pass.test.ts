/**
 * #3384 item 1: a CORE file-generation pass whose scope-narrowed entity list is empty is skipped, so
 * it cannot rewrite its whole output file (generated resolvers, entity subclasses, Angular forms) to
 * an empty module.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const warnings = vi.hoisted(() => [] as string[]);

// runCodeGen.ts pulls in the full class-registration manifest at import time; nothing here needs it.
vi.mock('@memberjunction/server-bootstrap-lite/mj-class-registrations', () => ({}));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: class {} }));
vi.mock('mssql', () => ({}));
vi.mock('../Misc/status_logging', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../Misc/status_logging')>();
    return { ...actual, LogWarning: vi.fn((m: string) => { warnings.push(m); }) };
});

import { EntityInfo } from '@memberjunction/core';
import { RunCodeGenBase } from '../runCodeGen';

beforeEach(() => {
    warnings.length = 0;
});

describe('RunCodeGenBase.SkipEmptyCorePass', () => {
    it('skips, with a warning naming the pass, when no core entity is in scope', () => {
        expect(RunCodeGenBase.SkipEmptyCorePass('CORE entity subclasses', [])).toBe(true);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('CORE entity subclasses');
    });

    it('runs the pass when at least one core entity is in scope', () => {
        const core = new EntityInfo({ ID: 'e1', Name: 'MJ: Users', SchemaName: '__mj' });
        expect(RunCodeGenBase.SkipEmptyCorePass('CORE GraphQL resolvers', [core])).toBe(false);
        expect(warnings).toHaveLength(0);
    });
});
