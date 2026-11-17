import { CompositeFilter } from './compositeFilter';
import type { CompositeFilterDescriptor, FilterDescriptor } from './filter.types';

/**
 * Extracts the underlying plain record type when `T` is a `BaseEntity<TObject>` subclass,
 * or returns `T` unchanged when `T` is already a plain row interface / Zod-inferred type.
 */
export type ExtractFilterRowType<T> = T extends { GetAll(): infer TObject } ? TObject : T;

/**
 * String keys of the target record type `TRow`.
 */
export type FilterFieldKey<TRow> = Extract<keyof TRow, string>;

/**
 * String keys of `TRow` whose non-nullable value is assignable to `string`.
 */
export type StringFilterFieldKey<TRow> = {
    [K in FilterFieldKey<TRow>]: NonNullable<TRow[K]> extends string ? K : never;
}[FilterFieldKey<TRow>];

/**
 * Allowed scalar value for a field `K` on `TRow` (preserving literal unions such as `'Owner' | 'User'`,
 * and permitting ISO strings alongside `Date` instances for date fields).
 */
export type FilterValueFor<TRow, K extends FilterFieldKey<TRow>> =
    | TRow[K]
    | (NonNullable<TRow[K]> extends Date ? string : never);

/**
 * Non-nullable scalar value for ordered / set comparisons (`Gt`, `Gte`, `Lt`, `Lte`, `In`, `NotIn`, `Between`).
 */
export type NonNullableFilterValueFor<TRow, K extends FilterFieldKey<TRow>> =
    | NonNullable<TRow[K]>
    | (NonNullable<TRow[K]> extends Date ? string : never);

export type FilterBuilderInputItem = FilterDescriptor | CompositeFilterDescriptor | CompositeFilter;

/**
 * Strongly-typed builder for constructing portable {@link CompositeFilterDescriptor} trees
 * over an entity row shape `TRow`.
 */
export interface TypedFilterBuilder<TRow> {
    Eq<K extends FilterFieldKey<TRow>>(field: K, value: FilterValueFor<TRow, K>): FilterDescriptor;
    Neq<K extends FilterFieldKey<TRow>>(field: K, value: FilterValueFor<TRow, K>): FilterDescriptor;
    Gt<K extends FilterFieldKey<TRow>>(field: K, value: NonNullableFilterValueFor<TRow, K>): FilterDescriptor;
    Gte<K extends FilterFieldKey<TRow>>(field: K, value: NonNullableFilterValueFor<TRow, K>): FilterDescriptor;
    Lt<K extends FilterFieldKey<TRow>>(field: K, value: NonNullableFilterValueFor<TRow, K>): FilterDescriptor;
    Lte<K extends FilterFieldKey<TRow>>(field: K, value: NonNullableFilterValueFor<TRow, K>): FilterDescriptor;
    Contains<K extends StringFilterFieldKey<TRow>>(field: K, value: string): FilterDescriptor;
    DoesNotContain<K extends StringFilterFieldKey<TRow>>(field: K, value: string): FilterDescriptor;
    StartsWith<K extends StringFilterFieldKey<TRow>>(field: K, value: string): FilterDescriptor;
    EndsWith<K extends StringFilterFieldKey<TRow>>(field: K, value: string): FilterDescriptor;
    IsNull<K extends FilterFieldKey<TRow>>(field: K): FilterDescriptor;
    IsNotNull<K extends FilterFieldKey<TRow>>(field: K): FilterDescriptor;
    IsEmpty<K extends FilterFieldKey<TRow>>(field: K): FilterDescriptor;
    IsNotEmpty<K extends FilterFieldKey<TRow>>(field: K): FilterDescriptor;
    In<K extends FilterFieldKey<TRow>>(field: K, values: readonly NonNullableFilterValueFor<TRow, K>[]): FilterDescriptor;
    NotIn<K extends FilterFieldKey<TRow>>(field: K, values: readonly NonNullableFilterValueFor<TRow, K>[]): FilterDescriptor;
    Between<K extends FilterFieldKey<TRow>>(
        field: K,
        low: NonNullableFilterValueFor<TRow, K>,
        high: NonNullableFilterValueFor<TRow, K>,
    ): FilterDescriptor;
    And(
        ...filters:
            | FilterBuilderInputItem[]
            | [readonly FilterBuilderInputItem[]]
            | [(f: TypedFilterBuilder<TRow>) => readonly FilterBuilderInputItem[]]
    ): CompositeFilterDescriptor;
    Or(
        ...filters:
            | FilterBuilderInputItem[]
            | [readonly FilterBuilderInputItem[]]
            | [(f: TypedFilterBuilder<TRow>) => readonly FilterBuilderInputItem[]]
    ): CompositeFilterDescriptor;
}

function unwrapFilterItem(
    item: FilterBuilderInputItem,
): FilterDescriptor | CompositeFilterDescriptor {
    return item instanceof CompositeFilter ? item.ToDescriptor() : item;
}

function normalizeGroupInputs<TRow>(
    builder: TypedFilterBuilder<TRow>,
    args: ReadonlyArray<
        | FilterBuilderInputItem
        | readonly FilterBuilderInputItem[]
        | ((f: TypedFilterBuilder<TRow>) => readonly FilterBuilderInputItem[])
    >,
): (FilterDescriptor | CompositeFilterDescriptor)[] {
    if (args.length === 1) {
        const first = args[0];
        if (typeof first === 'function') {
            return first(builder).map(unwrapFilterItem);
        }
        if (Array.isArray(first)) {
            return (first as readonly FilterBuilderInputItem[]).map(unwrapFilterItem);
        }
    }
    return (args as readonly FilterBuilderInputItem[]).map(unwrapFilterItem);
}

/**
 * Returns a zero-allocation, compile-time-typed filter builder for `T` (either a generated row type
 * such as `MJUserEntityType`, a `BaseEntity` subclass such as `MJUserEntity`, or any record interface).
 *
 * Every method returns a plain JSON {@link FilterDescriptor} or {@link CompositeFilterDescriptor}
 * that can be passed to `RunViewParams.Filter`, `BaseEnginePropertyConfig.Filter`,
 * `BaseEngine.Where()`, or `CompositeFilter.FromDescriptor()`.
 *
 * @example
 * ```ts
 * const f = FilterOf<MJUserEntityType>();
 * const filter = f.And(
 *     f.Eq('Type', 'Owner'),
 *     f.Or(f.StartsWith('Email', 'a'), f.IsNull('Title')),
 *     f.In('ID', ids),
 * );
 * await rv.RunView<MJUserEntity>({ EntityName: 'MJ: Users', Filter: filter, ResultType: 'entity_object' });
 * ```
 */
export function FilterOf<T = Record<string, unknown>>(): TypedFilterBuilder<ExtractFilterRowType<T>> {
    type TRow = ExtractFilterRowType<T>;
    const builder: TypedFilterBuilder<TRow> = {
        Eq<K extends FilterFieldKey<TRow>>(field: K, value: FilterValueFor<TRow, K>): FilterDescriptor {
            return { field, operator: 'eq', value };
        },
        Neq<K extends FilterFieldKey<TRow>>(field: K, value: FilterValueFor<TRow, K>): FilterDescriptor {
            return { field, operator: 'neq', value };
        },
        Gt<K extends FilterFieldKey<TRow>>(field: K, value: NonNullableFilterValueFor<TRow, K>): FilterDescriptor {
            return { field, operator: 'gt', value };
        },
        Gte<K extends FilterFieldKey<TRow>>(field: K, value: NonNullableFilterValueFor<TRow, K>): FilterDescriptor {
            return { field, operator: 'gte', value };
        },
        Lt<K extends FilterFieldKey<TRow>>(field: K, value: NonNullableFilterValueFor<TRow, K>): FilterDescriptor {
            return { field, operator: 'lt', value };
        },
        Lte<K extends FilterFieldKey<TRow>>(field: K, value: NonNullableFilterValueFor<TRow, K>): FilterDescriptor {
            return { field, operator: 'lte', value };
        },
        Contains<K extends StringFilterFieldKey<TRow>>(field: K, value: string): FilterDescriptor {
            return { field, operator: 'contains', value };
        },
        DoesNotContain<K extends StringFilterFieldKey<TRow>>(field: K, value: string): FilterDescriptor {
            return { field, operator: 'doesnotcontain', value };
        },
        StartsWith<K extends StringFilterFieldKey<TRow>>(field: K, value: string): FilterDescriptor {
            return { field, operator: 'startswith', value };
        },
        EndsWith<K extends StringFilterFieldKey<TRow>>(field: K, value: string): FilterDescriptor {
            return { field, operator: 'endswith', value };
        },
        IsNull<K extends FilterFieldKey<TRow>>(field: K): FilterDescriptor {
            return { field, operator: 'isnull', value: null };
        },
        IsNotNull<K extends FilterFieldKey<TRow>>(field: K): FilterDescriptor {
            return { field, operator: 'isnotnull', value: null };
        },
        IsEmpty<K extends FilterFieldKey<TRow>>(field: K): FilterDescriptor {
            return { field, operator: 'isempty', value: null };
        },
        IsNotEmpty<K extends FilterFieldKey<TRow>>(field: K): FilterDescriptor {
            return { field, operator: 'isnotempty', value: null };
        },
        In<K extends FilterFieldKey<TRow>>(field: K, values: readonly NonNullableFilterValueFor<TRow, K>[]): FilterDescriptor {
            return { field, operator: 'in', value: [...values] };
        },
        NotIn<K extends FilterFieldKey<TRow>>(field: K, values: readonly NonNullableFilterValueFor<TRow, K>[]): FilterDescriptor {
            return { field, operator: 'notin', value: [...values] };
        },
        Between<K extends FilterFieldKey<TRow>>(
            field: K,
            low: NonNullableFilterValueFor<TRow, K>,
            high: NonNullableFilterValueFor<TRow, K>,
        ): FilterDescriptor {
            return { field, operator: 'between', value: [low, high] };
        },
        And(...filters): CompositeFilterDescriptor {
            return {
                logic: 'and',
                filters: normalizeGroupInputs(builder, filters),
            };
        },
        Or(...filters): CompositeFilterDescriptor {
            return {
                logic: 'or',
                filters: normalizeGroupInputs(builder, filters),
            };
        },
    };
    return builder;
}
