/**
 * Diagnostic message templating — `$` in substituted values (issue #3171).
 *
 * Both sites splice component-authored data into a lint message:
 *   - `SemanticValidator.applyErrorTemplate` substitutes `{property}`,
 *     `{value}`, `{constraint}` and caller-supplied vars.
 *   - `RequiredWhenValidator` substitutes `{<dependsOn>}` with the sibling
 *     prop's value.
 *
 * As *string* replacements, `$$`, `$&`, `` $` `` and `$'` in that data were
 * expanded rather than inserted, so the diagnostic reported a value the
 * component never contained — the `$&` form splicing the template's own text
 * into it. Neither path had a test.
 */
import { describe, it, expect } from 'vitest';
import { SemanticValidator } from './semantic-validator';
import { RequiredWhenValidator } from './required-when-validator';
import type { ValidationContext } from './validation-context';
import type { PropertyConstraint, ConstraintViolation } from '@memberjunction/interactive-component-types';

/** `$` before an ordinary character is NOT special — that case must keep working. */
const HOSTILE = ['a$$b', 'a$&b', 'a$`b', "a$'b", 'a$1b', 'a$b', "x$&$`$'$$y"];

/** Minimal probe exposing the protected templating helper. */
class Probe extends SemanticValidator {
    getDescription(): string {
        return 'probe';
    }
    validate(): ConstraintViolation[] {
        return [];
    }
    public apply(
        constraint: PropertyConstraint,
        context: ValidationContext,
        vars: Record<string, unknown> = {},
    ): string {
        return this.applyErrorTemplate(constraint, context, 'default', vars);
    }
}

const contextWith = (propertyName: string, propertyValue: unknown, siblings: [string, unknown][] = []): ValidationContext =>
    ({
        propertyName,
        propertyValue,
        siblingProps: new Map<string, unknown>(siblings),
    } as unknown as ValidationContext);

describe('applyErrorTemplate — $ in substituted values (#3171)', () => {
    const probe = new Probe();

    for (const value of HOSTILE) {
        it(`substitutes a template var containing ${JSON.stringify(value)} verbatim`, () => {
            const constraint = { type: 'x', errorTemplate: 'got [{actual}]' } as unknown as PropertyConstraint;
            expect(probe.apply(constraint, contextWith('p', 'v'), { actual: value }))
                .toBe(`got [${value}]`);
        });
    }

    it('substitutes the property name verbatim when it contains $', () => {
        const constraint = { type: 'x', errorTemplate: '<{property}>' } as unknown as PropertyConstraint;
        expect(probe.apply(constraint, contextWith('a$&b', 'v'))).toBe('<a$&b>');
    });

    it('still returns the default message when there is no template', () => {
        const constraint = { type: 'x' } as unknown as PropertyConstraint;
        expect(probe.apply(constraint, contextWith('p', 'v'))).toBe('default');
    });

    it('still substitutes every standard variable', () => {
        const constraint = { type: 'ctype', errorTemplate: '{property}/{constraint}' } as unknown as PropertyConstraint;
        expect(probe.apply(constraint, contextWith('pname', 'v'))).toBe('pname/ctype');
    });
});

describe('RequiredWhenValidator — $ in the dependent value (#3171)', () => {
    const validator = new RequiredWhenValidator();

    const constraintFor = (template: string): PropertyConstraint =>
        ({
            type: 'required-when',
            dependsOn: 'mode',
            errorTemplate: template,
            config: { condition: 'true' },
        } as unknown as PropertyConstraint);

    for (const value of HOSTILE) {
        it(`substitutes a dependent value containing ${JSON.stringify(value)} verbatim`, () => {
            // propertyValue empty => the constraint is violated => the template renders.
            const context = contextWith('target', '', [['mode', value]]);
            const violations = validator.validate(context, constraintFor('mode was [{mode}]'));

            expect(violations).toHaveLength(1);
            expect(violations[0].message).toBe(`mode was [${value}]`);
        });
    }

    it('still reports no violation when the property has a value', () => {
        const context = contextWith('target', 'present', [['mode', 'a$&b']]);
        expect(validator.validate(context, constraintFor('mode was [{mode}]'))).toHaveLength(0);
    });
});
