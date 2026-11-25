/**
 * @fileoverview Standard server predicates shipped in `@memberjunction/tours-server`:
 * `HasRecords`, `QueryReturnsRows`, and `AuthorizationHeld`.
 * Always evaluated under the caller's `contextUser`.
 * @module @memberjunction/tours-server
 */

import {
    AuthorizationEvaluator,
    RunQuery,
    RunView,
    type IMetadataProvider,
    type IRunQueryProvider,
    type UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseTourServerPredicate,
    type TourServerPredicateInput,
    type TourServerPredicateResult,
} from './base-tour-server-predicate.js';

/**
 * Checks whether at least one record exists in `input.EntityName` matching optional
 * `input.ExtraFilter` under the caller's permissions and row-level security.
 */
@RegisterClass(BaseTourServerPredicate, 'HasRecords')
export class HasRecordsPredicate extends BaseTourServerPredicate {
    public async Evaluate(
        input: TourServerPredicateInput,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<TourServerPredicateResult> {
        const entityName = input.EntityName?.trim();
        if (!entityName) {
            return {
                Satisfied: false,
                ErrorMessage: 'HasRecords predicate requires EntityName.',
            };
        }

        const rv = RunView.FromMetadataProvider(provider);
        const res = await rv.RunView<Record<string, unknown>>(
            {
                EntityName: entityName,
                ExtraFilter: input.ExtraFilter?.trim() || undefined,
                MaxRows: 1,
                ResultType: 'simple',
            },
            contextUser,
        );

        if (!res.Success) {
            return {
                Satisfied: false,
                ErrorMessage: res.ErrorMessage || `RunView failed for entity '${entityName}'.`,
            };
        }

        const rowCount =
            typeof res.TotalRowCount === 'number' && res.TotalRowCount > 0
                ? res.TotalRowCount
                : res.Results.length;

        return {
            Satisfied: res.Results.length > 0 || rowCount > 0,
            RowCount: rowCount,
        };
    }
}

function isRunQueryProvider(provider: object): provider is IRunQueryProvider {
    return 'RunQuery' in provider && typeof (provider as { RunQuery?: unknown }).RunQuery === 'function';
}

/**
 * Checks whether a saved MJ Query (`input.QueryName` + optional `input.CategoryPath`)
 * returns at least one row under the caller's permissions.
 */
@RegisterClass(BaseTourServerPredicate, 'QueryReturnsRows')
export class QueryReturnsRowsPredicate extends BaseTourServerPredicate {
    public async Evaluate(
        input: TourServerPredicateInput,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<TourServerPredicateResult> {
        const queryName = input.QueryName?.trim();
        if (!queryName) {
            return {
                Satisfied: false,
                ErrorMessage: 'QueryReturnsRows predicate requires QueryName.',
            };
        }

        const rq = isRunQueryProvider(provider) ? new RunQuery(provider) : new RunQuery();
        const res = await rq.RunQuery(
            {
                QueryName: queryName,
                CategoryPath: input.CategoryPath?.trim() || undefined,
                Parameters: input.QueryParams,
                MaxRows: 1,
            },
            contextUser,
        );

        if (!res.Success) {
            return {
                Satisfied: false,
                ErrorMessage: res.ErrorMessage || `Query '${queryName}' execution failed.`,
            };
        }

        const rowCount =
            typeof res.TotalRowCount === 'number' && res.TotalRowCount > 0
                ? res.TotalRowCount
                : res.Results.length;

        return {
            Satisfied: res.Results.length > 0 || rowCount > 0,
            RowCount: rowCount,
        };
    }
}

/**
 * Checks whether `contextUser` holds `input.AuthorizationName` (including via ancestor grants).
 */
@RegisterClass(BaseTourServerPredicate, 'AuthorizationHeld')
export class AuthorizationHeldPredicate extends BaseTourServerPredicate {
    public async Evaluate(
        input: TourServerPredicateInput,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<TourServerPredicateResult> {
        const authName = input.AuthorizationName?.trim();
        if (!authName) {
            return {
                Satisfied: false,
                ErrorMessage: 'AuthorizationHeld predicate requires AuthorizationName.',
            };
        }

        const allAuthorizations = provider.Authorizations ?? [];
        const match = allAuthorizations.find(
            (a) => a.Name?.trim().toLowerCase() === authName.toLowerCase(),
        );
        if (!match) {
            return {
                Satisfied: false,
                ErrorMessage: `Authorization '${authName}' was not found.`,
            };
        }

        const evaluator = new AuthorizationEvaluator();
        const allowed = evaluator.UserCanExecuteWithAncestors(match, contextUser, allAuthorizations);
        return { Satisfied: allowed };
    }
}
