import { describe, it, expect } from 'vitest';
import { BaseInfo } from '../generic/baseInfo';

// Expose the protected copyInitData for direct invocation in tests.
// Matches the real MJ pattern: call super() (NO args), let field initializers
// run, then call copyInitData(initData) from the subclass constructor.
abstract class TestableInfo extends BaseInfo {
    public CallCopyInitData(initData: Record<string, unknown>) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this as unknown as { copyInitData(d: unknown): void }).copyInitData(initData);
    }
}

class TestInfo extends TestableInfo {
    Name: string | null = null;
    Description: string | null = null;
    DefaultValue: string | null = null;
    Order: number | null = null;

    constructor(initData: Record<string, unknown> | null = null) {
        super();
        if (initData) {
            this.CallCopyInitData(initData);
        }
    }
}

// Variant with lowercased field name to exercise the length-12 + toLowerCase fallback path
class TestInfoLower extends TestableInfo {
    Name: string | null = null;
    defaultvalue: string | null = null;

    constructor(initData: Record<string, unknown> | null = null) {
        super();
        if (initData) {
            this.CallCopyInitData(initData);
        }
    }
}

// 13-char field name ending in ...defaultvalue lowercased — must NOT trigger DefaultValue path
class WideInfo extends TestableInfo {
    DefaultValues: string | null = null;

    constructor(initData: Record<string, unknown> | null = null) {
        super();
        if (initData) {
            this.CallCopyInitData(initData);
        }
    }
}

describe('BaseInfo.copyInitData (perf-bundle)', () => {
    describe('basic assignment', () => {
        it('copies keys that exist on the target instance', () => {
            const info = new TestInfo({ Name: 'Foo', Description: 'Bar' });

            expect(info.Name).toBe('Foo');
            expect(info.Description).toBe('Bar');
        });

        it('ignores keys that do not exist on the target instance', () => {
            const info = new TestInfo({ Name: 'Foo', NonExistent: 'Leaks' });

            expect(info.Name).toBe('Foo');
            // hasOwnProperty path must not add new fields to the instance
            expect((info as unknown as Record<string, unknown>).NonExistent).toBeUndefined();
        });

        it('handles null initData safely', () => {
            const info = new TestInfo(null);

            expect(info.Name).toBeNull();
            expect(info.Description).toBeNull();
        });

        it('handles empty initData safely', () => {
            const info = new TestInfo({});

            expect(info.Name).toBeNull();
        });

        it('preserves numeric and non-string values', () => {
            const info = new TestInfo({ Order: 42 });

            expect(info.Order).toBe(42);
        });
    });

    describe('DefaultValue fast-path matching', () => {
        it('extracts actual value from SQL Server paren-wrapped defaults (exact PascalCase key)', () => {
            // ExtractActualDefaultValue strips surrounding parens — (('Pending')) should yield 'Pending'
            const info = new TestInfo({ DefaultValue: "(('Pending'))" });

            expect(info.DefaultValue).toBe('Pending');
        });

        it('extracts actual value for a numeric default like ((1))', () => {
            const info = new TestInfo({ DefaultValue: '((1))' });

            expect(info.DefaultValue).toBe('1');
        });

        it('treats lowercased defaultvalue via the length-12 + toLowerCase fallback path', () => {
            const info = new TestInfoLower({ defaultvalue: "(('Active'))" });

            expect(info.defaultvalue).toBe('Active');
        });

        it('leaves DefaultValue untouched when empty/falsy', () => {
            // Falsy value short-circuits the default-value branch entirely, copying verbatim.
            const info = new TestInfo({ DefaultValue: '' });

            expect(info.DefaultValue).toBe('');
        });

        it('does not treat similarly-named keys of wrong length as DefaultValue', () => {
            // 13-char key — length-12 fast path must skip, and key !== 'DefaultValue'
            const info = new WideInfo({ DefaultValues: "(('ShouldStay'))" });

            expect(info.DefaultValues).toBe("(('ShouldStay'))");
        });
    });
});
