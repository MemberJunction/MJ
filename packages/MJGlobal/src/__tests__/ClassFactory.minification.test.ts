import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClassFactory } from '../ClassFactory';
import {
    GetClassName,
    StampClassName,
    MJ_CLASS_NAME_SYMBOL,
    AreClassesRelated,
    GetClassInheritance,
    GetFullClassHierarchy,
} from '../ClassUtils';
import { RegisterClassEx } from '../RegisterClass';
import { MJGlobal } from '../Global';

describe('ClassFactory Minification Safety', () => {
    describe('StampClassName and GetClassName', () => {
        it('preserves true class name when .name property is mangled', () => {
            class BaseWidget {
                public render(): string {
                    return 'base';
                }
            }

            // Simulate minifier mangling .name to single-character identifier 'a'
            Object.defineProperty(BaseWidget, 'name', { value: 'a', configurable: true });
            expect(BaseWidget.name).toBe('a');

            // Before stamping, GetClassName falls back to the mangled name 'a'
            expect(GetClassName(BaseWidget)).toBe('a');

            // Stamp the unmangled name
            StampClassName(BaseWidget, 'BaseWidget');

            // Now GetClassName returns 'BaseWidget' despite .name being 'a'
            expect(GetClassName(BaseWidget)).toBe('BaseWidget');
            expect((BaseWidget as { __mjClassName?: unknown }).__mjClassName).toBe('BaseWidget');
            expect((BaseWidget as { [MJ_CLASS_NAME_SYMBOL]?: unknown })[MJ_CLASS_NAME_SYMBOL]).toBe('BaseWidget');
        });

        it('ignores null, undefined, empty, or non-function in StampClassName', () => {
            const notAClass = { name: 'Foo' };
            StampClassName(notAClass, 'Foo');
            expect(GetClassName(notAClass)).toBe('Unknown');

            class DummyClass {}
            StampClassName(DummyClass, '');
            StampClassName(DummyClass, '   ');
            expect(GetClassName(DummyClass)).toBe('DummyClass');
        });

        it('does NOT let an unstamped subclass inherit the parent class name via prototype chain', () => {
            class ParentEntity {
                public id: string = 'parent';
            }

            StampClassName(ParentEntity, 'ParentEntity');
            expect(GetClassName(ParentEntity)).toBe('ParentEntity');

            // Subclass inherits from ParentEntity along the constructor prototype chain
            class ChildEntity extends ParentEntity {
                public childProp: number = 42;
            }

            // ChildEntity does NOT have its own stamp; its .name is 'ChildEntity'
            // Object.getPrototypeOf(ChildEntity) === ParentEntity, so ParentEntity.__mjClassName is visible
            // on the prototype chain, but GetClassName must check own-property!
            expect(Object.prototype.hasOwnProperty.call(ChildEntity, '__mjClassName')).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(ChildEntity, MJ_CLASS_NAME_SYMBOL)).toBe(false);

            // GetClassName must return 'ChildEntity' (its own name), NEVER 'ParentEntity'
            expect(GetClassName(ChildEntity)).toBe('ChildEntity');

            // Now mangle ChildEntity.name to 'b'
            Object.defineProperty(ChildEntity, 'name', { value: 'b', configurable: true });
            // Since ChildEntity is unstamped and .name is 'b', GetClassName must return 'b', NEVER 'ParentEntity'
            expect(GetClassName(ChildEntity)).toBe('b');

            // Now stamp ChildEntity with its own name
            StampClassName(ChildEntity, 'ChildEntity');
            expect(GetClassName(ChildEntity)).toBe('ChildEntity');
        });

        it('supports GetClassInheritance and GetFullClassHierarchy with mangled stamped classes', () => {
            class RootItem {}
            class MiddleItem extends RootItem {}
            class LeafItem extends MiddleItem {}

            StampClassName(RootItem, 'RootItem');
            StampClassName(MiddleItem, 'MiddleItem');
            StampClassName(LeafItem, 'LeafItem');

            // Mangle all their .name properties
            Object.defineProperty(RootItem, 'name', { value: 'r', configurable: true });
            Object.defineProperty(MiddleItem, 'name', { value: 'm', configurable: true });
            Object.defineProperty(LeafItem, 'name', { value: 'l', configurable: true });

            const inheritance = GetClassInheritance(LeafItem);
            expect(inheritance.map((i) => i.name)).toEqual(['MiddleItem', 'RootItem']);

            const full = GetFullClassHierarchy(LeafItem);
            expect(full.map((i) => i.name)).toEqual(['LeafItem', 'MiddleItem', 'RootItem']);
        });

        it('correctly compares AreClassesRelated when names are mangled but stamped', () => {
            class AlphaBase {}
            class AlphaSub extends AlphaBase {}
            class BetaOther {}

            StampClassName(AlphaBase, 'AlphaBase');
            StampClassName(AlphaSub, 'AlphaSub');
            StampClassName(BetaOther, 'BetaOther');

            // Mangle all names to 'x'
            Object.defineProperty(AlphaBase, 'name', { value: 'x', configurable: true });
            Object.defineProperty(AlphaSub, 'name', { value: 'x', configurable: true });
            Object.defineProperty(BetaOther, 'name', { value: 'x', configurable: true });

            // AlphaSub and AlphaBase are related
            expect(AreClassesRelated(AlphaSub, AlphaBase)).toBe(true);
            expect(AreClassesRelated(AlphaBase, AlphaSub)).toBe(true);

            // BetaOther is unrelated
            expect(AreClassesRelated(AlphaBase, BetaOther)).toBe(false);
            expect(AreClassesRelated(AlphaSub, BetaOther)).toBe(false);
        });
    });

    describe('ClassFactory with Mangled Class Names', () => {
        let factory: ClassFactory;

        beforeEach(() => {
            factory = new ClassFactory();
        });

        it('registers, indexes, and creates instances when Base and Sub class names are mangled', () => {
            class EngineBase {
                public run(): string {
                    return 'base';
                }
            }

            class CustomEngine extends EngineBase {
                public override run(): string {
                    return 'custom';
                }
            }

            StampClassName(EngineBase, 'EngineBase');
            StampClassName(CustomEngine, 'CustomEngine');

            // Mangle both constructor .name properties
            Object.defineProperty(EngineBase, 'name', { value: 'a', configurable: true });
            Object.defineProperty(CustomEngine, 'name', { value: 'b', configurable: true });

            factory.Register(EngineBase, CustomEngine, 'custom-v1', 10, true);

            // GetAllRegistrations using Base class
            const allRegs = factory.GetAllRegistrations(EngineBase);
            expect(allRegs.length).toBe(1);
            expect(allRegs[0].SubClass).toBe(CustomEngine);

            // Keyed GetAllRegistrations
            const keyedRegs = factory.GetAllRegistrations(EngineBase, 'custom-v1');
            expect(keyedRegs.length).toBe(1);

            // GetRegistration
            const reg = factory.GetRegistration(EngineBase, 'custom-v1');
            expect(reg).not.toBeNull();
            expect(reg?.SubClass).toBe(CustomEngine);

            // CreateInstance returns custom subclass instance
            const instance = factory.CreateInstance<EngineBase>(EngineBase, 'custom-v1');
            expect(instance).not.toBeNull();
            expect(instance?.run()).toBe('custom');
        });

        it('supports GetRegistrationsByRootClass when root class is mangled and stamped', () => {
            class HierarchyRoot {}
            class HierarchyMid extends HierarchyRoot {}
            class HierarchyLeaf extends HierarchyMid {}

            StampClassName(HierarchyRoot, 'HierarchyRoot');
            StampClassName(HierarchyMid, 'HierarchyMid');
            StampClassName(HierarchyLeaf, 'HierarchyLeaf');

            Object.defineProperty(HierarchyRoot, 'name', { value: 'a', configurable: true });
            Object.defineProperty(HierarchyMid, 'name', { value: 'b', configurable: true });
            Object.defineProperty(HierarchyLeaf, 'name', { value: 'c', configurable: true });

            factory.Register(HierarchyMid, HierarchyLeaf, 'leaf-key', 0, true);

            const byRoot = factory.GetRegistrationsByRootClass(HierarchyRoot);
            expect(byRoot.length).toBe(1);
            expect(byRoot[0].SubClass).toBe(HierarchyLeaf);
        });

        it('works with RegisterLazyLoader when base class name is mangled and stamped', async () => {
            class LazyBase {
                public execute(): string {
                    return 'lazy';
                }
            }

            class LazyChild extends LazyBase {
                public override execute(): string {
                    return 'loaded-child';
                }
            }

            StampClassName(LazyBase, 'LazyBase');
            StampClassName(LazyChild, 'LazyChild');

            Object.defineProperty(LazyBase, 'name', { value: 'mangled_base', configurable: true });
            Object.defineProperty(LazyChild, 'name', { value: 'mangled_child', configurable: true });

            const loaderSpy = vi.fn(async (baseClassName: string, key: string): Promise<boolean> => {
                expect(baseClassName).toBe('LazyBase');
                expect(key).toBe('lazy-key');
                // Simulate lazy module loading registering the class
                factory.Register(LazyBase, LazyChild, key, 0, true);
                return true;
            });

            factory.RegisterLazyLoader(loaderSpy);

            const result = await factory.CreateInstanceAsync<LazyBase>(LazyBase, 'lazy-key');
            expect(loaderSpy).toHaveBeenCalledTimes(1);
            expect(result).not.toBeNull();
            expect(result?.execute()).toBe('loaded-child');
        });

        it('stamps class names via RegisterClassEx options bag (className and baseClassName)', () => {
            class DecoratorBase {}
            class DecoratorSub extends DecoratorBase {}

            // Mangle .name before applying RegisterClassEx
            Object.defineProperty(DecoratorBase, 'name', { value: 'min_base', configurable: true });
            Object.defineProperty(DecoratorSub, 'name', { value: 'min_sub', configurable: true });

            // Apply RegisterClassEx decorator manually
            const decorator = RegisterClassEx(DecoratorBase, {
                className: 'ExplicitSubClass',
                baseClassName: 'ExplicitBaseClass',
                key: 'explicit-key',
                skipNullKeyWarning: true,
            });
            decorator(DecoratorSub);

            expect(GetClassName(DecoratorBase)).toBe('ExplicitBaseClass');
            expect(GetClassName(DecoratorSub)).toBe('ExplicitSubClass');

            // Check that MJGlobal factory registered it under the stamped names
            const reg = MJGlobal.Instance.ClassFactory.GetRegistration(DecoratorBase, 'explicit-key');
            expect(reg).not.toBeNull();
            expect(reg?.SubClass).toBe(DecoratorSub);
        });
    });
});
