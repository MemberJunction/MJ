/**
 * A minified build renames classes to `e`, `t` and so on, so unrelated engines in different chunks
 * share a class name. The registry must keep each engine registered under its own key instead of
 * letting the last one overwrite the rest (PR #6684 review).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { BaseEngineRegistry } from '../generic/baseEngineRegistry';

type FakeEngine = { Configs: { Type: 'entity'; EntityName: string; PropertyName: string }[]; Loaded: boolean };

/** A fresh class per call, renamed the way a minifier would. */
function makeEngine(entityName: string, minifiedName = 'e'): FakeEngine {
    const EngineClass = class {
        public Configs = [{ Type: 'entity' as const, EntityName: entityName, PropertyName: '_rows' }];
        public Loaded = false;
    };
    Object.defineProperty(EngineClass, 'name', { value: minifiedName });
    return new EngineClass();
}

describe('BaseEngineRegistry with colliding class names', () => {
    const registry = BaseEngineRegistry.Instance;

    beforeEach(() => {
        registry.Reset();
    });

    it('keeps both engines registered when their class names collide', () => {
        const users = makeEngine('MJ: Users');
        const roles = makeEngine('MJ: Roles');

        registry.RegisterEngine(users);
        registry.RegisterEngine(roles);

        expect(registry.GetAllEngines()).toEqual([users, roles]);
        expect(registry.GetEngineNames()).toEqual(['e', 'e#2']);
        expect(registry.FindEnginesDeclaringEntity('MJ: Users')).toEqual(['e']);
        expect(registry.FindEnginesDeclaringEntity('MJ: Roles')).toEqual(['e#2']);
    });

    it('keeps one slot when the same engine registers or reports loading again', () => {
        const users = makeEngine('MJ: Users');
        const roles = makeEngine('MJ: Roles');
        registry.RegisterEngine(users);
        registry.RegisterEngine(roles);

        registry.RegisterEngine(roles);
        registry.NotifyEngineLoaded(roles);
        registry.NotifyEngineLoaded(users);

        expect(registry.GetEngineNames()).toEqual(['e', 'e#2']);
        expect(registry.GetEngineInfo('e#2')?.isLoaded).toBe(true);
    });

    it('unregistering one engine leaves the engine that shares its name', () => {
        const users = makeEngine('MJ: Users');
        const roles = makeEngine('MJ: Roles');
        registry.RegisterEngine(users);
        registry.RegisterEngine(roles);

        registry.UnregisterEngine(roles);

        expect(registry.GetAllEngines()).toEqual([users]);
    });

    it('a new instance of the same class replaces the old one in its slot', () => {
        const first = makeEngine('MJ: Users');
        const second = new (first.constructor as new () => FakeEngine)();

        registry.RegisterEngine(first);
        registry.RegisterEngine(second);

        expect(registry.GetAllEngines()).toEqual([second]);
    });
});
