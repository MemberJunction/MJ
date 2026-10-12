import { describe, it, expect, vi } from 'vitest';
import { ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/global';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core', async () => {
    const g = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
    return { BaseEntity: class {}, ValidationErrorInfo: g.ValidationErrorInfo, ValidationErrorType: g.ValidationErrorType };
});

// The generated base: field values and Dirty flags from a plain record, and a Validate with one optional warning.
vi.mock('../generated/entity_subclasses', () => ({
    MJThemeEntity: class {
        public Values: Record<string, string | null> = {};
        public DirtyFields = new Set<string>();
        public BaseErrors: ValidationErrorInfo[] = [];
        get LoginScreen(): string | null { return this.Values['LoginScreen'] ?? null; }
        get LoginScreenDraft(): string | null { return this.Values['LoginScreenDraft'] ?? null; }
        GetFieldByName(name: string) { return { Dirty: this.DirtyFields.has(name) }; }
        Validate(): ValidationResult {
            const r = new ValidationResult();
            r.Errors.push(...this.BaseErrors);
            r.Success = true;
            return r;
        }
    },
}));

import { MJThemeEntityExtended } from '../custom/MJThemeEntityExtended';

type TestTheme = MJThemeEntityExtended & { Values: Record<string, string | null>; DirtyFields: Set<string>; BaseErrors: ValidationErrorInfo[] };

function theme(values: Record<string, string | null>, dirty: string[]): TestTheme {
    const t = new MJThemeEntityExtended() as TestTheme;
    t.Values = values;
    t.DirtyFields = new Set(dirty);
    return t;
}

const UNSAFE = JSON.stringify({ Version: 1, Layout: 'split', Extra: true });

describe('MJThemeEntityExtended.Validate', () => {
    it('refuses an unusable LoginScreen that this save changes', () => {
        const r = theme({ LoginScreen: UNSAFE }, ['LoginScreen']).Validate();
        expect(r.Success).toBe(false);
        expect(r.Errors.map((e) => e.Source)).toEqual(['LoginScreen']);
    });

    it('refuses an unusable LoginScreenDraft that this save changes', () => {
        const r = theme({ LoginScreenDraft: '{not json' }, ['LoginScreenDraft']).Validate();
        expect(r.Success).toBe(false);
        expect(r.Errors[0].Source).toBe('LoginScreenDraft');
    });

    it('leaves a stored design alone when the save does not change it', () => {
        expect(theme({ LoginScreen: UNSAFE }, ['Name']).Validate().Success).toBe(true);
    });

    it('accepts clearing the design', () => {
        expect(theme({ LoginScreen: null, LoginScreenDraft: null }, ['LoginScreen', 'LoginScreenDraft']).Validate().Success).toBe(true);
    });

    it('keeps a base warning without failing the save', () => {
        const t = theme({}, []);
        t.BaseErrors = [new ValidationErrorInfo('Name', 'heads up', null, ValidationErrorType.Warning)];
        const r = t.Validate();
        expect(r.Success).toBe(true);
        expect(r.Errors).toHaveLength(1);
    });
});
