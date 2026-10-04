/**
 * A dependency's template tags see the values the composing query passes it. A static value or a
 * pass-through name given in the composition token applies inside `{% if %}`, `{% elif %}`,
 * `{% for %}` and `{% set %}` tags, not only in `{{ }}` expressions.
 */
import { describe, it, expect } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import type { QueryDependencySpec } from '@memberjunction/core';
import { RenderPipeline } from '../renderPipeline';

const user = new UserInfo(undefined, { ID: 'u-1', Name: 'Test', Email: 'test@example.com', Type: 'User', IsActive: true, UserRoles: [] });

const DEP: QueryDependencySpec = {
    Name: 'Dep',
    CategoryPath: '/Lib/',
    UsesTemplate: true,
    SQL: 'SELECT ID FROM t WHERE ID <= {{ Limit | default(10) | sqlNumber }}{% if Cat %} AND Category = {{ Cat | sqlString }}{% endif %}'
};

function render(outerSQL: string, parameters: Record<string, string> = {}, deps: QueryDependencySpec[] = [DEP]): string {
    return RenderPipeline.Run(outerSQL, {
        Platform: 'sqlserver', ContextUser: user, Parameters: parameters, UsesTemplate: true, Dependencies: deps
    }).FinalSQL;
}

describe('a dependency template block and the values passed to it', () => {
    it('applies a static value inside {% if %}', () => {
        const sql = render(`SELECT d.ID FROM {{query:"Lib/Dep(Cat='Alpha', Limit=60)"}} d`);
        expect(sql).toContain("Category = 'Alpha'");
        expect(sql).toContain('ID <= 60');
    });

    it('applies a pass-through value inside {% if %}', () => {
        const sql = render(`SELECT d.ID FROM {{query:"Lib/Dep(Cat=OuterCat)"}} d`, { OuterCat: 'Beta' });
        expect(sql).toContain("Category = 'Beta'");
    });

    it('leaves the block out when the value is not passed', () => {
        const sql = render(`SELECT d.ID FROM {{query:"Lib/Dep"}} d`);
        expect(sql).not.toContain('Category =');
        expect(sql).toContain('ID <= 10');
    });

    it('applies a static value inside {% elif %} and {% set %}', () => {
        const dep: QueryDependencySpec = {
            ...DEP,
            SQL: "{% set Floor = Min %}SELECT ID FROM t WHERE ID >= {{ Floor | sqlNumber }}{% if Mode == 'a' %} AND x = 1{% elif Mode == 'b' %} AND x = 2{% endif %}"
        };
        const sql = render(`SELECT d.ID FROM {{query:"Lib/Dep(Mode='b', Min=5)"}} d`, {}, [dep]);
        expect(sql).toContain('x = 2');
        expect(sql).toContain('ID >= 5');
    });

    it('does not rewrite an attribute or a string that only looks like the variable', () => {
        const dep: QueryDependencySpec = {
            ...DEP,
            SQL: "SELECT ID FROM t WHERE 1 = 1{% if 'Cat' != Cat %} AND y = 1{% endif %}{% if Opt.Cat %} AND z = 1{% endif %}"
        };
        const sql = render(`SELECT d.ID FROM {{query:"Lib/Dep(Cat='Dog')"}} d`, {}, [dep]);
        expect(sql).toContain('y = 1');
        expect(sql).not.toContain('z = 1');
    });
});
