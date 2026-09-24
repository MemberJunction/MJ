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

/**
 * MJ#3976 — the EXPLICIT-priority collision report. When two classes share a (base class, key,
 * priority), resolution picks the last one registered. That is unchanged here; what these tests pin
 * is that the warning is actionable: it names BOTH registrants, where each registered from, how they
 * relate, and which one resolution actually picks. The previous message named only the newcomer.
 *
 * Shapes mirror the real report (bizapps-tasks): the generated class registers with NO priority
 * (auto-assigned 1) and the app's custom subclass passes an explicit priority of 1.
 */
class GeneratedTaskEntity extends Base {}
class CustomTaskEntity extends GeneratedTaskEntity {}
class ServerTaskEntity extends CustomTaskEntity {}
class OtherTaskEntity extends Base {}

describe('ClassFactory.Register — explicit-priority collision report (MJ#3976)', () => {
    const KEY = 'MJ_BizApps_Tasks: Tasks';
    let factory: ClassFactory;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        factory = new ClassFactory();
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    const report = (): string => warnSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');

    it('a no-priority registration lands at 1, so an explicit priority of 1 collides with it', () => {
        factory.Register(Base, GeneratedTaskEntity, KEY, 0, true);
        factory.Register(Base, CustomTaskEntity, KEY, 1, true);

        expect(factory.GetAllRegistrations(Base, KEY).map(r => [r.SubClass.name, r.Priority])).toEqual([
            ['GeneratedTaskEntity', 1],
            ['CustomTaskEntity', 1],
        ]);
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('names the newcomer AND the incumbent, the key, and their relationship', () => {
        factory.Register(Base, GeneratedTaskEntity, KEY, 0, true);
        factory.Register(Base, CustomTaskEntity, KEY, 1, true);

        const text = report();
        expect(text).toContain('Registering class CustomTaskEntity');
        expect(text).toContain('incumbent:  GeneratedTaskEntity');
        expect(text).toContain(KEY);
        expect(text).toContain('CustomTaskEntity extends GeneratedTaskEntity');
    });

    it('names the registration resolution will actually pick', () => {
        factory.Register(Base, GeneratedTaskEntity, KEY, 0, true);
        factory.Register(Base, CustomTaskEntity, KEY, 1, true);

        expect(report()).toContain('resolution: CustomTaskEntity wins');
        expect(factory.GetRegistration(Base, KEY)!.SubClass).toBe(CustomTaskEntity);
    });

    it('explains the auto-priority trap in the fix line for an override', () => {
        factory.Register(Base, GeneratedTaskEntity, KEY, 0, true);
        factory.Register(Base, CustomTaskEntity, KEY, 1, true);

        expect(report()).toMatch(/fix:.*omit/i);
        expect(report()).toMatch(/auto-assigned priority 1/);
    });

    it('reports where each colliding registration was made', () => {
        factory.Register(Base, GeneratedTaskEntity, KEY, 0, true);
        factory.Register(Base, CustomTaskEntity, KEY, 1, true);

        // Both registrations happen in THIS file, so both provenance strings name it.
        expect(report().match(/ClassFactory\.collision\.test/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    });

    it('records provenance on every registration, colliding or not', () => {
        factory.Register(Base, GeneratedTaskEntity, KEY, 0, true);
        expect(factory.GetAllRegistrations(Base, KEY)[0].RegisteredFrom).toContain('ClassFactory.collision.test');
    });

    it('says the outcome is load-order dependent when the colliding classes are unrelated', () => {
        factory.Register(Base, CustomTaskEntity, KEY, 1, true);
        factory.Register(Base, OtherTaskEntity, KEY, 1, true);

        const text = report();
        expect(text).toContain('unrelated');
        expect(text).toMatch(/load order/i);
        expect(text).toContain('resolution: OtherTaskEntity wins');
    });

    it('says neither wins when a higher priority already outranks the collision', () => {
        factory.Register(Base, ServerTaskEntity, KEY, 5, true);
        factory.Register(Base, GeneratedTaskEntity, KEY, 1, true);
        factory.Register(Base, CustomTaskEntity, KEY, 1, true);

        expect(report()).toContain('resolution: neither — ServerTaskEntity at priority 5');
    });

    it('does NOT change resolution — equal priority still picks the last registered', () => {
        // The report is diagnostic only. Reverse order: the ancestor registers last and still wins.
        factory.Register(Base, CustomTaskEntity, KEY, 1, true);
        factory.Register(Base, GeneratedTaskEntity, KEY, 1, true);

        expect(factory.GetRegistration(Base, KEY)!.SubClass).toBe(GeneratedTaskEntity);
        expect(report()).toContain('resolution: GeneratedTaskEntity wins');
    });

    it('the real-world stack emits exactly one report — the server subclass collides with nothing', () => {
        factory.Register(Base, GeneratedTaskEntity, KEY, 0, true);
        factory.Register(Base, CustomTaskEntity, KEY, 1, true);
        factory.Register(Base, ServerTaskEntity, KEY, 0, true);  // no priority, as it ships today → 2

        expect(factory.GetRegistration(Base, KEY)!.SubClass).toBe(ServerTaskEntity);
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });
});
