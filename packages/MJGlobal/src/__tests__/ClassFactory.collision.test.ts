import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ClassFactory } from '../ClassFactory';
import { AreClassesRelated } from '../ClassUtils';

/**
 * Two DIFFERENT classes registering for the same (base class, key) pair is almost always a bug —
 * one silently shadows the other and the loser never runs. `@RegisterClass` passes `priority = 0`,
 * which routes to the auto-increment branch (`highestPriority + 1`), so the LATER registration
 * always wins. That is the documented, correct contract for an inheritance chain (a subclass
 * overriding its base is the whole point), and it is silently wrong for two unrelated classes that
 * merely collide on a key. Only `priority > 0` ever warned, so in practice nothing warned.
 *
 * These tests pin the distinction: an inheritance-chain override stays silent, an unrelated
 * collision warns, and either way the registration itself still succeeds (the warning is a
 * diagnostic, never a behavioral change — quietly refusing the registration would break every
 * existing intentional override).
 */

// ── Hierarchy under test ────────────────────────────────────────────────
class Base {}
class DerivedA extends Base {}
class DerivedAChild extends DerivedA {}
class UnrelatedB extends Base {}
class TotallySeparate {}

describe('ClassFactory.Register — unrelated-collision warning', () => {
    let factory: ClassFactory;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        factory = new ClassFactory();
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    /**
     * Only the COLLISION diagnostic. ClassFactory also warns about keyless registrations from
     * `GetAllRegistrations`, which is a separate pre-existing signal — asserting on all warnings
     * would make these tests fail for a reason that has nothing to do with collisions.
     */
    function warnings(): string {
        const calls = warnSpy.mock.calls as unknown[][];
        return calls
            .map((args: unknown[]) => args.map((a) => String(a)).join(' '))
            .filter((line: string) => line.includes('is registering for base class'))
            .join('\n');
    }

    it('stays SILENT when a subclass overrides its ancestor on the same key', () => {
        // The canonical, intentional case: DerivedAChild is meant to supersede DerivedA.
        factory.Register(Base, DerivedA, 'shared-key');
        factory.Register(Base, DerivedAChild, 'shared-key');

        expect(warnings()).toBe('');
        // and the later (more-derived) registration wins, per the documented contract
        expect(factory.CreateInstance<Base>(Base, 'shared-key')).toBeInstanceOf(DerivedAChild);
    });

    it('stays SILENT when the SAME class re-registers (duplicate module load)', () => {
        // A module loaded through two paths yields two distinct constructor objects with the same
        // name. Comparing by identity alone would report that as a collision on every dual-load.
        factory.Register(Base, DerivedA, 'shared-key');
        factory.Register(Base, DerivedA, 'shared-key');

        expect(warnings()).toBe('');
    });

    it('WARNS when two unrelated siblings collide on the same key', () => {
        factory.Register(Base, DerivedA, 'shared-key');
        factory.Register(Base, UnrelatedB, 'shared-key');

        const text = warnings();
        expect(text).toContain('UnrelatedB');
        expect(text).toContain('DerivedA'); // names the class being shadowed
        expect(text).toContain('shared-key');
    });

    it('still REGISTERS the colliding class — the warning is diagnostic only', () => {
        // Refusing the registration would break intentional overrides that currently rely on
        // last-one-wins, so behavior is unchanged; only the diagnostic is new.
        factory.Register(Base, DerivedA, 'shared-key');
        factory.Register(Base, UnrelatedB, 'shared-key');

        expect(factory.CreateInstance<Base>(Base, 'shared-key')).toBeInstanceOf(UnrelatedB);
    });

    it('does not warn across DIFFERENT keys for the same base class', () => {
        factory.Register(Base, DerivedA, 'key-one');
        factory.Register(Base, UnrelatedB, 'key-two');

        expect(warnings()).toBe('');
    });

    it('does not warn when no key is supplied and the classes share a chain', () => {
        factory.Register(Base, DerivedA);
        factory.Register(Base, DerivedAChild);

        expect(warnings()).toBe('');
    });

    it('warns for an unrelated keyless collision too', () => {
        factory.Register(Base, DerivedA);
        factory.Register(Base, UnrelatedB);

        expect(warnings()).toContain('UnrelatedB');
    });

    it('names every prior unrelated registration, not just the most recent', () => {
        factory.Register(Base, DerivedA, 'k');
        factory.Register(Base, UnrelatedB, 'k');
        warnSpy.mockClear();
        factory.Register(Base, TotallySeparate as unknown as typeof Base, 'k');

        const text = warnings();
        expect(text).toContain('DerivedA');
        expect(text).toContain('UnrelatedB');
    });
});

describe('AreClassesRelated', () => {
    it('is true for identical classes', () => {
        expect(AreClassesRelated(DerivedA, DerivedA)).toBe(true);
    });

    it('is true for same-named distinct constructors (dual module load)', () => {
        // Two separate `class DerivedA {}` objects — what a module loaded via two paths produces.
        const dup = class DerivedA extends Base {};
        expect(dup).not.toBe(DerivedA);
        expect(AreClassesRelated(DerivedA, dup)).toBe(true);
    });

    it('is true in BOTH directions for an ancestor/descendant pair', () => {
        expect(AreClassesRelated(DerivedAChild, DerivedA)).toBe(true);
        expect(AreClassesRelated(DerivedA, DerivedAChild)).toBe(true);
    });

    it('is true across a multi-level chain', () => {
        expect(AreClassesRelated(DerivedAChild, Base)).toBe(true);
    });

    it('is false for unrelated siblings sharing only a common base', () => {
        expect(AreClassesRelated(DerivedA, UnrelatedB)).toBe(false);
    });

    it('is false for classes in entirely separate hierarchies', () => {
        expect(AreClassesRelated(DerivedA, TotallySeparate)).toBe(false);
    });

    it('is false — never throws — for null/undefined/non-constructor input', () => {
        expect(AreClassesRelated(null, DerivedA)).toBe(false);
        expect(AreClassesRelated(DerivedA, undefined)).toBe(false);
        expect(AreClassesRelated({}, DerivedA)).toBe(false);
        expect(AreClassesRelated('DerivedA', DerivedA)).toBe(false);
    });
});

// ── Second physical copies of a package ─────────────────────────────────
// Each call returns a distinct constructor with identical source text, which is what a second
// installed copy of the defining package produces when its module-level registrations run again.
class EntityBase {}
const loadGeneratedCopy = () =>
    class OrderHeader extends EntityBase {
        Kind(): string { return 'generated'; }
    };

describe('ClassFactory.Register — second physical copy of a package', () => {
    let factory: ClassFactory;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        factory = new ClassFactory();
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    function lines(marker: string): string[] {
        const calls = warnSpy.mock.calls as unknown[][];
        return calls
            .map((args: unknown[]) => args.map((a) => String(a)).join(' '))
            .filter((line: string) => line.includes(marker));
    }
    const copyWarnings = (): string[] => lines('ignored a second copy');
    const collisionWarnings = (): string[] => lines('is registering for base class');

    it('keeps a real subclass winning when a copy of its parent registers after it', () => {
        const Generated = loadGeneratedCopy();
        class OrderHeaderServer extends Generated {}
        factory.Register(EntityBase, Generated, 'Orders');
        factory.Register(EntityBase, OrderHeaderServer, 'Orders');

        const copy = loadGeneratedCopy();
        expect(copy).not.toBe(Generated);
        factory.Register(EntityBase, copy, 'Orders');

        expect(factory.CreateInstance<EntityBase>(EntityBase, 'Orders')).toBeInstanceOf(OrderHeaderServer);
        expect(factory.GetAllRegistrations(EntityBase, 'Orders')).toHaveLength(2);
    });

    it('keeps a same-named subclass of a same-named class (class X extends X) as an override', () => {
        const Generated = loadGeneratedCopy();
        const makeOverride = (Parent: typeof Generated) =>
            class OrderHeader extends Parent {
                override Kind(): string { return 'override'; }
            };
        factory.Register(EntityBase, Generated, 'Orders');
        const Override = makeOverride(Generated);
        factory.Register(EntityBase, Override, 'Orders');
        // a second copy of the overriding package: same name, same source, parent shares its name
        const OverrideCopy = makeOverride(Generated);
        factory.Register(EntityBase, OverrideCopy, 'Orders');

        expect(copyWarnings()).toHaveLength(0);
        expect(factory.GetAllRegistrations(EntityBase, 'Orders')).toHaveLength(3);

        // a later copy of the generated class does not displace the override
        factory.Register(EntityBase, loadGeneratedCopy(), 'Orders');
        const winner = factory.CreateInstance<InstanceType<typeof Generated>>(EntityBase, 'Orders');
        expect(winner).toBeInstanceOf(OverrideCopy);
        expect(winner?.Kind()).toBe('override');
        expect(copyWarnings()).toHaveLength(1);
        expect(factory.GetAllRegistrations(EntityBase, 'Orders')).toHaveLength(3);
    });

    it('still auto-increments and warns for a same-named class with different source', () => {
        const Generated = loadGeneratedCopy();
        factory.Register(EntityBase, Generated, 'Orders');
        const Different = class OrderHeader extends EntityBase {
            Kind(): string { return 'different'; }
        };
        factory.Register(EntityBase, Different, 'Orders');

        const regs = factory.GetAllRegistrations(EntityBase, 'Orders');
        expect(regs).toHaveLength(2);
        expect(regs.map((r) => r.Priority)).toEqual([1, 2]);
        expect(factory.CreateInstance<EntityBase>(EntityBase, 'Orders')).toBeInstanceOf(Different);
        expect(copyWarnings()).toHaveLength(0);
    });

    it('still warns on an unrelated collision with a different-source class of another name', () => {
        factory.Register(EntityBase, loadGeneratedCopy(), 'Orders');
        class OtherHeader extends EntityBase {}
        factory.Register(EntityBase, OtherHeader, 'Orders');

        expect(collisionWarnings()).toHaveLength(1);
        expect(copyWarnings()).toHaveLength(0);
    });

    it('leaves explicit-priority registrations unchanged, copies included', () => {
        factory.Register(EntityBase, loadGeneratedCopy(), 'Orders', 5);
        const copy = loadGeneratedCopy();
        factory.Register(EntityBase, copy, 'Orders', 5);

        expect(factory.GetAllRegistrations(EntityBase, 'Orders')).toHaveLength(2);
        expect(factory.CreateInstance<EntityBase>(EntityBase, 'Orders')).toBeInstanceOf(copy);
        expect(copyWarnings()).toHaveLength(0);
        expect(lines('registrations already exist for that combination')).toHaveLength(1);
    });

    it('does not treat a re-registration of the same constructor as a second copy', () => {
        const Generated = loadGeneratedCopy();
        factory.Register(EntityBase, Generated, 'Orders');
        factory.Register(EntityBase, Generated, 'Orders');

        expect(copyWarnings()).toHaveLength(0);
        expect(factory.GetAllRegistrations(EntityBase, 'Orders')).toHaveLength(2);
    });

    it('emits the warning once however many copies register, naming the class', () => {
        factory.Register(EntityBase, loadGeneratedCopy(), 'Orders');
        factory.Register(EntityBase, loadGeneratedCopy(), 'Orders');
        factory.Register(EntityBase, loadGeneratedCopy(), 'Orders');
        factory.Register(EntityBase, loadGeneratedCopy(), 'Orders');

        const warned = copyWarnings();
        expect(warned).toHaveLength(1);
        expect(warned[0]).toContain('OrderHeader');
        expect(warned[0]).toContain('EntityBase');
        expect(warned[0]).toContain('Orders');
        expect(collisionWarnings()).toHaveLength(0);
        expect(factory.GetAllRegistrations(EntityBase, 'Orders')).toHaveLength(1);
    });
});
