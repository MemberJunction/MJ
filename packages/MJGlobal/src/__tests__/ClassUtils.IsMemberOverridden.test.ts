/**
 * `IsMemberOverridden` — telling "made no choice" apart from "chose the default".
 *
 * WHY IT EXISTS
 * A base class member cannot express the difference on its own. `DefaultSkipAsyncValidation`
 * returning `true` looks identical whether a subclass deliberately opted out or never knew the flag
 * was there — so an API whose default sits in the *off* position silently disables exactly the
 * subclasses that most wanted it on. That is how `BaseEntity.ValidateAsync` overrides came to be
 * dead code on every save: the method was written, documented as automatically called, and skipped.
 *
 * The distinction is recoverable only by asking whether the member was replaced, which is what this
 * does. The cases below are the ones that make it either trustworthy or quietly wrong.
 */
import { describe, expect, it } from 'vitest';
import { IsMemberOverridden } from '../ClassUtils';

class Base {
    public method(): string {
        return 'base';
    }
    public get flag(): boolean {
        return true;
    }
}

/** Replaces the method only — the shape an application usually writes. */
class MethodOverride extends Base {
    public override method(): string {
        return 'sub';
    }
}

/** Replaces the accessor only. */
class GetterOverride extends Base {
    public override get flag(): boolean {
        return false;
    }
}

/** Inherits an override rather than declaring one — the generated / app / server layering. */
class Grandchild extends MethodOverride {}

/** Declares neither. */
class Passthrough extends Base {}

/** An unrelated hierarchy, for the base-class-identity checks. */
class OtherBase {
    public method(): string {
        return 'other';
    }
}

describe('finding an override', () => {
    it('detects a replaced method', () => {
        expect(IsMemberOverridden(new MethodOverride(), 'method', Base)).toBe(true);
    });

    it('detects a replaced accessor', () => {
        // Descriptors carry an accessor on `get` and a method on `value`, never both — comparing
        // only one of them makes half the cases silently answer false.
        expect(IsMemberOverridden(new GetterOverride(), 'flag', Base)).toBe(true);
    });

    it('finds an override declared further up the chain', () => {
        // Grandchild declares nothing itself. Inspecting only the instance's own prototype would
        // report false and defer to a policy nobody stated.
        expect(IsMemberOverridden(new Grandchild(), 'method', Base)).toBe(true);
    });

    it('reports false when a subclass declares neither', () => {
        expect(IsMemberOverridden(new Passthrough(), 'method', Base)).toBe(false);
        expect(IsMemberOverridden(new Passthrough(), 'flag', Base)).toBe(false);
    });

    it('reports false for the base class itself', () => {
        expect(IsMemberOverridden(new Base(), 'method', Base)).toBe(false);
    });

    it('does not confuse two members of the same class', () => {
        const m = new MethodOverride();
        expect(IsMemberOverridden(m, 'method', Base)).toBe(true);
        expect(IsMemberOverridden(m, 'flag', Base)).toBe(false);
    });
});

describe('the base class is part of the question', () => {
    it('reports false for a member the base does not declare', () => {
        // No baseline means nothing was overridden. Answering true here would treat any incidental
        // method on a subclass as an intentional override of something.
        expect(IsMemberOverridden(new MethodOverride(), 'notDeclaredAnywhere', Base)).toBe(false);
    });

    it('reports false when the instance does not descend from the base', () => {
        // The walk stops at the base prototype, which this chain never reaches.
        expect(IsMemberOverridden(new MethodOverride(), 'method', OtherBase)).toBe(false);
    });

    it('does not let two base classes share a cached answer', () => {
        // Cached per (class, member, base). Keyed on member alone, whichever base was asked first
        // would decide for the other — and the wrong answer here re-enables the original bug.
        const m = new MethodOverride();
        expect(IsMemberOverridden(m, 'method', Base)).toBe(true);
        expect(IsMemberOverridden(m, 'method', OtherBase)).toBe(false);
        expect(IsMemberOverridden(m, 'method', Base)).toBe(true);
    });
});

describe('answers are stable and per class', () => {
    it('returns the same answer on repeat calls', () => {
        const m = new MethodOverride();
        for (let i = 0; i < 3; i++) {
            expect(IsMemberOverridden(m, 'method', Base)).toBe(true);
        }
    });

    it('does not let one class decide for another', () => {
        expect(IsMemberOverridden(new MethodOverride(), 'method', Base)).toBe(true);
        expect(IsMemberOverridden(new Passthrough(), 'method', Base)).toBe(false);
        expect(IsMemberOverridden(new MethodOverride(), 'method', Base)).toBe(true);
    });

    it('answers per instance of the same class identically', () => {
        expect(IsMemberOverridden(new MethodOverride(), 'method', Base)).toBe(true);
        expect(IsMemberOverridden(new MethodOverride(), 'method', Base)).toBe(true);
    });
});

describe('bad input is answered, not thrown', () => {
    it.each([
        ['null instance', null],
        ['undefined instance', undefined],
        ['a primitive', 42],
        ['a string', 'nope'],
    ])('returns false for %s', (_label, value) => {
        // Callers reach this on a hot path with whatever they were handed; a throw here would turn
        // a policy question into an outage.
        expect(IsMemberOverridden(value as never, 'method', Base)).toBe(false);
    });

    it('returns false for an empty member name', () => {
        expect(IsMemberOverridden(new MethodOverride(), '', Base)).toBe(false);
    });

    it('returns false when the base class is not a constructor', () => {
        expect(IsMemberOverridden(new MethodOverride(), 'method', null as never)).toBe(false);
        expect(IsMemberOverridden(new MethodOverride(), 'method', {} as never)).toBe(false);
    });

    it('returns false for an object with a null prototype', () => {
        // Object.create(null) has no constructor, so the cache key cannot be formed.
        expect(IsMemberOverridden(Object.create(null), 'method', Base)).toBe(false);
    });
});
