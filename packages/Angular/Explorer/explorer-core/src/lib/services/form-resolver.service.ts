import { Injectable, Type } from '@angular/core';
import { IMetadataProvider, RunView, UserInfo, EntityInfo, LogError } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

/**
 * Slim row shape for an `EntityFormOverride` lookup. Resolution doesn't need
 * the full BaseEntity object — `simple` ResultType is faster and avoids a
 * compile-time dependency on the generated entity class. The row is only ever
 * read by the resolver; mutation goes through the generated entity in other
 * code paths (Studio, AI authoring).
 */
export interface EntityFormOverrideRow {
    ID: string;
    EntityID: string;
    ComponentID: string;
    Scope: 'User' | 'Role' | 'Global';
    UserID: string | null;
    RoleID: string | null;
    Priority: number;
    Status: 'Active' | 'Inactive' | 'Pending';
}

/** Resolved form kind for a given (entity, user, roles) tuple. */
export type FormResolution =
    | { kind: 'interactive'; override: EntityFormOverrideRow }
    | { kind: 'class'; subClass: Type<BaseFormComponent> }
    | { kind: 'none' };

/**
 * Picks the form to render for an entity record.
 *
 * Tier order:
 *   1. `EntityFormOverride` row matching the caller's User/Role/Global scope,
 *      Status='Active', ordered by scope tier (User > Role > Global), then
 *      Priority DESC, then `__mj_CreatedAt DESC`. First row wins.
 *   2. Existing `ClassFactory.GetRegistration(BaseFormComponent, entityName)` —
 *      the @RegisterClass + CodeGen-generated path used today.
 *   3. None — caller surfaces the "no form registered" error.
 *
 * Designed to be a near-zero-cost wedge: when no override exists for the
 * entity, we issue one filtered RunView that returns no rows and fall
 * through. The query is filterable on `EntityID` (indexed by CodeGen's FK
 * index) and is cheap.
 */
@Injectable({ providedIn: 'root' })
export class FormResolverService {

    async ResolveFormForEntity(
        entity: EntityInfo,
        user: UserInfo,
        provider: IMetadataProvider,
    ): Promise<FormResolution> {
        const override = await this.lookupActiveOverride(entity, user, provider);
        if (override) {
            return { kind: 'interactive', override };
        }

        const reg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseFormComponent, entity.Name);
        // ClassFactory.SubClass is typed `any` because it stores raw class
        // references across many base classes. Narrowing to Type<BaseFormComponent>
        // here is a runtime promise: GetRegistration(BaseFormComponent, …) only
        // returns rows where SubClass extends BaseFormComponent (enforced by
        // @RegisterClass). createComponent needs a concrete `Type<T>` to accept
        // the constructor — `typeof BaseFormComponent` is abstract and rejected.
        return reg
            ? { kind: 'class', subClass: reg.SubClass as Type<BaseFormComponent> }
            : { kind: 'none' };
    }

    private async lookupActiveOverride(
        entity: EntityInfo,
        user: UserInfo,
        provider: IMetadataProvider,
    ): Promise<EntityFormOverrideRow | null> {
        const userRoleIds = (user.UserRoles ?? []).map(r => r.RoleID).filter(Boolean);
        const roleClause = userRoleIds.length > 0
            ? `(Scope='Role' AND RoleID IN (${userRoleIds.map(id => `'${id}'`).join(',')}))`
            : "(1=0)";

        const filter = `
            EntityID='${entity.ID}'
            AND Status='Active'
            AND (
                (Scope='User' AND UserID='${user.ID}')
                OR ${roleClause}
                OR Scope='Global'
            )
        `.trim();

        const orderBy = `
            CASE Scope WHEN 'User' THEN 1 WHEN 'Role' THEN 2 ELSE 3 END,
            Priority DESC,
            __mj_CreatedAt DESC
        `.trim();

        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<EntityFormOverrideRow>({
            EntityName: 'MJ: Entity Form Overrides',
            Fields: ['ID', 'EntityID', 'ComponentID', 'Scope', 'UserID', 'RoleID', 'Priority', 'Status'],
            ExtraFilter: filter,
            OrderBy: orderBy,
            MaxRows: 1,
            ResultType: 'simple',
            // Bypass MJ's RunView cache: override rows are runtime-mutable
            // (Studio edits, AI agents, direct SQL toggles for A/B testing).
            // A stale cached "Active" override would mask a fresh Inactive
            // toggle and vice versa. Query is one indexed row, cheap to repeat.
            BypassCache: true,
        }, user);

        if (!result.Success) {
            LogError(`FormResolverService: override lookup failed for ${entity.Name}: ${result.ErrorMessage}`);
            return null;
        }

        return result.Results?.[0] ?? null;
    }
}
