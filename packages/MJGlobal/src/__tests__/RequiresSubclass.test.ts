import { describe, it, expect } from 'vitest';
import { RequiresSubclass, ClassRequiresSubclass, REQUIRES_SUBCLASS_KEY } from '../RequiresSubclass';

@RequiresSubclass()
abstract class MarkedBase {
    abstract DoWork(): string;
}

class ConcreteChild extends MarkedBase {
    DoWork(): string { return 'real'; }
}

abstract class UnmarkedBase {
    abstract DoWork(): string;
}

/** Legacy form the decorator replaced — still honored so pre-decorator bases keep working. */
class LegacyStaticBase {
    public static readonly RequiresSubclass = true;
}

describe('RequiresSubclass', () => {
    describe('the decorator', () => {
        it('marks the decorated class', () => {
            expect(ClassRequiresSubclass(MarkedBase)).toBe(true);
        });

        it('leaves an undecorated class unmarked', () => {
            expect(ClassRequiresSubclass(UnmarkedBase)).toBe(false);
        });

        it('writes a NON-ENUMERABLE marker so it cannot leak into spreads or JSON', () => {
            const descriptor = Object.getOwnPropertyDescriptor(MarkedBase.prototype, REQUIRES_SUBCLASS_KEY);
            expect(descriptor?.enumerable).toBe(false);
            // and therefore never shows up on an instance's enumerable surface
            const instance = new ConcreteChild();
            expect(Object.keys(instance)).not.toContain(REQUIRES_SUBCLASS_KEY);
            expect(JSON.stringify({ ...instance })).not.toContain(REQUIRES_SUBCLASS_KEY);
        });
    });

    describe('own-property semantics (the reason this is a decorator + helper)', () => {
        it('a CONCRETE SUBCLASS of a marked base is NOT itself marked', () => {
            // This is the correctness fix. A plain `cls.RequiresSubclass` read walks the
            // constructor prototype chain, so a subclass would inherit `true` and resolving
            // against it would wrongly throw even though it is perfectly instantiable.
            expect(ClassRequiresSubclass(ConcreteChild)).toBe(false);
        });

        it('the naive inherited-property read WOULD have reported the subclass as marked', () => {
            // Pins the bug being fixed: prove the inherited read is truthy for the subclass,
            // so this test fails loudly if someone reverts to plain property access.
            const inherited = (ConcreteChild.prototype as unknown as Record<string, unknown>)[REQUIRES_SUBCLASS_KEY];
            expect(inherited).toBe(true);                       // inherited via the prototype chain
            expect(ClassRequiresSubclass(ConcreteChild)).toBe(false); // but own-property check says no
        });
    });

    describe('accepts a class or an instance', () => {
        it('resolves an instance of a marked base', () => {
            const hollow = Object.create(MarkedBase.prototype) as MarkedBase;
            expect(ClassRequiresSubclass(hollow)).toBe(true);
        });

        it('resolves an instance of a concrete subclass as unmarked', () => {
            expect(ClassRequiresSubclass(new ConcreteChild())).toBe(false);
        });
    });

    describe('robustness', () => {
        it('returns false for null/undefined rather than throwing', () => {
            expect(ClassRequiresSubclass(null)).toBe(false);
            expect(ClassRequiresSubclass(undefined)).toBe(false);
        });

        it('returns false for primitives and plain objects', () => {
            expect(ClassRequiresSubclass(42)).toBe(false);
            expect(ClassRequiresSubclass('nope')).toBe(false);
            expect(ClassRequiresSubclass({})).toBe(false);
        });
    });

    describe('backward compatibility', () => {
        it('still honors the legacy `static RequiresSubclass = true` form', () => {
            expect(ClassRequiresSubclass(LegacyStaticBase)).toBe(true);
        });

        it('does not let the legacy static leak to its subclasses either', () => {
            class LegacyChild extends LegacyStaticBase {}
            expect(ClassRequiresSubclass(LegacyChild)).toBe(false);
        });
    });
});
