import { describe, expect, it } from 'vitest';
import { ApplySourceDefaults, ValidateSourceSettings } from '../ContentSourceConfigurationResolver.js';

describe('defaults', () => {
    it('fills in a declared default for a field the source left empty', () => {
        const settings = ApplySourceDefaults([{ Key: 'Path', Label: 'Path', Type: 'path', DefaultValue: '/data' }], {});
        expect(settings.Path).toBe('/data');
    });

    it('does not overwrite a value the source actually set', () => {
        const settings = ApplySourceDefaults([{ Key: 'Path', Label: 'Path', Type: 'path', DefaultValue: '/data' }], { Path: '/x' });
        expect(settings.Path).toBe('/x');
    });

    it('treats empty string as unset, so a blank field still gets its default', () => {
        const settings = ApplySourceDefaults([{ Key: 'Path', Label: 'Path', Type: 'text', DefaultValue: '/data' }], { Path: '' });
        expect(settings.Path).toBe('/data');
    });
});

describe('validation', () => {
    it('reports a missing required field', () => {
        const problems = ValidateSourceSettings([{ Key: 'URL', Type: 'url', Required: true, Label: 'Feed URL' }], {});
        expect(problems).toEqual([{ Key: 'URL', Message: 'Feed URL is required' }]);
    });

    it('allows a missing optional field', () => {
        expect(ValidateSourceSettings([{ Key: 'URL', Label: 'URL', Type: 'url' }], {})).toEqual([]);
    });

    it('rejects a dropdown value outside Options and accepts one inside', () => {
        const field = {
            Key: 'Mode',
            Label: 'Mode',
            Type: 'dropdown' as const,
            Options: [{ Label: 'A', Value: 'a' }, { Label: 'B', Value: 'b' }],
        };
        expect(ValidateSourceSettings([field], { Mode: 'c' })[0].Message).toContain('must be one of: a, b');
        expect(ValidateSourceSettings([field], { Mode: 'a' })).toEqual([]);
    });

    it('rejects a malformed URL', () => {
        const problems = ValidateSourceSettings([{ Key: 'URL', Label: 'URL', Type: 'url' }], { URL: 'not a url' });
        expect(problems[0].Message).toContain('valid URL');
    });
});
