import { describe, expect, it } from 'vitest';
import { ContentSourceConfigurationResolver, SourceTypeField } from '../ContentSourceConfigurationResolver.js';

/** Reach the private validation/defaulting logic without standing up a database. */
function harness() {
    const resolver = new ContentSourceConfigurationResolver({} as never, {} as never);
    const inner = resolver as unknown as {
        applyDefaults(declared: readonly SourceTypeField[], stored: Record<string, unknown>): Record<string, unknown>;
        validate(
            declared: readonly SourceTypeField[],
            settings: Record<string, unknown>,
        ): { Key: string | null; Message: string }[];
    };
    return inner;
}

describe('defaults', () => {
    it('fills in a declared default for a field the source left empty', () => {
        const settings = harness().applyDefaults([{ Key: 'Depth', Type: 'number', DefaultValue: '2' }], {});
        expect(settings.Depth).toBe(2);
    });

    it('coerces a boolean default rather than storing the string', () => {
        const settings = harness().applyDefaults([{ Key: 'Recurse', Type: 'boolean', DefaultValue: 'true' }], {});
        expect(settings.Recurse).toBe(true);
    });

    it('does not overwrite a value the source actually set', () => {
        const settings = harness().applyDefaults([{ Key: 'Depth', Type: 'number', DefaultValue: '2' }], { Depth: 9 });
        expect(settings.Depth).toBe(9);
    });

    it('treats empty string as unset, so a blank field still gets its default', () => {
        const settings = harness().applyDefaults([{ Key: 'Path', Type: 'text', DefaultValue: '/data' }], { Path: '' });
        expect(settings.Path).toBe('/data');
    });
});

describe('validation', () => {
    it('reports a missing required field', () => {
        const problems = harness().validate([{ Key: 'URL', Type: 'url', Required: true, Label: 'Feed URL' }], {});
        expect(problems).toEqual([{ Key: 'URL', Message: 'Feed URL is required' }]);
    });

    it('allows a missing OPTIONAL field', () => {
        expect(harness().validate([{ Key: 'URL', Type: 'url' }], {})).toEqual([]);
    });

    it('rejects a dropdown value outside Options', () => {
        const problems = harness().validate(
            [{ Key: 'Mode', Type: 'dropdown', Options: [{ Label: 'A', Value: 'a' }, { Label: 'B', Value: 'b' }] }],
            { Mode: 'c' },
            {},
        );
        expect(problems[0].Message).toContain('must be one of: a, b');
    });

    it('accepts a dropdown value within Options', () => {
        const problems = harness().validate(
            [{ Key: 'Mode', Type: 'dropdown', Options: [{ Label: 'A', Value: 'a' }] }],
            { Mode: 'a' },
            {},
        );
        expect(problems).toEqual([]);
    });

    it('rejects a non-numeric value for a number field', () => {
        const problems = harness().validate([{ Key: 'Depth', Type: 'number' }], { Depth: 'deep' });
        expect(problems[0].Message).toContain('must be a number');
    });

    it('enforces declared numeric bounds', () => {
        const field: SourceTypeField = { Key: 'Depth', Type: 'number', Minimum: 1, Maximum: 5 };
        expect(harness().validate([field], { Depth: 9 })[0].Message).toContain('at most 5');
        expect(harness().validate([field], { Depth: 0 })[0].Message).toContain('at least 1');
        expect(harness().validate([field], { Depth: 3 })).toEqual([]);
    });

    it('rejects a malformed URL', () => {
        const problems = harness().validate([{ Key: 'URL', Type: 'url' }], { URL: 'not a url' });
        expect(problems[0].Message).toContain('valid URL');
    });
});
