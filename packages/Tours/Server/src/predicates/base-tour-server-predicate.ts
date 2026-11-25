/**
 * @fileoverview ClassFactory plugin base class for server-evaluated Guided Tour predicates.
 * All predicates evaluate strictly under the caller's `contextUser` so permissions and RLS apply.
 * @module @memberjunction/tours-server
 */

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type {
    ToursEvaluatePredicatesInput,
    ToursEvaluatePredicatesOutput,
} from '@memberjunction/core-entities';
import { RequiresSubclass } from '@memberjunction/global';

export type TourServerPredicateInput = ToursEvaluatePredicatesInput['Predicates'][number];
export type TourServerPredicateResult = ToursEvaluatePredicatesOutput['Results'][string];

/**
 * Base class for server-evaluated tour completion, prerequisite, and eligibility predicates.
 * Register concrete implementations via `@RegisterClass(BaseTourServerPredicate, '<PredicateType>')`.
 */
@RequiresSubclass()
export abstract class BaseTourServerPredicate {
    /**
     * Evaluates this predicate strictly under `contextUser`'s permissions and RLS rules.
     */
    public abstract Evaluate(
        input: TourServerPredicateInput,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<TourServerPredicateResult>;
}
