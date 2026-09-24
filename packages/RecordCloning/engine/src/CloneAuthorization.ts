/**
 * @file CloneAuthorization.ts
 * Server-side authorization checks for record cloning.
 *
 * Resolution for an entity (plan §9.1): `Configuration.Clone.RequiredAuthorization` when set;
 * else the per-entity leaf `Clone Records: <Entity Name>` when one exists; else the schema
 * node (`Clone Records in Platform Schema` for `__mj`, `Clone Records in Custom Schemas`
 * otherwise). Every check walks ancestors, so a `Clone Records` holder passes them all.
 *
 * @see plans/record-cloning/README.md §9
 */

import { AuthorizationEvaluator, AuthorizationInfo, EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';

/** Name of the authorization that allows firing Entity Actions / AI Actions during a clone. */
export const FIRE_HOOKS_AUTHORIZATION = 'Clone Records: Fire Hooks';

/** Schema that holds MemberJunction's own entities. */
const PLATFORM_SCHEMA = '__mj';

/** Outcome of one authorization check, in the shape `RecordClone.Describe` returns. */
export interface CloneAuthorizationResult {
    /** The authorization that was checked. */
    Name: string;
    /** Whether the user holds it (directly or through an ancestor). */
    Granted: boolean;
}

/**
 * Evaluates the clone authorizations for one provider. Create one per request; it only reads
 * the provider's cached `Authorizations` list.
 */
export class CloneAuthorizer {
    private readonly evaluator = new AuthorizationEvaluator();

    public constructor(private readonly provider: IMetadataProvider) {}

    /** The authorization that governs creating rows of `entity` in a clone. */
    public ResolveAuthorizationName(entity: EntityInfo): string {
        const configured = entity.CloneConfig?.RequiredAuthorization?.trim();
        if (configured) return configured;

        const leaf = `Clone Records: ${entity.Name}`;
        if (this.find(leaf)) return leaf;

        return entity.SchemaName?.trim().toLowerCase() === PLATFORM_SCHEMA
            ? 'Clone Records in Platform Schema'
            : 'Clone Records in Custom Schemas';
    }

    /** Whether `user` may clone rows of `entity`. */
    public CanCloneEntity(entity: EntityInfo, user: UserInfo): CloneAuthorizationResult {
        const name = this.ResolveAuthorizationName(entity);
        return { Name: name, Granted: this.userHolds(name, user) };
    }

    /** Whether `user` may fire Entity Actions and AI Actions during a clone. */
    public CanFireHooks(user: UserInfo): boolean {
        return this.userHolds(FIRE_HOOKS_AUTHORIZATION, user);
    }

    /** An authorization missing from metadata grants nothing: the check fails closed. */
    private userHolds(name: string, user: UserInfo): boolean {
        const auth = this.find(name);
        if (!auth) return false;
        return this.evaluator.UserCanExecuteWithAncestors(auth, user, this.provider.Authorizations ?? []);
    }

    private find(name: string): AuthorizationInfo | undefined {
        const target = name.trim().toLowerCase();
        return (this.provider.Authorizations ?? []).find((a) => a.Name?.trim().toLowerCase() === target);
    }
}
