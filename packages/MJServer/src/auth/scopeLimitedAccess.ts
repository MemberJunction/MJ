import { AuthorizationError, UseMiddleware, getMetadataStorage, type MiddlewareFn } from 'type-graphql';
import { LogStatus, type UserInfo } from '@memberjunction/core';
import type { AppContext } from '../types.js';
import { IsScopeLimitedPrincipal } from './scopeLimitedPrincipal.js';

/**
 * The slice of type-graphql's resolver metadata this module reads: which class declares a
 * root field, and under which method name.
 */
interface ResolverFieldMeta {
    target: Function;
    methodName: string;
}

/** Resolver classes whose every root field refuses scope-limited principals. */
const refusedClasses = new Set<Function>();
/** Individual root fields that refuse scope-limited principals, keyed by declaring class. */
const refusedMethods = new Map<Function, Set<string>>();
/** Root fields that already carry the guard middleware, so applying twice is a no-op. */
const guardedFields = new Map<Function, Set<string>>();

/**
 * type-graphql middleware that refuses a root field to scope-limited principals.
 *
 * A scope-limited principal (see {@link IsScopeLimitedPrincipal}) is confined by row-level
 * security tokens, and that confinement exists only on paths that go through entity
 * permissions and RLS. Execution entry points — run an action, a prompt, an agent, a
 * template, a stored query, an MCP tool — act on the server's behalf, reach data around
 * those layers, or spend money on the caller's request. None of that is bounded by the
 * session's scope, so these fields refuse the principal outright.
 *
 * The system user always passes: it is never scope-limited, and some guarded resolvers
 * also expose `*SystemUser` variants.
 */
export const ScopeLimitedPrincipalGuard: MiddlewareFn<AppContext> = async ({ context, info }, next) => {
    if (context?.userPayload?.isSystemUser) {
        return next();
    }
    const user = context?.userPayload?.userRecord as UserInfo | undefined;
    if (IsScopeLimitedPrincipal(user)) {
        LogStatus(`[Auth] Refused ${info.parentType.name}.${info.fieldName} for a scope-limited session (user ${user?.ID ?? 'unknown'}).`);
        throw new AuthorizationError(`${info.fieldName} is not available to scope-limited sessions.`);
    }
    return next();
};

/**
 * Refuses the decorated GraphQL root field(s) to scope-limited principals — anonymous
 * magic-link guests and resource-scoped magic-link sessions.
 *
 * - On a **method**, guards that one `@Query` / `@Mutation` / `@Subscription`.
 * - On a **resolver class**, guards every root field the class itself declares.
 *
 * Use it on any entry point whose work is not bounded by entity permissions and RLS. A field
 * that must serve a particular kind of guest (for example, the public web widget's pinned
 * agent) stays unmarked and refuses everyone else inline.
 *
 * The decorator only records the intent. `Serve()` attaches {@link ScopeLimitedPrincipalGuard}
 * to the marked fields just before it builds the schema (see
 * {@link ApplyScopeLimitedPrincipalGuards}). Keeping type-graphql out of decoration time means
 * importing a resolver never depends on type-graphql's metadata, so test doubles that replace
 * type-graphql keep working.
 *
 * @example
 * ```typescript
 * @RefuseScopeLimitedPrincipals()
 * @Resolver()
 * export class RunTemplateResolver extends ResolverBase { ... }
 * ```
 */
export function RefuseScopeLimitedPrincipals(): ClassDecorator & MethodDecorator {
    return ((target: Function | object, propertyKey?: string | symbol) => {
        if (propertyKey === undefined) {
            refusedClasses.add(target as Function);
            return;
        }
        if (typeof propertyKey === 'symbol') {
            throw new Error('RefuseScopeLimitedPrincipals cannot decorate a symbol-keyed member.');
        }
        const resolverClass = (target as object).constructor;
        const methods = refusedMethods.get(resolverClass) ?? new Set<string>();
        methods.add(propertyKey);
        refusedMethods.set(resolverClass, methods);
    }) as ClassDecorator & MethodDecorator;
}

/**
 * True when the root field `methodName` declared by `resolverClass` refuses scope-limited
 * principals, by either a class-level or a method-level {@link RefuseScopeLimitedPrincipals}.
 */
export function IsRefusedToScopeLimitedPrincipals(resolverClass: Function, methodName: string): boolean {
    return refusedClasses.has(resolverClass) || (refusedMethods.get(resolverClass)?.has(methodName) ?? false);
}

/**
 * Attaches {@link ScopeLimitedPrincipalGuard} to every root field marked with
 * {@link RefuseScopeLimitedPrincipals}. `Serve()` calls this after every resolver module is
 * imported and before the schema is built; calling it again only guards fields marked since.
 *
 * @returns the number of fields newly guarded by this call.
 */
export function ApplyScopeLimitedPrincipalGuards(): number {
    const storage = getMetadataStorage() as unknown as {
        queries: ReadonlyArray<ResolverFieldMeta>;
        mutations: ReadonlyArray<ResolverFieldMeta>;
        subscriptions: ReadonlyArray<ResolverFieldMeta>;
    };
    let added = 0;
    for (const field of [...storage.queries, ...storage.mutations, ...storage.subscriptions]) {
        if (!IsRefusedToScopeLimitedPrincipals(field.target, field.methodName)) {
            continue;
        }
        const done = guardedFields.get(field.target) ?? new Set<string>();
        if (done.has(field.methodName)) {
            continue;
        }
        UseMiddleware(ScopeLimitedPrincipalGuard)(field.target.prototype, field.methodName, {});
        done.add(field.methodName);
        guardedFields.set(field.target, done);
        added++;
    }
    return added;
}
