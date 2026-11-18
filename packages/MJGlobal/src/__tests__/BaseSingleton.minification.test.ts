import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BaseSingleton } from '../BaseSingleton';
import { StampClassName } from '../ClassUtils';
import { GetGlobalObjectStore } from '../util';

function clearSingletonStore(): void {
    const g = GetGlobalObjectStore();
    if (g) {
        for (const key of Object.keys(g)) {
            if (key.startsWith('___SINGLETON__')) {
                delete g[key];
            }
        }
    }
}

function renameClass(ctor: object, name: string): void {
    Object.defineProperty(ctor, 'name', { value: name, configurable: true });
}

/** A mangling minifier renames every class in the bundle, BaseSingleton included. */
function simulateMangledBuild(): void {
    renameClass(BaseSingleton, 'Q');
}

/** Two classes with the same name and byte-identical source that close over different values. */
function makeClosureClass(tag: string) {
    class ClosureSingleton extends BaseSingleton<ClosureSingleton> {
        public readonly tag = tag;
        public static get Instance(): ClosureSingleton {
            return super.getInstance<ClosureSingleton>();
        }
    }
    return ClosureSingleton;
}

describe('BaseSingleton minification and dual-copy safety', () => {
    beforeEach(() => {
        clearSingletonStore();
    });

    afterEach(() => {
        renameClass(BaseSingleton, 'BaseSingleton');
    });

    describe('mangled build', () => {
        beforeEach(() => {
            simulateMangledBuild();
        });

        it('keeps separate instances for distinct classes whose minified names collide', () => {
            class FirstMinifiedSingleton extends BaseSingleton<FirstMinifiedSingleton> {
                public readonly tag = 'first';
                public static get Instance(): FirstMinifiedSingleton {
                    return super.getInstance<FirstMinifiedSingleton>();
                }
            }
            class SecondMinifiedSingleton extends BaseSingleton<SecondMinifiedSingleton> {
                public readonly tag = 'second';
                public static get Instance(): SecondMinifiedSingleton {
                    return super.getInstance<SecondMinifiedSingleton>();
                }
            }
            renameClass(FirstMinifiedSingleton, 'i');
            renameClass(SecondMinifiedSingleton, 'i');

            const a1 = FirstMinifiedSingleton.Instance;
            const b1 = SecondMinifiedSingleton.Instance;

            expect(a1).not.toBe(b1);
            expect(a1.tag).toBe('first');
            expect(b1.tag).toBe('second');
            expect(FirstMinifiedSingleton.Instance).toBe(a1);
            expect(SecondMinifiedSingleton.Instance).toBe(b1);
        });

        // esbuild emits `var e=class extends t{...}` for two unrelated classes in different chunks,
        // with identical text and different captured imports (PR #6684 review).
        it.each([['first', 'second'], ['second', 'first']])(
            'does not alias identical constructor text with different captured dependencies (%s built first)',
            (builtFirst) => {
                const classes = { first: makeClosureClass('first'), second: makeClosureClass('second') };
                expect(classes.first).not.toBe(classes.second);
                expect(classes.first.name).toBe(classes.second.name);
                expect(Function.prototype.toString.call(classes.first))
                    .toBe(Function.prototype.toString.call(classes.second));

                const builtSecond = builtFirst === 'first' ? 'second' : 'first';
                const early = classes[builtFirst as 'first' | 'second'].Instance;
                const late = classes[builtSecond as 'first' | 'second'].Instance;

                expect(late).not.toBe(early);
                expect(early.tag).toBe(builtFirst);
                expect(late.tag).toBe(builtSecond);
                expect(classes.first.Instance.tag).toBe('first');
                expect(classes.second.Instance.tag).toBe('second');
            },
        );

        it('uses MJ_CLASS_NAME_SYMBOL so stamped singletons retain unminified global keys', () => {
            class StampedA extends BaseSingleton<StampedA> {
                public readonly kind = 'A';
                public static get Instance(): StampedA {
                    return super.getInstance<StampedA>();
                }
            }
            class StampedB extends BaseSingleton<StampedB> {
                public readonly kind = 'B';
                public static get Instance(): StampedB {
                    return super.getInstance<StampedB>();
                }
            }
            StampClassName(StampedA, 'UserInfoEngine');
            StampClassName(StampedB, 'DashboardEngine');
            renameClass(StampedA, 'a');
            renameClass(StampedB, 'a');

            const a = StampedA.Instance;
            const b = StampedB.Instance;

            expect(a).not.toBe(b);
            expect(a.GlobalKey).toBe('___SINGLETON__UserInfoEngine');
            expect(b.GlobalKey).toBe('___SINGLETON__DashboardEngine');
            expect(GetGlobalObjectStore()!['___SINGLETON__UserInfoEngine']).toBe(a);
        });

        it('honors an explicit className override when sharing a global key', () => {
            class BaseShared extends BaseSingleton<BaseShared> {
                public static get Instance(): BaseShared {
                    return super.getInstance<BaseShared>('CustomSharedKey');
                }
            }
            class SubShared extends BaseSingleton<SubShared> {
                public static get Instance(): SubShared {
                    return super.getInstance<SubShared>('CustomSharedKey');
                }
            }
            renameClass(BaseShared, 'e');
            renameClass(SubShared, 'e');

            expect(SubShared.Instance).toBe(BaseShared.Instance);
        });
    });

    describe('unmangled names (Node, dev builds)', () => {
        it('still deduplicates duplicate physical copies of the same class with identical definitions', () => {
            const makeCopy = () => {
                class SharedDupSingleton extends BaseSingleton<SharedDupSingleton> {
                    public value = 42;
                    public static get Instance(): SharedDupSingleton {
                        return super.getInstance<SharedDupSingleton>();
                    }
                }
                return SharedDupSingleton;
            };

            const Copy1 = makeCopy();
            const Copy2 = makeCopy();

            expect(Copy1).not.toBe(Copy2);
            expect(Copy2.Instance).toBe(Copy1.Instance);
        });

        // Two installs of one package at different versions: same class name, different source.
        it('deduplicates copies of the same class whose source differs between package versions', () => {
            const CopyA = (() => {
                class SkewSingleton extends BaseSingleton<SkewSingleton> {
                    public v = 1;
                    public static get Instance(): SkewSingleton {
                        return super.getInstance<SkewSingleton>();
                    }
                }
                return SkewSingleton;
            })();
            const CopyB = (() => {
                class SkewSingleton extends BaseSingleton<SkewSingleton> {
                    public v = 1;
                    public Extra(): number {
                        return 2;
                    }
                    public static get Instance(): SkewSingleton {
                        return super.getInstance<SkewSingleton>();
                    }
                }
                return SkewSingleton;
            })();
            expect(CopyA.name).toBe(CopyB.name);
            expect(Function.prototype.toString.call(CopyA)).not.toBe(Function.prototype.toString.call(CopyB));

            expect(CopyB.Instance).toBe(CopyA.Instance);
        });

        it('creates a fresh instance when a test deletes the specific ___SINGLETON__ key', () => {
            class ResettableSingleton extends BaseSingleton<ResettableSingleton> {
                public static get Instance(): ResettableSingleton {
                    return super.getInstance<ResettableSingleton>();
                }
            }

            const first = ResettableSingleton.Instance;
            const g = GetGlobalObjectStore();
            delete g!['___SINGLETON__ResettableSingleton'];
            const second = ResettableSingleton.Instance;
            expect(second).not.toBe(first);
        });
    });
});
