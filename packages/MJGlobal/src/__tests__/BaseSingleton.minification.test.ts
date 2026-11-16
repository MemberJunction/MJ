import { describe, it, expect, beforeEach } from 'vitest';
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

describe('BaseSingleton minification and dual-copy safety', () => {
    beforeEach(() => {
        clearSingletonStore();
    });

    it('keeps separate instances for distinct classes whose minified names collide', () => {
        // Simulate ESBuild minifying two separate chunks to the same short class name "i"
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

        Object.defineProperty(FirstMinifiedSingleton, 'name', { value: 'i', configurable: true });
        Object.defineProperty(SecondMinifiedSingleton, 'name', { value: 'i', configurable: true });

        const a1 = FirstMinifiedSingleton.Instance;
        const b1 = SecondMinifiedSingleton.Instance;
        const a2 = FirstMinifiedSingleton.Instance;
        const b2 = SecondMinifiedSingleton.Instance;

        expect(a1).not.toBe(b1);
        expect(a1.tag).toBe('first');
        expect(b1.tag).toBe('second');
        expect(a2).toBe(a1);
        expect(b2).toBe(b1);
    });

    it('uses MJ_CLASS_NAME_SYMBOL so @RegisterClass singletons retain unminified global keys', () => {
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
        Object.defineProperty(StampedA, 'name', { value: 'a', configurable: true });
        Object.defineProperty(StampedB, 'name', { value: 'a', configurable: true });

        const a = StampedA.Instance;
        const b = StampedB.Instance;

        expect(a).not.toBe(b);
        expect(a.GlobalKey).toBe('___SINGLETON__UserInfoEngine');
        expect(b.GlobalKey).toBe('___SINGLETON__DashboardEngine');
    });

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
        const inst1 = Copy1.Instance;
        const inst2 = Copy2.Instance;
        expect(inst2).toBe(inst1);
    });

    it('honors explicit className override when sharing a global key', () => {
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

        const first = BaseShared.Instance;
        const second = SubShared.Instance;
        expect(second).toBe(first);
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
