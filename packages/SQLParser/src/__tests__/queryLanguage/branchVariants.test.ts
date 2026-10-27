/**
 * QueryTemplate.BranchVariants: the base assignment plus one variant per `{% if %}` toggled on
 * its own, as overrides of the base.
 */
import { describe, it, expect } from 'vitest';
import { QueryTemplate } from '../../template/queryTemplate.js';
import { BranchVariantValues } from '../../template/branchVariants.js';
import type { BranchValue } from '../../template/branchEvaluator.js';
import { SS } from './helpers.js';

function plan(sql: string) {
    return QueryTemplate.Parse(sql, SS).BranchVariants().Value;
}

const SAMPLE: BranchValue = { Kind: 'Sample' };
const ABSENT: BranchValue = { Kind: 'Absent' };
const literal = (Value: string | number | boolean | null): BranchValue => ({ Kind: 'Literal', Value });

describe('QueryTemplate.BranchVariants', () => {
    it('is the base alone for a template with no {% if %}', () => {
        const set = plan('SELECT * FROM t WHERE a = {{ a | sqlString }}');
        expect(set.Base).toEqual({ a: SAMPLE });
        expect(set.Variants).toEqual([{ Index: 0, Toggle: null, Overrides: {}, Satisfiable: true }]);
    });

    it('gives n + 1 variants, each toggling one block by leaving its parameter out', () => {
        const sql = 'SELECT * FROM t WHERE 1=1 {% if a %}AND a = {{ a | sqlString }}{% endif %} {% if b %}AND b = {{ b | sqlNumber }}{% endif %}';
        const set = plan(sql);
        expect(set.Base).toEqual({ a: SAMPLE, b: SAMPLE });
        expect(set.Variants.map(v => [v.Index, v.Overrides, v.Toggle?.FromBranch, v.Toggle?.ToBranch, v.Satisfiable])).toEqual([
            [0, {}, undefined, undefined, true],
            [1, { a: ABSENT }, 0, 1, true],
            [2, { b: ABSENT }, 0, 1, true],
        ]);
        expect(sql.substring(set.Variants[1].Toggle?.IfSpan.Start ?? 0, set.Variants[1].Toggle?.IfSpan.End ?? 0)).toBe('{% if a %}AND a = {{ a | sqlString }}{% endif %}');
        expect(BranchVariantValues(set, set.Variants[2])).toEqual({ a: SAMPLE, b: ABSENT });
    });

    it('satisfies comparisons with the literals they compare with', () => {
        const set = plan("SELECT 1 {% if mode == 'big' %}A{% elif mode == 'small' %}B{% else %}C{% endif %} {% if n > 100 %}D{% endif %}");
        expect(set.Base).toEqual({ mode: literal('big'), n: literal(101) });
        expect(set.Variants[1].Overrides).toEqual({ mode: literal('small') });
        expect(set.Variants[1].Toggle?.ToBranch).toBe(1);
        expect(set.Variants[2].Overrides).toEqual({ n: literal(100) });
    });

    it('handles negative literals, != and boolean comparisons', () => {
        const set = plan('SELECT 1 {% if t >= -5 %}A{% endif %} {% if s != "x" %}B{% endif %} {% if f == true %}C{% endif %}');
        expect(set.Base.t).toEqual(literal(-5));
        expect(set.Base.s).toEqual(literal('x_other'));
        expect(set.Variants.slice(1).map(v => v.Satisfiable)).toEqual([true, true, true]);
        expect(set.Variants[3].Overrides).toEqual({ f: literal(false) });
    });

    it('keeps a required parameter present', () => {
        const set = plan('SELECT {{ a | sqlString }} {% if a %}X{% endif %}');
        expect(set.Variants[1].Satisfiable).toBe(false);
        expect(set.Variants[1].Overrides).toEqual({});
    });

    it('makes the outer block reach an inner block it toggles', () => {
        const set = plan('SELECT 1 {% if a %}A{% else %}{% if b %}B{% endif %}{% endif %}');
        expect(set.Variants.map(v => v.Overrides)).toEqual([{}, { a: ABSENT }, { a: ABSENT }]);
        expect(set.Variants[2].Toggle).toMatchObject({ FromBranch: null, ToBranch: 0 });
    });

    it('toggles an inner block while keeping the outer branch', () => {
        const set = plan('SELECT 1 {% if a %}{% if b %}B{% endif %}{% endif %}');
        expect(set.Variants[2].Overrides).toEqual({ b: ABSENT });
        expect(set.Variants[2].Toggle).toMatchObject({ FromBranch: 0, ToBranch: 1 });
    });

    it('marks a block whose condition reads loop values as not satisfiable', () => {
        const set = plan('SELECT 1 {% for s in xs %}{% if not loop.first %} OR {% endif %}{{ s | sqlString }}{% endfor %}');
        expect(set.Base).toEqual({ xs: SAMPLE });
        expect(set.Variants[1]).toMatchObject({ Satisfiable: false, Overrides: {}, Toggle: { FromBranch: null, ToBranch: null } });
    });

    it('treats Context tokens as present but not comparable', () => {
        const set = plan("SELECT 1 {% if Context.UserID %}A{% endif %} {% if Context.UserName == 'x' %}B{% endif %}");
        expect(set.Variants.slice(1).map(v => v.Satisfiable)).toEqual([false, false]);
    });

    it('sees two blocks that read one parameter move together', () => {
        const set = plan('SELECT 1 {% if a %}X{% endif %} {% if a %}Y{% endif %}');
        expect(set.Variants[1].Overrides).toEqual({ a: ABSENT });
        expect(set.Variants[2].Overrides).toEqual({ a: ABSENT });
    });

    it('stays bounded when a block reads many parameters', () => {
        const names = Array.from({ length: 20 }, (_, i) => `p${i} == ${i}`).join(' and ');
        const set = plan(`SELECT 1 {% if ${names} %}X{% endif %}`);
        expect(set.Variants).toHaveLength(2);
    });
});
