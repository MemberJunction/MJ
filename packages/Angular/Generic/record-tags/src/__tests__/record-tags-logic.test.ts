import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Angular core before importing the component
vi.mock('@angular/core', () => {
    class MockEventEmitter {
        emit = vi.fn();
    }
    return {
        Component: () => (target: unknown) => target,
        Directive: () => (target: unknown) => target,
        Input: () => (target: unknown, key: string) => {},
        Output: () => (target: unknown, key: string) => {},
        EventEmitter: MockEventEmitter,
        OnInit: undefined,
        inject: vi.fn(),
    };
});

// BaseAngularComponent uses @Directive() at runtime — mock it so tests don't pull in real Angular DI.
vi.mock('@memberjunction/ng-base-types', () => {
    class MockBaseAngularComponent {
        Provider: unknown = null;
        get ProviderToUse() { return this.Provider; }
    }
    return { BaseAngularComponent: MockBaseAngularComponent };
});

// Mock MJ dependencies
vi.mock('@memberjunction/core', () => {
    class MockRunView {}
    class MockBaseEntity {}
    return { RunView: MockRunView, BaseEntity: MockBaseEntity };
});

vi.mock('@memberjunction/core-entities', () => {
    class MockMJTaggedItemEntity {}
    return { MJTaggedItemEntity: MockMJTaggedItemEntity };
});

vi.mock('@memberjunction/graphql-dataprovider', () => ({
    GraphQLDataProvider: {
        Instance: { ExecuteGQL: vi.fn().mockResolvedValue({}) },
    },
}));

vi.mock('@memberjunction/global', () => ({
    UUIDsEqual: (a: string, b: string) => a === b,
}));

import { RecordTagsComponent } from '../lib/record-tags.component';

describe('RecordTagsComponent', () => {
    let component: RecordTagsComponent;

    beforeEach(() => {
        component = new RecordTagsComponent();
    });

    describe('initial state', () => {
        it('should have IsLoading set to true', () => {
            expect(component.IsLoading).toBe(true);
        });

        it('should have TaggedItems as an empty array', () => {
            expect(component.TaggedItems).toEqual([]);
            expect(component.TaggedItems).toHaveLength(0);
        });
    });

    describe('GetTagOpacity', () => {
        it('should return 0.3 for weight 0 (clamped minimum)', () => {
            expect(component.GetTagOpacity(0)).toBe(0.3);
        });

        it('should return 0.3 for weight 0.3 (boundary)', () => {
            expect(component.GetTagOpacity(0.3)).toBe(0.3);
        });

        it('should return 0.5 for weight 0.5', () => {
            expect(component.GetTagOpacity(0.5)).toBe(0.5);
        });

        it('should return 1.0 for weight 1.0 (maximum)', () => {
            expect(component.GetTagOpacity(1.0)).toBe(1.0);
        });

        it('should return 0.3 for weight below 0.3 (e.g. 0.1)', () => {
            expect(component.GetTagOpacity(0.1)).toBe(0.3);
        });

        it('should return the weight itself when weight exceeds 0.3', () => {
            expect(component.GetTagOpacity(0.75)).toBe(0.75);
        });
    });

    describe('GetTagFontSize', () => {
        it('should return "0.85rem" for weight 0', () => {
            expect(component.GetTagFontSize(0)).toBe('0.85rem');
        });

        it('should return "1rem" for weight 0.5', () => {
            expect(component.GetTagFontSize(0.5)).toBe('1rem');
        });

        it('should return "1.15rem" for weight 1.0', () => {
            expect(component.GetTagFontSize(1.0)).toBe('1.15rem');
        });

        it('should scale linearly between 0.85rem and 1.15rem', () => {
            const result = component.GetTagFontSize(0.25);
            // 0.85 + (0.25 * 0.3) = 0.925 (may have floating point variance)
            expect(parseFloat(result)).toBeCloseTo(0.925, 2);
            expect(result).toMatch(/rem$/);
        });
    });
});
