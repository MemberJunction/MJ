import { Field, ObjectType, Query, Resolver } from 'type-graphql';
import { BaseSearchProvider } from '@memberjunction/search-engine';

/**
 * Surfaces the runtime ClassFactory registrations of `BaseSearchProvider`
 * subclasses for UI consumers (P5.5 — SearchScope form's provider dropdown).
 *
 * Why a GraphQL query and not a hardcoded client-side list:
 *   - `@memberjunction/search-engine` is a Node-only package; the browser
 *     can't import it directly, so it can't read `ClassFactory` itself.
 *   - Third-party packages can register additional providers at server boot
 *     without modifying any UI code; this query keeps the form auto-discovering.
 *   - The list is also useful for ops debugging ("which providers does this
 *     server build know about?").
 *
 * The resolver is intentionally read-only and does not require system-user
 * privileges — knowing the registered driver-class names on a given server
 * isn't sensitive, and the SearchScope form itself is gated by entity-level
 * permission checks. Adjust if your deployment treats the provider catalog
 * as confidential.
 */
@ObjectType()
export class AvailableSearchProviderGQL {
    @Field()
    DriverClass!: string;

    @Field()
    SourceType!: string;
}

@Resolver()
export class AvailableSearchProvidersResolver {
    @Query(() => [AvailableSearchProviderGQL])
    AvailableSearchProviders(): AvailableSearchProviderGQL[] {
        const registrations = BaseSearchProvider.GetAvailableProviders();
        return registrations.map(r => {
            const gql = new AvailableSearchProviderGQL();
            gql.DriverClass = r.DriverClass;
            gql.SourceType = r.SourceType;
            return gql;
        });
    }
}
