/**
 * A template expression with a `default(…)` filter renders even when its parameter is not
 * supplied, so that parameter is optional — unless another expression uses it without a default.
 */
import { describe, it, expect } from 'vitest';
import { SQLParser } from '../sql-parser.js';

const param = (sql: string, name: string) => SQLParser.ExtractParameterInfo(sql).find(p => p.name === name);

describe('ExtractParameterInfo and default()', () => {
    it('marks a parameter used only with default() as optional', () => {
        const info = param('SELECT ID FROM t WHERE ID <= {{ MaxId | default(7) | sqlNumber }}', 'MaxId')!;
        expect(info.isRequired).toBe(false);
        expect(info.defaultValue).toBe(7);
    });

    it('keeps it required when another expression uses it without a default', () => {
        const info = param('SELECT ID FROM t WHERE ID <= {{ MaxId | default(7) | sqlNumber }} AND ID <> {{ MaxId | sqlNumber }}', 'MaxId')!;
        expect(info.isRequired).toBe(true);
    });

    it('keeps a parameter without default() required', () => {
        expect(param('SELECT ID FROM t WHERE ID <= {{ MaxId | sqlNumber }}', 'MaxId')!.isRequired).toBe(true);
    });
});
