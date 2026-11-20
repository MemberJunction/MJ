/**
 * RequiredWhenValidator: a `required-when` condition is data. It is evaluated
 * with only the sibling prop value in scope and never runs as code.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { RequiredWhenValidator } from './required-when-validator';
import type { ValidationContext } from './validation-context';
import type { PropertyConstraint } from '@memberjunction/interactive-component-types';
import { ComponentLinter } from '../../component-linter';

type MarkerHost = typeof globalThis & { __mjConditionMarker?: string };
const host = globalThis as MarkerHost;

const contextWith = (propertyValue: unknown, sibling: unknown): ValidationContext =>
    ({
        propertyName: 'target',
        propertyValue,
        siblingProps: new Map<string, unknown>([['mode', sibling]]),
    } as unknown as ValidationContext);

const constraintWith = (condition: string): PropertyConstraint =>
    ({
        type: 'required-when',
        dependsOn: 'mode',
        config: { condition },
    } as unknown as PropertyConstraint);

/** A condition that only sets a harmless marker on globalThis. */
const MARKER_CONDITION = "(globalThis.__mjConditionMarker = 'set', true)";

afterEach(() => {
    delete host.__mjConditionMarker;
});

describe('RequiredWhenValidator condition evaluation', () => {
    const validator = new RequiredWhenValidator();

    it('does not run a condition that writes to globalThis', () => {
        validator.validate(contextWith('', 'x'), constraintWith(MARKER_CONDITION));
        expect(host.__mjConditionMarker).toBeUndefined();
    });

    it('does not let a condition change the constraint it belongs to', () => {
        const constraint = constraintWith("(constraint.errorTemplate = 'changed', true)");
        validator.validate(contextWith('', 'x'), constraint);
        expect(constraint.errorTemplate).toBeUndefined();
    });

    it('reports an unsupported condition instead of a missing-prop violation', () => {
        const violations = validator.validate(contextWith('', 'x'), constraintWith("typeof process === 'object'"));
        expect(violations).toHaveLength(1);
        expect(violations[0].type).toBe('unsupported-condition');
    });

    it('refuses a condition with a method call that takes a callback', () => {
        const violations = validator.validate(
            contextWith('', 'sum'),
            constraintWith("['sum'].some(x => x === siblingProp)"),
        );
        expect(violations.map(v => v.type)).toEqual(['unsupported-condition']);
    });

    it('refuses a method call other than includes on a literal array', () => {
        const violations = validator.validate(
            contextWith('', 'sum'),
            constraintWith("''.padStart(3).length > 0"),
        );
        expect(violations.map(v => v.type)).toEqual(['unsupported-condition']);
    });

    it('evaluates a comparison with a negative number literal and refuses other minus forms', () => {
        const typesFor = (condition: string, sibling: unknown): string[] =>
            validator.validate(contextWith('', sibling), constraintWith(condition)).map(v => v.type);

        expect(typesFor('siblingProp > -1', 0)).toEqual(['missing-required-prop']);
        expect(typesFor('siblingProp > -1', -5)).toEqual([]);
        expect(typesFor('-siblingProp > 0', -5)).toEqual(['unsupported-condition']);
        expect(typesFor('- -1 < siblingProp', 5)).toEqual(['unsupported-condition']);
    });

    it('refuses a condition longer than the length limit', () => {
        const long = Array.from({ length: 20 }, (_, i) => `siblingProp === 'v${i}'`).join(' || ') + " || siblingProp === 'sum'";
        const violations = validator.validate(contextWith('', 'sum'), constraintWith(long));
        expect(violations.map(v => v.type)).toEqual(['unsupported-condition']);
    });
});

describe('ComponentLinter with a required-when constraint from the spec', () => {
    it('does not run the condition of an embedded dependency', async () => {
        const spec = {
            name: 'MyForm',
            location: 'embedded',
            type: 'form',
            title: 'x',
            description: 'x',
            code: "function MyForm({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) { const { Dep } = components; return <Dep a='1' b='' />; }",
            dependencies: [
                {
                    name: 'Dep',
                    location: 'embedded',
                    code: 'function Dep(){return null}',
                    properties: [
                        { name: 'a', type: 'string' },
                        {
                            name: 'b',
                            type: 'string',
                            constraints: [{ type: 'required-when', dependsOn: 'a', config: { condition: MARKER_CONDITION } }],
                        },
                    ],
                },
            ],
        };
        await ComponentLinter.lintComponent(spec.code, spec.name, JSON.parse(JSON.stringify(spec)), true, undefined);
        expect(host.__mjConditionMarker).toBeUndefined();
    });
});
